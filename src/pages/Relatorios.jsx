import React, { useState, useEffect, useMemo } from 'react';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { getDatabase, ref, onValue } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { getStatusLabel } from '../services/database';
import { FileText, Download, BarChart3, Users, AlertTriangle, Building2, Clock, CalendarDays, FileSpreadsheet, GripVertical, KeyRound, GitCompareArrows } from 'lucide-react';
import { format } from 'date-fns';
import { checkPermission } from './permissionUtils';

export default function Relatorios() {
  const { empresaAtual, empresas } = useAuth();
  const { loading: loadingPermissoes, user: authUser, autorizado } = usePermissao('relatorios');

  const empresasParaBuscar = useMemo(() => {
    if (empresaAtual) return [empresaAtual];
    return empresas || [];
  }, [empresaAtual, empresas]);
  const viewAllCompanies = !empresaAtual;

  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [periodos, setPeriodos] = useState([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState(null);
  const [stepsByCompany, setStepsByCompany] = useState({});
  const [etapas, setEtapas] = useState([]);
  const [indicadores, setIndicadores] = useState(null);
  const [tab, setTab] = useState('resumo');
  const [additionalSheetData, setAdditionalSheetData] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState([]);

  useEffect(() => {
    if (authUser?.id && empresaAtual?.id) {
      const db = getFirestore();
      const userRef = doc(db, 'tenants', empresaAtual.id, 'usuarios', authUser.id);
      const unsubscribe = onSnapshot(userRef, (snapshot) => {
        const data = snapshot.data();
        setUserProfile(data ? { ...authUser, ...data } : authUser);
        setLoadingProfile(false);
      });
      return () => unsubscribe();
    } else {
      setLoadingProfile(false);
    }
  }, [authUser, empresaAtual]);


  useEffect(() => {
    if (!empresasParaBuscar || empresasParaBuscar.length === 0) {
      setEtapas([]);
      setStepsByCompany({});
      return;
    }

    const unsubs = [];
    const db = getDatabase();
    
    empresasParaBuscar.forEach(emp => {
      const googleTableRef = ref(db, `tenants/${emp.id}/tabelaGoogle`);
      const unsubscribe = onValue(googleTableRef, (snapshot) => {
        const data = snapshot.val();
        const processedEtapas = data ? processData(data) : [];
        setStepsByCompany(prev => ({
          ...prev,
          [emp.id]: processedEtapas.map(d => ({ 
              ...d, 
              empresaId: emp.id, 
              empresaNome: emp.nome
          }))
        }));
      });
      unsubs.push(unsubscribe);
    });

    return () => unsubs.forEach(u => u());
  }, [empresasParaBuscar]);

  useEffect(() => {
    const periodosPorData = new Map();
    Object.values(stepsByCompany).flat().forEach(etapa => {
      const dataPrevista = new Date(etapa.dataPrevista);
      if (!isNaN(dataPrevista.getTime())) {
        const mes = dataPrevista.getMonth() + 1;
        const ano = dataPrevista.getFullYear();
        periodosPorData.set(`${mes}-${ano}`, { id: `${mes}-${ano}`, mes, ano });
      }
    });
    const periodosOrdenados = Array.from(periodosPorData.values()).sort((a, b) => b.ano - a.ano || b.mes - a.mes);
    const periodosDisponiveis = [{ id: 'todos', mes: 'Todos', ano: '' }, ...periodosOrdenados];
    setPeriodos(periodosDisponiveis);
    setPeriodoSelecionado(prev => periodosDisponiveis.find(p => p.id === prev?.id) || periodosDisponiveis[0]);
  }, [stepsByCompany]);

  useEffect(() => {
    const allSteps = Object.values(stepsByCompany).flat();
    if (periodoSelecionado && periodoSelecionado.id !== 'todos') {
      const filteredSteps = allSteps.filter(etapa => {
          if (!etapa.dataPrevista) return false;
          const etapaDate = new Date(etapa.dataPrevista);
          return etapaDate.getMonth() + 1 === parseInt(periodoSelecionado.mes) && etapaDate.getFullYear() === parseInt(periodoSelecionado.ano);
      });
      setEtapas(filteredSteps);
      setIndicadores(calcularIndicadoresLocal(filteredSteps)); // Use local function
    } else {
      setEtapas(allSteps);
      setIndicadores(calcularIndicadoresLocal(allSteps)); // Use local function
    }
  }, [stepsByCompany, periodoSelecionado]);

  const calcularIndicadoresLocal = (dados) => {
    const total = dados.length;
    const concluidas = dados.filter(e => e.status === 'concluido' || e.status === 'concluido_atraso').length;
    const atrasadas = dados.filter(e => e.status === 'atrasado').length;
    const concluidasComAtraso = dados.filter(e => e.status === 'concluido_atraso').length;
    
    // Cálculo de tempo médio de atraso
    let somaDiasAtraso = 0;
    let qtdAtrasoParaMedia = 0;
    
    dados.forEach(e => {
      if (e.dataPrevista) {
        const dPrev = new Date(e.dataPrevista);
        dPrev.setHours(0,0,0,0);
        
        let dReal;
        if (e.status === 'concluido' || e.status === 'concluido_atraso') {
           if (e.dataReal) dReal = new Date(e.dataReal);
        } else if (e.status === 'atrasado') {
           dReal = new Date();
        }

        if (dReal) {
            dReal.setHours(0,0,0,0);
            if (dReal.getTime() > dPrev.getTime()) {
                const diffTime = Math.abs(dReal.getTime() - dPrev.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                somaDiasAtraso += diffDays;
                qtdAtrasoParaMedia++;
            }
        }
      }
    });

    const tempoMedioAtraso = qtdAtrasoParaMedia > 0 ? Math.round(somaDiasAtraso / qtdAtrasoParaMedia) : 0;
    const percentualConcluido = total > 0 ? Math.round((concluidas / total) * 100) : 0;

    return { total, concluidas, atrasadas, concluidasComAtraso, tempoMedioAtraso, percentualConcluido };
  };

  // Adiciona a função processData que está faltando neste arquivo
  const processData = (data) => {
    if (!data) return [];
    const dataArray = Array.isArray(data) ? data : Object.values(data);
    const etapasValidadas = [];
    const normalizeVal = (str) => str ? String(str).trim().replace(/\s+/g, ' ').toLowerCase() : '';

    // Pre-compute header mapping
    const headerMap = new Map();
    dataArray.forEach(row => {
      Object.keys(row).forEach(k => {
        headerMap.set(normalizeVal(k), k);
      });
    });
  
    const formatarData = (valor) => {
      if (valor === null || valor === undefined || String(valor).trim() === '') return null;
  
      if (typeof valor === 'number') {
        const valorAjustado = Math.floor(valor + 0.001);
        const date = new Date((valorAjustado - 25569) * 86400 * 1000 + 43200000);
        return date.toISOString();
      }
      
      if (typeof valor === 'string') {
        const v = valor.trim();
        
        // Detecta se já é uma string ISO para evitar deslocamento de fuso horário
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return v;
        
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
  
        const ymd = v.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})(?:[\sT]+(\d{1,2}):(\d{2}))?/);
        if (ymd) {
           const ano = parseInt(ymd[1], 10);
           const mes = parseInt(ymd[2], 10);
           const dia = parseInt(ymd[3], 10);
           const hora = ymd[4] ? parseInt(ymd[4], 10) : null;
           const min = ymd[5] ? parseInt(ymd[5], 10) : null;
  
           if (hora !== null) {
              const date = new Date(ano, mes - 1, dia, hora, min || 0, 0);
              if (!isNaN(date.getTime())) return date.toISOString();
           } else {
              const date = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
              if (!isNaN(date.getTime())) return date.toISOString();
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

    dataArray.forEach((row) => {
      const getVal = (keys) => {
        for (const k of keys) {
          let val = row[k];
          if (val === undefined) {
            const normalized = normalizeVal(k);
            const actualKey = headerMap.get(normalized);
            if (actualKey) val = row[actualKey];
          }
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            return val;
          }
        }
        return undefined;
      };
  
      const nome = getVal(['TAREFA', 'tarefa', 'Nome', 'nome', 'Etapa', 'etapa', 'Etapas', 'etapas', 'Tarefas', 'tarefas', 'Atividade', 'atividade', 'Descrição', 'descricao', 'Item', 'item']);
      if (!nome) return;
  
      let dataPrevista = formatarData(getVal(['INÍCIO', 'início', 'inicio', 'Data Prevista', 'dataPrevista', 'Data de Início', 'Data de Inicio', 'Previsão', 'Previsao', 'Data', 'Date', 'Start', 'Planejado', 'Data Planejada', 'Início Previsto', 'Inicio Previsto']));
      const horaInicio = getVal(['HORA INICIO', 'Hora Inicio', 'hora inicio', 'Hora Início']);
      dataPrevista = combinarDataHora(dataPrevista, horaInicio);

      let dataReal = formatarData(getVal(['TÉRMINO', 'término', 'termino', 'Data Real', 'dataReal', 'Data Conclusão', 'Data Conclusao', 'Conclusão', 'Conclusao', 'Realizado', 'Executado', 'Fim', 'Data de Término', 'Data de Termino', 'Data Fim', 'Data Final', 'End', 'Término Real', 'Termino Real']));
      const horaTermino = getVal(['HORA TÉRMINO', 'Hora Término', 'hora término', 'HORA TERMICA', 'Hora Termica']);
      dataReal = combinarDataHora(dataReal, horaTermino);

      // Lógica de Status Corrigida (Igual ao Dashboard)
      let status = 'pendente';
      const now = new Date();

      let rawStatus = getVal(['STATUS', 'Status', 'status', 'SITUAÇÃO', 'Situação', 'situacao', 'Estado', 'estado']);
      
      if (rawStatus) {
         const s = String(rawStatus).toLowerCase();
         if (s.includes('conclu')) {
             status = 'concluido';
             if (dataReal && dataPrevista && new Date(dataReal) > new Date(dataPrevista)) {
                 status = 'concluido_atraso';
             }
         }
         else if (s.includes('atras')) status = 'atrasado';
         else if (s.includes('andamento')) status = 'em_andamento';
         else status = 'pendente';
      } else {
         if (dataReal) {
             status = 'concluido';
             if (dataPrevista && new Date(dataReal) > new Date(dataPrevista)) {
                 status = 'concluido_atraso';
             }
         } else {
             if (dataPrevista && new Date(dataPrevista) < now) {
                 status = 'atrasado';
             } else {
                 status = 'pendente';
             }
         }
      }

      etapasValidadas.push({
        ...row, // Keep original data
        nome: nome,
        area: getVal(['ÁREA', 'área', 'area']) || '',
        responsavel: getVal(['ATRIBUÍDO PARA', 'atribuído para', 'Responsável', 'responsavel']) || '',
        dataPrevista: dataPrevista,
        dataReal: dataReal,
        status: status,
        observacoes: getVal(['Observações', 'observacoes', 'Observação', 'observação', 'Observacao', 'observacao', 'Obs', 'obs', 'Comentários', 'comentarios']) || ''
      });
    });
  
    return etapasValidadas;
  };

  if (loadingPermissoes || loadingProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Carregando permissões...</p>
      </div>
    );
  }

  if (!empresas || empresas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Nenhuma empresa disponível</p>
      </div>
    );
  }

  if (!autorizado) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Acesso não autorizado.</p>
      </div>
    );
  }

  const exportarCSV = () => {
    const headers = ['D+', 'Etapa', 'Área', 'Responsável', 'Data Prevista', 'Data Real', 'Status', 'Observações'];
    if (viewAllCompanies) {
      headers.splice(2, 0, 'Empresa');
    }

    const rows = etapas.map(e => {
      const rowData = [
        e.ordem,
        e.nome,
        e.area || '',
        e.responsavel || '',
        e.dataPrevista ? format(new Date(e.dataPrevista), 'dd/MM/yyyy HH:mm') : '',
        e.dataReal ? format(new Date(e.dataReal), 'dd/MM/yyyy HH:mm') : '',
        getStatusLabel(e.status),
        e.observacoes || ''
      ];
      if (viewAllCompanies) {
        rowData.splice(2, 0, e.empresaNome || '');
      }
      return rowData;
    });
    
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_fechamento_${periodoSelecionado?.mes}_${periodoSelecionado?.ano}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const etapasAtrasadas = etapas.filter(e => e.status === 'atrasado' || e.status === 'concluido_atraso');
  const etapasPorArea = etapas.reduce((acc, e) => {
    const area = e.area || 'Sem área';
    if (!acc[area]) acc[area] = [];
    acc[area].push(e);
    return acc;
  }, {});
  const etapasPorResponsavel = etapas.reduce((acc, e) => {
    const resp = e.responsavel || 'Sem responsável';
    if (!acc[resp]) acc[resp] = { total: 0, atrasadas: 0 };
    acc[resp].total++;
    if (e.status === 'atrasado' || e.status === 'concluido_atraso') acc[resp].atrasadas++;
    return acc;
  }, {});
  const etapasPorEmpresa = etapas.reduce((acc, e) => {
    const emp = e.empresaNome || 'Sem empresa';
    if (!acc[emp]) acc[emp] = { total: 0, atrasadas: 0, concluidas: 0 };
    acc[emp].total++;
    if (e.status === 'atrasado' || e.status === 'concluido_atraso') acc[emp].atrasadas++;
    if (e.status === 'concluido' || e.status === 'concluido_atraso') acc[emp].concluidas++;
    return acc;
  }, {});

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Relatórios</h1>
            <p style={{ color: 'var(--text-muted)' }}>Relatórios gerenciais do fechamento contábil</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <div className="period-filter-group">
            <span className="period-filter-label">Período</span>
            <select
            value={periodoSelecionado?.id || ''}
            onChange={(e) => {
              const periodo = periodos.find(p => p.id === e.target.value);
              setPeriodoSelecionado(periodo);
            }}
            className="period-filter"
            aria-label="Selecionar período"
          >
            {periodos.map(p => (
              <option key={p.id} value={p.id}>
                {p.id === 'todos' ? 'Todos os Períodos' : new Date(p.ano, p.mes - 1).toLocaleString('pt-BR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase()) + `/${p.ano}`}
              </option>
            ))}
            </select>
          </div>
          
          <button
            onClick={exportarCSV}
            className="btn btn-secondary"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6" style={{ borderBottom: '1px solid var(--border)' }}>
        <TabButton active={tab === 'resumo'} onClick={() => setTab('resumo')} icon={<FileText className="w-4 h-4" />} label="Resumo" />
        <TabButton active={tab === 'atrasadas'} onClick={() => setTab('atrasadas')} icon={<AlertTriangle className="w-4 h-4" />} label="Atrasadas" />
        <TabButton active={tab === 'concluidas_atraso'} onClick={() => setTab('concluidas_atraso')} icon={<Clock className="w-4 h-4" />} label="Concluídas c/ Atraso" />
        <TabButton active={tab === 'areas'} onClick={() => setTab('areas')} icon={<BarChart3 className="w-4 h-4" />} label="Por Área" />
        <TabButton active={tab === 'responsaveis'} onClick={() => setTab('responsaveis')} icon={<Users className="w-4 h-4" />} label="Responsáveis" />
        <TabButton active={tab === 'por_dia'} onClick={() => setTab('por_dia')} icon={<CalendarDays className="w-4 h-4" />} label="Por Dia" />
        <TabButton active={tab === 'tabela_dinamica'} onClick={() => setTab('tabela_dinamica')} icon={<FileSpreadsheet className="w-4 h-4" />} label="Tabela Dinâmica" />
        {viewAllCompanies && <TabButton active={tab === 'empresas'} onClick={() => setTab('empresas')} icon={<Building2 className="w-4 h-4" />} label="Por Empresa" />}
      </div>

      {/* Conteúdo */}
      {tab === 'resumo' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>Relatório Final do Fechamento</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Período: {periodoSelecionado?.mes}/{periodoSelecionado?.ano}</p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Concluídas" value={indicadores?.concluidas || 0} color="green" />
            <StatCard label="Atrasadas" value={indicadores?.atrasadas || 0} color="red" />
            <StatCard label="Com Atraso" value={indicadores?.concluidasComAtraso || 0} color="orange" />
            <StatCard label="Tempo Médio Atraso" value={`${indicadores?.tempoMedioAtraso || 0} dias`} color="blue" />
          </div>

          <div className="rounded-lg p-4" style={{ background: 'var(--surface-2)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              <strong>Progresso Total:</strong> {indicadores?.percentualConcluido || 0}%
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              <strong>Total de Etapas:</strong> {indicadores?.total || 0}
            </p>
          </div>
        </div>
      )}

      {tab === 'atrasadas' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Etapas Atrasadas</h2>
          
          {etapasAtrasadas.length === 0 ? (
            <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>Nenhuma etapa atrasada</p>
          ) : (
            <div className="space-y-2">
              {etapasAtrasadas.map(etapa => (
                <div key={etapa.id} className="flex items-center justify-between p-4 rounded-lg" style={{ background: 'var(--danger-soft)' }}>
                  <div>
                    <p className="font-medium" style={{ color: 'var(--text)' }}>{etapa.nome}</p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{etapa.responsavel || 'Sem responsável'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Prevista: {etapa.dataPrevista ? format(new Date(etapa.dataPrevista), 'MM/dd') : '-'}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      etapa.status === 'atrasado' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'
                    }`}>
                      {getStatusLabel(etapa.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'concluidas_atraso' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Etapas Concluídas com Atraso</h2>
          
          {etapas.filter(e => e.status === 'concluido_atraso').length === 0 ? (
            <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>Nenhuma etapa concluída com atraso</p>
          ) : (
            <div className="space-y-2">
              {etapas.filter(e => e.status === 'concluido_atraso').map(etapa => (
                <div key={etapa.id} className="p-4 rounded-lg" style={{ background: 'var(--warning-soft)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium" style={{ color: 'var(--text)' }}>{etapa.nome}</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{etapa.responsavel || 'Sem responsável'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Prevista: {etapa.dataPrevista ? format(new Date(etapa.dataPrevista), 'dd/MM') : '-'} | 
                        Real: {etapa.dataReal ? format(new Date(etapa.dataReal), 'dd/MM') : '-'}
                      </p>
                      <span className="badge badge-warning">
                        Concluído com Atraso
                      </span>
                    </div>
                  </div>
                  {etapa.observacoes && (
                    <p className="text-sm mt-2 pt-2" style={{ borderTop: '1px solid var(--warning-border)', color: 'var(--warning-text)' }}><strong>Observação:</strong> {etapa.observacoes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'areas' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Relatório por Área</h2>
          
          <div className="space-y-4">
            {Object.entries(etapasPorArea).map(([area, etapasArea]) => {
              const concluidas = etapasArea.filter(e => e.status === 'concluido' || e.status === 'concluido_atraso').length;
              const percentual = Math.round((concluidas / etapasArea.length) * 100);
              
              return (
                <div key={area} className="p-4 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium" style={{ color: 'var(--text)' }}>{area}</span>
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{concluidas}/{etapasArea.length} ({percentual}%)</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${percentual}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'empresas' && viewAllCompanies && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Relatório por Empresa</h2>
          
          <div className="space-y-4">
            {Object.entries(etapasPorEmpresa).map(([empresa, dados]) => {
              const percentual = dados.total > 0 ? Math.round((dados.concluidas / dados.total) * 100) : 0;
              
              return (
                <div key={empresa} className="p-4 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium" style={{ color: 'var(--text)' }}>{empresa}</span>
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{dados.concluidas}/{dados.total} ({percentual}%)</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${percentual}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'responsaveis' && (
        <div className="card overflow-hidden">
          <div className="p-6">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Ranking de Responsáveis</h2>
          </div>
          
          <table className="w-full">
            <thead style={{ background: 'var(--surface-2)' }}>
              <tr>
                <th className="table-header">Responsável</th>
                <th className="table-header">Total</th>
                <th className="table-header">Atrasadas</th>
                <th className="table-header">% Atraso</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {Object.entries(etapasPorResponsavel)
                .sort((a, b) => b[1].atrasadas - a[1].atrasadas)
                .map(([resp, dados]) => (
                  <tr key={resp} className="table-row">
                    <td className="table-cell font-medium" style={{ color: 'var(--text)' }}>{resp}</td>
                    <td className="table-cell">{dados.total}</td>
                    <td className="table-cell">{dados.atrasadas}</td>
                    <td className="table-cell">
                      <span className={`badge ${
                        dados.atrasadas > 0 ? 'badge-danger' : 'badge-success'
                      }`}>
                        {Math.round((dados.atrasadas / dados.total) * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'tabela_dinamica' && (
        <TabelaDinamicaContainer empresaId={empresaAtual?.id} />
      )}

      {tab === 'por_dia' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Etapas por Dia</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Distribuição de etapas por data prevista (eixo: responsável)</p>
          
          {(() => {
            // Agrupa por dia e por responsável
            const porDia = {};
            const todosUsuarios = new Set();
            etapas.forEach(e => {
              if (!e.dataPrevista) return;
              const dia = format(new Date(e.dataPrevista), 'dd/MM');
              const usuario = e.responsavel || 'Sem responsável';
              todosUsuarios.add(usuario);
              if (!porDia[dia]) porDia[dia] = { total: 0, usuarios: {} };
              porDia[dia].total++;
              porDia[dia].usuarios[usuario] = (porDia[dia].usuarios[usuario] || 0) + 1;
            });
            const listaUsuarios = Array.from(todosUsuarios).sort();
            const dados = Object.entries(porDia)
              .sort(([a], [b]) => {
                const [dA, mA] = a.split('/').map(Number);
                const [dB, mB] = b.split('/').map(Number);
                return mA - mB || dA - dB;
              })
              .slice(-15)
              .map(([dia, vals]) => ({ label: dia, total: vals.total, usuarios: vals.usuarios }));
            
            return (
              <GraficoColunasPorUsuario
                dados={dados}
                listaUsuarios={listaUsuarios}
                alturaMax={200}
              />
            );
          })()}
        </div>
      )}

    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium transition-colors ${
        active 
          ? 'border-[var(--primary)] text-[var(--primary)]' 
          : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ label, value, color }) {
  const colors = {
    green: { bg: 'var(--success-soft)', text: 'var(--success)' },
    red: { bg: 'var(--danger-soft)', text: 'var(--danger)' },
    orange: { bg: 'var(--warning-soft)', text: 'var(--warning)' },
    blue: { bg: 'var(--info-soft)', text: 'var(--info)' },
  };

  return (
    <div className="p-4 rounded-lg" style={{ background: colors[color].bg, color: colors[color].text }}>
      <p className="text-sm opacity-80 font-medium">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

const CORES_USUARIOS = [
  '#35dab3', '#26b8e0', '#7c9cff', '#f5b64d', '#fb7169',
  '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa',
  '#fb923c', '#c084fc', '#2dd4bf', '#f87171', '#4ade80',
];

function GraficoColunasPorUsuario({ dados, listaUsuarios, alturaMax = 200 }) {
  const [tooltip, setTooltip] = useState(null);

  if (!dados || dados.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
        Nenhum dado disponível para o gráfico
      </div>
    );
  }

  const maxTotal = Math.max(...dados.map(d => d.total), 1);

  const makeSummary = (item) => {
    const lines = listaUsuarios
      .filter(u => (item.usuarios[u] || 0) > 0)
      .map(u => `${u}: ${item.usuarios[u]} tarefa(s)`);
    return [`📅 ${item.label}`, `Total: ${item.total}`, '', ...lines].join('\n');
  };

  return (
    <div className="w-full overflow-x-auto relative">
      <div className="flex items-end gap-3 pb-6 min-w-[400px]" style={{ height: alturaMax + 60 }}>
        {dados.map((item, idx) => {
          const alturaTotal = (item.total / maxTotal) * alturaMax;

          return (
            <div
              key={idx}
              className="flex-1 flex flex-col items-center gap-1 min-w-[40px] relative"
              onMouseEnter={(e) => setTooltip({ item, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setTooltip(null)}
              onMouseMove={(e) => setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
            >
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{item.total}</span>
              <div className="w-full flex flex-col-reverse rounded-t-md overflow-hidden cursor-pointer" style={{ height: alturaTotal, background: 'var(--surface-2)' }}>
                {listaUsuarios.map((usuario, uIdx) => {
                  const count = item.usuarios[usuario] || 0;
                  if (count === 0) return null;
                  const altura = (count / item.total) * alturaTotal;
                  return (
                    <div
                      key={usuario}
                      style={{ height: `${altura}px`, background: CORES_USUARIOS[uIdx % CORES_USUARIOS.length], minHeight: '2px' }}
                      title={`${usuario}: ${count} tarefa(s)`}
                    />
                  );
                })}
              </div>
              <span className="text-xs truncate max-w-full text-center" style={{ color: 'var(--text-muted)' }} title={item.label}>{item.label}</span>
            </div>
          );
        })}
      </div>
      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 p-3 rounded-lg shadow-lg text-xs pointer-events-none"
          style={{
            left: Math.min(tooltip.x + 10, window.innerWidth - 200),
            top: Math.max(tooltip.y - 10, 10),
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            minWidth: '160px'
          }}
        >
          <p className="font-semibold mb-1" style={{ color: 'var(--accent)' }}>📅 {tooltip.item.label}</p>
          <p className="mb-1" style={{ color: 'var(--text-muted)' }}>Total: <strong>{tooltip.item.total}</strong></p>
          <div className="mt-1 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
            {listaUsuarios
              .filter(u => (tooltip.item.usuarios[u] || 0) > 0)
              .map((u, uIdx) => (
                <div key={u} className="flex items-center gap-2 mt-1">
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CORES_USUARIOS[uIdx % CORES_USUARIOS.length] }} />
                  <span className="flex-1 truncate">{u}</span>
                  <span className="font-medium">{tooltip.item.usuarios[u]}</span>
                </div>
              ))}
          </div>
        </div>
      )}
      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        {listaUsuarios.map((usuario, uIdx) => (
          <div key={usuario} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ background: CORES_USUARIOS[uIdx % CORES_USUARIOS.length] }} />
            <span>{usuario}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabelaDinamicaContainer({ empresaId }) {
  const [activeTab, setActiveTab] = useState('cenario1');
  const [dataCenario1, setDataCenario1] = useState([]);
  const [dataCenario2, setDataCenario2] = useState([]);
  const [colsCenario1, setColsCenario1] = useState([]);
  const [colsCenario2, setColsCenario2] = useState([]);
  const [cenarioSelecionado1, setCenarioSelecionado1] = useState('Principal');
  const [cenarioSelecionado2, setCenarioSelecionado2] = useState('Principal');

  if (!empresaId) {
    return (
      <div className="card p-6 text-center" style={{ color: 'var(--text-muted)' }}>
        Selecione uma empresa para visualizar a tabela dinâmica.
      </div>
    );
  }

  return (
    <div className="card p-0">
      <div className="flex gap-2 p-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <TabButton active={activeTab === 'cenario1'} onClick={() => setActiveTab('cenario1')} icon={<FileSpreadsheet className="w-4 h-4" />} label="Cenário 1" />
        <TabButton active={activeTab === 'cenario2'} onClick={() => setActiveTab('cenario2')} icon={<FileSpreadsheet className="w-4 h-4" />} label="Cenário 2" />
        <TabButton active={activeTab === 'conciliacao'} onClick={() => setActiveTab('conciliacao')} icon={<GitCompareArrows className="w-4 h-4" />} label="Conciliação" />
      </div>
      <div className="p-6">
        {activeTab === 'cenario1' && (
          <TabelaDinamicaComponent
            empresaId={empresaId}
            onDataChange={setDataCenario1}
            onColsChange={setColsCenario1}
            cenarioSelecionado={cenarioSelecionado1}
            setCenarioSelecionado={setCenarioSelecionado1}
            instanceId="1"
          />
        )}
        {activeTab === 'cenario2' && (
          <TabelaDinamicaComponent
            empresaId={empresaId}
            onDataChange={setDataCenario2}
            onColsChange={setColsCenario2}
            cenarioSelecionado={cenarioSelecionado2}
            setCenarioSelecionado={setCenarioSelecionado2}
            instanceId="2"
          />
        )}
        {activeTab === 'conciliacao' && (
          <TabelaConciliacao data1={dataCenario1} data2={dataCenario2} cols1={colsCenario1} cols2={colsCenario2} />
        )}
      </div>
    </div>
  );
}

function TabelaConciliacao({ data1, data2, cols1, cols2 }) {
  const { headers, conciliacaoData } = useMemo(() => {
    if (!data1.length || !data2.length || !data1[0]?.chave_dinamica || !data2[0]?.chave_dinamica) {
      return { headers: [], conciliacaoData: [] };
    }

    const map1 = new Map(data1.map(row => [row.chave_dinamica, row]));
    const map2 = new Map(data2.map(row => [row.chave_dinamica, row]));
    const allKeys = new Set([...map1.keys(), ...map2.keys()]);
    const commonCols = new Set([...cols1, ...cols2].filter(c => c !== 'chave_dinamica' && c !== 'cenario'));

    const result = [];
    allKeys.forEach(key => {
      const row1 = map1.get(key);
      const row2 = map2.get(key);
      let status = '';
      if (row1 && row2) status = 'Encontrado em ambos';
      else if (row1) status = 'Apenas no Cenário 1';
      else if (row2) status = 'Apenas no Cenário 2';

      const rowData = { chave_dinamica: key, status };
      commonCols.forEach(col => {
        const val1 = row1?.[col] ?? '';
        const val2 = row2?.[col] ?? '';
        rowData[`${col}_1`] = val1;
        rowData[`${col}_2`] = val2;
        rowData[`${col}_diff`] = val1 !== val2;
      });
      result.push(rowData);
    });

    return { headers: Array.from(commonCols), conciliacaoData: result };
  }, [data1, data2, cols1, cols2]);

  if (!conciliacaoData.length) {
    return <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>Configure a chave e os dados nos Cenários 1 e 2 para ver a conciliação.</div>;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Conciliação de Cenários</h2>
      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-xs text-left">
          <thead style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <tr>
              <th className="px-3 py-2 font-medium sticky left-0 bg-[var(--surface-2)] z-10">Chave</th>
              <th className="px-3 py-2 font-medium">Status</th>
              {headers.map(h => <th key={h} colSpan={2} className="px-3 py-2 font-medium text-center border-l border-[var(--border)]">{h}</th>)}
            </tr>
            <tr>
              <th className="px-3 py-2 font-medium sticky left-0 bg-[var(--surface-2)] z-10"></th>
              <th className="px-3 py-2 font-medium"></th>
              {headers.map(h => <React.Fragment key={h}><th className="px-3 py-2 font-medium border-l border-[var(--border)]">Cenário 1</th><th className="px-3 py-2 font-medium">Cenário 2</th></React.Fragment>)}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {conciliacaoData.map((row, idx) => (
              <tr key={idx} className="hover:bg-[var(--surface-2)]">
                <td className="px-3 py-1.5 whitespace-nowrap sticky left-0 bg-inherit z-10 font-medium" style={{ color: 'var(--text)' }}>{row.chave_dinamica}</td>
                <td className="px-3 py-1.5 whitespace-nowrap"><span className={`badge ${row.status === 'Encontrado em ambos' ? 'badge-success' : row.status === 'Apenas no Cenário 1' ? 'badge-info' : 'badge-warning'}`}>{row.status}</span></td>
                {headers.map(h => <React.Fragment key={h}><td className={`px-3 py-1.5 whitespace-nowrap border-l border-[var(--border)] ${row[`${h}_diff`] ? 'bg-red-500/10' : ''}`}>{String(row[`${h}_1`])}</td><td className={`px-3 py-1.5 whitespace-nowrap ${row[`${h}_diff`] ? 'bg-red-500/10' : ''}`}>{String(row[`${h}_2`])}</td></React.Fragment>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabelaDinamicaComponent({ empresaId, onDataChange, onColsChange, instanceId, cenarioSelecionado, setCenarioSelecionado }) {
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCols, setSelectedCols] = useState([]);
  const [draggedCol, setDraggedCol] = useState(null);
  const [keyTemplate, setKeyTemplate] = useState('area&codigo&nome');
  const [dynamicKeyIncluded, setDynamicKeyIncluded] = useState(false);
  const [cenarios, setCenarios] = useState([]);
  const db = getDatabase();
  const firestoreDb = getFirestore();

  useEffect(() => {
    if (!empresaId) return;
    setLoading(true);

    const fetchAll = async () => {
      try {
        const cenariosDisponiveis = [{ label: 'Principal', nome: 'Principal', index: -1 }];
        // Fetch main spreadsheet
        const mainSnap = await new Promise(resolve => {
          onValue(ref(db, `tenants/${empresaId}/tabelaGoogle`), resolve, { onlyOnce: true });
        });
        const mainData = mainSnap.val() || [];

        // Fetch additional spreadsheets config
        const empresaSnap = await new Promise(resolve => {
          onSnapshot(doc(firestoreDb, 'tenants', empresaId), resolve);
        });
        const empresaData = empresaSnap.data();
        const additional = empresaData?.additionalSpreadsheets || [];
        additional.forEach((s, i) => {
          cenariosDisponiveis.push({ label: s.label || `Planilha ${i + 1}`, nome: s.label || `Planilha ${i + 1}` });
        });
        setCenarios(cenariosDisponiveis);

        const allRows = [];
        const allHeaders = new Set();

        // Add main data with "Principal" cenario
        const mainArray = Array.isArray(mainData) ? mainData : Object.values(mainData);
        mainArray.forEach(row => {
          if (typeof row === 'object' && row !== null) {
            const newRow = { cenario: 'Principal', ...row };
            allRows.push(newRow);
            Object.keys(newRow).forEach(k => allHeaders.add(k));
          }
        });

        // Fetch and add additional spreadsheets
        for (let i = 0; i < additional.length; i++) {
          const s = additional[i];
          if (!s.spreadsheetId) continue;
          try {
            const snap = await new Promise(resolve => {
              onValue(ref(db, `tenants/${empresaId}/tabelaGoogle_${i}`), resolve, { onlyOnce: true });
            });
            const addData = snap.val() || [];
            const addArray = Array.isArray(addData) ? addData : Object.values(addData);
            const label = s.label || `Planilha ${i + 1}`;
            addArray.forEach(row => {
              if (typeof row === 'object' && row !== null) {
                const newRow = { cenario: label, ...row };
                allRows.push(newRow);
                Object.keys(newRow).forEach(k => allHeaders.add(k));
              }
            });
          } catch (e) {
            console.warn(`Erro ao carregar planilha adicional ${i}:`, e);
          }
        }

        const headerList = Array.from(allHeaders);
        setHeaders(headerList);
        setSelectedCols(headerList.slice(0, 10)); // Default: first 10 columns
        setData(allRows);
      } catch (e) {
        console.error('Erro ao carregar dados da tabela dinâmica:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [empresaId, db]);

  useEffect(() => {
    if (!empresaId || !cenarioSelecionado) return;

    const fetchCenarioData = async () => {
      setLoading(true);
      try {
        const empresaDoc = await new Promise(resolve => onSnapshot(doc(firestoreDb, 'tenants', empresaId), resolve));
        const empresaConfig = empresaDoc.data();
        const cenariosDisponiveis = [{ label: empresaConfig?.mainSpreadsheetLabel || 'Principal', nome: 'Principal', index: -1 }];
        (empresaConfig?.additionalSpreadsheets || []).forEach((s, i) => {
          cenariosDisponiveis.push({ label: s.label || `Planilha ${i + 1}`, nome: s.label || `Planilha ${i + 1}`, index: i });
        });
        setCenarios(cenariosDisponiveis);

        const cenarioInfo = cenariosDisponiveis.find(c => c.nome === cenarioSelecionado);
        if (!cenarioInfo) return;

        const dataPath = cenarioInfo.index === -1 ? `tenants/${empresaId}/tabelaGoogle` : `tenants/${empresaId}/tabelaGoogle_${cenarioInfo.index}`;
        const dataSnap = await new Promise(resolve => onValue(ref(db, dataPath), resolve, { onlyOnce: true }));
        const rawData = dataSnap.val() || [];
        const dataArray = Array.isArray(rawData) ? rawData : Object.values(rawData);

        const allHeaders = new Set();
        dataArray.forEach(row => Object.keys(row).forEach(k => allHeaders.add(k)));

        setHeaders(Array.from(allHeaders));
        setData(dataArray.map(row => ({ ...row, cenario: cenarioSelecionado })));
      } catch (error) {
        console.error("Erro ao carregar dados do cenário:", error);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCenarioData();
  }, [empresaId, cenarioSelecionado, db, firestoreDb]);

  const dadosCenario = useMemo(() => {
    return data.filter(row => row.cenario === cenarioSelecionado);
  }, [data, cenarioSelecionado]);

  useEffect(() => {
    // Se a chave dinâmica for incluída, adicione-a aos cabeçalhos e colunas selecionadas
    if (dynamicKeyIncluded && !headers.includes('chave_dinamica')) {
      setHeaders(prev => [...prev, 'chave_dinamica']);
      if (!selectedCols.includes('chave_dinamica')) {
        setSelectedCols(prev => ['chave_dinamica', ...prev]);
      }
    }
  }, [dynamicKeyIncluded, headers, selectedCols]);

  const processedData = useMemo(() => {
    if (!keyTemplate) return dadosCenario.map(row => ({ ...row, chave_dinamica: '' }));

    const columnsToJoin = keyTemplate.split('&').map(s => s.trim()).filter(Boolean);
    if (columnsToJoin.length === 0) return dadosCenario.map(row => ({ ...row, chave_dinamica: '' }));

    return dadosCenario.map(row => {
      const generatedKey = columnsToJoin
        .map(colName => row[colName] ?? '')
        .join('&');
      return { ...row, chave_dinamica: generatedKey };
    });
  }, [dadosCenario, keyTemplate]);

  useEffect(() => {
    if (onDataChange) onDataChange(processedData);
    if (onColsChange) onColsChange(selectedCols);
  }, [processedData, selectedCols, onDataChange, onColsChange]);

  const toggleColumn = (col) => {
    setSelectedCols(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const handleDragStart = (e, col) => {
    setDraggedCol(col);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, targetCol) => {
    e.preventDefault();
    if (draggedCol && draggedCol !== targetCol) {
      const fromIndex = selectedCols.indexOf(draggedCol);
      const toIndex = selectedCols.indexOf(targetCol);
      const newCols = [...selectedCols];
      // Move o item arrastado para a nova posição
      newCols.splice(fromIndex, 1);
      newCols.splice(toIndex, 0, draggedCol);
      setSelectedCols(newCols);
    }
    setDraggedCol(null);
  };

  if (loading) {
    return (
      <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
        Carregando dados...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
        Nenhum dado encontrado. Configure as planilhas na página Empresas.
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Selecione as colunas para exibir e arraste os cabeçalhos para reordená-las.
      </p>
      {/* Seletor de Cenário */}
      <div className="mb-6">
        <label className="form-label">Fonte de Dados (Cenário)</label>
        <select
          value={cenarioSelecionado}
          onChange={(e) => setCenarioSelecionado(e.target.value)}
          className="form-input w-full max-w-md"
        >
          {cenarios.map(c => (
            <option key={c.label} value={c.nome}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      {/* Gerador de Chave */}
      <div className="mb-6">
        <label className="form-label flex items-center gap-2">Gerador de Chave</label>
        <div className="flex items-center gap-2">
          <div className="relative flex-grow max-w-md">
            <KeyRound className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={keyTemplate}
              onChange={(e) => setKeyTemplate(e.target.value)}
              className="form-input w-full pl-9"
              placeholder="Ex: area&codigo&nome"
            />
          </div>
          <button
            type="button"
            onClick={() => setDynamicKeyIncluded(true)}
            className="btn btn-secondary"
          >
            Incluir Chave na Tabela
          </button>
        </div>
        <p className="form-hint">Use '&' para separar os nomes das colunas que deseja combinar.</p>
      </div>

      {/* Seletor de Colunas */}
      <div className="mb-4">
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Colunas visíveis:</p>
        <div className="flex flex-wrap gap-1">
          {['chave_dinamica', ...headers].sort().map(col => (
            <button
              key={col}
              onClick={() => toggleColumn(col)}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${
                selectedCols.includes(col)
                  ? 'text-white bg-[var(--accent)]'
                  : 'text-[var(--text-muted)] bg-[var(--surface-2)] hover:bg-[var(--surface)]'
              }`}
            >
              {col}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela de Dados */}
      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-xs text-left">
          <thead style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <tr>
              {selectedCols.map(col => (
                <th 
                  key={col} 
                  className="px-3 py-2 font-medium whitespace-nowrap cursor-move"
                  draggable
                  onDragStart={(e) => handleDragStart(e, col)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, col)}
                >
                  <div className="flex items-center gap-1">
                    <GripVertical className="w-3 h-3 text-[var(--text-dim)]" />
                    {col}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {processedData.map((row, idx) => (
              <tr key={idx} className="hover:bg-[var(--surface-2)]">
                {selectedCols.map(col => (
                  <td key={col} className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate" style={{ color: 'var(--text)' }}>
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
        Total: {processedData.length} registros
      </p>
    </div>
  );
}

function GraficoColunas({ dados, alturaMax = 200 }) {
  if (!dados || dados.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
        Nenhum dado disponível para o gráfico
      </div>
    );
  }

  const maxTotal = Math.max(...dados.map(d => d.total), 1);

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end gap-3 pb-6 min-w-[400px]" style={{ height: alturaMax + 60 }}>
        {dados.map((item, idx) => {
          const alturaTotal = (item.total / maxTotal) * alturaMax;
          const alturaConcluidas = (item.concluidas / item.total) * alturaTotal || 0;
          const alturaAtrasadas = (item.atrasadas / item.total) * alturaTotal || 0;
          const alturaPendentes = alturaTotal - alturaConcluidas - alturaAtrasadas;

          return (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1 min-w-[40px]">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{item.total}</span>
              <div className="w-full flex flex-col-reverse rounded-t-md overflow-hidden" style={{ height: alturaTotal, background: 'var(--surface-2)' }}>
                {alturaPendentes > 0 && (
                  <div style={{ height: `${alturaPendentes}px`, background: 'var(--warning-soft)', minHeight: alturaPendentes > 0 ? '2px' : '0' }} />
                )}
                {alturaAtrasadas > 0 && (
                  <div style={{ height: `${alturaAtrasadas}px`, background: 'var(--danger-soft)', minHeight: alturaAtrasadas > 0 ? '2px' : '0' }} />
                )}
                {alturaConcluidas > 0 && (
                  <div style={{ height: `${alturaConcluidas}px`, background: 'var(--success-soft)', minHeight: alturaConcluidas > 0 ? '2px' : '0' }} />
                )}
              </div>
              <span className="text-xs truncate max-w-full text-center" style={{ color: 'var(--text-muted)' }} title={item.label}>{item.label}</span>
            </div>
          );
        })}
      </div>
      {/* Legenda */}
      <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--success-soft)' }} />
          <span>Concluídas</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--danger-soft)' }} />
          <span>Atrasadas</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--warning-soft)' }} />
          <span>Pendentes</span>
        </div>
      </div>
    </div>
  );
}
