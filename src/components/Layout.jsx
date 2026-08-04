import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../pages/Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { set } from 'firebase/database';
import { database, ref, firestore } from '../firebase';
import { doc, collection, getDocs, writeBatch, setDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { RefreshCw } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { format } from 'date-fns';

export default function Layout() {
  const { empresaAtual } = useAuth();
  const [syncState, setSyncState] = useState({ status: 'idle', message: '', lastSync: null });
  const [autoSync, setAutoSync] = useState(false);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(5); // Aumentado para 5 min
  const lastFetchedCsvText = useRef(null); // Cache para o conteúdo da planilha
  const lastSyncedDataJson = useRef(null); // Cache para os dados processados

  const syncGoogleSheet = useCallback(async () => {
    if (!empresaAtual?.id || !empresaAtual?.spreadsheetId) return;

    setSyncState(prev => ({ ...prev, status: 'syncing', message: 'Sincronizando...' }));
    try {
      const sheetParam = empresaAtual.sheetName ? `&sheet=${encodeURIComponent(empresaAtual.sheetName)}` : '&gid=0';
      const url = `https://docs.google.com/spreadsheets/d/${empresaAtual.spreadsheetId}/gviz/tq?tqx=out:csv${sheetParam}&t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
      const csvText = await response.text();
      if (csvText.trim().toLowerCase().startsWith('<!doctype html') || csvText.includes('<html')) {
        throw new Error('Planilha privada ou link inválido');
      }

      // Otimização de Leitura: Compara o CSV atual com o anterior. Se for igual, não faz nada.
      if (lastFetchedCsvText.current === csvText) {
        setSyncState({ status: 'success', message: 'Nenhuma alteração detectada', lastSync: new Date() });
        return;
      }
      lastFetchedCsvText.current = csvText;

      const workbook = XLSX.read(csvText, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { raw: true });
      if (!data || data.length === 0) throw new Error('Planilha vazia');

      // Otimização de Escrita: Processa os dados e compara com o cache antes de escrever.
      const processedDataForDb = processData(data, []);
      const processedDataJson = JSON.stringify(processedDataForDb);
      if (lastSyncedDataJson.current === processedDataJson) {
        setSyncState({ status: 'success', message: 'Nenhuma alteração de dados para sincronizar', lastSync: new Date() });
        return;
      }

      const rawTasksByPeriod = data.reduce((acc, row) => {
        const tempProcessed = processData([row], [])[0];
        if (tempProcessed && tempProcessed.dataPrevista) {
          const d = new Date(tempProcessed.dataPrevista);
          const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(row);
        }
        return acc;
      }, {});
      if (Object.keys(rawTasksByPeriod).length === 0) throw new Error('Nenhuma tarefa com data válida.');

      const periodsRef = collection(firestore, 'tenants', empresaAtual.id, 'periodos');
      const periodsSnap = await getDocs(periodsRef);
      const existingPeriods = periodsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      let totalStepsSynced = 0;

      await Promise.all(Object.keys(rawTasksByPeriod).map(async (periodKey) => {
        const [year, month] = periodKey.split('-').map(Number);
        const rawRows = rawTasksByPeriod[periodKey];
        let periodDoc = existingPeriods.find(p => p.ano === year && p.mes === month);
        let periodId;
        let currentDocs = []; // Armazena as etapas existentes para o período

        if (periodDoc) {
          periodId = periodDoc.id;
          // Otimização: Busca os documentos existentes do período UMA VEZ.
          const snapshot = await getDocs(collection(firestore, 'tenants', empresaAtual.id, 'periodos', periodId, 'etapas'));
          currentDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
          const newPeriodRef = doc(collection(firestore, 'tenants', empresaAtual.id, 'periodos'));
          await setDoc(newPeriodRef, { ano: year, mes: month, status: 'aberto', createdAt: new Date().toISOString() });
          periodId = newPeriodRef.id;
          // Se o período é novo, não há documentos existentes.
          currentDocs = [];
        }
        const processedSteps = processData(rawRows, currentDocs);
        const batch = writeBatch(firestore);
        const keptIds = new Set();
        const etapasColRef = collection(firestore, 'tenants', empresaAtual.id, 'periodos', periodId, 'etapas');

        processedSteps.forEach(step => {
          const { id, ...stepData } = step;
          const docRef = id ? doc(etapasColRef, id) : doc(etapasColRef);

          const existing = id ? currentDocs.find(d => d.id === id) : null;
          
          // Otimização: Escreve apenas se houver mudança
          const hasChanged = !existing || Object.keys(stepData).some(key => String(stepData[key] ?? '') !== String(existing[key] ?? ''));

          if (hasChanged) {
            batch.set(docRef, stepData, { merge: true });
          }
          if (id) keptIds.add(id);
        });

        currentDocs.forEach(d => { if (!keptIds.has(d.id)) batch.delete(doc(etapasColRef, d.id)); });
        await batch.commit();
        totalStepsSynced += processedSteps.length;
      }));

      if (database) {
        await set(ref(database, `tenants/${empresaAtual.id}/tabelaGoogle`), processedDataForDb);
        lastSyncedDataJson.current = processedDataJson; // Atualiza o cache de dados processados
      }
      setSyncState({ status: 'success', message: `${totalStepsSynced} etapas em ${Object.keys(rawTasksByPeriod).length} períodos`, lastSync: new Date() });
    } catch (error) {
      console.error('[AutoSync] Erro:', error);
      setSyncState({ status: 'error', message: error.message || 'Erro na sincronização', lastSync: null });
    }
  }, [empresaAtual]);

  useEffect(() => {
    if (autoSync) {
      const interval = setInterval(syncGoogleSheet, syncIntervalMinutes * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [autoSync, syncGoogleSheet, syncIntervalMinutes]);

  // Count steps from sync state
  const stepCount = syncState.lastSync ? (syncState.message.match(/\d+/)?.[0] || '--') : '--';

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <div className="topbar">
          <div className="flex items-center gap-4">
            {empresaAtual?.spreadsheetId && (
              <div className="sync-chip">
                <span className={`led ${syncState.status === 'syncing' ? 'animate-pulse' : ''}`}></span>
                <span>
                  {syncState.status === 'syncing' ? 'Sincronizando...' : 
                   syncState.status === 'success' ? syncState.message :
                   syncState.status === 'error' ? 'Erro na sincronização' : 
                   `${stepCount} etapas · ${empresaAtual?.nome || 'Consolidado'}`}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {empresaAtual?.spreadsheetId && (
              <>
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs">
                  <input 
                    type="checkbox" 
                    checked={autoSync}
                    onChange={(e) => setAutoSync(e.target.checked)}
                    className="rounded border-slate-600 bg-transparent"
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>Auto</span>
                </label>
                {autoSync && (
                  <div className="flex items-center gap-1">
                    <input 
                      type="number" min="1" max="60" 
                      value={syncIntervalMinutes} 
                      onChange={(e) => setSyncIntervalMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-12 h-6 px-1 text-center text-xs rounded"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>min</span>
                  </div>
                )}
              </>
            )}
            {empresaAtual?.spreadsheetId && (
              <button 
                onClick={() => syncGoogleSheet()} 
                className="btn btn-primary !py-1.5 !px-4 text-xs"
                disabled={syncState.status === 'syncing'}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncState.status === 'syncing' ? 'animate-spin' : ''}`} />
                Sincronizar agora
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

// processData function kept identical for data integrity
const processData = (data, existingSteps) => {
  const etapasValidadas = [];
  const normalizeVal = (str) => str ? String(str).trim().replace(/\s+/g, ' ').toLowerCase() : '';
  const headerMap = new Map();
  if (data.length > 0) {
    Object.keys(data[0]).forEach(k => headerMap.set(normalizeVal(k), k.trim()));
  }
  
  const formatarData = (valor) => {
    if (valor === null || valor === undefined || String(valor).trim() === '') return null;
    if (typeof valor === 'number') {
      const valorAjustado = Math.floor(valor + 0.001);
      const date = new Date((valorAjustado - 25569) * 86400 * 1000 + 43200000);
      return date.toISOString();
    }
    if (typeof valor === 'string') {
      const v = valor.trim();
      const dmy = v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:[\sT]+(\d{1,2}):(\d{2}))?/);
      if (dmy) {
        const dia = parseInt(dmy[1], 10), mes = parseInt(dmy[2], 10);
        let ano = parseInt(dmy[3], 10);
        const hora = dmy[4] ? parseInt(dmy[4], 10) : null, min = dmy[5] ? parseInt(dmy[5], 10) : null;
        if (ano < 100) ano += 2000;
        if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
          if (hora !== null) {
            const date = new Date(ano, mes - 1, dia, hora, min || 0, 0);
            if (!isNaN(date.getTime())) return date.toISOString();
          } else {
            const date = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
            if (!isNaN(date.getTime())) return date.toISOString();
          }
        }
      }
    }
    return null;
  };

  const combinarDataHora = (dataISO, horaVal) => {
    if (!dataISO) return null;
    if (horaVal === undefined || horaVal === null || String(horaVal).trim() === '') return dataISO;
    const dt = new Date(dataISO);
    const year = dt.getUTCFullYear(), month = dt.getUTCMonth(), day = dt.getUTCDate();
    let hours = 0, minutes = 0;
    if (typeof horaVal === 'number') {
      const totalSeconds = Math.round(horaVal * 86400);
      hours = Math.floor(totalSeconds / 3600) % 24;
      minutes = Math.floor((totalSeconds % 3600) / 60);
    } else if (typeof horaVal === 'string') {
      const v = horaVal.trim();
      if (v.includes('T') || v.includes('-') || v.includes('/')) {
        const timeDate = new Date(v);
        if (!isNaN(timeDate.getTime())) {
          hours = v.toUpperCase().includes('Z') ? timeDate.getUTCHours() : timeDate.getHours();
          minutes = v.toUpperCase().includes('Z') ? timeDate.getUTCMinutes() : timeDate.getMinutes();
        }
      } else {
        const parts = v.split(':');
        if (parts.length >= 2) { hours = parseInt(parts[0], 10) || 0; minutes = parseInt(parts[1], 10) || 0; }
      }
    }
    const localDate = new Date(year, month, day, hours, minutes, 0, 0);
    return localDate.toISOString();
  };

  data.forEach((row, index) => {
    const getVal = (keys) => {
      for (const k of keys) {
        const normalKey = normalizeVal(k);
        const actualKey = headerMap.get(normalKey) || k;
        const val = actualKey ? row[actualKey] : row[k];
        if (val !== undefined && val !== null && String(val).trim() !== '') return val;
      }
      return undefined;
    };
    const nome = getVal(['TAREFA', 'tarefa', 'Nome', 'nome', 'Etapa', 'etapa', 'Atividade', 'atividade']);
    const codigo = getVal(['CODIGO', 'codigo', 'CÓDIGO', 'código', 'Codigo', 'Código', 'Cod', 'COD', 'ID', 'Id', 'Code']);
    if (!nome) return;
    const existing = existingSteps.find(e => {
      const obs = e.observacoes || '';
      if (codigo && String(obs).includes(String(codigo))) return true;
      return e.nome === nome;
    });
    let rawOrdem = getVal(['Ordem', 'ordem', 'D+']);
    let ordem = parseInt(rawOrdem);
    if (isNaN(ordem) && typeof rawOrdem === 'string') { const match = rawOrdem.match(/\d+/); if (match) ordem = parseInt(match[0]); }
    if (isNaN(ordem)) ordem = index + 1;
    let dataPrevista = formatarData(getVal(['Data Prevista', 'dataPrevista', 'INÍCIO', 'início', 'inicio', 'Previsão', 'Previsao', 'Data', 'Date']));
    const horaInicio = getVal(['HORA INICIO', 'Hora Inicio', 'hora inicio', 'Hora Início']);
    dataPrevista = combinarDataHora(dataPrevista, horaInicio);
    let rawDataReal = getVal(['Início (Debug)', 'Inicio (Debug)', 'Início(Debug)', 'Inicio(Debug)', 'inicio (debug)', 'inicio debug', 'Inicio Debug', 'Debug', 'Data Real', 'dataReal', 'Data Conclusão', 'Data Conclusao', 'Conclusão', 'Conclusao', 'Realizado', 'Executado', 'Fim', 'TÉRMINO', 'término', 'termino']);
    if (rawDataReal === undefined) { const debugKey = Object.keys(row).find(k => k.toLowerCase().includes('debug')); if (debugKey) rawDataReal = row[debugKey]; }
    let dataReal = formatarData(rawDataReal);
    const horaTermino = getVal(['HORA TÉRMINO', 'Hora Término', 'hora término', 'HORA TERMICA', 'Hora Termica']);
    dataReal = combinarDataHora(dataReal, horaTermino);
    let rawStatus = getVal(['STATUS', 'Status', 'status', 'SITUAÇÃO', 'Situação', 'situacao', 'Estado', 'estado']);
    let status = 'pendente';
    const now = new Date();
    const statusStr = rawStatus ? String(rawStatus).toLowerCase() : '';
    const hasDataReal = dataReal !== null && dataReal !== undefined;
    const isExplicitlyConcluido = statusStr.includes('conclu');
    if (hasDataReal || isExplicitlyConcluido) {
      status = 'concluido';
      if (dataReal && dataPrevista && new Date(dataReal) > new Date(dataPrevista)) status = 'concluido_atraso';
    } else {
      if (dataPrevista && new Date(dataPrevista) < now) status = 'atrasado';
      else if (statusStr.includes('andamento')) status = 'em_andamento';
      else status = 'pendente';
      if (statusStr.includes('atras')) status = 'atrasado';
    }
    let concluidoEm = existing ? existing.concluidoEm : null;
    let quemConcluiu = existing ? existing.quemConcluiu : null;
    if (status === 'concluido' || status === 'concluido_atraso') {
      if (!quemConcluiu) quemConcluiu = 'Importação Automática';
      if (!dataReal) dataReal = dataPrevista || new Date().toISOString();
      concluidoEm = dataReal;
    }
    etapasValidadas.push({
      nome, descricao: getVal(['Descrição', 'descricao']) || '',
      area: getVal(['Área', 'area', 'ÁREA']) || '',
      responsavel: getVal(['Responsável', 'responsavel', 'ATRIBUÍDO PARA', 'atribuído para', 'atribuido para', 'Responsavel', 'Owner']) || '',
      dataPrevista, dataReal, ordem,
      codigo: (codigo !== undefined && codigo !== null) ? codigo : '',
      observacoes: getVal(['Observações', 'observacoes', 'Observação', 'observação', 'Observacao', 'observacao', 'OBSERVAÇÃO', 'Obs', 'obs', 'Comentários', 'comentarios']) || '',
      status, concluidoEm: concluidoEm || null,
      quemConcluiu: quemConcluiu || null,
      executadoPor: getVal(['EXECUTADO POR', 'Executado Por', 'Executado por', 'executado por', 'ExecutadoPor', 'executadoPor', 'Executor', 'executor', 'Quem executou', 'Realizado por', 'Executado p/', 'Executado P/', 'Executado']) || ''
    });
  });
  return etapasValidadas;
};