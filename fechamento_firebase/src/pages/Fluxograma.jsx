import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDatabase, ref, onValue, set, push, remove } from 'firebase/database';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { getPeriodos, getEtapas, getStatusColor, getStatusLabel, atualizarEtapa } from '../services/database';
import { format, getDaysInMonth, addDays } from 'date-fns';
import { X, Check, Clock, AlertTriangle, ChevronDown, ChevronUp, CalendarOff, RefreshCw, Calendar } from 'lucide-react';
import TimelineBackground from './TimelineBackground';
import * as XLSX from 'xlsx';
import { checkPermission } from './permissionUtils';

export default function Fluxograma() {
  const navigate = useNavigate();
  const { empresaAtual } = useAuth();
  const { loading: loadingPermissoes, user: authUser } = usePermissao('fluxograma');
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (authUser?.id && empresaAtual?.id) {
      setLoadingProfile(true);
      const db = getFirestore();
      const userRef = doc(db, 'tenants', empresaAtual.id, 'usuarios', authUser.id);
      const unsubscribe = onSnapshot(userRef, (snapshot) => {
        const data = snapshot.data();
        if (!data) {
          console.warn(`Fluxograma: Perfil não encontrado em tenants/${empresaAtual.id}/usuarios/${authUser.id}`);
        }
        setUserProfile(data ? { ...authUser, ...data } : { ...authUser, perfilIncompleto: true });
        setLoadingProfile(false);
      });
      return () => unsubscribe();
    } else {
      if (authUser) setUserProfile(authUser);
      setLoadingProfile(false);
    }
  }, [authUser, empresaAtual]);

  // Restrição removida
  const autorizado = true;

  const [periodos, setPeriodos] = useState([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [etapaSelecionada, setEtapaSelecionada] = useState(null);
  const [intervalo, setIntervalo] = useState(1);
  const [horaInicio, setHoraInicio] = useState(0);
  const [horaFim, setHoraFim] = useState(23);
  const [alturaSlot, setAlturaSlot] = useState(128);
  const [mostrarSemData, setMostrarSemData] = useState(false);
  const [empresaDados, setEmpresaDados] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const timelineRef = useRef(null);
  const [filtroLegenda, setFiltroLegenda] = useState(null);

  // Fetch periods when company changes
  useEffect(() => {
    if (!empresaAtual) {
      setPeriodos([]);
      setPeriodoSelecionado(null);
      return;
    }

    // Busca dados atualizados da empresa no Firestore (onde o spreadsheetId é salvo)
    const db = getFirestore();
    const empresaRef = doc(db, 'tenants', empresaAtual.id);
    const unsubEmpresa = onSnapshot(empresaRef, (snapshot) => {
      const data = snapshot.data();
      if (data) {
        setEmpresaDados({ id: empresaAtual.id, ...data });
      }
    });

    const unsubscribe = getPeriodos(empresaAtual.id, (data) => {
      setPeriodos(data);
      // Automatically select the first period of a new company
      setPeriodoSelecionado(data.length > 0 ? data[0] : null);
    });

    return () => {
      unsubscribe();
      unsubEmpresa();
    };
  }, [empresaAtual]);

  // Fetch etapas when company or period changes
  useEffect(() => {
    if (!empresaAtual || !periodoSelecionado) {
      setEtapas([]);
      return;
    }

    setEtapas([]);
    const unsubscribe = getEtapas(empresaAtual.id, periodoSelecionado.id, (data) => {
      // 1. Filtra duplicatas técnicas (mesmo ID)
      const uniqueById = data.filter((item, index, self) => 
        index === self.findIndex((t) => t.id === item.id)
      );
      
      // 2. Filtra duplicatas lógicas (mesmo Nome ou Código) para evitar visualização repetida
      const uniqueByContent = uniqueById.filter((item, index, self) => 
        index === self.findIndex((t) => (t.codigo && t.codigo === item.codigo) || (!t.codigo && t.nome === item.nome))
      );

      // Ordena por data prevista para garantir consistência visual na renderização e nas conexões
      const sortedData = uniqueByContent.sort((a, b) => {
        if (!a.dataPrevista) return 1;
        if (!b.dataPrevista) return -1;
        return new Date(a.dataPrevista) - new Date(b.dataPrevista);
      });

      setEtapas(sortedData);
    });
    return () => unsubscribe();
  }, [empresaAtual, periodoSelecionado]);

  if (loadingPermissoes || loadingProfile || (authUser && !userProfile) || (userProfile && !userProfile.perfilAcesso && !userProfile.perfilIncompleto)) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Carregando permissões...</p>
      </div>
    );
  }

  if (!empresaAtual) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Selecione uma empresa para visualizar o fluxograma</p>
      </div>
    );
  }

  const handleConcluir = async (etapa) => {
    await atualizarEtapa(
      empresaAtual.id,
      periodoSelecionado.id,
      etapa.id,
      { ...etapa, status: 'concluido', dataReal: new Date().toISOString().split('T')[0] },
      userProfile.id,
      userProfile.nome || userProfile.name
    );
  };

  const handleSync = async () => {
    const dados = empresaDados || empresaAtual;
    if (!dados?.spreadsheetId) {
      if (window.confirm("Esta empresa não possui uma planilha configurada. Deseja ir para a tela de Empresas para configurar agora?")) {
        navigate('/empresas');
      }
      return;
    }
    
    if (!periodoSelecionado) {
      alert("Selecione um período para sincronizar.");
      return;
    }
    
    setSyncing(true);
    try {
      const url = `https://docs.google.com/spreadsheets/d/${dados.spreadsheetId}/gviz/tq?tqx=out:csv&gid=0&t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Erro ao conectar com a planilha.');
      
      const csvText = await response.text();
      if (csvText.trim().toLowerCase().startsWith('<!doctype html') || csvText.includes('<html')) {
        throw new Error('Planilha privada ou link inválido.');
      }

      const workbook = XLSX.read(csvText, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { raw: true });

      // Processamento inicial (tentando manter histórico)
      let processedSteps = processData(data, etapas);

      if (processedSteps.length > 0) {
        let keepHistory = true;

        // Pergunta sobre o histórico (Status/Datas)
        if (etapas.length > 0) {
          keepHistory = window.confirm(
            `Encontrados ${processedSteps.length} registros na planilha.\n` +
            `Existem ${etapas.length} registros no sistema.\n\n` +
            `[OK] = MANTER histórico (Status, Datas, Responsáveis) e atualizar dados.\n` +
            `[Cancelar] = LIMPAR TUDO (Resetar status para 'Pendente' e apagar histórico).`
          );
        }

        // Se escolheu LIMPAR (Cancelar), reprocessa ignorando os dados atuais
        if (!keepHistory) {
          if (!window.confirm("⚠️ TEM CERTEZA?\n\nIsso apagará todos os status 'Concluído' e datas reais.\nO sistema ficará idêntico à planilha original.")) {
            setSyncing(false);
            return;
          }
          processedSteps = processData(data, []); // Passa array vazio para ignorar histórico
        }

        // Confirmação final de substituição
        if (processedSteps.length > 0) {
          const db = getDatabase();
          const etapasRef = ref(db, `tenants/${empresaAtual.id}/periodos/${periodoSelecionado.id}/etapas`);

          try {
            // 1. Limpa visualmente e no banco (Reset Total)
            setEtapas([]); 

            // 2. Prepara os novos dados (Preservando IDs para evitar duplicação)
            const updates = {};
            
            processedSteps.forEach(step => {
              // Se já tem ID (veio do processData/match), usa ele. Se não, cria um novo.
              const key = step.id || push(etapasRef).key;
              const { id, ...dados } = step;
              
              updates[key] = {
                ...dados,
                createdAt: new Date().toISOString(),
                createdBy: user?.id || 'importacao',
                createdByName: user?.name || 'Importação'
              };
            });
            
            // 3. Gravação Atômica (Substitui tudo)
            await set(etapasRef, updates);
            
            alert(`Sincronização concluída com sucesso!\nTotal de etapas: ${processedSteps.length}`);
          } catch (err) {
            console.error(err);
            alert("Erro ao gravar no banco de dados: " + err.message);
          }
        }
      } else {
        alert('Nenhuma etapa encontrada na planilha.');
      }
    } catch (error) {
      console.error(error);
      alert('Erro na sincronização: ' + error.message);
    } finally {
      setSyncing(false);
    }
  }

  let dataInicio = new Date();
  let diasNoMes = 30;

  if (periodoSelecionado) {
    dataInicio = new Date(periodoSelecionado.ano, periodoSelecionado.mes - 1, 1);
    diasNoMes = getDaysInMonth(dataInicio);
  }

  const getStatusBorderColor = (etapa) => {
    const status = etapa.status ? etapa.status.toLowerCase() : '';
    const now = new Date();

    // Verifica variações de 'concluido' (ex: 'Concluído', 'Concluído c/ Atraso')
    if (status === 'concluido' || status === 'concluído' || status.includes('concluido') || status.includes('concluído')) {
      if (etapa.dataReal && etapa.dataPrevista) {
        try {
          const real = format(new Date(etapa.dataReal), 'yyyy-MM-dd');
          const prev = format(new Date(etapa.dataPrevista), 'yyyy-MM-dd');
          if (real > prev) return 'bg-orange-500';
        } catch (e) {
          console.error("Erro ao comparar datas", e);
        }
      }
      return 'bg-green-500';
    }

    // Verifica se está atrasado pelo horário
    if (etapa.dataPrevista && new Date(etapa.dataPrevista) < now) {
      return 'bg-red-500';
    }

    switch(status) {
      case 'atrasado': return 'bg-red-500';
      case 'pendente': return 'bg-yellow-500';
      case 'em_andamento': return 'bg-blue-500';
      default: return 'bg-slate-300';
    }
  };

  // Identifica tarefas que não aparecerão na timeline
  const tarefasSemData = etapas.filter(e => !e.dataPrevista);
  const dataFimTimeline = addDays(dataInicio, diasNoMes);
  
  const tarefasForaDoPeriodo = etapas.filter(e => {
    if (!e.dataPrevista) return false;
    const d = new Date(e.dataPrevista);
    return d < dataInicio || d >= dataFimTimeline;
  });

  const totalOcultas = tarefasSemData.length + tarefasForaDoPeriodo.length;

  const renderSlot = ({ date, hour }) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const now = new Date();
    
    const tasks = etapas.filter(etapa => {
      if (!etapa.dataPrevista) return false;
      const etapaDate = new Date(etapa.dataPrevista);
      // Compara apenas a data (ignorando hora local vs UTC para o dia)
      const etapaDateStr = format(etapaDate, 'yyyy-MM-dd');
      
      if (etapaDateStr !== dateStr) return false;
      
      // Filtra pela hora (usando hora local)
      const taskHour = etapaDate.getHours();
      return taskHour >= hour && taskHour < hour + intervalo;
    }).sort((a, b) => {
      const diffOrdem = (a.ordem || 0) - (b.ordem || 0);
      if (diffOrdem !== 0) return diffOrdem;
      return new Date(a.dataPrevista) - new Date(b.dataPrevista);
    });

    return (
      <div className="flex flex-col gap-2 h-full overflow-y-auto custom-scrollbar">
        {tasks.map(etapa => {
          const isLate = etapa.dataPrevista && new Date(etapa.dataPrevista) < now && 
                         etapa.status !== 'concluido' && 
                         etapa.status !== 'concluido_atraso';
          return (
          <button
            key={etapa.id}
            onClick={(e) => {
              e.stopPropagation();
              setEtapaSelecionada(etapa);
            }}
            className={`w-full py-2 pr-2 pl-7 rounded-lg shadow-sm text-left hover:shadow-md transition-all relative overflow-hidden group flex items-center gap-2 ${
              etapa.status === 'atrasado' || isLate ? 'animate-blink-red' : 'bg-white border border-slate-200'
            }`}
          >
            <div className={`absolute left-0 top-0 bottom-0 w-5 ${getStatusBorderColor(etapa)}`}></div>
            
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
              D+{etapa.ordem}
            </div>

            <div className="min-w-0 flex-1">
              <div className="font-medium text-xs text-slate-800 truncate" title={etapa.nome}>{etapa.nome}</div>
              <div className="flex items-center gap-2 mt-0.5">
                {etapa.responsavel && (
                  <div className="text-[10px] text-slate-500 truncate" title={etapa.responsavel}>{etapa.responsavel}</div>
                )}
                <div className="text-[10px] text-slate-600 font-medium truncate" title={etapa.area}>{etapa.area}</div>
              </div>
            </div>
          </button>
        )})}
      </div>
    );
  };

  // Prepara conexões entre etapas baseadas na ordem (D+) para desenhar as setas
  // Filtra apenas etapas com data prevista válida para evitar conexões quebradas
  const sortedEtapas = [...etapas]
    .filter(e => e.dataPrevista)
    .sort((a, b) => {
      const diffOrdem = (a.ordem || 0) - (b.ordem || 0);
      if (diffOrdem !== 0) return diffOrdem;
      // Se ordem (D+) for igual, ordena por data/hora para criar um fluxo lógico de tempo
      return new Date(a.dataPrevista) - new Date(b.dataPrevista);
    });
    
  const conexoes = [];
  for (let i = 0; i < sortedEtapas.length - 1; i++) {
    // Só cria conexão se ambas as etapas tiverem data prevista definida
    if (sortedEtapas[i].dataPrevista && sortedEtapas[i+1].dataPrevista) {
      conexoes.push({ from: sortedEtapas[i], to: sortedEtapas[i+1] });
    }
  }

  // Adiciona conexões manuais salvas no banco
  etapas.forEach(etapa => {
    if (etapa.conexoes && Array.isArray(etapa.conexoes)) {
      etapa.conexoes.forEach(targetId => {
        const target = etapas.find(e => String(e.id) === String(targetId));
        if (target) conexoes.push({ from: etapa, to: target });
      });
    }
  });

  const renderHeader = ({ date }) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const count = etapas.filter(e => {
      if (!e.dataPrevista) return false;
      return format(new Date(e.dataPrevista), 'yyyy-MM-dd') === dateStr;
    }).length;
    
    return (
      <div className="text-xs font-normal text-slate-500 mt-1">
        {count} etapa{count !== 1 && 's'}
      </div>
    );
  };

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <img src="/contabil.png" alt="Logo Contábil" className="w-36 h-36 object-contain" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Fluxograma do Fechamento</h1>
            <p className="text-slate-500">Visualização interativa das etapas do fechamento contábil</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3">
            <span className="text-xs text-slate-500 font-medium">Zoom:</span>
            <input
              type="range"
              min="60"
              max="300"
              step="10"
              value={alturaSlot}
              onChange={(e) => setAlturaSlot(Number(e.target.value))}
              className="w-20 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              title="Ajustar altura da linha"
            />
          </div>

          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2">
            <span className="text-xs text-slate-500 font-medium">Horário:</span>
            <select
              value={horaInicio}
              onChange={(e) => setHoraInicio(Number(e.target.value))}
              className="py-2 bg-transparent text-sm focus:outline-none"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
              ))}
            </select>
            <span className="text-slate-400">-</span>
            <select
              value={horaFim}
              onChange={(e) => setHoraFim(Number(e.target.value))}
              className="py-2 bg-transparent text-sm focus:outline-none"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>

          <select
            value={intervalo}
            onChange={(e) => setIntervalo(Number(e.target.value))}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value={1}>1h</option>
            <option value={2}>2h</option>
            <option value={3}>3h</option>
            <option value={4}>4h</option>
            <option value={6}>6h</option>
          </select>

          <button
            onClick={() => timelineRef.current?.centerOnNow()}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
            title="Ir para o dia atual"
          >
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">Hoje</span>
          </button>

          <button
            onClick={handleSync}
            disabled={syncing}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
              !(empresaDados || empresaAtual)?.spreadsheetId 
                ? 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200' 
                : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
            } ${syncing ? 'opacity-50 cursor-wait' : ''}`}
            title={!(empresaDados || empresaAtual)?.spreadsheetId ? "Clique para saber como configurar" : "Atualizar dados da planilha Google"}
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>

          <select
            value={periodoSelecionado?.id || ''}
            onChange={(e) => {
              const periodo = periodos.find(p => p.id === e.target.value);
              setPeriodoSelecionado(periodo);
            }}
            className="px-4 py-2 border border-slate-200 rounded-lg font-medium text-slate-700"
          >
            {periodos.map(p => (
              <option key={p.id} value={p.id}>{p.mes}/{p.ano}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Alerta de Tarefas Ocultas */}
      {totalOcultas > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
          <button 
            onClick={() => setMostrarSemData(!mostrarSemData)}
            className="flex items-center justify-between w-full text-orange-800"
          >
            <div className="flex items-center gap-2">
              <CalendarOff className="w-5 h-5" />
              <span className="font-medium">
                {totalOcultas} tarefas não estão visíveis na timeline
                {tarefasSemData.length > 0 && ` (${tarefasSemData.length} sem data)`}
                {tarefasForaDoPeriodo.length > 0 && ` (${tarefasForaDoPeriodo.length} fora do período)`}
              </span>
            </div>
            {mostrarSemData ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          
          {mostrarSemData && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-fadeIn">
              {[...tarefasSemData, ...tarefasForaDoPeriodo].map(etapa => (
                <button
                  key={etapa.id}
                  onClick={() => setEtapaSelecionada(etapa)}
                  className="p-3 rounded-lg bg-white border border-orange-100 shadow-sm text-left hover:shadow-md transition-all flex items-center gap-3"
                >
                  <div className={`w-1.5 self-stretch rounded-full ${getStatusBorderColor(etapa)}`}></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-slate-800 truncate">{etapa.nome}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {etapa.dataPrevista 
                        ? `Data: ${format(new Date(etapa.dataPrevista), 'dd/MM/yyyy')}` 
                        : 'Sem data definida'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between border border-slate-100">
          <div>
            <p className="text-sm font-medium text-slate-500">Total de Tarefas</p>
            <p className="text-2xl font-bold text-slate-800">{etapas.length}</p>
          </div>
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between border border-slate-100">
          <div>
            <p className="text-sm font-medium text-slate-500">Tarefas Atrasadas</p>
            <p className="text-2xl font-bold text-red-600">{etapas.filter(e => {
              const isLate = e.dataPrevista && new Date(e.dataPrevista) < new Date() && 
                             e.status !== 'concluido' && 
                             e.status !== 'concluido_atraso';
              return e.status === 'atrasado' || isLate;
            }).length}</p>
          </div>
          <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-4">
        <LegendItem color="bg-green-500" label="Concluído" onClick={() => setFiltroLegenda({ color: 'bg-green-500', label: 'Concluído' })} />
        <LegendItem color="bg-blue-500" label="Em Andamento" onClick={() => setFiltroLegenda({ color: 'bg-blue-500', label: 'Em Andamento' })} />
        <LegendItem color="bg-yellow-500" label="Pendente" onClick={() => setFiltroLegenda({ color: 'bg-yellow-500', label: 'Pendente' })} />
        <LegendItem color="bg-orange-500" label="Concluído c/ Atraso" onClick={() => setFiltroLegenda({ color: 'bg-orange-500', label: 'Concluído c/ Atraso' })} />
        <LegendItem color="bg-red-500" label="Atrasado" onClick={() => setFiltroLegenda({ color: 'bg-red-500', label: 'Atrasado' })} />
      </div>

      {/* Fluxograma Kanban */}
      <div className="bg-white rounded-xl shadow-sm h-[650px] flex flex-col">
        {etapas.length === 0 ? (
          <p className="text-slate-500 text-center py-12">Nenhuma etapa cadastrada para este período</p>
        ) : (
          <TimelineBackground 
            ref={timelineRef}
            key={periodoSelecionado?.id}
            dataInicio={dataInicio} 
            dias={diasNoMes} 
            renderSlot={renderSlot} 
            renderHeader={renderHeader}
            intervalo={intervalo}
            horaInicio={horaInicio}
            horaFim={horaFim}
            alturaSlot={alturaSlot}
            conexoes={conexoes}
            etapas={etapas} // Passa a lista completa para calcular posições exatas
          />
        )}
      </div>

      {/* Modal de Detalhes */}
      {etapaSelecionada && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-slideIn">
            {(() => {
              const isLate = etapaSelecionada.dataPrevista && new Date(etapaSelecionada.dataPrevista) < new Date() && 
                             etapaSelecionada.status !== 'concluido' && 
                             etapaSelecionada.status !== 'concluido_atraso';
              
              const headerColor = isLate ? 'bg-red-500' : getStatusColor(etapaSelecionada.status);
              const statusLabel = isLate ? 'Atrasado' : getStatusLabel(etapaSelecionada.status);

              return (
                <div className={`p-4 rounded-t-2xl text-white ${headerColor}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{etapaSelecionada.nome}</h3>
                    <button onClick={() => setEtapaSelecionada(null)} className="p-1 hover:bg-white/20 rounded">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-sm opacity-80">{statusLabel}</p>
                </div>
              );
            })()}
            
            <div className="p-6 space-y-4">
              <InfoRow label="Área" value={etapaSelecionada.area || '-'} />
              <InfoRow label="Responsável" value={etapaSelecionada.responsavel || '-'} />
              <InfoRow label="Data Prevista" value={etapaSelecionada.dataPrevista ? format(new Date(etapaSelecionada.dataPrevista), 'dd/MM/yyyy HH:mm') : '-'} />
              <InfoRow label="Data Real" value={etapaSelecionada.dataReal ? format(new Date(etapaSelecionada.dataReal), 'dd/MM/yyyy HH:mm') : '-'} />
              {etapaSelecionada.descricao && (
                <div>
                  <p className="text-sm text-slate-500">Descrição</p>
                  <p className="text-slate-800">{etapaSelecionada.descricao}</p>
                </div>
              )}
              {etapaSelecionada.observacoes && (
                <div>
                  <p className="text-sm text-slate-500">Observações</p>
                  <p className="text-slate-800">{etapaSelecionada.observacoes}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setEtapaSelecionada(null)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
              >
                Fechar
              </button>
              {!etapaSelecionada.dataReal && (
                <button
                  onClick={() => {
                    handleConcluir(etapaSelecionada);
                    setEtapaSelecionada(null);
                  }}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Concluir
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Legenda (Lista de Atividades) */}
      {filtroLegenda && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col animate-slideIn">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded ${filtroLegenda.color}`}></div>
                <h3 className="text-lg font-semibold text-slate-800">
                  {filtroLegenda.label}
                </h3>
              </div>
              <button onClick={() => setFiltroLegenda(null)} className="p-1 hover:bg-slate-100 rounded-full text-slate-500">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <div className="col-span-4 pl-5">Atividade</div>
              <div className="col-span-2">Responsável</div>
              <div className="col-span-2 text-center">Início</div>
              <div className="col-span-2 text-center">Término</div>
              <div className="col-span-2">Observação</div>
            </div>
            
            <div className="p-4 overflow-y-auto custom-scrollbar">
              {etapas.filter(etapa => getStatusBorderColor(etapa) === filtroLegenda.color).length === 0 ? (
                <p className="text-slate-500 text-center py-8">Nenhuma atividade encontrada com este status.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {etapas
                    .filter(etapa => getStatusBorderColor(etapa) === filtroLegenda.color)
                    .map(etapa => (
                    <button
                      key={etapa.id}
                      onClick={() => {
                        setFiltroLegenda(null);
                        setEtapaSelecionada(etapa);
                      }}
                      className="w-full p-3 rounded-lg bg-white border border-slate-200 shadow-sm text-left hover:shadow-md transition-all grid grid-cols-12 gap-2 group"
                    >
                      {/* Coluna 1: Atividade (4 cols) */}
                      <div className="col-span-4 flex gap-3 min-w-0">
                        <div className={`w-1.5 rounded-full shrink-0 ${getStatusBorderColor(etapa)}`}></div>
                        <div className="min-w-0 flex flex-col justify-center">
                          <div className="flex items-center gap-2">
                             <div className="font-medium text-sm text-slate-800 truncate" title={etapa.nome}>{etapa.nome}</div>
                             <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 shrink-0">D+{etapa.ordem}</span>
                          </div>
                        </div>
                      </div>

                      {/* Coluna 2: Responsável (2 cols) */}
                      <div className="col-span-2 flex items-center text-xs text-slate-500 truncate" title={etapa.responsavel}>
                        <span className="truncate w-full">{etapa.responsavel || '-'}</span>
                      </div>

                      {/* Coluna 3: Início (2 cols) */}
                      <div className="col-span-2 flex items-center justify-center text-xs text-slate-500">
                        {etapa.dataPrevista ? format(new Date(etapa.dataPrevista), 'dd/MM HH:mm') : '-'}
                      </div>

                      {/* Coluna 4: Término (2 cols) */}
                      <div className="col-span-2 flex items-center justify-center text-xs text-slate-500">
                        {etapa.dataReal ? format(new Date(etapa.dataReal), 'dd/MM HH:mm') : '-'}
                      </div>

                      {/* Coluna 5: Observação (2 cols) */}
                      <div className="col-span-2 flex items-center text-xs text-slate-400 italic truncate" title={etapa.observacoes}>
                        <span className="truncate w-full">{etapa.observacoes || '-'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end">
               <span className="text-xs text-slate-500">
                 Total: {etapas.filter(etapa => getStatusBorderColor(etapa) === filtroLegenda.color).length}
               </span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink-red {
          0%, 100% { background-color: #ffffff; border: 1px solid #e2e8f0; }
          50% { background-color: #fee2e2; border: 1px solid #ef4444; }
        }
        .animate-blink-red {
          animation: blink-red 2s infinite;
        }
      `}</style>
    </div>
  );
}

// Função auxiliar para processar dados (Reutiliza lógica da Importação)
const processData = (data, existingSteps = []) => {
  if (!Array.isArray(data)) return [];
  const etapasValidadas = [];
  const chavesProcessadas = new Set();
  const usedIds = new Set(); // Rastreia IDs já vinculados para permitir códigos duplicados em tarefas diferentes

  const formatarData = (valor) => {
    if (valor === null || valor === undefined || String(valor).trim() === '') return null;

    // 1. Número (Serial Excel)
    if (typeof valor === 'number') {
      const valorAjustado = Math.floor(valor + 0.001);
      const date = new Date((valorAjustado - 25569) * 86400 * 1000 + 43200000);
      return date.toISOString();
    }
    
    if (typeof valor === 'string') {
      const v = valor.trim();
      const dmy = v.match(/^(\d{1,2})\/\-\.\/\-\./);
      if (dmy) {
        const dia = parseInt(dmy[1], 10);
        const mes = parseInt(dmy[2], 10);
        let ano = parseInt(dmy[3], 10);
        if (ano < 100) ano += 2000;
        if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
             const date = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
             if (!isNaN(date.getTime())) return date.toISOString();
        }
      }
      const ymd = v.match(/^(\d{4})\/\-\.\/\-\./);
      if (ymd) {
         const ano = parseInt(ymd[1], 10);
         const mes = parseInt(ymd[2], 10);
         const dia = parseInt(ymd[3], 10);
         const date = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
         if (!isNaN(date.getTime())) return date.toISOString();
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
      const parts = horaVal.trim().split(':');
      if (parts.length >= 2) {
        hours = parseInt(parts[0], 10) || 0;
        minutes = parseInt(parts[1], 10) || 0;
      }
    }
    
    const localDate = new Date(year, month, day, hours, minutes, 0, 0);
    return localDate.toISOString();
  };

  data.forEach((row, index) => {
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
    const codigo = getVal(['CODIGO', 'codigo', 'CÓDIGO', 'código', 'Codigo', 'Código', 'Cod', 'COD', 'ID', 'Id', 'Code']);
    
    if (!nome) return;

    const normalizeVal = (str) => str ? String(str).trim().replace(/\s+/g, ' ').toLowerCase() : '';
    const uniqueKey = `${codigo ? 'code:' + normalizeVal(codigo) : ''}|name:${normalizeVal(nome)}`;
    
    if (chavesProcessadas.has(uniqueKey)) return;
    chavesProcessadas.add(uniqueKey);

    const existing = existingSteps.find(e => {
      if (usedIds.has(e.id)) return false;
      const normalize = (str) => str ? String(str).trim().replace(/\s+/g, ' ').toLowerCase() : '';
      const codeA = normalize(codigo);
      const codeB = normalize(e.codigo);
      const nameA = normalize(nome);
      const nameB = normalize(e.nome);
      if (codeA && codeB && codeA === codeB && nameA === nameB) return true;
      if (codeA && codeB && codeA === codeB) return true;
      if (nameA === nameB) {
        if (codeA && codeB && codeA !== codeB) return false;
        return true;
      }
      return false;
    });

    if (existing) usedIds.add(existing.id);

    let rawOrdem = getVal(['D+', 'd+', 'Ordem', 'ordem', 'Dia', 'dia']);
    let ordem = parseInt(rawOrdem);
    if (isNaN(ordem) && typeof rawOrdem === 'string') {
       const match = rawOrdem.match(/\d+/);
       if (match) ordem = parseInt(match[0]);
    }
    if (isNaN(ordem)) ordem = index + 1;

    let dataPrevista = formatarData(getVal(['INÍCIO', 'início', 'inicio', 'Data Prevista', 'dataPrevista', 'Data de Início', 'Data de Inicio', 'Previsão', 'Previsao', 'Data', 'Date', 'Start', 'Planejado', 'Data Planejada']));
    const horaInicio = getVal(['HORA INICIO', 'Hora Inicio', 'hora inicio', 'Hora Início']);
    dataPrevista = combinarDataHora(dataPrevista, horaInicio);
    
    let rawDataReal = getVal(['TÉRMINO', 'término', 'termino', 'Data Real', 'dataReal', 'Data Conclusão', 'Data Conclusao', 'Conclusão', 'Conclusao', 'Realizado', 'Executado', 'Fim', 'Data de Término', 'Data de Termino', 'Data Fim', 'Data Final', 'End']);

    let dataReal = formatarData(rawDataReal);
    const horaTermino = getVal(['HORA TÉRMINO', 'Hora Término', 'hora término', 'HORA TERMICA', 'Hora Termica']);
    dataReal = combinarDataHora(dataReal, horaTermino);
    
    let rawStatus = getVal(['STATUS', 'Status', 'status', 'SITUAÇÃO', 'Situação', 'situacao', 'Estado', 'estado']);
    let status = existing?.status || 'pendente';
    
    if (rawStatus) {
       const s = String(rawStatus).toLowerCase();
       if (s.includes('conclu')) status = 'concluido';
       else if (s.includes('atras')) status = 'atrasado';
       else if (s.includes('pendente')) status = 'pendente';
       else if (s.includes('andamento')) status = 'em_andamento';
    } else if (status === 'pendente' && rawDataReal !== undefined && rawDataReal !== null && String(rawDataReal).trim() !== '') {
      status = 'concluido';
    }

    let concluidoEm = existing?.concluidoEm || null;
    let quemConcluiu = existing?.quemConcluiu || null;

    if (status === 'concluido') {
      if (!quemConcluiu) quemConcluiu = 'Importação Automática';
      if (!dataReal) dataReal = dataPrevista || new Date().toISOString();
      concluidoEm = dataReal;
    }

    etapasValidadas.push({
      id: existing ? existing.id : null,
      nome: nome,
      descricao: getVal(['Descrição', 'descricao']) || '',
      area: getVal(['ÁREA', 'área', 'area', 'Área']) || '',
      responsavel: getVal(['ATRIBUÍDO PARA', 'atribuído para', 'atribuido para', 'Responsável', 'responsavel', 'Responsavel', 'Owner']) || '',
      dataPrevista: dataPrevista,
      dataReal: dataReal,
      ordem: ordem,
      codigo: (codigo !== undefined && codigo !== null) ? codigo : '',
      observacoes: getVal(['Observações', 'observacoes', 'Observação', 'observação', 'Observacao', 'observacao', 'Obs', 'obs', 'Comentários', 'comentarios']) || '',
      status: status,
      concluidoEm: concluidoEm,
      quemConcluiu: quemConcluiu
    });
  });

  return etapasValidadas;
};

function LegendItem({ color, label, onClick }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-2 hover:bg-slate-50 px-2 py-1 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-100"
    >
      <div className={`w-4 h-4 rounded ${color}`} />
      <span className="text-sm text-slate-600">{label}</span>
    </button>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800">{value}</span>
    </div>
  );
}
