import { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { importarEtapas } from '../services/database';
import { getDatabase, ref, get } from 'firebase/database';
import * as XLSX from 'xlsx';
import { RefreshCw, CheckCircle2, AlertCircle, CloudLightning } from 'lucide-react';
import { format } from 'date-fns';

export default function Layout() {
  const { empresaAtual } = useAuth();
  const [syncState, setSyncState] = useState({ status: 'idle', message: '', lastSync: null });

  const syncGoogleSheet = useCallback(async () => {
    if (!empresaAtual?.id || !empresaAtual?.spreadsheetId) return;

    setSyncState(prev => ({ ...prev, status: 'syncing', message: 'Sincronizando...' }));
    
    try {
      // 1. Busca dados frescos do Google Sheets
      // Adicionado gid=0 para garantir a primeira aba e timestamp para evitar cache
      const url = `https://docs.google.com/spreadsheets/d/${empresaAtual.spreadsheetId}/gviz/tq?tqx=out:csv&gid=0&t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      
      if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
      
      const csvText = await response.text();
      // Verifica se a planilha é privada (retorna HTML de login)
      if (csvText.trim().toLowerCase().startsWith('<!doctype html') || csvText.includes('<html')) {
        throw new Error('Planilha privada ou link inválido');
      }

      const workbook = XLSX.read(csvText, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);

      if (!data || data.length === 0) throw new Error('Planilha vazia');

      // 2. Busca Períodos existentes
      const db = getDatabase();
      const periodosSnapshot = await get(ref(db, `tenants/${empresaAtual.id}/periodos`));
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
          setSyncState({ 
              status: 'success', 
            message: `Atualizado: ${processedSteps.length} etapas (${targetPeriod.mes}/${targetPeriod.ano})`, 
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
    const interval = setInterval(syncGoogleSheet, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [syncGoogleSheet]);

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
    if (!valor) return null;
    if (typeof valor === 'number') {
      const date = new Date((valor - 25569 + 0.5) * 86400 * 1000);
      return date.toISOString();
    }
    if (typeof valor === 'string') {
      const v = valor.trim();
      if (v.length > 0 && !isNaN(v) && !v.includes('/') && !v.includes('-') && !v.includes(':')) {
        const num = parseFloat(v);
        const date = new Date((num - 25569 + 0.5) * 86400 * 1000);
        return date.toISOString();
      }
      if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(v)) {
        const parts = v.split(/[\/-]/);
        const p1 = parseInt(parts[0], 10);
        const p2 = parseInt(parts[1], 10);
        const ano = parseInt(parts[2], 10);
        let dia, mes;
        // Lógica de data ambígua: Prioriza MM/DD/YYYY conforme solicitado
        if (p1 > 12) { dia = p1; mes = p2; }
        else if (p2 > 12) { mes = p1; dia = p2; }
        else { mes = p1; dia = p2; } 
        
        const d = new Date(ano, mes - 1, dia);
        if (isNaN(d) || d.getDate() !== dia || d.getMonth() !== mes - 1 || d.getFullYear() !== ano) return null;
        return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T12:00:00.000Z`;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T12:00:00.000Z`;
    }
    return null;
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

    const dataPrevista = formatarData(getVal(['Data Prevista', 'dataPrevista', 'INÍCIO', 'início', 'inicio', 'Previsão', 'Previsao', 'Data', 'Date']));
    
    let rawDataReal = getVal(['Início (Debug)', 'Inicio (Debug)', 'Início(Debug)', 'Inicio(Debug)', 'inicio (debug)', 'inicio debug', 'Inicio Debug', 'Debug', 'Data Real', 'dataReal', 'Data Conclusão', 'Data Conclusao', 'Conclusão', 'Conclusao', 'Realizado', 'Executado', 'Fim', 'TÉRMINO', 'término', 'termino']);
    
    if (rawDataReal === undefined) {
      const debugKey = Object.keys(row).find(k => k.toLowerCase().includes('debug'));
      if (debugKey) rawDataReal = row[debugKey];
    }

    let dataReal = formatarData(rawDataReal);
    
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
      observacoes: getVal(['Observações', 'observacoes', 'CODIGO', 'codigo']) || '',
      status: status,
      concluidoEm: concluidoEm || null,
      quemConcluiu: quemConcluiu || null
    });
  });

  return etapasValidadas;
};
