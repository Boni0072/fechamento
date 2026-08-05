import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { getStatusColor, getStatusLabel, atualizarEtapa } from '../services/database';
import { format, startOfMonth, endOfMonth, differenceInCalendarDays, startOfDay } from 'date-fns';
import { X, Check, Clock, AlertTriangle, Calendar, Maximize2, Minimize2 } from 'lucide-react';
import TimelineBackground from './TimelineBackground';
import { getDatabase, ref, onValue } from "firebase/database";

// Componente de Carrossel para os cards dentro de cada slot
const TaskCarousel = ({ tasks, setEtapaSelecionada }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [now, setNow] = useState(new Date());
  const cardRef = useRef(null);
  const sideBarRef = useRef(null);

  useEffect(() => {
    if (tasks.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex(prevIndex => (prevIndex + 1) % tasks.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [tasks.length]);

  // Atualiza o horário atual a cada 30 segundos para reavaliar atrasos
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (tasks.length === 0) return null;

  const etapa = tasks[currentIndex];
  const status = etapa.status ? etapa.status.toLowerCase() : '';
  const isLate = (etapa.dataPrevista && new Date(etapa.dataPrevista) < now && status !== 'concluido' && status !== 'concluido_atraso') || status === 'atrasado';

  // Blink effect - alterna fundo do card, outline e cor do texto
  useEffect(() => {
    const el = cardRef.current;
    const sideBar = sideBarRef.current;
    if (!el) return;
    if (!isLate) {
      el.style.backgroundColor = '';
      el.style.outline = '';
      el.style.color = '';
      el.style.fontWeight = '';
      return;
    }
    let toggle = false;
    const id = setInterval(() => {
      toggle = !toggle;
      if (toggle) {
        el.style.backgroundColor = '#fef2f2';
        el.style.outline = '3px solid #ef4444';
        el.style.color = '#b91c1c';
        el.style.fontWeight = '700';
        if (sideBar) sideBar.style.backgroundColor = '#ef4444'; // Pisca a barra
      } else {
        el.style.backgroundColor = '#ffffff';
        el.style.outline = '3px solid #fca5a5';
        el.style.color = '#7f1d1d';
        el.style.fontWeight = '600';
        if (sideBar) sideBar.style.backgroundColor = '#fca5a5'; // Estado alternado da barra
      }
    }, 500);
    return () => {
      clearInterval(id);
      if (el) {
        el.style.backgroundColor = '';
        el.style.outline = '';
        el.style.color = '';
        el.style.fontWeight = '';
        if (sideBar) sideBar.style.backgroundColor = ''; // Limpa a cor da barra
      }
    };
  }, [isLate, currentIndex]);

  let borderColor = 'bg-slate-300';
  if (status === 'concluido' || status === 'concluído' || status.includes('concluido')) {
    borderColor = status.includes('atraso') ? 'bg-orange-500' : 'bg-green-500';
  } else if (isLate || status === 'atrasado') {
    borderColor = 'bg-red-500';
  } else if (status === 'pendente') {
    borderColor = 'bg-yellow-500';
  } else if (status === 'em_andamento') {
    borderColor = 'bg-blue-500';
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <button 
        ref={cardRef}
        key={etapa.id}
        onClick={(e) => {e.stopPropagation(); setEtapaSelecionada(etapa);}}
        className="flex flex-col rounded-lg shadow-sm text-left hover:shadow-md relative overflow-hidden border border-slate-200 w-full max-w-[95%] group shrink-0 h-full bg-white transition-transform duration-300"
      >
        <div ref={sideBarRef} className={`absolute left-0 top-0 bottom-0 w-1.5 ${borderColor}`} />
        
        <div className="p-2.5 pb-1.5 overflow-hidden">
          <div className="font-bold text-[17px] text-slate-900 leading-tight line-clamp-2 break-words min-h-[2.5em]">
            {etapa.codigo ? `${etapa.codigo} - ` : ''}{etapa.nome}
          </div>
        </div>

        <div className="mx-2.5 mb-2.5 mt-auto p-2 bg-slate-50 rounded-md border border-slate-100 flex items-center justify-between overflow-hidden shrink-0">
          <div className="flex items-center gap-1.5 text-[12px] text-slate-500 shrink-0">
            <span className="font-medium whitespace-nowrap">Área:</span>
            <span className="font-bold text-slate-700">{etapa.area || '-'}</span>
          </div>
          <div className="h-3 w-[1px] bg-slate-200 shrink-0" />
          <div className="flex items-center gap-1.5 text-[12px] text-slate-500 shrink-0">
            <span className="font-medium whitespace-nowrap">Resp:</span>
            <span className="font-bold text-slate-700">{etapa.responsavel || '-'}</span>
          </div>
          <div className="h-3 w-[1px] bg-slate-200 shrink-0" />
          <div className="flex items-center gap-1.5 text-[12px] text-slate-500 overflow-hidden">
           <span className="font-medium shrink-0 whitespace-nowrap">Exec:</span>
            <span className="font-bold text-slate-700 truncate">{etapa.executadoPor || '-'}</span>
          </div>
        </div>
      </button>

      {tasks.length > 1 && (
        <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-1">
          {tasks.map((_, idx) => (
            <div 
              key={idx} 
              className={`h-1 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-4 bg-blue-500' : 'w-1 bg-slate-300'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function Fluxograma() {
  const navigate = useNavigate();
  const { empresaAtual, empresas, selecionarEmpresa } = useAuth();
  const { loading: loadingPermissoes, user: authUser } = usePermissao('fluxograma');
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [etapas, setEtapas] = useState([]);
  const [allEtapas, setAllEtapas] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState(null);
  const [etapaSelecionada, setEtapaSelecionada] = useState(null);
  const [intervalo, setIntervalo] = useState(1);
  const [horaInicio, setHoraInicio] = useState(0);
  const [horaFim, setHoraFim] = useState(23);
  const [alturaSlot, setAlturaSlot] = useState(128);
  const [larguraColuna, setLarguraColuna] = useState(450);
  const [isMobile, setIsMobile] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [empresaDados, setEmpresaDados] = useState(null);
  const [showAtrasadasModal, setShowAtrasadasModal] = useState(false);
  const [showResponsavelDetalheModal, setShowResponsavelDetalheModal] = useState(false);
  const [responsavelDetalhe, setResponsavelDetalhe] = useState(null);
  const timelineRef = useRef(null);
  const pageRef = useRef(null);
  const [stepsByCompany, setStepsByCompany] = useState({});

  const empresasParaBuscar = useMemo(() => {
    if (empresaAtual) return [empresaAtual];
    return empresas || [];
  }, [empresaAtual, empresas]);

  const atrasadasEtapas = useMemo(() => {
    return etapas.filter(e => e.status === 'atrasado');
  }, [etapas]);

  const responsavelChartData = useMemo(() => {
    const counts = {};
    atrasadasEtapas.forEach((etapa) => {
      const responsavel = etapa.responsavel?.trim() || 'Sem responsável';
      counts[responsavel] = (counts[responsavel] || 0) + 1;
    });
    const entries = Object.entries(counts)
      .map(([responsavel, quantidade]) => ({ responsavel, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);
    const total = entries.reduce((sum, item) => sum + item.quantidade, 0);
    return entries.map((item) => ({
      ...item,
      percentual: total > 0 ? Math.round((item.quantidade / total) * 100) : 0,
    }));
  }, [atrasadasEtapas]);

  const tarefasAtrasadasPorResponsavel = useMemo(() => {
    const map = {};
    atrasadasEtapas.forEach((etapa) => {
      const responsavel = etapa.responsavel?.trim() || 'Sem responsável';
      if (!map[responsavel]) map[responsavel] = [];
      map[responsavel].push(etapa);
    });
    return map;
  }, [atrasadasEtapas]);

  const sortedEtapas = useMemo(() => {
    return [...etapas]
      .filter(e => e.dataPrevista)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || new Date(a.dataPrevista) - new Date(b.dataPrevista));
  }, [etapas]);
  
  const conexoes = useMemo(() => {
    const res = [];
    for (let i = 0; i < sortedEtapas.length - 1; i++) {
      res.push({ from: sortedEtapas[i], to: sortedEtapas[i+1] });
    }
    etapas.forEach(etapa => {
      if (etapa.conexoes && Array.isArray(etapa.conexoes)) {
        etapa.conexoes.forEach(targetId => {
          const target = etapas.find(e => String(e.id) === String(targetId));
          if (target) res.push({ from: etapa, to: target });
        });
      }
    });
    return res;
  }, [sortedEtapas, etapas]);

  const renderSlot = useCallback(({ date, hour }) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const tasks = etapas.filter(etapa => {
      if (!etapa.dataPrevista) return false;
      const etapaDate = new Date(etapa.dataPrevista);
      if (isNaN(etapaDate.getTime())) return false;
      if (format(etapaDate, 'yyyy-MM-dd') !== dateStr) return false;
      const taskHour = etapaDate.getHours();
      return taskHour >= hour && taskHour < hour + intervalo;
    }).sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || new Date(a.dataPrevista) - new Date(b.dataPrevista));

    if (tasks.length === 0) return null;

    return (
      <div className="w-full h-full overflow-hidden">
        <TaskCarousel tasks={tasks} setEtapaSelecionada={setEtapaSelecionada} />
      </div>
    );
  }, [etapas, intervalo]);

  const renderHeader = useCallback(({ date }) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const count = etapas.filter(e => e.dataPrevista && format(new Date(e.dataPrevista), 'yyyy-MM-dd') === dateStr).length;
    return <div className="text-[10px] lg:text-xs font-normal text-slate-500 mt-0.5">{count} etapa{count !== 1 && 's'}</div>;
  }, [etapas]);

  useEffect(() => {
    if (authUser?.id && empresaAtual?.id) {
      setLoadingProfile(true);
      const db = getFirestore();
      const userRef = doc(db, 'tenants', empresaAtual.id, 'usuarios', authUser.id);
      const unsubscribe = onSnapshot(userRef, (snapshot) => {
        const data = snapshot.data();
        setUserProfile(data ? { ...authUser, ...data } : { ...authUser, perfilIncompleto: true });
        setLoadingProfile(false);
      });
      return () => unsubscribe();
    } else {
      if (authUser) setUserProfile(authUser);
      setLoadingProfile(false);
    }
  }, [authUser, empresaAtual]);

  useEffect(() => {
    if (!empresaAtual) {
      setEmpresaDados(null);
      return;
    }
    const db = getFirestore();
    const empresaRef = doc(db, 'tenants', empresaAtual.id);
    const unsubEmpresa = onSnapshot(empresaRef, (snapshot) => {
      const data = snapshot.data();
      if (data) setEmpresaDados({ id: empresaAtual.id, ...data });
    });
    return () => unsubEmpresa();
  }, [empresaAtual]);

  useEffect(() => {
    const db = getDatabase();
    const unsubs = [];

    if (empresaAtual) {
      const googleTableRef = ref(db, `tenants/${empresaAtual.id}/tabelaGoogle`);
      const unsub = onValue(googleTableRef, (snapshot) => {
        const data = snapshot.val();
        const processed = data ? processRealtimeData(data) : [];
        const etapasComNomeEmpresa = processed.map(e => ({ ...e, empresaId: empresaAtual.id, empresaNome: empresaAtual.nome }));
        setAllEtapas(etapasComNomeEmpresa);
      });
      unsubs.push(unsub);
    } else {
      if (!empresasParaBuscar || empresasParaBuscar.length === 0) {
        setAllEtapas([]);
        setStepsByCompany({});
        return;
      }
      empresasParaBuscar.forEach(emp => {
        const googleTableRef = ref(db, `tenants/${emp.id}/tabelaGoogle`);
        const unsub = onValue(googleTableRef, (snapshot) => {
          const data = snapshot.val();
          const processed = data ? processRealtimeData(data) : [];
          setStepsByCompany(prev => ({ // This will trigger the effect below
            ...prev,
            [emp.id]: processed.map(d => ({ ...d, empresaId: emp.id, empresaNome: emp.nome }))
          }));
        });
        unsubs.push(unsub);
      });
    }
    return () => unsubs.forEach(u => u());
  }, [empresasParaBuscar, empresaAtual]);

  useEffect(() => {
    if (!empresaAtual) {
      const allSteps = Object.values(stepsByCompany).flat();
      // Correção: Usa uma chave composta para garantir a unicidade.
      // Quando o id não existe (dados do RTDB sem etapas manuais), usa codigo+nome como fallback
      const uniqueStepsMap = new Map();
      allSteps.forEach(step => {
        const key = step.id
          ? `${step.empresaId}-${step.id}`
          : `${step.empresaId}-${step.codigo || ''}-${step.nome}`;
        uniqueStepsMap.set(key, step);
      });
      const uniqueById = Array.from(uniqueStepsMap.values());
      setAllEtapas(uniqueById);
    }
  }, [stepsByCompany, empresaAtual]);

  useEffect(() => {
    const periodsMap = new Map();
    allEtapas.forEach(step => {
      if (step.dataPrevista) {
        const d = new Date(step.dataPrevista);
        if (!isNaN(d.getTime())) {
          const month = d.getMonth() + 1;
          const year = d.getFullYear();
          const key = `${month}-${year}`;
          if (!periodsMap.has(key)) {
            periodsMap.set(key, { id: key, mes: month, ano: year });
          }
        }
      }
    });

    const sortedData = Array.from(periodsMap.values()).sort((a, b) => {
      if (b.ano !== a.ano) return b.ano - a.ano;
      return b.mes - a.mes;
    });

    const finalPeriods = [{ id: 'todos', mes: 'Todos', ano: '' }, ...sortedData];
    setPeriodos(finalPeriods);

    setPeriodoSelecionado(prev => {
      if (prev && finalPeriods.find(p => p.id === prev.id)) return prev;
      return finalPeriods.length > 0 ? finalPeriods[0] : null;
    });
  }, [allEtapas]);

  useEffect(() => {
    let filtered = allEtapas;
    if (periodoSelecionado && periodoSelecionado.id !== 'todos') {
      filtered = allEtapas.filter(e => {
        if (!e.dataPrevista) return false;
        const d = new Date(e.dataPrevista);
        return (d.getMonth() + 1) == periodoSelecionado.mes && d.getFullYear() == periodoSelecionado.ano;
      });
    }
    const sorted = filtered.sort((a, b) => {
      if (!a.dataPrevista) return 1;
      if (!b.dataPrevista) return -1;
      return new Date(a.dataPrevista) - new Date(b.dataPrevista);
    });
    setEtapas(sorted);
  }, [allEtapas, periodoSelecionado]);

  const dataInicio = useMemo(() => {
    const now = new Date();
    if (periodoSelecionado && periodoSelecionado.id !== 'todos') {
      return startOfMonth(new Date(periodoSelecionado.ano, periodoSelecionado.mes - 1, 1));
    }

    if (etapas.length === 0) return startOfMonth(now);

    const dates = [now];
    etapas.forEach(e => {
      if (e.dataPrevista) {
        const d = new Date(e.dataPrevista);
        if (!isNaN(d.getTime())) dates.push(d);
      }
    });
    
    const minDate = new Date(Math.min(...dates));
    return startOfDay(minDate);
  }, [etapas, periodoSelecionado]);

  const diasNoMes = useMemo(() => {
    const now = new Date();
    if (periodoSelecionado && periodoSelecionado.id !== 'todos') {
      const endPeriod = endOfMonth(dataInicio);
      return differenceInCalendarDays(endPeriod, dataInicio) + 1;
    }

    if (etapas.length === 0) return differenceInCalendarDays(endOfMonth(now), startOfMonth(now)) + 1;

    const dates = [now];
    etapas.forEach(e => {
      if (e.dataPrevista) {
        const d = new Date(e.dataPrevista);
        if (!isNaN(d.getTime())) dates.push(d);
      }
    });

    const maxDate = new Date(Math.max(...dates));
    const endPeriod = startOfDay(maxDate);
    
    if (dataInicio > endPeriod) return 1;

    return differenceInCalendarDays(endPeriod, dataInicio) + 1;
  }, [dataInicio, etapas, periodoSelecionado]);

  // Detecta se está em dispositivo móvel e ajusta a largura da coluna
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Não sobrescreve a largura quando em fullscreen
      if (!document.fullscreenElement) {
        setLarguraColuna(mobile ? 280 : 450);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const computeFullscreenWidth = () => {
      if (!pageRef.current) return 450;
      const width = pageRef.current.clientWidth;
      return Math.max(450, Math.min(900, Math.floor(width / 2.5)));
    };

    const handleFullscreenChange = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (!active) {
        setLarguraColuna(isMobile ? 280 : 450);
      } else {
        setLarguraColuna(computeFullscreenWidth());
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobile]);

  if (loadingPermissoes || loadingProfile || (authUser && !userProfile)) {
    return <div className="flex items-center justify-center h-96 text-slate-500">Carregando permissões...</div>;
  }

  if (!empresas || empresas.length === 0) {
    return <div className="flex items-center justify-center h-96 text-slate-500">Nenhuma empresa disponível</div>;
  }

  const totalTarefas = etapas.length;
  const concluidas = etapas.filter(e => e.status?.includes('concluido')).length;
  const percentual = totalTarefas > 0 ? Math.round((concluidas / totalTarefas) * 100) : 0;
  const atrasadas = etapas.filter(e => e.status === 'atrasado').length;

  return (
    <div ref={pageRef} className="animate-fadeIn">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-4 lg:mb-6 gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800">Fluxograma do Fechamento</h1>
          <p className="text-sm lg:text-base text-slate-500">Visualização interativa das etapas do fechamento contábil</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:gap-3 items-center">
          <div className="period-filter-group">
            <span className="period-filter-label">Período</span>
            <select
            value={periodoSelecionado?.id || ''}
            onChange={(e) => {
              const selectedId = e.target.value;
              const periodo = periodos.find(p => p.id === selectedId);
              setPeriodoSelecionado(periodo);
            }}
            className="period-filter"
            aria-label="Selecionar período"
          >
            {periodos.map(p => {
              const label = p.id === 'todos' 
                ? 'Todos os Períodos' 
                : new Date(p.ano, p.mes - 1).toLocaleString('pt-BR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase()) + `/${p.ano}`;
              return <option key={p.id} value={p.id}>{label}</option>;
            })}
            </select>
          </div>
          <div className="bg-white px-3 lg:px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 lg:gap-3 border border-slate-200">
            <div className="relative w-8 h-8 lg:w-10 lg:h-10">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path className="text-slate-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                <path className="text-green-500" strokeDasharray={`${percentual}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">{percentual}%</div>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Progresso</p>
              <p className="text-sm font-bold text-slate-800">{totalTarefas} tarefas</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAtrasadasModal(true)}
            className="bg-white px-3 lg:px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 lg:gap-3 border border-slate-200 hover:bg-slate-50 transition-colors text-left"
          >
            <div>
              <p className="text-xs text-slate-500 font-medium">Atrasadas</p>
              <p className="text-sm font-bold text-red-600">{atrasadas}</p>
            </div>
            <div className="w-7 h-7 lg:w-8 lg:h-8 bg-red-50 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
          </button>

          <button 
            onClick={async () => {
              if (!isFullscreen) {
                if (pageRef.current?.requestFullscreen) {
                  await pageRef.current.requestFullscreen();
                }
              } else {
                if (document.exitFullscreen) {
                  await document.exitFullscreen();
                }
                setLarguraColuna(isMobile ? 280 : 450);
                setIsFullscreen(false);
              }
            }}
            className="px-3 lg:px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center gap-2"
            title={isFullscreen ? "Restaurar Grade" : "Expandir Grade"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => timelineRef.current?.centerOnNow()} className="px-3 lg:px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Hoje
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm h-[calc(100vh-150px)] min-h-[400px] lg:min-h-[650px] flex flex-col overflow-hidden">
        {etapas.length === 0 ? <p className="text-slate-500 text-center py-12">Nenhuma etapa cadastrada</p> : (
          <TimelineBackground 
            key={dataInicio.getTime()}
            ref={timelineRef} 
            dataInicio={dataInicio} 
            dias={diasNoMes} 
            renderSlot={renderSlot} 
            renderHeader={renderHeader} 
            intervalo={intervalo} 
            horaInicio={horaInicio} 
            horaFim={horaFim} 
            alturaSlot={alturaSlot} 
            larguraColuna={larguraColuna}
            conexoes={conexoes} 
            etapas={etapas}
          />
        )}
      </div>

      {etapaSelecionada && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg animate-slideIn overflow-hidden border border-white/20">
            {(() => {
              const isLate = etapaSelecionada.dataPrevista && new Date(etapaSelecionada.dataPrevista) < new Date() && 
                             etapaSelecionada.status !== 'concluido' && 
                             etapaSelecionada.status !== 'concluido_atraso';
              
              const headerColor = isLate ? 'bg-red-600' : getStatusColor(etapaSelecionada.status);
              const statusLabel = isLate ? 'Atrasado' : getStatusLabel(etapaSelecionada.status);

              return (
                <div className={`p-6 text-white ${headerColor} relative`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-white/20 rounded text-[10px] font-bold uppercase tracking-wider">D+{etapaSelecionada.ordem}</span>
                        <span className="text-xs font-medium opacity-90">{statusLabel}</span>
                      </div>
                      <h3 className="text-xl font-bold leading-tight">{etapaSelecionada.nome}</h3>
                    </div>
                    <button onClick={() => setEtapaSelecionada(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              );
            })()}
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Área</p>
                  <p className="text-sm font-semibold text-slate-700">{etapaSelecionada.area || '-'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Responsável</p>
                  <p className="text-sm font-semibold text-slate-700">{etapaSelecionada.responsavel || '-'}</p>
                </div>
                <div className="bg-blue-50 p-3 rounded-2xl border border-blue-100 col-span-2">
                  <p className="text-[10px] font-bold text-blue-400 uppercase mb-1">Executado por</p>
                  <input
                    type="text"
                    value={etapaSelecionada.executadoPor || ''}
                    placeholder="Aguardando execução"
                    className="w-full bg-transparent border-none p-0 text-sm font-bold text-blue-700 placeholder-blue-300 focus:ring-0 focus:outline-none"
                    readOnly
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500">Início Previsto</span>
                  </div>
                  <span className="text-xs font-bold text-slate-700">
                    {etapaSelecionada.dataPrevista ? format(new Date(etapaSelecionada.dataPrevista), 'dd/MM/yyyy HH:mm') : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-medium text-slate-500">Data Real</span>
                  </div>
                  <span className="text-xs font-bold text-slate-700">
                    {etapaSelecionada.dataReal ? format(new Date(etapaSelecionada.dataReal), 'dd/MM/yyyy HH:mm') : '-'}
                  </span>
                </div>
              </div>

              {(etapaSelecionada.descricao || etapaSelecionada.observacoes) && (
                <div className="space-y-4 pt-2">
                  {etapaSelecionada.descricao && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Descrição</p>
                      <p className="text-sm text-slate-600 leading-relaxed">{etapaSelecionada.descricao}</p>
                    </div>
                  )}
                  {etapaSelecionada.observacoes && (
                    <div className="bg-yellow-50 p-4 rounded-2xl border border-yellow-100">
                      <p className="text-[10px] font-bold text-yellow-600 uppercase mb-1">Observações</p>
                      <p className="text-sm text-yellow-800 leading-relaxed">{etapaSelecionada.observacoes}</p>
                    </div>
                  )}
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
            </div>
          </div>
        </div>
      )}

      {showAtrasadasModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl animate-slideIn overflow-hidden border border-white/20">
            <div className="flex items-center justify-between p-6 bg-red-600 text-white">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] font-semibold opacity-80">Atrasadas</p>
                <h2 className="text-2xl font-bold">Etapas Atrasadas</h2>
              </div>
              <button onClick={() => setShowAtrasadasModal(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {atrasadasEtapas.length === 0 ? (
                <p className="text-slate-600">Nenhuma etapa atrasada encontrada no período atual.</p>
              ) : (
                <div className="space-y-6">
                  <div className="bg-slate-50 rounded-3xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] font-semibold text-slate-500">Responsáveis com mais atrasos</p>
                        <p className="text-sm text-slate-700">Veja quem precisa de atenção primeiro</p>
                      </div>
                      <span className="text-sm font-bold text-slate-900">{atrasadasEtapas.length}</span>
                    </div>
                    <div className="flex items-center justify-center">
                      <svg viewBox="0 0 200 200" className="w-48 h-48">
                        <circle cx="100" cy="100" r="70" fill="transparent" stroke="#e2e8f0" strokeWidth="30" />
                        {responsavelChartData.reduce((acc, item, index) => {
                          const circumference = 2 * Math.PI * 70;
                          const dash = (item.percentual / 100) * circumference;
                          const offset = acc.offset;
                          acc.elements.push(
                            <circle
                              key={item.responsavel}
                              cx="100"
                              cy="100"
                              r="70"
                              fill="transparent"
                              stroke={['#ef4444', '#f97316', '#3b82f6', '#14b8a6', '#8b5cf6', '#f59e0b', '#0f766e'][index % 7]}
                              strokeWidth="30"
                              strokeDasharray={`${dash} ${circumference - dash}`}
                              strokeDashoffset={offset}
                              strokeLinecap="round"
                              transform="rotate(-90 100 100)"
                            />
                          );
                          acc.offset -= dash;
                          return acc;
                        }, { offset: 2 * Math.PI * 70, elements: [] }).elements}
                        <text x="100" y="100" textAnchor="middle" dominantBaseline="middle" className="text-slate-900 font-semibold" fontSize="18">
                          {atrasadasEtapas.length}
                        </text>
                      </svg>
                    </div>
                    <div className="mt-4 space-y-3">
                      {responsavelChartData.map((item, index) => {
                        const isSelected = responsavelDetalhe === item.responsavel;
                        return (
                          <button
                            key={item.responsavel}
                            type="button"
                            onClick={() => {
                              setResponsavelDetalhe(isSelected ? null : item.responsavel);
                              setShowResponsavelDetalheModal(isSelected ? false : true);
                            }}
                            className={`w-full flex items-center justify-between gap-2 p-3 rounded-2xl border transition-all ${isSelected ? 'bg-blue-600 border-blue-700 shadow-inner' : 'bg-white border-slate-200 hover:bg-slate-100'}`}
                          >
                            <div className={`flex items-center gap-3 text-left ${isSelected ? 'text-white' : ''}`}>
                              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ['#ef4444', '#f97316', '#3b82f6', '#14b8a6', '#8b5cf6', '#f59e0b', '#0f766e'][index % 7] }} />
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{item.responsavel}</p>
                                <p className="text-xs text-slate-500">{item.percentual}%</p>
                              </div>
                            </div>
                            <span className="text-sm font-bold text-slate-900">{item.quantidade}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => {
                  setShowAtrasadasModal(false);
                  setShowResponsavelDetalheModal(false);
                  setResponsavelDetalhe(null);
                }}
                className="px-5 py-2 bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {showResponsavelDetalheModal && responsavelDetalhe && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl animate-slideIn overflow-hidden border border-white/20">
            <div className="flex items-center justify-between p-6 bg-blue-600 text-white">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] font-semibold opacity-80">Detalhes do Responsável</p>
                <h2 className="text-2xl font-bold">{responsavelDetalhe}</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowResponsavelDetalheModal(false)}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {(tarefasAtrasadasPorResponsavel[responsavelDetalhe] || []).map((etapa) => (
                <div key={etapa.id} className="rounded-3xl bg-slate-50 border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <p className="text-sm font-semibold text-slate-900">{etapa.nome || 'Sem nome'}</p>
                    <span className="text-xs uppercase tracking-[0.18em] text-red-600">Atrasado</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                    <div>
                      <p className="font-medium text-slate-800">Área</p>
                      <p>{etapa.area || '-'}</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">Previsto</p>
                      <p>{etapa.dataPrevista ? format(new Date(etapa.dataPrevista), 'dd/MM/yyyy HH:mm') : '-'}</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">Responsável</p>
                      <p>{etapa.responsavel || '-'}</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">Executado por</p>
                      <p>{etapa.executadoPor || '-'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowResponsavelDetalheModal(false)}
                className="px-5 py-2 bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink-bg {
          0%, 100% { background-color: #ffffff; border-color: #fca5a5; }
          50% { background-color: #fef2f2; border-color: #ef4444; }
        }
        .animate-blink {
          animation: blink-bg 1s ease-in-out infinite !important;
        }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
      `}</style>
    </div>
  );
}

const processRealtimeData = (data) => {
  if (!data) return [];
  const dataArray = Array.isArray(data) ? data : Object.values(data);
  return processData(dataArray, []);
};
function processData(data, existingSteps = []) {
  if (!Array.isArray(data)) return [];
  const etapasValidadas = [];
  const chavesProcessadas = new Set();
  const usedIds = new Set(); // Rastreia IDs já vinculados para permitir códigos duplicados em tarefas diferentes

  // --- OPTIMIZATION START ---
  const normalizeMapKey = (str) => str ? String(str).trim().replace(/\s+/g, ' ').toLowerCase() : '';
  const normalizeVal = (str) => str ? String(str).trim().replace(/\s+/g, ' ').toLowerCase() : '';

  // Pre-compute header mapping to avoid repeated Object.keys().find()
  const headerMap = new Map();
  data.forEach(row => {
    Object.keys(row).forEach(k => {
      headerMap.set(normalizeVal(k), k);
    });
  });

  const existingByCodeAndName = new Map();
  const existingByCode = new Map();
  const existingByName = new Map();

  existingSteps.forEach(step => {
    const code = normalizeMapKey(step.codigo);
    const name = normalizeMapKey(step.nome);

    if (code && name) {
      existingByCodeAndName.set(`code:${code}|name:${name}`, step);
    }
    if (code) {
      if (!existingByCode.has(code)) {
        existingByCode.set(code, []);
      }
      existingByCode.get(code).push(step);
    }
    if (name) {
      if (!existingByName.has(name)) {
        existingByName.set(name, []);
      }
      existingByName.get(name).push(step);
    }
  });
  // --- OPTIMIZATION END ---

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
      
      // Detecta se já é uma string ISO para evitar deslocamento de fuso horário
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return v;
      
      // 2. Formato DD/MM/AAAA HH:mm (Estrito BR)
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

      // 3. Formato ISO YYYY-MM-DD HH:mm
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

  data.forEach((row, index) => {
    const getVal = (keys) => {
      for (const k of keys) {
        let val = row[k];
        if (val === undefined) {
          // Use pre-computed map instead of searching every row
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
    const codigo = getVal(['CODIGO', 'codigo', 'CÓDIGO', 'código', 'Codigo', 'Código', 'Cod', 'COD', 'ID', 'Id', 'Code']);
    
    if (!nome) return;

    const uniqueKey = `${codigo ? 'code:' + normalizeVal(codigo) : ''}|name:${normalizeVal(nome)}`;
    
    if (chavesProcessadas.has(uniqueKey)) return;
    chavesProcessadas.add(uniqueKey);

    // --- OPTIMIZATION START ---
    let existing = null;
    const codeA = normalizeVal(codigo);
    const nameA = normalizeVal(nome);

    // 1. Match Forte: Código E Nome iguais
    if (codeA && nameA) {
      const match = existingByCodeAndName.get(`code:${codeA}|name:${nameA}`);
      if (match && !usedIds.has(match.id)) {
        existing = match;
      }
    }

    // 2. Match por Código (se nome mudou, ou se é a "próxima" tarefa com mesmo código)
    if (!existing && codeA && existingByCode.has(codeA)) {
      const potentialMatches = existingByCode.get(codeA);
      existing = potentialMatches.find(e => !usedIds.has(e.id));
    }

    // 3. Match por Nome (se código não existe ou mudou)
    if (!existing && nameA && existingByName.has(nameA)) {
      const potentialMatches = existingByName.get(nameA);
      const match = potentialMatches.find(e => !usedIds.has(e.id));
      if (match) {
        const codeB = normalizeMapKey(match.codigo);
        if (!(codeA && codeB && codeA !== codeB)) {
          existing = match;
        }
      }
    }
    // --- OPTIMIZATION END ---

    if (existing) {
      usedIds.add(existing.id);
    }

    let rawOrdem = getVal(['D+', 'd+', 'Ordem', 'ordem', 'Dia', 'dia']);
    let ordem = parseInt(rawOrdem);
    if (isNaN(ordem)) ordem = index + 1;

    let dataPrevista = formatarData(getVal(['INÍCIO', 'início', 'inicio', 'Data Prevista', 'dataPrevista', 'Data de Início', 'Data de Inicio', 'Previsão', 'Previsao', 'Data', 'Date', 'Start', 'Planejado', 'Data Planejada']));
    const horaInicio = getVal(['HORA INICIO', 'Hora Inicio', 'hora inicio', 'Hora Início']);
    dataPrevista = combinarDataHora(dataPrevista, horaInicio);
    
    let dataReal = formatarData(getVal(['TÉRMINO', 'término', 'termino', 'Data Real', 'dataReal', 'Data Conclusão', 'Data Conclusao', 'Conclusão', 'Conclusao', 'Realizado', 'Executado', 'Fim', 'Data de Término', 'Data de Termino', 'Data Fim', 'Data Final', 'End']));
    const horaTermino = getVal(['HORA TÉRMINO', 'Hora Término', 'hora término', 'HORA TERMICA', 'Hora Termica']);
    dataReal = combinarDataHora(dataReal, horaTermino);

    // Lógica de Status Corrigida
    let status = 'pendente';
    const now = new Date();

    let rawStatus = getVal(['STATUS', 'Status', 'status', 'SITUAÇÃO', 'Situação', 'situacao', 'Estado', 'estado']);
    
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

    etapasValidadas.push({
      id: existing ? existing.id : (Date.now().toString(36) + Math.random().toString(36).substr(2)),
      nome: nome,
      area: getVal(['ÁREA', 'área', 'area', 'Área']) || '',
      responsavel: getVal(['ATRIBUÍDO PARA', 'atribuído para', 'atribuido para', 'Responsável', 'responsavel', 'Responsavel', 'Owner']) || '',
      dataPrevista: dataPrevista,
      dataReal: dataReal,
      ordem: ordem,
      codigo: (codigo !== undefined && codigo !== null) ? String(codigo) : '',
      status: status,
      executadoPor: getVal(['EXECUTADO POR', 'Executado Por', 'Executado por', 'executado por', 'ExecutadoPor', 'executadoPor', 'Executor', 'executor', 'Quem executou', 'Realizado por', 'Executado p/', 'Executado P/', 'Executado']) || quemConcluiu || '',
      observacoes: getVal(['Observações', 'observacoes', 'Observação', 'observação', 'Observacao', 'observacao', 'Obs', 'obs', 'Comentários', 'comentarios']) || '',
      ...row
    });
  });
  return etapasValidadas;
}
