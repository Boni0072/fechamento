import { useState, useEffect, useMemo } from 'react';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { getDatabase, ref, onValue } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { getPeriodos, getEtapas, getStatusLabel } from '../services/database';
import { FileText, Download, BarChart3, Users, AlertTriangle, Building2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { checkPermission } from './permissionUtils';

export default function Relatorios() {
  const { empresaAtual, empresas } = useAuth();
  const { loading: loadingPermissoes, user: authUser } = usePermissao('relatorios');

  const empresasParaBuscar = useMemo(() => {
    if (empresaAtual) return [empresaAtual];
    return empresas || [];
  }, [empresaAtual, empresas]);
  const viewAllCompanies = !empresaAtual;

  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [periodos, setPeriodos] = useState([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState(null);
  const [allPeriodsMap, setAllPeriodsMap] = useState({});
  const [stepsByCompany, setStepsByCompany] = useState({});
  const [etapas, setEtapas] = useState([]);
  const [indicadores, setIndicadores] = useState(null);
  const [tab, setTab] = useState('resumo');

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

  // Restrição removida
  const autorizado = true;

  useEffect(() => {
    if (!empresasParaBuscar || empresasParaBuscar.length === 0) {
      setPeriodos([]);
      setPeriodoSelecionado(null);
      setAllPeriodsMap({});
      return;
    }

    setAllPeriodsMap({});
    const unsubs = [];
    empresasParaBuscar.forEach(emp => {
      const unsubscribe = getPeriodos(emp.id, (data) => {
        setAllPeriodsMap(prev => ({ ...prev, [emp.id]: data || [] }));
      });
      unsubs.push(unsubscribe);
    });

    return () => unsubs.forEach(u => u());
  }, [empresasParaBuscar]);

  useEffect(() => {
    const allPeriods = Object.values(allPeriodsMap).flat();
    const uniqueMap = new Map();
    
    allPeriods.forEach(p => {
      const key = `${p.ano}-${p.mes}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, { 
          id: key, 
          mes: p.mes, 
          ano: p.ano 
        });
      }
    });

    const sorted = Array.from(uniqueMap.values()).sort((a, b) => {
      if (b.ano !== a.ano) return b.ano - a.ano;
      return b.mes - a.mes;
    });

    setPeriodos(sorted);
    
    if (!periodoSelecionado && sorted.length > 0) {
      setPeriodoSelecionado(sorted[0]);
    } else if (periodoSelecionado) {
        const exists = sorted.find(p => p.id === periodoSelecionado.id);
        if (!exists && sorted.length > 0) setPeriodoSelecionado(sorted[0]);
    }
  }, [allPeriodsMap]);

  useEffect(() => {
    if (!empresasParaBuscar || empresasParaBuscar.length === 0) {
      setEtapas([]);
      setStepsByCompany({});
      return;
    }

    setStepsByCompany({});
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
    const allSteps = Object.values(stepsByCompany).flat();
    if (periodoSelecionado) {
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
    if (!Array.isArray(data)) return [];
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

    data.forEach((row) => {
      const getVal = (keys) => {
        const normalize = (k) => k ? String(k).toLowerCase().replace(/\s+/g, ' ').trim() : '';
        for (const k of keys) {
          let val = row[k];
          if (val === undefined) {
            const target = normalize(k);
            const foundKey = Object.keys(row).find(rk => normalize(rk) === target);
            if (foundKey) val = row[foundKey];
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
            <h1 className="text-2xl font-bold text-slate-800">Relatórios</h1>
            <p className="text-slate-500">Relatórios gerenciais do fechamento contábil</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <select
            value={periodoSelecionado?.id || ''}
            onChange={(e) => {
              const periodo = periodos.find(p => p.id === e.target.value);
              setPeriodoSelecionado(periodo);
            }}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            {periodos.map(p => (
              <option key={p.id} value={p.id}>{p.mes}/{p.ano}</option>
            ))}
          </select>
          
          <button
            onClick={exportarCSV}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200">
        <TabButton active={tab === 'resumo'} onClick={() => setTab('resumo')} icon={<FileText className="w-4 h-4" />} label="Resumo" />
        <TabButton active={tab === 'atrasadas'} onClick={() => setTab('atrasadas')} icon={<AlertTriangle className="w-4 h-4" />} label="Atrasadas" />
        <TabButton active={tab === 'concluidas_atraso'} onClick={() => setTab('concluidas_atraso')} icon={<Clock className="w-4 h-4" />} label="Concluídas c/ Atraso" />
        <TabButton active={tab === 'areas'} onClick={() => setTab('areas')} icon={<BarChart3 className="w-4 h-4" />} label="Por Área" />
        <TabButton active={tab === 'responsaveis'} onClick={() => setTab('responsaveis')} icon={<Users className="w-4 h-4" />} label="Responsáveis" />
        {viewAllCompanies && <TabButton active={tab === 'empresas'} onClick={() => setTab('empresas')} icon={<Building2 className="w-4 h-4" />} label="Por Empresa" />}
      </div>

      {/* Conteúdo */}
      {tab === 'resumo' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Relatório Final do Fechamento</h2>
          <p className="text-sm text-slate-500 mb-6">Período: {periodoSelecionado?.mes}/{periodoSelecionado?.ano}</p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Concluídas" value={indicadores?.concluidas || 0} color="green" />
            <StatCard label="Atrasadas" value={indicadores?.atrasadas || 0} color="red" />
            <StatCard label="Com Atraso" value={indicadores?.concluidasComAtraso || 0} color="orange" />
            <StatCard label="Tempo Médio Atraso" value={`${indicadores?.tempoMedioAtraso || 0} dias`} color="blue" />
          </div>

          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-600">
              <strong>Progresso Total:</strong> {indicadores?.percentualConcluido || 0}%
            </p>
            <p className="text-sm text-slate-600">
              <strong>Total de Etapas:</strong> {indicadores?.total || 0}
            </p>
          </div>
        </div>
      )}

      {tab === 'atrasadas' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Etapas Atrasadas</h2>
          
          {etapasAtrasadas.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Nenhuma etapa atrasada</p>
          ) : (
            <div className="space-y-2">
              {etapasAtrasadas.map(etapa => (
                <div key={etapa.id} className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-800">{etapa.nome}</p>
                    <p className="text-sm text-slate-500">{etapa.responsavel || 'Sem responsável'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-600">Prevista: {etapa.dataPrevista ? format(new Date(etapa.dataPrevista), 'MM/dd') : '-'}</p>
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
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Etapas Concluídas com Atraso</h2>
          
          {etapas.filter(e => e.status === 'concluido_atraso').length === 0 ? (
            <p className="text-slate-500 text-center py-8">Nenhuma etapa concluída com atraso</p>
          ) : (
            <div className="space-y-2">
              {etapas.filter(e => e.status === 'concluido_atraso').map(etapa => (
                <div key={etapa.id} className="p-4 bg-orange-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-slate-800">{etapa.nome}</p>
                      <p className="text-sm text-slate-500">{etapa.responsavel || 'Sem responsável'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-600">
                        Prevista: {etapa.dataPrevista ? format(new Date(etapa.dataPrevista), 'dd/MM') : '-'} | 
                        Real: {etapa.dataReal ? format(new Date(etapa.dataReal), 'dd/MM') : '-'}
                      </p>
                      <span className="text-xs px-2 py-1 rounded-full bg-orange-500 text-white">
                        Concluído com Atraso
                      </span>
                    </div>
                  </div>
                  {etapa.observacoes && (
                    <p className="text-sm text-slate-600 mt-2 border-t border-orange-200 pt-2"><strong>Observação:</strong> {etapa.observacoes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'areas' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Relatório por Área</h2>
          
          <div className="space-y-4">
            {Object.entries(etapasPorArea).map(([area, etapasArea]) => {
              const concluidas = etapasArea.filter(e => e.status === 'concluido' || e.status === 'concluido_atraso').length;
              const percentual = Math.round((concluidas / etapasArea.length) * 100);
              
              return (
                <div key={area} className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-800">{area}</span>
                    <span className="text-sm text-slate-500">{concluidas}/{etapasArea.length} ({percentual}%)</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500" style={{ width: `${percentual}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'empresas' && viewAllCompanies && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Relatório por Empresa</h2>
          
          <div className="space-y-4">
            {Object.entries(etapasPorEmpresa).map(([empresa, dados]) => {
              const percentual = dados.total > 0 ? Math.round((dados.concluidas / dados.total) * 100) : 0;
              
              return (
                <div key={empresa} className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-800">{empresa}</span>
                    <span className="text-sm text-slate-500">{dados.concluidas}/{dados.total} ({percentual}%)</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500" style={{ width: `${percentual}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'responsaveis' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Ranking de Responsáveis</h2>
          
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Responsável</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Atrasadas</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">% Atraso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(etapasPorResponsavel)
                .sort((a, b) => b[1].atrasadas - a[1].atrasadas)
                .map(([resp, dados]) => (
                  <tr key={resp}>
                    <td className="px-4 py-3 text-sm text-slate-800">{resp}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{dados.total}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{dados.atrasadas}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        dados.atrasadas > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
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
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
        active 
          ? 'border-primary-600 text-primary-600' 
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ label, value, color }) {
  const colors = {
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    orange: 'bg-orange-50 text-orange-700',
    blue: 'bg-blue-50 text-blue-700',
  };

  return (
    <div className={`p-4 rounded-lg ${colors[color]}`}>
      <p className="text-sm opacity-80">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
