import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFirestore, doc, onSnapshot, collection, getDocs, writeBatch } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { getPeriodos, getEtapas, getStatusColor, getStatusLabel, atualizarEtapa } from '../services/database';
import { format, getDaysInMonth, addDays } from 'date-fns';
import { X, Check, Clock, AlertTriangle, ChevronDown, ChevronUp, CalendarOff, RefreshCw, Calendar, Users, FolderTree } from 'lucide-react';
import TimelineBackground from './TimelineBackground';
import * as XLSX from 'xlsx';
import { getDatabase, ref, onValue } from "firebase/database";
import { checkPermission } from './permissionUtils';
import { ptBR } from 'date-fns/locale';

const MemoizedTimeline = memo(TimelineBackground);

// Componente de Carrossel para os cards dentro de cada slot
const TaskCarousel = ({ tasks, setEtapaSelecionada }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const now = new Date();

  useEffect(() => {
    if (tasks.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % tasks.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [tasks.length]);

  if (tasks.length === 0) return null;

  const etapa = tasks[currentIndex];
  const status = etapa.status ? etapa.status.toLowerCase() : '';
  const isLate = etapa.dataPrevista && new Date(etapa.dataPrevista) < now && status !== 'concluido' && status !== 'concluido_atraso';
  
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
    <div className="relative w-full h-full flex items-center justify-center p-2 overflow-hidden">
      <button 
        key={etapa.id}
        onClick={(e) => { e.stopPropagation(); setEtapaSelecionada(etapa); }}
        className={`flex flex-col rounded-lg shadow-sm text-left hover:shadow-md transition-all relative overflow-hidden border border-slate-200 w-full max-w-[400px] group bg-white shrink-0 h-fit ${status === 'atrasado' || isLate ? 'animate-blink-red !border-red-300' : 'hover:border-blue-300'}`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${borderColor}`}></div>
        
        <div className="p-2.5 pb-1.5 overflow-hidden">
          <div className="font-bold text-[17px] text-slate-900 leading-tight line-clamp-2 break-words min-h-[2.5em]">
            {etapa.codigo ? `${etapa.codigo} - ` : ''}{etapa.nome}
          </div>
        </div>

        <div className="mx-2.5 mb-2.5 p-2 bg-slate-50 rounded-md border border-slate-100 flex items-center justify-between overflow-hidden shrink-0">
          <div className="flex items-center gap-1.5 text-[12px] text-slate-500 shrink-0">
            <span className="font-medium whitespace-nowrap">Área:</span>
            <span className="font-bold text-slate-700">{etapa.area || '-'}</span>
          </div>
          <div className="h-3 w-[1px] bg-slate-200 shrink-0"></div>
          <div className="flex items-center gap-1.5 text-[12px] text-slate-500 shrink-0">
            <span className="font-medium whitespace-nowrap">Resp:</span>
            <span className="font-bold text-slate-700">{etapa.responsavel || '-'}</span>
          </div>
          <div className="h-3 w-[1px] bg-slate-200 shrink-0"></div>
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

  const [periodos, setPeriodos] = useState([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [etapaSelecionada, setEtapaSelecionada] = useState(null);
  const [intervalo, setIntervalo] = useState(1);
  const [horaInicio, setHoraInicio] = useState(0);
    const [horaFim, setHoraFim] = useState(23);
  const [alturaSlot, setAlturaSlot] = useState(240); // Aumentado para acomodar 2 cards confortavelmente
  const [mostrarSemData, setMostrarSemData] = useState(false);
  const [empresaDados, setEmpresaDados] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const timelineRef = useRef(null);
  const isSyncingRef = useRef(false);
  const [filtroLegenda, setFiltroLegenda] = useState(null);
  const [nextSync, setNextSync] = useState(15);
  const [autoSyncing, setAutoSyncing] = useState(false);

  const [allPeriodsMap, setAllPeriodsMap] = useState({});
  const [stepsByCompany, setStepsByCompany] = useState({});

  const empresasParaBuscar = useMemo(() => {
    if (empresaAtual) return [empresaAtual];
    return empresas || [];
  }, [empresaAtual, empresas]);

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
    return <div className="text-xs font-normal text-slate-500 mt-1">{count} etapa{count !== 1 && 's'}</div>;
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
      if (!uniqueMap.has(key)) uniqueMap.set(key, { id: key, mes: p.mes, ano: p.ano });
    });
    const sorted = Array.from(uniqueMap.values()).sort((a, b) => b.ano - a.ano || b.mes - a.mes);
    setPeriodos(sorted);
    if (!periodoSelecionado && sorted.length > 0) setPeriodoSelecionado(sorted[0]);
  }, [allPeriodsMap]);

  useEffect(() => {
    // Se tiver empresa selecionada, usa o Realtime Database (igual Etapas.jsx)
    if (empresaAtual) {
      // Limpa etapas da empresa anterior para evitar "flash" de dados incorretos
      setEtapas([]);

      const db = getDatabase();
      const googleTableRef = ref(db, `tenants/${empresaAtual.id}/tabelaGoogle`);

      const unsubscribe = onValue(googleTableRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const processed = processRealtimeData(data);
          setEtapas(processed);
        } else {
          setEtapas([]);
        }
      });

      return () => unsubscribe();
    }

    // Fallback para Firestore (apenas se não tiver empresa selecionada / visualizando todas)
    if (!periodoSelecionado || !empresasParaBuscar.length || empresaAtual) {
      setEtapas([]);
      setStepsByCompany({});
      return;
    }
    setStepsByCompany({});
    const unsubs = [];
    empresasParaBuscar.forEach(emp => {
      const empPeriods = allPeriodsMap[emp.id] || [];
      const match = empPeriods.find(p => p.mes === periodoSelecionado.mes && p.ano === periodoSelecionado.ano);
      if (match) {
        const unsubscribe = getEtapas(emp.id, match.id, (data) => {
          setStepsByCompany(prev => ({
            ...prev,
            [emp.id]: data.map(d => ({ ...d, empresaId: emp.id, empresaNome: emp.nome, periodoId: match.id }))
          }));
        });
        unsubs.push(unsubscribe);
      }
    });
    return () => unsubs.forEach(u => u());
  }, [periodoSelecionado, empresasParaBuscar, allPeriodsMap, empresaAtual]);

  useEffect(() => {
    const allSteps = Object.values(stepsByCompany).flat();
    const uniqueById = allSteps.filter((item, index, self) => index === self.findIndex((t) => t.id === item.id));
    const sortedData = uniqueById.sort((a, b) => {
      if (!a.dataPrevista) return 1;
      if (!b.dataPrevista) return -1;
      return new Date(a.dataPrevista) - new Date(b.dataPrevista);
    });
    if (!empresaAtual) setEtapas(sortedData);
  }, [stepsByCompany]);

  const handleSync = useCallback(async (isAuto = false) => {
    if (isSyncingRef.current) return;
    if (!empresaAtual) return;
    const dados = empresaDados || empresaAtual;
    if (!dados?.spreadsheetId || !periodoSelecionado) return;

    const empPeriods = allPeriodsMap[empresaAtual.id] || [];
    const realPeriod = empPeriods.find(p => p.mes === periodoSelecionado.mes && p.ano === periodoSelecionado.ano);
    if (!realPeriod) return;
    
    isSyncingRef.current = true;
    if (!isAuto) setSyncing(true); else setAutoSyncing(true);

    try {
      const url = `https://docs.google.com/spreadsheets/d/${dados.spreadsheetId}/gviz/tq?tqx=out:csv${dados.sheetName ? '&sheet=' + encodeURIComponent(dados.sheetName) : '&gid=0'}&t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      const csvText = await response.text();
      const workbook = XLSX.read(csvText, { type: 'string' });
      const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: true });

      const db = getFirestore();
      const etapasRef = collection(db, 'tenants', empresaAtual.id, 'periodos', realPeriod.id, 'etapas');
      const snapshot = await getDocs(etapasRef);
      const currentDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      let processedSteps = processData(data, currentDocs);
      if (processedSteps.length > 0) {
        const batch = writeBatch(db);
        processedSteps.forEach(step => {
          const docRef = step.id ? doc(etapasRef, step.id) : doc(etapasRef);
          batch.set(docRef, { ...step, updatedAt: new Date().toISOString() }, { merge: true });
        });
        await batch.commit();
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSyncing(false); setAutoSyncing(false); isSyncingRef.current = false;
    }
  }, [empresaAtual, empresaDados, periodoSelecionado, allPeriodsMap, userProfile]);

  useEffect(() => {
    let interval;
    if (empresaDados?.spreadsheetId && periodoSelecionado && !syncing) {
      interval = setInterval(() => {
        if (!isSyncingRef.current && !syncing) {
          setNextSync(prev => {
            if (prev <= 1) { handleSync(true); return 15; }
            return prev - 1;
          });
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [empresaDados, periodoSelecionado, syncing, handleSync]);

  const handleConcluir = async (etapa) => {
    const empId = etapa.empresaId || empresaAtual?.id;
    const perId = etapa.periodoId;
    if (!empId || !perId) return;
    await atualizarEtapa(empId, perId, etapa.id, { 
      ...etapa, status: 'concluido', dataReal: new Date().toISOString(), executadoPor: userProfile?.nome || userProfile?.email
    }, userProfile?.id, userProfile?.nome);
  };

  const dataInicio = useMemo(() => {
    return periodoSelecionado ? new Date(periodoSelecionado.ano, periodoSelecionado.mes - 1, 1) : new Date();
  }, [periodoSelecionado]);

  const diasNoMes = useMemo(() => {
    return periodoSelecionado ? getDaysInMonth(dataInicio) : 30;
  }, [periodoSelecionado, dataInicio]);

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
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Fluxograma do Fechamento</h1>
          <p className="text-slate-500">Visualização interativa das etapas do fechamento contábil</p>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3">
            <span className="text-xs text-slate-500 font-medium">Zoom:</span>
            <input type="range" min="60" max="600" step="10" value={alturaSlot} onChange={(e) => setAlturaSlot(Number(e.target.value))} className="w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          </div>
          <select value={periodoSelecionado?.id || ''} onChange={(e) => setPeriodoSelecionado(periodos.find(p => p.id === e.target.value))} className="px-4 py-2 border border-slate-200 rounded-lg font-medium text-slate-700">
            {periodos.map(p => <option key={p.id} value={p.id}>{p.mes}/{p.ano}</option>)}
          </select>
          <button onClick={() => timelineRef.current?.centerOnNow()} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Hoje
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 border border-slate-100">
          <div className="relative w-16 h-16">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <path className="text-slate-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
              <path className="text-green-500" strokeDasharray={`${percentual}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">{percentual}%</div>
          </div>
          <div><p className="text-sm text-slate-500">Progresso</p><p className="text-2xl font-bold">{totalTarefas} tarefas</p></div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between border border-slate-100">
          <div><p className="text-sm text-slate-500">Atrasadas</p><p className="text-2xl font-bold text-red-600">{atrasadas}</p></div>
          <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm h-[650px] flex flex-col overflow-hidden">
        {etapas.length === 0 ? <p className="text-slate-500 text-center py-12">Nenhuma etapa cadastrada</p> : (
          <MemoizedTimeline 
            ref={timelineRef} 
            dataInicio={dataInicio} 
            dias={diasNoMes} 
            renderSlot={renderSlot} 
            renderHeader={renderHeader} 
            intervalo={intervalo} 
            horaInicio={horaInicio} 
            horaFim={horaFim} 
            alturaSlot={alturaSlot} 
            conexoes={conexoes} 
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

      <style>{`
        @keyframes blink-red { 0%, 100% { background-color: #ffffff; } 50% { background-color: #fee2e2; } }
        .animate-blink-red { animation: blink-red 2s infinite; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }

        .custom-scrollbar::-webkit-scrollbar {
          width: 14px;
          height: 14px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
          border: 3px solid #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .custom-scrollbar-inner::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar-inner::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 4px;
        }
        .custom-scrollbar-inner::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
          border: 2px solid #f8fafc;
        }
        .custom-scrollbar-inner::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
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
  const usedIds = new Set();

  const formatarData = (valor) => {
    if (valor === null || valor === undefined || String(valor).trim() === '') return null;
    if (typeof valor === 'number') {
      const valorAjustado = Math.floor(valor + 0.001);
      const date = new Date((valorAjustado - 25569) * 86400 * 1000 + 43200000);
      return date.toISOString();
    }
    if (typeof valor === 'string') {
      const v = valor.trim();
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
      const normalize = (k) => k ? String(k).toLowerCase().replace(/\s+/g, ' ').trim() : '';
      for (const k of keys) {
        let val = row[k];
        if (val === undefined) {
          const target = normalize(k);
          const foundKey = Object.keys(row).find(rk => normalize(rk) === target);
          if (foundKey) val = row[foundKey];
        }
        if (val !== undefined && val !== null && String(val).trim() !== '') return val;
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
      id: null,
      nome: nome,
      area: getVal(['ÁREA', 'área', 'area', 'Área']) || '',
      responsavel: getVal(['ATRIBUÍDO PARA', 'atribuído para', 'atribuido para', 'Responsável', 'responsavel', 'Responsavel', 'Owner']) || '',
      dataPrevista: dataPrevista,
      dataReal: dataReal,
      ordem: ordem,
      codigo: (codigo !== undefined && codigo !== null) ? String(codigo) : '',
      status: status,
      executadoPor: getVal(['EXECUTADO POR', 'Executado Por', 'Executado por', 'executado por', 'ExecutadoPor', 'executadoPor', 'Executor', 'executor', 'Quem executou', 'Realizado por', 'Executado p/', 'Executado P/', 'Executado']) || ''
    });
  });
  return etapasValidadas;
}
