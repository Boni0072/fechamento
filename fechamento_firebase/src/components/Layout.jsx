import { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { importarEtapas } from '../services/database';
import { getDatabase, ref, get, set } from 'firebase/database';
import * as XLSX from 'xlsx';
import { RefreshCw, CheckCircle2, AlertCircle, CloudLightning } from 'lucide-react';
import { format } from 'date-fns';

export default function Layout() {
  const { empresaAtual } = useAuth();
  const [syncState, setSyncState] = useState({ status: 'idle', message: '', lastSync: null });
  const [autoSync, setAutoSync] = useState(false);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(1);

  const syncGoogleSheet = useCallback(async () => {
    if (!empresaAtual?.id || !empresaAtual?.spreadsheetId) return;

    setSyncState(prev => ({ ...prev, status: 'syncing', message: 'Sincronizando...' }));
    
    try {
      // 1. Busca dados frescos do Google Sheets
      // CORREÇÃO: Usa o parâmetro 'sheet' para buscar a aba específica configurada, ou gid=0 como fallback
      const sheetParam = empresaAtual.sheetName ? `&sheet=${encodeURIComponent(empresaAtual.sheetName)}` : '&gid=0';
      const url = `https://docs.google.com/spreadsheets/d/${empresaAtual.spreadsheetId}/gviz/tq?tqx=out:csv${sheetParam}&t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      
      if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
      
      const csvText = await response.text();
      // Verifica se a planilha é privada (retorna HTML de login)
      if (csvText.trim().toLowerCase().startsWith('<!doctype html') || csvText.includes('<html')) {
        throw new Error('Planilha privada ou link inválido');
      }

      const workbook = XLSX.read(csvText, { type: 'string' });
      
      // Como pedimos uma aba específica via URL, o CSV retornado contém apenas os dados dessa aba.
      // O XLSX.read vai criar um workbook com uma única aba (geralmente "Sheet1").
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);

      if (!data || data.length === 0) throw new Error('Planilha vazia');

      // 2. Busca Períodos existentes
      const db = getDatabase();
      const periodosSnapshot = await get(ref(db, `periodos/${empresaAtual.id}`));
      const periodosData = periodosSnapshot.val();
      const periodos = periodosData 
        ? Object.entries(periodosData).map(([id, val]) => ({ id, ...val }))
        : [];

      if (periodos.length === 0) throw new Error('Nenhum período cadastrado');

      // 3. Identifica o período alvo (Lógica Melhorada com Fallback)
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const currentYear = today.getFullYear();
      
      // Tenta achar período atual (comparação solta == para aceitar string/number)
      let targetPeriod = periodos.find(p => p.mes == currentMonth && p.ano == currentYear);
      
      // Fallback: Se não achar o atual, pega o último período criado (mais recente)
      if (!targetPeriod) {
          const sorted = [...periodos].sort((a, b) => {
              if (a.ano != b.ano) return b.ano - a.ano;
              return b.mes - a.mes;
          });
          targetPeriod = sorted[0];
      }
      
      if (!targetPeriod) throw new Error('Não foi possível identificar um período alvo');

      // 4. Busca etapas existentes para preservar status
      const etapasSnapshot = await get(ref(db, `tenants/${empresaAtual.id}/periodos/${targetPeriod.id}/etapas`));
      const etapasData = etapasSnapshot.val();
      const existingSteps = etapasData 
        ? Object.entries(etapasData).map(([id, val]) => ({ id, ...val }))
        : [];

      // 5. Processa os dados (Mapeamento de colunas e datas)
      const processedSteps = processData(data, existingSteps);

      // 6. Atualiza o banco de dados
      if (processedSteps.length > 0) {
          await importarEtapas(empresaAtual.id, targetPeriod.id, processedSteps);
          
          // Atualiza o cache no Realtime Database para refletir as mudanças automaticamente no sistema
          await set(ref(db, `tenants/${empresaAtual.id}/tabelaGoogle`), processedSteps);

          const nomeEmpresa = empresaAtual.nome || 'Empresa';
          const mesLabel = targetPeriod.mes || '?';
          const anoLabel = targetPeriod.ano || '?';

          setSyncState({ 
              status: 'success', 
            message: `Atualizado: ${processedSteps.length} etapas (${mesLabel}/${anoLabel}) - ${nomeEmpresa}`, 
              lastSync: new Date() 
          });
      } else {
          throw new Error('Nenhuma etapa válida encontrada');
      }

    } catch (error) {
      console.error('[AutoSync] Erro na sincronização automática:', error);
      setSyncState({ 
          status: 'error', 
          message: error.message || 'Erro na sincronização',
          lastSync: null
      });
    }
  }, [empresaAtual]);

  useEffect(() => {
    syncGoogleSheet();
  }, [syncGoogleSheet]);

  useEffect(() => {
    if (autoSync) {
      const interval = setInterval(syncGoogleSheet, syncIntervalMinutes * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [autoSync, syncGoogleSheet, syncIntervalMinutes]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Barra de Status de Sincronização */}
        {empresaAtual?.spreadsheetId && (
            <div className="bg-white border-b border-slate-200 px-6 py-2 flex justify-end items-center gap-4 text-xs shadow-sm z-10">
                <div className="flex items-center gap-2 text-slate-500">
                    <CloudLightning className={`w-3 h-3 ${syncState.status === 'syncing' ? 'text-blue-500 animate-pulse' : 'text-slate-400'}`} />
                    <span className="font-medium">Google Sheets:</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 px-2 py-1 rounded transition-colors select-none">
                    <input 
                      type="checkbox" 
                      checked={autoSync}
                      onChange={(e) => setAutoSync(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 border-slate-300"
                    />
                    <span className="text-slate-600 font-medium">Auto</span>
                  </label>
                  
                  {autoSync && (
                    <div className="flex items-center gap-1">
                      <input 
                        type="number" 
                        min="1" 
                        max="60" 
                        value={syncIntervalMinutes} 
                        onChange={(e) => setSyncIntervalMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-12 h-6 px-1 border border-slate-300 rounded text-center text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <span className="text-slate-500">min</span>
                    </div>
                  )}
                </div>
                
                <button 
                    onClick={() => syncGoogleSheet()} 
                    className="text-blue-600 hover:text-blue-800 font-medium hover:underline disabled:opacity-50"
                    disabled={syncState.status === 'syncing'}
                >
                    Sincronizar Agora
                </button>

                {syncState.status === 'syncing' && (
                    <div className="flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Sincronizando...</span>
                    </div>
                )}

                {syncState.status === 'success' && (
                    <div className="flex items-center gap-1.5 text-green-600 bg-green-50 px-2 py-1 rounded-full" title={syncState.message}>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{syncState.message}</span>
                        {syncState.lastSync && <span className="text-green-600/70 ml-1">({format(syncState.lastSync, 'HH:mm')})</span>}
                    </div>
                )}

                {syncState.status === 'error' && (
                    <div className="flex items-center gap-1.5 text-red-600 bg-red-50 px-2 py-1 rounded-full" title={syncState.message}>
                        <AlertCircle className="w-3 h-3" />
                        <span>{syncState.message}</span>
                    </div>
                )}
            </div>
        )}

        <div className="flex-1 overflow-auto p-6">
            <Outlet />
        </div>
      </main>
    </div>
  );
}

// Função auxiliar para processar dados (Reutiliza lógica da Importação)
const processData = (data, existingSteps) => {
  const etapasValidadas = [];

  const formatarData = (valor) => {
    if (valor === null || valor === undefined || String(valor).trim() === '') return null;

    if (typeof valor === 'number') {
      const valorAjustado = Math.floor(valor + 0.001);
      const date = new Date((valorAjustado - 25569) * 86400 * 1000 + 43200000);
      return date.toISOString();
    }
    
    if (typeof valor === 'string') {
      const v = valor.trim();
      
      // Formato DD/MM/AAAA HH:mm
      const dmy = v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:[\sT]+(\d{1,2}):(\d{2}))?/);
      if (dmy) {
        const dia = parseInt(dmy[1], 10);
        const mes = parseInt(dmy[2], 10);
        let ano = parseInt(dmy[3], 10);
        const hora = dmy[4] ? parseInt(dmy[4], 10) : null;
        const min = dmy[5] ? parseInt(dmy[5], 10) : null;
        
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
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth();
    const day = dt.getUTCDate();

    let hours = 0;
    let minutes = 0;

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
        if (parts.length >= 2) {
          hours = parseInt(parts[0], 10) || 0;
          minutes = parseInt(parts[1], 10) || 0;
        }
      }
    }
    
    const localDate = new Date(year, month, day, hours, minutes, 0, 0);
    return localDate.toISOString();
  };

  data.forEach((row, index) => {
    const getVal = (keys) => {
      const normalize = (k) => k ? String(k).toLowerCase().replace(/\s+/g, ' ').trim() : '';
      for (const k of keys) {
        if (row[k] !== undefined) return row[k];
        const target = normalize(k);
        const foundKey = Object.keys(row).find(rk => normalize(rk) === target);
        if (foundKey) return row[foundKey];
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
    if (isNaN(ordem) && typeof rawOrdem === 'string') {
       const match = rawOrdem.match(/\d+/);
       if (match) ordem = parseInt(match[0]);
    }
    if (isNaN(ordem)) ordem = index + 1;

    let dataPrevista = formatarData(getVal(['Data Prevista', 'dataPrevista', 'INÍCIO', 'início', 'inicio', 'Previsão', 'Previsao', 'Data', 'Date']));
    const horaInicio = getVal(['HORA INICIO', 'Hora Inicio', 'hora inicio', 'Hora Início']);
    dataPrevista = combinarDataHora(dataPrevista, horaInicio);
    
    let rawDataReal = getVal(['Início (Debug)', 'Inicio (Debug)', 'Início(Debug)', 'Inicio(Debug)', 'inicio (debug)', 'inicio debug', 'Inicio Debug', 'Debug', 'Data Real', 'dataReal', 'Data Conclusão', 'Data Conclusao', 'Conclusão', 'Conclusao', 'Realizado', 'Executado', 'Fim', 'TÉRMINO', 'término', 'termino']);
    
    if (rawDataReal === undefined) {
      const debugKey = Object.keys(row).find(k => k.toLowerCase().includes('debug'));
      if (debugKey) rawDataReal = row[debugKey];
    }

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
        if (dataReal && dataPrevista && new Date(dataReal) > new Date(dataPrevista)) {
            status = 'concluido_atraso';
        }
    } else {
        if (dataPrevista && new Date(dataPrevista) < now) {
            status = 'atrasado';
        } else if (statusStr.includes('andamento')) {
            status = 'em_andamento';
        } else {
            status = 'pendente';
        }

        if (statusStr.includes('atras')) {
            status = 'atrasado';
        }
    }

    let concluidoEm = existing ? existing.concluidoEm : null;
    let quemConcluiu = existing ? existing.quemConcluiu : null;

    if (status === 'concluido' || status === 'concluido_atraso') {
      if (!quemConcluiu) quemConcluiu = 'Importação Automática';
      if (!dataReal) dataReal = dataPrevista || new Date().toISOString();
      concluidoEm = dataReal;
    }

    etapasValidadas.push({
      nome: nome,
      descricao: getVal(['Descrição', 'descricao']) || '',
      area: getVal(['Área', 'area', 'ÁREA']) || '',
      responsavel: getVal(['Responsável', 'responsavel', 'ATRIBUÍDO PARA', 'atribuído para', 'atribuido para', 'Responsavel', 'Owner']) || '',
      dataPrevista: dataPrevista,
      dataReal: dataReal,
      ordem: ordem,
      codigo: (codigo !== undefined && codigo !== null) ? codigo : '',
      observacoes: getVal(['Observações', 'observacoes', 'Observação', 'observação', 'Observacao', 'observacao', 'OBSERVAÇÃO', 'Obs', 'obs', 'Comentários', 'comentarios']) || '',
      status: status,
      concluidoEm: concluidoEm || null,
      quemConcluiu: quemConcluiu || null,
      executadoPor: getVal(['EXECUTADO POR', 'Executado Por', 'Executado por', 'executado por', 'ExecutadoPor', 'executadoPor', 'Executor', 'executor', 'Quem executou', 'Realizado por', 'Executado p/', 'Executado P/', 'Executado']) || ''
    });
  });

  return etapasValidadas;
};
