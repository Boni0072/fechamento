import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { doc, onSnapshot, collection, getDocs, writeBatch, setDoc } from 'firebase/firestore';
import { firestore, db as database } from '../firebase';
import { getEtapas } from '../services/database';
import { Clock, AlertTriangle, Activity, Target, X, Info, RefreshCw, ChevronDown, ChevronUp, Trophy, Maximize2, CheckCircle2, ListChecks } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ref, onValue, set } from "firebase/database";

export default function Dashboard() {
  const navigate = useNavigate();
  const { empresaAtual, empresas, selecionarEmpresa } = useAuth();
  const { loading: loadingPermissoes, user: authUser, autorizado } = usePermissao('dashboard');
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const viewAllCompanies = !empresaAtual;

  useEffect(() => {
    if (authUser && authUser.id && empresaAtual && empresaAtual.id) {
      setLoadingProfile(true);
      const userRef = doc(firestore, 'tenants', empresaAtual.id, 'usuarios', authUser.id);
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

  const [periodos, setPeriodos] = useState([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [allEtapas, setAllEtapas] = useState([]);
  const [stepsByCompany, setStepsByCompany] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedAreaType, setSelectedAreaType] = useState('responsavel');
  const [selectedGargalo, setSelectedGargalo] = useState(null);
  const [desempenhoMode, setDesempenhoMode] = useState('responsavel');
  const [empresaDados, setEmpresaDados] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [showResponsavel, setShowResponsavel] = useState(false);
  const [showApoio, setShowApoio] = useState(false);
  const [expandedChart, setExpandedChart] = useState(null);
  const [kpis, setKpis] = useState({
    total: 0, concluidas: 0, concluidasNoPrazo: 0, concluidasComAtraso: 0,
    pendentes: 0, emAndamento: 0, atrasadas: 0,
    percentualConcluido: 0, percentualPrazo: 0, mediaAtraso: 0,
    topGargalos: [], desempenhoPorArea: [], desempenhoPorResponsavel: [],
    desempenhoPorEmpresa: [], rankingApoio: []
  });

  useEffect(() => { setPeriodoSelecionado(null); }, [empresaAtual]);

  useEffect(() => {
    if (!empresaAtual && (!empresas || empresas.length === 0)) return;
    let unsubEmpresa = () => {};
    if (empresaAtual) {
      const empresaRef = doc(firestore, 'tenants', empresaAtual.id);
      unsubEmpresa = onSnapshot(empresaRef, (snapshot) => {
        setEmpresaDados({ id: empresaAtual.id, ...snapshot.data() });
      });
    }
    return () => { unsubEmpresa(); };
  }, [empresaAtual, viewAllCompanies, empresas]);

  useEffect(() => {
    if (!empresaAtual) return;
    const googleTableRef = ref(database, `tenants/${empresaAtual.id}/tabelaGoogle`);
    const unsub = onValue(googleTableRef, (snapshot) => {
      const data = snapshot.val();
      const processedEtapas = data ? processRealtimeData(data) : [];
      setStepsByCompany({ [empresaAtual.id]: processedEtapas.map(e => ({ ...e, empresaNome: empresaAtual.nome, empresaId: empresaAtual.id })) });
    });
    return () => unsub();
  }, [empresaAtual]);

  useEffect(() => {
    if (empresaAtual) return;
    if (!empresas || empresas.length === 0) { setStepsByCompany({}); return; }
    const unsubs = empresas.map(emp => {
      const googleTableRef = ref(database, `tenants/${emp.id}/tabelaGoogle`);
      return onValue(googleTableRef, (snapshot) => {
        const data = snapshot.val();
        const processedEtapas = data ? processRealtimeData(data) : [];
        setStepsByCompany(prev => ({ ...prev, [emp.id]: processedEtapas.map(e => ({ ...e, empresaNome: emp.nome, empresaId: emp.id })) }));
      });
    });
    return () => unsubs.forEach(unsub => unsub());
  }, [empresas, empresaAtual]);

  useEffect(() => {
    const allSteps = Object.values(stepsByCompany).flat();
    setAllEtapas(allSteps);
    const periodsMap = new Map();
    allSteps.forEach(step => {
      if (step.dataPrevista) {
        const d = new Date(step.dataPrevista);
        if (!isNaN(d.getTime())) {
          const key = `${d.getMonth()+1}-${d.getFullYear()}`;
          if (!periodsMap.has(key)) periodsMap.set(key, { id: key, mes: d.getMonth()+1, ano: d.getFullYear() });
        }
      }
    });
    const sortedData = Array.from(periodsMap.values()).sort((a, b) => b.ano - a.ano || b.mes - a.mes);
    const finalPeriods = [{ id: 'todos', mes: 'Todos', ano: '' }, ...sortedData];
    setPeriodos(finalPeriods);
    setPeriodoSelecionado(prev => prev && finalPeriods.find(p => p.id === prev.id) ? prev : finalPeriods[0] || null);
  }, [stepsByCompany]);

  useEffect(() => {
    let filtered = allEtapas;
    if (periodoSelecionado && periodoSelecionado.id !== 'todos') {
      filtered = allEtapas.filter(e => {
        if (!e.dataPrevista) return false;
        const d = new Date(e.dataPrevista);
        return (d.getMonth() + 1) == periodoSelecionado.mes && d.getFullYear() == periodoSelecionado.ano;
      });
    }
    setEtapas(filtered);
    calcularKpis(filtered);
  }, [allEtapas, periodoSelecionado]);

  const handleSync = useCallback(async (isAuto = false) => {
    if (isSyncingRef.current) return;
    const targetEmpresas = empresaAtual ? [{ ...empresaAtual, ...empresaDados }] : (empresas || []);
    const empresasParaSync = targetEmpresas.filter(e => e.spreadsheetId);
    if (empresasParaSync.length === 0) {
      if (!isAuto && window.confirm("Nenhuma empresa configurada.\n\nDeseja configurar as planilhas agora?")) navigate('/empresas');
      return;
    }
    isSyncingRef.current = true;
    if (!isAuto) setSyncing(true); else setAutoSyncing(true);
    try {
      let globalTotalOps = 0, totalPeriodsProcessed = 0;
      const syncPromises = empresasParaSync.map(async (emp) => {
        const sheetParam = emp.sheetName ? `&sheet=${encodeURIComponent(emp.sheetName)}` : '&gid=0';
        const url = `https://docs.google.com/spreadsheets/d/${emp.spreadsheetId}/gviz/tq?tqx=out:csv${sheetParam}&t=${Date.now()}`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return 0;
        const csvText = await response.text();
        if (csvText.trim().toLowerCase().startsWith('<!doctype html')) return 0;
        const workbook = XLSX.read(csvText, { type: 'string' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { raw: true });
        const rawTasksByPeriod = data.reduce((acc, row) => {
          const tp = processData([row])[0];
          if (tp?.dataPrevista) { const d = new Date(tp.dataPrevista); const key = `${d.getUTCFullYear()}-${d.getUTCMonth()+1}`; if (!acc[key]) acc[key] = []; acc[key].push(row); }
          return acc;
        }, {});
        if (Object.keys(rawTasksByPeriod).length === 0) return 0;
        const periodsSnap = await getDocs(collection(firestore, 'tenants', emp.id, 'periodos'));
        const existingPeriods = periodsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        let companyOps = 0;
        await Promise.all(Object.keys(rawTasksByPeriod).map(async (periodKey) => {
          const [year, month] = periodKey.split('-').map(Number);
          const rawRows = rawTasksByPeriod[periodKey];
          let periodDoc = existingPeriods.find(p => p.ano === year && p.mes === month);
          let periodId = periodDoc?.id, currentDocs = [];
          if (periodDoc) {
            const snapshot = await getDocs(collection(firestore, 'tenants', emp.id, 'periodos', periodId, 'etapas'));
            currentDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          } else {
            const newPeriodRef = doc(collection(firestore, 'tenants', emp.id, 'periodos'));
            await setDoc(newPeriodRef, { ano: year, mes: month, status: 'aberto', createdAt: new Date().toISOString() });
            periodId = newPeriodRef.id;
          }
          const processedSteps = processData(rawRows, currentDocs);
          const batch = writeBatch(firestore);
          const keptIds = new Set();
          const etapasColRef = collection(firestore, 'tenants', emp.id, 'periodos', periodId, 'etapas');
          processedSteps.forEach(step => { const { id, ...sd } = step; batch.set(id ? doc(etapasColRef, id) : doc(etapasColRef), sd, { merge: true }); if (id) keptIds.add(id); });
          currentDocs.forEach(d => { if (!keptIds.has(d.id)) batch.delete(doc(etapasColRef, d.id)); });
          await batch.commit();
          return processedSteps.length;
        }));
        totalPeriodsProcessed += Object.keys(rawTasksByPeriod).length;
        await set(ref(database, `tenants/${emp.id}/tabelaGoogle`), processData(data));
      });
      const results = await Promise.all(syncPromises);
      globalTotalOps = results.reduce((a, b) => a + b, 0);
      if (!isAuto) alert(`Sincronização concluída!\nEmpresas: ${empresasParaSync.length}\nPeríodos: ${totalPeriodsProcessed}\nItens: ${globalTotalOps}`);
    } catch (error) {
      if (!isAuto) alert('Erro na sincronização: ' + error.message);
    } finally {
      if (!isAuto) setSyncing(false); else setAutoSyncing(false);
      isSyncingRef.current = false;
    }
  }, [empresaAtual, empresaDados, empresas, navigate]);

  const calcularKpis = useCallback((dados) => {
    if (!dados) return;
    const total = dados.length;
    const pendentes = dados.filter(e => e.status === 'pendente').length;
    const emAndamento = dados.filter(e => e.status === 'em_andamento').length;
    const atrasadas = dados.filter(e => e.status === 'atrasado').length;
    const concluidasNoPrazoCount = dados.filter(e => e.status === 'concluido').length;
    const concluidasComAtrasoCount = dados.filter(e => e.status === 'concluido_atraso').length;
    const concluidasTotal = concluidasNoPrazoCount + concluidasComAtrasoCount;
    const percentualConcluido = total > 0 ? Math.round((concluidasTotal / total) * 100) : 0;
    const percentualPrazo = concluidasTotal > 0 ? Math.round((concluidasNoPrazoCount / concluidasTotal) * 100) : 100;
    let somaDiasAtraso = 0, qtdAtrasoParaMedia = 0;
    dados.forEach(e => {
      if (e.dataPrevista) {
        const dPrev = new Date(e.dataPrevista); dPrev.setHours(0,0,0,0);
        let dReal; if (e.status === 'concluido' || e.status === 'concluido_atraso') { dReal = e.dataReal ? new Date(e.dataReal) : new Date(); } else { dReal = new Date(); }
        dReal.setHours(0,0,0,0);
        const isLateStatus = e.status === 'atrasado' || e.status === 'concluido_atraso';
        const isLateDate = dReal.getTime() > dPrev.getTime();
        if (isLateStatus || (isLateDate && (e.status === 'atrasado' || e.status === 'concluido' || e.status === 'concluido_atraso'))) {
          somaDiasAtraso += Math.ceil(Math.abs(dReal.getTime() - dPrev.getTime()) / (1000*60*60*24)); qtdAtrasoParaMedia++;
        }
      }
    });
    const mediaAtraso = qtdAtrasoParaMedia > 0 ? Math.round(somaDiasAtraso / qtdAtrasoParaMedia) : 0;
    const areasMap = {};
    dados.forEach(e => { if (e.status === 'atrasado') { const area = e.area || 'Sem Área'; areasMap[area] = (areasMap[area]||0)+1; } });
    const topGargalos = Object.entries(areasMap).sort(([,a],[,b]) => b-a).slice(0,3).map(([area, count]) => ({ area, count }));
    const areaStats = {};
    dados.forEach(e => { const area = e.area || 'Sem Área'; if (!areaStats[area]) areaStats[area] = { total: 0, concluidas: 0 }; areaStats[area].total++; if (e.status === 'concluido' || e.status === 'concluido_atraso') areaStats[area].concluidas++; });
    const desempenhoPorArea = Object.entries(areaStats).map(([nome, s]) => ({ nome, total: s.total, concluidas: s.concluidas, percentual: s.total > 0 ? Math.round((s.concluidas/s.total)*100) : 0 })).sort((a,b) => b.percentual - a.percentual);
    const respStats = {};
    dados.forEach(e => { const resp = e.responsavel || 'Sem Responsável'; if (!respStats[resp]) respStats[resp] = { total: 0, concluidas: 0 }; respStats[resp].total++; if (e.status === 'concluido' || e.status === 'concluido_atraso') respStats[resp].concluidas++; });
    const desempenhoPorResponsavel = Object.entries(respStats).map(([nome, s]) => ({ nome, total: s.total, concluidas: s.concluidas, percentual: s.total > 0 ? Math.round((s.concluidas/s.total)*100) : 0 })).sort((a,b) => b.percentual - a.percentual);
    const execStats = {};
    dados.forEach(e => {
      const executor = e.executadoPor || 'Sem Executado';
      if (!execStats[executor]) execStats[executor] = { total: 0, concluidas: 0 };
      execStats[executor].total++;
      if (e.status === 'concluido' || e.status === 'concluido_atraso') execStats[executor].concluidas++;
    });
    const desempenhoPorExecutadoPor = Object.entries(execStats).map(([nome, s]) => ({ nome, total: s.total, concluidas: s.concluidas, percentual: s.total > 0 ? Math.round((s.concluidas/s.total)*100) : 0 })).sort((a,b) => b.percentual - a.percentual);
    const empStats = {};
    dados.forEach(e => { const emp = e.empresaNome || empresaDados?.nome || empresaAtual?.nome || 'Empresa'; if (!empStats[emp]) empStats[emp] = { total: 0, concluidas: 0 }; empStats[emp].total++; if (e.status === 'concluido' || e.status === 'concluido_atraso') empStats[emp].concluidas++; });
    const desempenhoPorEmpresa = Object.entries(empStats).map(([nome, s]) => ({ nome, total: s.total, concluidas: s.concluidas, percentual: s.total > 0 ? Math.round((s.concluidas/s.total)*100) : 0 })).sort((a,b) => b.percentual - a.percentual);
    const apoioStats = {};
    dados.forEach(e => { if (e.executadoPor && e.responsavel) { const ex = String(e.executadoPor).trim(), rp = String(e.responsavel).trim(); if (ex && rp && ex.toLowerCase() !== rp.toLowerCase()) { apoioStats[ex] = (apoioStats[ex]||0)+1; } } });
    const rankingApoio = Object.entries(apoioStats).map(([nome, count]) => ({ nome, count })).sort((a,b) => b.count - a.count);
    setKpis({ total, concluidas: concluidasTotal, concluidasNoPrazo: concluidasNoPrazoCount, concluidasComAtraso: concluidasComAtrasoCount, pendentes, emAndamento, atrasadas, percentualConcluido, percentualPrazo, mediaAtraso, topGargalos, desempenhoPorArea, desempenhoPorResponsavel, desempenhoPorExecutadoPor, desempenhoPorEmpresa, rankingApoio });
  }, [empresaDados, empresaAtual]);

  const chartData = [
    { key: 'concluidas_no_prazo', label: 'Concluídas no Prazo', value: kpis.concluidasNoPrazo, color: '#35dab3' },
    { key: 'concluidas_atraso', label: 'Concluídas c/ Atraso', value: kpis.concluidasComAtraso, color: '#f5b64d' },
    { key: 'em_andamento', label: 'Em Andamento', value: kpis.emAndamento, color: '#7c9cff' },
    { key: 'pendentes', label: 'Pendentes', value: kpis.pendentes, color: '#b17cff' },
    { key: 'atrasadas', label: 'Atrasadas', value: kpis.atrasadas, color: '#fb7169' },
  ];

  const desempenhoData = desempenhoMode === 'responsavel' ? kpis.desempenhoPorResponsavel : kpis.desempenhoPorExecutadoPor;
  const desempenhoLabel = desempenhoMode === 'responsavel' ? 'Desempenho por Responsável' : 'Desempenho por Executado Por';
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const totalChart = kpis.total || 1;

  if (loadingPermissoes || loadingProfile || (authUser && !userProfile) || (userProfile && !userProfile.perfilAcesso && !userProfile.perfilIncompleto)) {
    return <div className="flex flex-col items-center justify-center h-96"><div className="spinner"></div><p style={{ color: 'var(--text-muted)' }} className="mt-3">Carregando permissões...</p></div>;
  }

  if (!empresaAtual && !viewAllCompanies) {
    return <div className="flex flex-col items-center justify-center h-96"><p style={{ color: 'var(--text-muted)' }}>Nenhuma empresa selecionada</p><a href="/empresas" className="mt-2">Criar ou selecionar uma empresa</a></div>;
  }

  if (!autorizado) return <div className="flex flex-col items-center justify-center h-96"><p style={{ color: 'var(--text-muted)' }}>Acesso não autorizado.</p></div>;

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", letterSpacing: '-0.3px', color: 'var(--text)' }}>Dashboard do Fechamento</h1>
          <p style={{ color: 'var(--text-muted)' }} className="text-sm mt-1">Acompanhe o progresso do fechamento contábil</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={periodoSelecionado?.id || ''}
            onChange={(e) => { const p = periodos.find(p => p.id === e.target.value); setPeriodoSelecionado(p); }}
            className="!py-2 !px-4 text-sm"
          >
            {periodos.map(p => {
              const label = p.id === 'todos' ? 'Todos os Períodos' : new Date(p.ano, p.mes-1).toLocaleString('pt-BR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase()) + `/${p.ano}`;
              return <option key={p.id} value={p.id}>{label}</option>;
            })}
          </select>
          <button onClick={() => handleSync(false)} disabled={syncing} className="btn btn-primary">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        {/* Donut Chart */}
        <div className="card lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Progresso do Fechamento</h3>
            <button onClick={() => setExpandedChart('progresso')} style={{ color: 'var(--text-dim)' }} className="hover:opacity-80"><Maximize2 className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex items-center justify-center gap-6">
            <div className="relative w-[360px] h-[360px] shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" style={{ filter: 'drop-shadow(0 0 14px rgba(53,218,179,0.18))' }}>
                <defs>
                  <linearGradient id="gradAtraso" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#fb7169"/><stop offset="100%" stopColor="#f5b64d"/></linearGradient>
                  <linearGradient id="gradPend" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#8c6cf5"/><stop offset="100%" stopColor="#a076ff"/></linearGradient>
                  <linearGradient id="gradOk" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#35dab3"/><stop offset="100%" stopColor="#26b8e0"/></linearGradient>
                  <linearGradient id="gradAnd" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#5b7bff"/><stop offset="100%" stopColor="#3f60f5"/></linearGradient>
                  <linearGradient id="gradConcluidasAtraso" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#f5b64d"/><stop offset="100%" stopColor="#f3a832"/></linearGradient>
                </defs>
                <circle cx="50" cy="50" r="43" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14"/>
                {(() => { let acc = 0; const segments = [
                  { v: kpis.atrasadas, grad: 'url(#gradAtraso)' },
                  { v: kpis.pendentes, grad: 'url(#gradPend)' },
                  { v: kpis.emAndamento, grad: 'url(#gradAnd)' },
                  { v: kpis.concluidasComAtraso, grad: 'url(#gradConcluidasAtraso)' },
                  { v: kpis.concluidasNoPrazo, grad: 'url(#gradOk)' },
                ]; return segments.map((seg, i) => { const len = (seg.v / totalChart) * (2 * Math.PI * 43); const off = acc; acc += len; return <circle key={i} cx="50" cy="50" r="43" fill="none" stroke={seg.grad} strokeWidth="14" strokeDasharray={`${len} ${2 * Math.PI * 43}`} strokeDashoffset={-off} transform="rotate(-90 50 50)" strokeLinecap="round" className="transition-all duration-1000 ease-out"/>; }); })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>{kpis.percentualConcluido}%</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>Concluído</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-1 max-w-[160px]">
              {chartData.map(item => (
                <div key={item.key} onClick={() => setSelectedStatus(item.key)} className="flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }}></div>
                    <span className="text-xs" style={{ color: 'var(--text)' }}>{item.label}</span>
                  </div>
                  <span className="badge">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              title="Conclusão Geral"
              value={`${kpis.percentualConcluido}%`}
              subtitle={`${kpis.concluidas}/${kpis.total} etapas`}
              icon={<Activity className="w-4 h-4" />}
              chipColor="mint"
              sparkline={[30, 45, 38, 52, 48, 60, 55, kpis.percentualConcluido]}
            />
            <MetricCard
              title="Aderência ao Prazo"
              value={`${kpis.percentualPrazo}%`}
              subtitle="Das etapas concluídas"
              icon={<Target className="w-4 h-4" />}
              chipColor={kpis.percentualPrazo >= 90 ? "mint" : kpis.percentualPrazo >= 70 ? "warning" : "danger"}
              sparkline={[80, 75, 85, 70, 90, 65, 72, kpis.percentualPrazo]}
            />
            <MetricCard
              title="Etapas em Atraso"
              value={kpis.atrasadas}
              subtitle="Requerem atenção"
              icon={<AlertTriangle className="w-4 h-4" />}
              chipColor={kpis.atrasadas === 0 ? "mint" : "danger"}
              sparkline={[40, 45, 50, 48, 52, 55, 53, kpis.atrasadas]}
            />
            <MetricCard
              title="Média de Atraso"
              value={`${kpis.mediaAtraso}d`}
              subtitle="Fora do prazo"
              icon={<Clock className="w-4 h-4" />}
              chipColor="warning"
              sparkline={[120, 130, 140, 135, 145, 150, 146, kpis.mediaAtraso]}
            />
          </div>

          {/* Bottom row: Area / Gargalos */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-5" onDoubleClick={() => setDesempenhoMode(prev => prev === 'responsavel' ? 'executado' : 'responsavel')}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{desempenhoLabel}</h3>
                  <p className="text-[9px] mt-1" style={{ color: 'var(--text-dim)' }}>Dois cliques para alternar entre Responsável e Executado Por</p>
                </div>
                <button onClick={() => setExpandedChart('area')} style={{ color: 'var(--text-dim)' }} className="hover:opacity-80"><Maximize2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="h-[130px] flex items-end gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
                {desempenhoData.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum dado disponível</div>
                ) : (
                  desempenhoData.map((item, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-1.5 min-w-[40px] flex-1 h-full justify-end group cursor-pointer" onClick={() => { setSelectedArea(item.nome); setSelectedAreaType(desempenhoMode); }}>
                      <span className="text-[10px] font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{item.percentual}%</span>
                      <div className="w-full flex-1 rounded-t-md relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <div className="absolute bottom-0 left-0 right-0 rounded-t-md transition-all duration-500" style={{ height: `${item.percentual}%`, background: 'linear-gradient(180deg, var(--accent), var(--accent-2))', boxShadow: '0 0 12px rgba(53,218,179,0.2)' }} />
                      </div>
                      <span className="text-[9px] text-center truncate w-full max-w-[50px]" style={{ color: 'var(--text-dim)' }}>{item.nome.split(' ')[0]}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Principais Gargalos</h3>
                <button onClick={() => setExpandedChart('gargalos')} style={{ color: 'var(--text-dim)' }} className="hover:opacity-80"><Maximize2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex flex-col gap-3">
                {kpis.topGargalos.length === 0 ? (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--text-dim)' }}>Nenhum gargalo identificado</p>
                ) : (
                  kpis.topGargalos.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 flex items-center justify-center rounded text-[10px]" style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>{idx+1}</span>
                        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{item.area}</span>
                      </div>
                      <span className="badge badge-danger">{item.count} atrasadas</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Evolution by Company */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Evolução por Empresa</h3>
          <button onClick={() => setExpandedChart('empresas')} style={{ color: 'var(--text-dim)' }} className="hover:opacity-80"><Maximize2 className="w-3.5 h-3.5" /></button>
        </div>
        {kpis.desempenhoPorEmpresa.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--text-dim)' }}>Nenhum dado disponível</p>
        ) : (
          <div className="flex flex-col gap-4">
            {kpis.desempenhoPorEmpresa.map((item, idx) => (
              <div key={idx} className="flex items-center gap-4">
                <span className="text-sm font-semibold w-[120px] shrink-0" style={{ color: 'var(--text)' }}>{item.nome}</span>
                <div className="progress-bar flex-1"><div className="progress-fill" style={{ width: `${item.percentual}%` }}></div></div>
                <span className="text-sm font-bold w-[40px] text-right" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{item.percentual}%</span>
                <span className="text-xs w-[80px] text-right" style={{ color: 'var(--text-dim)' }}>{item.concluidas}/{item.total}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Performance by Responsible & Support Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={() => setShowResponsavel(!showResponsavel)}>
            <div className="flex items-center gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Desempenho por Responsável</h3>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={(e) => { e.stopPropagation(); setExpandedChart('responsavel'); }} style={{ color: 'var(--text-dim)' }} className="hover:opacity-80"><Maximize2 className="w-3.5 h-3.5" /></button>
              {showResponsavel ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-dim)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />}
            </div>
          </div>
          {showResponsavel && (
            <div className="flex flex-col gap-3 max-h-[260px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
              {kpis.desempenhoPorResponsavel.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: 'var(--text-dim)' }}>Nenhum dado disponível</p>
              ) : (
                kpis.desempenhoPorResponsavel.map((item, idx) => (
                  <div key={idx} onClick={() => setSelectedUser(item.nome)} className="cursor-pointer p-2 rounded-lg transition-colors" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-medium" style={{ color: 'var(--text)' }}>{item.nome}</span>
                      <span style={{ color: 'var(--text-dim)' }}>{item.concluidas}/{item.total} ({item.percentual}%)</span>
                    </div>
                    <div className="progress-bar"><div className="progress-fill" style={{ width: `${item.percentual}%` }}></div></div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4" style={{ color: 'var(--warning)' }} />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Campeões de Apoio</h3>
            </div>
            <button onClick={() => setExpandedChart('apoio')} style={{ color: 'var(--text-dim)' }} className="hover:opacity-80"><Maximize2 className="w-3.5 h-3.5" /></button>
          </div>
          {kpis.rankingApoio.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-dim)' }}>Nenhum dado disponível</p>
          ) : (
            <>
              <div className="flex items-end justify-center gap-4 h-36 pt-2 mb-4">
                {['silver','gold','bronze'].map((tier, idx) => {
                  const person = kpis.rankingApoio[idx];
                  if (!person) return <div key={tier} className="flex-1" />;
                  const heights = [55, 75, 40];
                  const emojis = { gold: '🥇', silver: '🥈', bronze: '🥉' };
                  return (
                    <div key={tier} className="flex flex-col items-center flex-1 group">
                      <span className="text-[10px] font-medium text-center mb-1" style={{ color: 'var(--text-muted)' }}>{person.nome.split(' ')[0]}</span>
                      <div className="w-full rounded-t-lg transition-all group-hover:opacity-90 flex items-end justify-center pb-2" style={{ height: `${heights[idx]}px`, background: idx === 1 ? 'linear-gradient(180deg, #f5b64d, rgba(245,182,77,0.3))' : idx === 0 ? 'linear-gradient(180deg, #35dab3, rgba(53,218,179,0.3))' : 'linear-gradient(180deg, #7c9cff, rgba(124,156,255,0.3))', borderTop: `3px solid ${idx === 1 ? '#f5b64d' : idx === 0 ? '#35dab3' : '#7c9cff'}` }}>
                        <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: idx === 0 ? 'var(--accent)' : idx === 1 ? 'var(--warning)' : 'var(--info)' }}>{idx+1}</span>
                      </div>
                      <span className="text-[10px] mt-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{person.count} t.</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col gap-2">
                {kpis.rankingApoio.slice(0, 5).map((item, index) => (
                  <div key={index} className="flex items-center gap-3 py-1.5" style={{ borderBottom: index < 4 ? '1px solid var(--border)' : 'none' }}>
                    <span className="w-5 h-5 flex items-center justify-center rounded text-[10px]" style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>{index+1}</span>
                    <span className="text-xs font-medium flex-1" style={{ color: 'var(--text)' }}>{item.nome}</span>
                    <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{item.count} tarefas</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Expanded Modal */}
      {expandedChart && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '1000px' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
                {expandedChart === 'progresso' && 'Progresso Detalhado'}
                {expandedChart === 'area' && desempenhoLabel}
                {expandedChart === 'gargalos' && 'Principais Gargalos'}
                {expandedChart === 'empresas' && 'Evolução por Empresas'}
                {expandedChart === 'responsavel' && 'Desempenho por Responsável'}
                {expandedChart === 'apoio' && 'Ranking de Apoio'}
              </h3>
              <button onClick={() => setExpandedChart(null)} className="p-1.5 rounded-lg transition-colors" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {expandedChart === 'progresso' && (
                <div className="flex flex-col items-center gap-8">
                  <div className="relative w-[300px] h-[300px]">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" style={{ filter: 'drop-shadow(0 0 20px rgba(53,218,179,0.2))' }}>
                      <circle cx="50" cy="50" r={40} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12"/>
                      {(() => { let acc = 0; const segs = [
                        { v: kpis.atrasadas, c: '#fb7169' }, { v: kpis.pendentes, c: '#f5b64d' }, { v: kpis.emAndamento, c: '#7c9cff' }, { v: kpis.concluidasComAtraso, c: '#f5b64d' }, { v: kpis.concluidasNoPrazo, c: '#35dab3' }
                      ]; return segs.map((s, i) => { const len = (s.v/totalChart)*circumference; const off = acc; acc += len; return <circle key={i} cx="50" cy="50" r={40} fill="none" stroke={s.c} strokeWidth="12" strokeDasharray={`${len} ${circumference}`} strokeDashoffset={-off} transform="rotate(-90 50 50)" strokeLinecap="round"/>; }); })()}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-5xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>{kpis.percentualConcluido}%</span>
                      <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Concluído</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full max-w-2xl">
                    {chartData.map(item => (
                      <button key={item.key} type="button" onClick={() => setSelectedStatus(item.key)} className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all text-left" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ background: item.color }}></div>
                          <span className="text-xs" style={{ color: 'var(--text)' }}>{item.label}</span>
                        </div>
                        <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{item.value}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {expandedChart === 'area' && (
                <div className="h-[400px] flex items-end gap-4 overflow-x-auto pb-6" style={{ scrollbarWidth: 'thin' }}>
                  {desempenhoData.map((item, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-2 min-w-[70px] h-full justify-end cursor-pointer" onClick={() => { setExpandedChart(null); setSelectedArea(item.nome); setSelectedAreaType(desempenhoMode); }}>
                      <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{item.percentual}%</span>
                      <div className="w-full max-w-[60px] flex-1 rounded-t-lg relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <div className="absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-700" style={{ height: `${item.percentual}%`, background: 'linear-gradient(180deg, var(--accent), var(--accent-2))', boxShadow: '0 0 16px rgba(53,218,179,0.25)' }} />
                      </div>
                      <span className="text-xs font-medium text-center" style={{ color: 'var(--text)' }}>{item.nome}</span>
                      <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{item.concluidas}/{item.total}</span>
                    </div>
                  ))}
                </div>
              )}
              {expandedChart === 'gargalos' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {kpis.topGargalos.map((item, idx) => (
                    <div key={idx} onClick={() => { setExpandedChart(null); setSelectedGargalo(item.area); }} className="flex items-center justify-between p-4 rounded-lg cursor-pointer transition-all" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', fontFamily: 'var(--font-display)' }}>{idx+1}</span>
                        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{item.area}</span>
                      </div>
                      <span className="badge badge-danger">{item.count} atrasadas</span>
                    </div>
                  ))}
                </div>
              )}
              {expandedChart === 'empresas' && (
                <div className="flex flex-col gap-4">
                  {kpis.desempenhoPorEmpresa.map((item, idx) => (
                    <div key={idx} className="p-4 rounded-lg" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{item.nome}</span>
                        <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{item.percentual}%</span>
                      </div>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${item.percentual}%` }}></div></div>
                      <div className="flex justify-between mt-1.5 text-xs" style={{ color: 'var(--text-dim)' }}><span>Progresso: {item.concluidas}/{item.total}</span><span>{item.total - item.concluidas} restantes</span></div>
                    </div>
                  ))}
                </div>
              )}
              {expandedChart === 'responsavel' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {kpis.desempenhoPorResponsavel.map((item, idx) => (
                    <div key={idx} onClick={() => { setExpandedChart(null); setSelectedUser(item.nome); }} className="p-4 rounded-lg cursor-pointer transition-all" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>{item.nome.charAt(0)}</div>
                        <span className="text-sm font-medium truncate flex-1" style={{ color: 'var(--text)' }}>{item.nome}</span>
                        <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{item.percentual}%</span>
                      </div>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${item.percentual}%` }}></div></div>
                      <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>{item.concluidas} de {item.total} tarefas</div>
                    </div>
                  ))}
                </div>
              )}
              {expandedChart === 'apoio' && (
                <div className="flex flex-col gap-6">
                  <div className="flex items-end justify-center gap-6 h-48">
                    {[1,0,2].map(idx => {
                      const person = kpis.rankingApoio[idx];
                      if (!person) return <div key={idx} className="flex-1" />;
                      const heights = [120, 160, 90];
                      const colors = idx === 0 ? ['var(--accent)', 'rgba(53,218,179,0.2)'] : idx === 1 ? ['var(--warning)', 'rgba(245,182,77,0.2)'] : ['var(--info)', 'rgba(124,156,255,0.2)'];
                      return (
                        <div key={idx} className="flex flex-col items-center flex-1 group">
                          <span className="text-xs font-medium text-center mb-2" style={{ color: 'var(--text)' }}>{person.nome.split(' ')[0]}</span>
                          <div className="w-full rounded-t-xl flex items-end justify-center pb-3 transition-all" style={{ height: `${heights[idx]}px`, background: `linear-gradient(180deg, ${colors[0]}, ${colors[1]})`, borderTop: `3px solid ${colors[0]}` }}>
                            <span className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: '#fff' }}>{idx+1}</span>
                          </div>
                          <span className="text-xs mt-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{person.count} tarefas</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {kpis.rankingApoio.slice(3).map((item, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 rounded-lg" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                        <span className="w-6 h-6 rounded flex items-center justify-center text-[10px]" style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>{index+4}</span>
                        <span className="text-xs font-medium flex-1" style={{ color: 'var(--text)' }}>{item.nome}</span>
                        <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {selectedUser && <RadarModal userName={selectedUser} allEtapas={etapas} onClose={() => setSelectedUser(null)} />}
      {selectedStatus && <StatusDetailsModal statusType={selectedStatus} etapas={etapas} onClose={() => setSelectedStatus(null)} />}
      {selectedArea && <AreaDetailsModal name={selectedArea} type={selectedAreaType} etapas={etapas} onClose={() => setSelectedArea(null)} />}
      {selectedGargalo && <GargalosDetailsModal areaName={selectedGargalo} etapas={etapas} onClose={() => setSelectedGargalo(null)} />}
    </div>
  );
}

// --- Helper Components ---
function MetricCard({ title, value, subtitle, icon, chipColor, sparkline }) {
  const sparkPoints = sparkline?.join(',') || '';
  return (
    <div className="card p-4 min-h-[120px] flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between">
          <div className={`icon-chip ${chipColor}`}>{icon}</div>
          {sparkline && (
            <svg className="w-16 h-7" viewBox="0 0 64 28">
              <polyline points={sparkline.map((v, i) => `${(i/(sparkline.length-1))*60},${28-(v/Math.max(...sparkline))*24}`).join(' ')} fill="none" stroke={chipColor === 'danger' ? 'var(--danger)' : chipColor === 'warning' ? 'var(--warning)' : 'var(--accent)'} strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
        </div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider mt-2 mb-1" style={{ color: 'var(--text-muted)' }}>{title}</h3>
      </div>
      <div>
        <div className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.5px', color: chipColor === 'danger' ? 'var(--danger)' : chipColor === 'warning' ? 'var(--warning)' : 'var(--text)' }}>{value}</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>
      </div>
    </div>
  );
}

function StatusBadge({ color, label, count, onClick, className = '' }) {
  return (
    <div onClick={onClick} className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${className}`} style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        <span className="text-xs" style={{ color: 'var(--text)' }}>{label}</span>
      </div>
      <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface-2)', color: 'var(--text)' }}>{count}</span>
    </div>
  );
}

function RadarModal({ userName, allEtapas, onClose }) {
  const userTasks = allEtapas.filter(e => e.responsavel === userName);
  const total = userTasks.length;
  const concluidas = userTasks.filter(e => e.status === 'concluido' || e.status === 'concluido_atraso').length;
  const atrasadas = userTasks.filter(e => e.status === 'atrasado').length;
  const concluidasNoPrazo = userTasks.filter(e => {
    if ((e.status !== 'concluido' && e.status !== 'concluido_atraso') || !e.dataReal || !e.dataPrevista) return false;
    return new Date(e.dataReal).setHours(0,0,0,0) <= new Date(e.dataPrevista).setHours(0,0,0,0);
  }).length;
  const counts = {}; allEtapas.forEach(e => { const r = e.responsavel || 'Sem Responsável'; counts[r] = (counts[r]||0)+1; });
  const maxTotal = Math.max(...Object.values(counts), 1);
  let somaDias = 0, countAtraso = 0;
  userTasks.forEach(e => {
    if (e.dataPrevista) {
      const dPrev = new Date(e.dataPrevista).setHours(0,0,0,0);
      let dReal = e.dataReal ? new Date(e.dataReal) : new Date(); dReal.setHours(0,0,0,0);
      if (dReal > dPrev && (e.status === 'atrasado' || e.status === 'concluido_atraso' || e.status === 'concluido')) {
        somaDias += Math.ceil(Math.abs(dReal - dPrev) / (1000*60*60*24)); countAtraso++;
      }
    }
  });
  const mediaAtraso = countAtraso > 0 ? somaDias / countAtraso : 0;
  const delegadas = userTasks.filter(e => {
    if (!e.executadoPor) return false;
    return String(e.executadoPor).trim().toLowerCase() !== String(userName).trim().toLowerCase();
  }).length;

  const metrics = [
    { label: 'Conclusão', value: total > 0 ? Math.round((concluidas/total)*100) : 0, desc: 'Taxa de finalização (Concluídas / Total).' },
    { label: 'Pontualidade', value: concluidas > 0 ? Math.round((concluidasNoPrazo/concluidas)*100) : 0, desc: 'Qualidade da entrega no prazo.' },
    { label: 'Aderência', value: total > 0 ? Math.round(((total-atrasadas)/total)*100) : 0, desc: 'Saúde da carteira.' },
    { label: 'Volume', value: Math.round((total/maxTotal)*100), desc: 'Carga de trabalho relativa.' },
    { label: 'Eficiência', value: Math.max(0, 100 - Math.round(mediaAtraso*5)), desc: 'Penaliza atrasos longos.' },
    { label: 'Delegação', value: total > 0 ? Math.round((delegadas/total)*100) : 0, desc: 'Tarefas executadas por terceiros.' },
  ];
  const eficiencia = metrics.find(m => m.label === 'Eficiência').value;
  const volume = metrics.find(m => m.label === 'Volume').value;
  let resumo = `O desempenho de ${userName} indica necessidade de atenção aos prazos.`;
  if (eficiencia >= 90) resumo = volume >= 80 ? `Alta performance com alto volume de trabalho.` : `Excelente eficácia nas entregas.`;
  else if (eficiencia >= 70) resumo = `Bom desempenho geral, com oportunidades pontuais de melhoria.`;

  const size = 300, center = size/2, radiusG = 100, angleSlice = 360 / metrics.length;
  const getPoint = (value, index) => {
    const angle = index * angleSlice - 90;
    const r = (value/100) * radiusG;
    const rad = (angle * Math.PI) / 180;
    return { x: center + r * Math.cos(rad), y: center + r * Math.sin(rad) };
  };
  const points = metrics.map((m, i) => getPoint(m.value, i)).map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="text-base font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Radar de Performance</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{userName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
        <div className="p-6 flex flex-col items-center">
          <div className="relative w-[260px] h-[260px]">
            <svg width={size} height={size} className="overflow-visible" style={{ transform: 'scale(0.87)', transformOrigin: 'center' }}>
              {[20,40,60,80,100].map(l => <polygon key={l} points={metrics.map((_,i) => { const p = getPoint(l,i); return `${p.x},${p.y}`; }).join(' ')} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>)}
              {metrics.map((_,i) => { const p = getPoint(100,i); return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>; })}
              <polygon points={points} fill="rgba(53,218,179,0.12)" stroke="var(--accent)" strokeWidth="2"/>
              {metrics.map((m,i) => { const p = getPoint(m.value,i); return <circle key={i} cx={p.x} cy={p.y} r="4" fill="var(--accent)"><title>{m.label}: {m.value}%</title></circle>; })}
              {metrics.map((m,i) => { const p = getPoint(115,i); return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-body)" fontWeight="600">{m.label}</text>; })}
            </svg>
          </div>
          <div className="w-full p-4 rounded-lg mb-4" style={{ background: 'var(--accent-soft)', border: '1px solid rgba(53,218,179,0.2)' }}>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--accent)' }}>{resumo}</p>
          </div>
          <div className="flex flex-col gap-2 w-full">
            {metrics.map((m, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="pr-3">
                  <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{m.label}</div>
                  <div className="text-[10px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-dim)' }}>{m.desc}</div>
                </div>
                <span className="text-base font-bold shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{m.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusDetailsModal({ statusType, etapas, onClose }) {
  const getFiltered = () => {
    switch (statusType) {
      case 'concluidas_no_prazo': return etapas.filter(e => { if (e.status !== 'concluido' && e.status !== 'concluido_atraso') return false; if (e.status === 'concluido_atraso') return false; if (!e.dataReal || !e.dataPrevista) return true; return new Date(e.dataReal).setHours(0,0,0,0) <= new Date(e.dataPrevista).setHours(0,0,0,0); });
      case 'concluidas_atraso': return etapas.filter(e => { if (e.status !== 'concluido' && e.status !== 'concluido_atraso') return false; if (e.status === 'concluido_atraso') return true; if (!e.dataReal || !e.dataPrevista) return false; return new Date(e.dataReal).setHours(0,0,0,0) > new Date(e.dataPrevista).setHours(0,0,0,0); });
      case 'em_andamento': return etapas.filter(e => e.status === 'em_andamento');
      case 'pendentes': return etapas.filter(e => e.status === 'pendente');
      case 'atrasadas': return etapas.filter(e => e.status === 'atrasado');
      default: return [];
    }
  };
  const filtered = getFiltered();
  const titles = { concluidas_no_prazo: 'Concluídas no Prazo', concluidas_atraso: 'Concluídas com Atraso', em_andamento: 'Em Andamento', pendentes: 'Pendentes', atrasadas: 'Atrasadas' };
  const calcularAtraso = (p, r) => { if (!p || !r) return '-'; const d = new Date(r) - new Date(p); if (d <= 0) return '-'; return `${Math.floor(d / (1000*60*60))}h ${Math.floor((d % (1000*60*60*60)) / (1000*60))}m`; };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '98vw' }}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="text-base font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{titles[statusType] || 'Detalhes'}</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{filtered.length} itens</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-dim)' }}>Nenhuma etapa encontrada.</div>
          ) : (
            <div className="table-wrap m-4">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th style={{ minWidth: '200px' }}>Etapa</th>
                    <th>Responsável</th>
                    <th>Executado Por</th>
                    <th>Prevista</th>
                    <th>Realizado</th>
                    <th className="text-center">Atraso</th>
                    <th style={{ minWidth: '150px' }}>Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{item.codigo || '-'}</td>
                      <td><div className="line-clamp-2" title={item.nome}>{item.nome}</div></td>
                      <td>{item.responsavel || 'Não atribuído'}</td>
                      <td>{item.executadoPor || '-'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{item.dataPrevista ? new Date(item.dataPrevista).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{item.dataReal ? new Date(item.dataReal).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td className="text-center" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{calcularAtraso(item.dataPrevista, item.dataReal)}</td>
                      <td><div className="line-clamp-2" title={item.observacoes}>{item.observacoes || '-'}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AreaDetailsModal({ name, type, etapas, onClose }) {
  const filtered = etapas.filter(e => {
    const key = type === 'executado' ? (e.executadoPor || 'Sem Executado') : (e.responsavel || 'Sem Responsável');
    return key === name;
  });
  const calcularAtraso = (p, r) => { if (!p || !r) return '-'; const d = new Date(r) - new Date(p); if (d <= 0) return '-'; return `${Math.floor(d / (1000*60*60))}h ${Math.floor((d % (1000*60*60*60)) / (1000*60))}m`; };
  const title = type === 'executado' ? 'Detalhes: Executado Por' : 'Detalhes: Responsável';
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '98vw' }}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="text-base font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{title}: {name}</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{filtered.length} itens</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          <div className="table-wrap m-4">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th style={{ minWidth: '200px' }}>Etapa</th>
                  <th>Responsável</th>
                  <th>Executado Por</th>
                  <th>Prevista</th>
                  <th>Realizado</th>
                  <th className="text-center">Atraso</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{item.codigo || '-'}</td>
                    <td><div className="line-clamp-2" title={item.nome}>{item.nome}</div></td>
                    <td>{item.responsavel || 'Não atribuído'}</td>
                    <td>{item.executadoPor || '-'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{item.dataPrevista ? new Date(item.dataPrevista).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{item.dataReal ? new Date(item.dataReal).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                    <td className="text-center" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{calcularAtraso(item.dataPrevista, item.dataReal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function GargalosDetailsModal({ areaName, etapas, onClose }) {
  const filtered = etapas.filter(e => (e.area || 'Sem Área') === areaName && e.status === 'atrasado');
  const calcularAtraso = (p, r) => { if (!p || !r) return '-'; const d = new Date(r) - new Date(p); if (d <= 0) return '-'; return `${Math.floor(d / (1000*60*60))}h ${Math.floor((d % (1000*60*60*60)) / (1000*60))}m`; };
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '98vw' }}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="text-base font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Principais Gargalos: {areaName}</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{filtered.length} itens em atraso</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-dim)' }}>Nenhuma etapa em atraso encontrada para esta área.</div>
          ) : (
            <div className="table-wrap m-4">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th style={{ minWidth: '200px' }}>Etapa</th>
                    <th>Responsável</th>
                    <th>Executado Por</th>
                    <th>Prevista</th>
                    <th>Realizado</th>
                    <th className="text-center">Atraso</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{item.codigo || '-'}</td>
                      <td><div className="line-clamp-2" title={item.nome}>{item.nome}</div></td>
                      <td>{item.responsavel || 'Não atribuído'}</td>
                      <td>{item.executadoPor || '-'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{item.dataPrevista ? new Date(item.dataPrevista).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{item.dataReal ? new Date(item.dataReal).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td className="text-center" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{calcularAtraso(item.dataPrevista, item.dataReal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Keep original processData and processRealtimeData functions unchanged
function processRealtimeData(data) {
  if (!data) return [];
  const dataArray = Array.isArray(data) ? data : Object.values(data);
  return processData(dataArray, []);
}

function processData(data, existingSteps = []) {
  if (!Array.isArray(data)) return [];
  const etapasValidadas = [];
  const chavesProcessadas = new Set();
  const usedIds = new Set();
  const normalizeVal = (str) => str ? String(str).trim().replace(/\s+/g, ' ').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';
  const headerMap = new Map();
  if (data.length > 0) Object.keys(data[0]).forEach(k => headerMap.set(normalizeVal(k), k));
  const existingByCodeAndName = new Map();
  const existingByCode = new Map();
  const existingByName = new Map();
  existingSteps.forEach(e => {
    const code = normalizeVal(e.codigo);
    const name = normalizeVal(e.nome);
    if (code && name) existingByCodeAndName.set(`${code}|${name}`, e);
    if (code) { if (!existingByCode.has(code)) existingByCode.set(code, []); existingByCode.get(code).push(e); }
    if (name) { if (!existingByName.has(name)) existingByName.set(name, []); existingByName.get(name).push(e); }
  });
  const formatarData = (valor) => {
    if (!valor || String(valor).trim() === '') return null;
    const v = String(valor).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return v;
    const dmy = v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:[\sT]+(\d{1,2}):(\d{2}))?/);
    if (dmy) {
      const dia = parseInt(dmy[1],10), mes = parseInt(dmy[2],10);
      let ano = parseInt(dmy[3],10);
      const hora = dmy[4] ? parseInt(dmy[4],10) : 12, min = dmy[5] ? parseInt(dmy[5],10) : 0;
      if (ano < 100) ano += 2000;
      const date = new Date(ano, mes-1, dia, hora, min, 0);
      if (!isNaN(date.getTime())) return date.toISOString();
    }
    if (typeof valor === 'number') { const date = new Date((Math.floor(valor+0.001)-25569)*86400*1000+43200000); return date.toISOString(); }
    return null;
  };
  const combinarDataHora = (dataISO, horaVal) => {
    if (!dataISO || !horaVal) return dataISO;
    const dt = new Date(dataISO);
    let hours = 0, minutes = 0;
    if (typeof horaVal === 'number') { const ts = Math.round(horaVal*86400); hours = Math.floor(ts/3600)%24; minutes = Math.floor((ts%3600)/60); }
    else if (String(horaVal).includes(':')) { const p = String(horaVal).split(':'); hours = parseInt(p[0])||0; minutes = parseInt(p[1])||0; }
    return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), hours, minutes).toISOString();
  };
  data.forEach((row, index) => {
    const getVal = (keys) => { for (const k of keys) { const nk = normalizeVal(k); const ak = headerMap.get(nk); const val = ak ? row[ak] : row[k]; if (val !== undefined && val !== null && String(val).trim() !== '') return val; } return undefined; };
    const nome = getVal(['TAREFA','Nome','Etapa','tarefa','nome','etapa']);
    const codigo = getVal(['CODIGO','ID','Code','codigo','id','code']);
    if (!nome) return;
    const codeVal = normalizeVal(codigo), nameVal = normalizeVal(nome);
    const uniqueKey = `${codeVal}|${nameVal}`;
    if (chavesProcessadas.has(uniqueKey)) return;
    chavesProcessadas.add(uniqueKey);
    let existing = existingByCodeAndName.get(uniqueKey);
    if (!existing && codeVal) existing = (existingByCode.get(codeVal)||[]).find(e => !usedIds.has(e.id));
    if (!existing && nameVal) existing = (existingByName.get(nameVal)||[]).find(e => !usedIds.has(e.id));
    if (existing) usedIds.add(existing.id);
    let dataPrevista = formatarData(getVal(['INÍCIO','Data Prevista','início','inicio','dataPrevista']));
    dataPrevista = combinarDataHora(dataPrevista, getVal(['HORA INICIO','hora inicio','Hora Início']));
    let dataReal = formatarData(getVal(['TÉRMINO','Data Real','término','termino','dataReal']));
    dataReal = combinarDataHora(dataReal, getVal(['HORA TÉRMINO','hora término','hora termino']));
    let status = 'pendente';
    const rawStatus = getVal(['STATUS','Situação','Estado']);
    const statusStr = rawStatus ? String(rawStatus).toLowerCase() : '';
    if (dataReal || statusStr.includes('conclu')) {
      const isLateByDate = dataReal && dataPrevista && new Date(dataReal) > new Date(dataPrevista);
      status = (isLateByDate || statusStr.includes('atras')) ? 'concluido_atraso' : 'concluido';
    } else if (dataPrevista && new Date(dataPrevista) < new Date()) { status = 'atrasado'; }
    if (!status.startsWith('concluido') && statusStr.includes('atras')) status = 'atrasado';
    else if (!status.startsWith('concluido') && statusStr.includes('andamento')) status = 'em_andamento';
    etapasValidadas.push({ id: existing?.id || null, nome, codigo: String(codigo||''), area: getVal(['ÁREA','área','area'])||'', responsavel: getVal(['ATRIBUÍDO PARA','atribuído para','responsável','responsavel'])||'', status, dataPrevista, dataReal, ordem: parseInt(getVal(['D+','ordem','Ordem']))||index+1, executadoPor: getVal(['EXECUTADO POR','executado por'])||'', observacoes: getVal(['Observações','observações','obs'])||'' });
  });
  return etapasValidadas;
}