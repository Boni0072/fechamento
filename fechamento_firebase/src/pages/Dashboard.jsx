import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate} from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { getFirestore, doc, onSnapshot, collection, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { getPeriodos, getEtapas } from '../services/database';
import { Clock, AlertTriangle, Activity, Target, X, Info, RefreshCw, ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import * as XLSX from 'xlsx';

import { getDatabase, ref, onValue } from "firebase/database";

const processRealtimeData = (data) => {
  if (!data) return [];
  const dataArray = Array.isArray(data) ? data : Object.values(data);
  return processData(dataArray, []);
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { empresaAtual, empresas, selecionarEmpresa } = useAuth();
  const { loading: loadingPermissoes, user: authUser } = usePermissao('dashboard');
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // CORREÇÃO LÓGICA: Sincroniza viewAllCompanies com a seleção da Sidebar
  const viewAllCompanies = !empresaAtual;

  useEffect(() => {
    if (authUser && authUser.id && empresaAtual && empresaAtual.id) {
      setLoadingProfile(true);
      const db = getFirestore();
      const userRef = doc(db, 'tenants', empresaAtual.id, 'usuarios', authUser.id);
      const unsubscribe = onSnapshot(userRef, (snapshot) => {
        const data = snapshot.data();
        if (!data) {
          console.warn(`Dashboard: Perfil não encontrado em tenants/${empresaAtual.id}/usuarios/${authUser.id}`);
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

  const [periodos, setPeriodos] = useState([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [stepsByCompany, setStepsByCompany] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [empresaDados, setEmpresaDados] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const [nextSync, setNextSync] = useState(15);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [showResponsavel, setShowResponsavel] = useState(false);
  const [showApoio, setShowApoio] = useState(false); 
  const [kpis, setKpis] = useState({
    total: 0,
    concluidas: 0,
    concluidasNoPrazo: 0,
    concluidasComAtraso: 0,
    pendentes: 0,
    emAndamento: 0,
    atrasadas: 0,
    percentualConcluido: 0,
    percentualPrazo: 0,
    mediaAtraso: 0,
    topGargalos: [],
    desempenhoPorArea: [],
    desempenhoPorResponsavel: [],
    desempenhoPorEmpresa: [],
    rankingApoio: []
  });

  useEffect(() => {
    setPeriodoSelecionado(null);
  }, [empresaAtual]);

  useEffect(() => {
    if (!empresaAtual && (!empresas || empresas.length === 0)) return;
    const db = getFirestore();
    let unsubEmpresa = () => {};
    if (empresaAtual) {
      const empresaRef = doc(db, 'tenants', empresaAtual.id);
      unsubEmpresa = onSnapshot(empresaRef, (snapshot) => {
        setEmpresaDados({ id: empresaAtual.id, ...snapshot.data() });
      });
    }
    let unsubscribe;
    if (viewAllCompanies) {
      const unsubscribes = [];
      const allPeriodsMap = new Map();
      empresas.forEach(emp => {
        const unsub = getPeriodos(emp.id, (data) => {
          data.forEach(p => {
            const key = `${p.mes}-${p.ano}`;
            if (!allPeriodsMap.has(key)) {
              allPeriodsMap.set(key, { mes: p.mes, ano: p.ano, id: key });
            }
          });
          const sortedData = Array.from(allPeriodsMap.values()).sort((a, b) => {
            if (b.ano !== a.ano) return b.ano - a.ano;
            if (b.mes !== a.mes) return b.mes - a.mes;
            return 0;
          });
          setPeriodos(sortedData);
          setPeriodoSelecionado(prev => {
            if (!prev && sortedData.length > 0) return sortedData[0];
            if (prev) {
              const match = sortedData.find(p => p.mes === prev.mes && p.ano === prev.ano);
              return match || sortedData[0] || null;
            }
            return null;
          });
        });
        unsubscribes.push(unsub);
      });
      unsubscribe = () => unsubscribes.forEach(u => u());
    } else {
      unsubscribe = getPeriodos(empresaAtual.id, (data) => {
        const sortedData = (data || []).sort((a, b) => {
          if (b.ano !== a.ano) return b.ano - a.ano;
          if (b.mes !== a.mes) return b.mes - a.mes;
          return a.id.localeCompare(b.id);
        });
        const periodosUnicos = sortedData.filter((item, index, self) =>
          index === self.findIndex(p => p.mes === item.mes && p.ano === item.ano)
        );
        setPeriodos(periodosUnicos);
        
        setPeriodoSelecionado(prev => {
            if (!prev) return periodosUnicos[0] || null;
            // Tenta manter o período selecionado ou busca um correspondente
            const match = periodosUnicos.find(p => p.id === prev.id || (p.mes === prev.mes && p.ano === prev.ano));
            return match || periodosUnicos[0] || null;
        });
      });
    }
    return () => {
      unsubscribe();
      unsubEmpresa();
    };
  }, [empresaAtual, viewAllCompanies, empresas]);

  // Effect separado para Single Company (evita recarregar quando 'empresas' muda)
  useEffect(() => {
    if (!empresaAtual) return;
    
    const db = getDatabase();
    const googleTableRef = ref(db, `tenants/${empresaAtual.id}/tabelaGoogle`);
    
    // Limpa dados anteriores para evitar mistura visual durante a troca
    setStepsByCompany({});

    const unsub = onValue(googleTableRef, (snapshot) => {
      const data = snapshot.val();
      const processedEtapas = data ? processRealtimeData(data) : [];
      const etapasComNomeEmpresa = processedEtapas.map(etapa => ({
        ...etapa,
        empresaNome: empresaAtual.nome,
        empresaId: empresaAtual.id,
      }));
      setStepsByCompany({ [empresaAtual.id]: etapasComNomeEmpresa });
    });

    return () => unsub();
  }, [empresaAtual]);

  // Effect separado para View All Companies
  useEffect(() => {
    if (empresaAtual) return;
    if (!empresas || empresas.length === 0) return;

    const db = getDatabase();
    setStepsByCompany({});

    const unsubs = empresas.map(emp => {
      const googleTableRef = ref(db, `tenants/${emp.id}/tabelaGoogle`);
      return onValue(googleTableRef, (snapshot) => {
        const data = snapshot.val();
        const processedEtapas = data ? processRealtimeData(data) : [];
        const etapasComNomeEmpresa = processedEtapas.map(etapa => ({
          ...etapa,
          empresaNome: emp.nome,
          empresaId: emp.id,
        }));
        setStepsByCompany(prev => ({ ...prev, [emp.id]: etapasComNomeEmpresa }));
      });
    });

    return () => unsubs.forEach(unsub => unsub());
  }, [empresas, empresaAtual]);

  useEffect(() => {
    const allSteps = Object.values(stepsByCompany).flat();
    setEtapas(allSteps);
    calcularKpis(allSteps);
  }, [stepsByCompany]);

  const handleSync = useCallback(async (isAuto = false) => {
    if (isSyncingRef.current) return;

    const dados = empresaDados || empresaAtual;
    if (!dados?.spreadsheetId) {
      if (!isAuto) {
        if (window.confirm("Esta empresa não possui uma planilha configurada para sincronização.\n\nOs dados exibidos estão salvos no banco de dados do sistema.\n\nDeseja configurar uma planilha agora para permitir atualizações?")) {
          navigate('/empresas');
        }
      }
      return;
    }
    
    if (!periodoSelecionado) {
      if (!isAuto) alert("Selecione um período para sincronizar.");
      return;
    }
    
    isSyncingRef.current = true;
    if (!isAuto) setSyncing(true); else setAutoSyncing(true);

    try {
      const sheetParam = dados.sheetName ? `&sheet=${encodeURIComponent(dados.sheetName)}` : '&gid=0';
      const url = `https://docs.google.com/spreadsheets/d/${dados.spreadsheetId}/gviz/tq?tqx=out:csv${sheetParam}&t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Erro ao conectar com a planilha.');
      
      const csvText = await response.text();
      if (csvText.trim().toLowerCase().startsWith('<!doctype html') || csvText.includes('<html')) {
        throw new Error('Planilha privada ou link inválido.');
      }

      const workbook = XLSX.read(csvText, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { raw: true });

      // Busca dados atuais do banco para comparação precisa e exclusão de itens removidos
      const db = getFirestore();
      const etapasRef = collection(db, 'tenants', empresaAtual.id, 'periodos', periodoSelecionado.id, 'etapas');
      const snapshot = await getDocs(etapasRef);
      const currentDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      // Processamento inicial (tentando manter histórico)
      let processedSteps = processData(data, currentDocs);

      if (processedSteps.length > 0) {
        let keepHistory = true;

        // Pergunta sobre o histórico (Status/Datas)
        if (!isAuto && currentDocs.length > 0) {
          keepHistory = window.confirm(
            `Encontrados ${processedSteps.length} registros na planilha.\n` +
            `Existem ${currentDocs.length} registros no sistema.\n\n` +
            `[OK] = MANTER histórico (Status, Datas, Responsáveis) e atualizar dados.\n` +
            `[Cancelar] = LIMPAR TUDO (Resetar status para 'Pendente' e apagar histórico).`
          );
        }

        // Se escolheu LIMPAR (Cancelar), reprocessa ignorando os dados atuais
        if (!keepHistory) {
          if (!isAuto && !window.confirm("⚠️ TEM CERTEZA?\n\nIsso apagará todos os status 'Concluído' e datas reais.\nO sistema ficará idêntico à planilha original.")) {
            if (!isAuto) setSyncing(false);
            isSyncingRef.current = false;
            return;
          }
          processedSteps = processData(data, []); // Passa array vazio para ignorar histórico
        }

        // Prepara lista de operações
        const operations = [];
        const keptIds = new Set();

        // Adiciona operações de atualização/criação
        processedSteps.forEach(step => {
          const docRef = step.id ? doc(etapasRef, step.id) : doc(etapasRef);
          const { id, ...stepData } = step;
          operations.push({ type: 'set', ref: docRef, data: stepData });
          if (step.id) keptIds.add(step.id);
        });

        // Adiciona operações de exclusão para itens que não estão mais na planilha
        const docsToDelete = currentDocs.filter(d => !keptIds.has(d.id));
        docsToDelete.forEach(d => {
          operations.push({ type: 'delete', ref: doc(etapasRef, d.id) });
        });

        // Executa em lotes de 400 (limite do Firestore é 500)
        const BATCH_SIZE = 400;
        for (let i = 0; i < operations.length; i += BATCH_SIZE) {
          const batch = writeBatch(db);
          const chunk = operations.slice(i, i + BATCH_SIZE);
          
          chunk.forEach(op => {
            if (op.type === 'set') {
              batch.set(op.ref, op.data, { merge: true });
            } else if (op.type === 'delete') {
              batch.delete(op.ref);
            }
          });
          
          await batch.commit();
        }

        if (!isAuto) alert(`Sincronização concluída com sucesso!\n\nItens atualizados: ${processedSteps.length}\nItens removidos: ${docsToDelete.length}`);
      } else {
        if (!isAuto) alert('Nenhuma etapa encontrada na planilha.');
      }
    } catch (error) {
      console.error(error);
      if (!isAuto) alert('Erro na sincronização: ' + error.message);
    } finally {
      if (!isAuto) setSyncing(false); else setAutoSyncing(false);
      isSyncingRef.current = false;
    }
  }, [empresaAtual, empresaDados, periodoSelecionado, navigate]);

  // Sincronização Automática (Polling)
  useEffect(() => {
    let interval;
    if (empresaDados?.spreadsheetId && periodoSelecionado && !syncing && !viewAllCompanies) {
      interval = setInterval(() => {
        if (!isSyncingRef.current && !syncing) {
          setNextSync(prev => {
            if (prev <= 1) {
              handleSync(true);
              return 15;
            }
            return prev - 1;
          });
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [empresaDados, periodoSelecionado, syncing, viewAllCompanies, handleSync]);

  const calcularKpis = (dados) => {
    const total = dados.length;
    const pendentes = dados.filter(e => e.status === 'pendente').length;
    const emAndamento = dados.filter(e => e.status === 'em_andamento').length;
    const atrasadas = dados.filter(e => e.status === 'atrasado').length;

    // Identifica todas as concluídas
    const concluidasList = dados.filter(e => e.status === 'concluido' || e.status === 'concluido_atraso');
    const concluidasTotal = concluidasList.length;

    // Calcula No Prazo vs Com Atraso baseado em DATAS
    let noPrazo = 0;
    let comAtraso = 0;

    concluidasList.forEach(e => {
      // Se status for explicitamente atrasado
      if (e.status === 'concluido_atraso') {
        comAtraso++;
        return;
      }

      // Verificação por data
      if (e.dataReal && e.dataPrevista) {
        const dReal = new Date(e.dataReal);
        dReal.setHours(0,0,0,0);
        const dPrev = new Date(e.dataPrevista);
        dPrev.setHours(0,0,0,0);
        
        if (dReal.getTime() > dPrev.getTime()) {
          comAtraso++;
        } else {
          noPrazo++;
        }
      } else {
        // Se não tem datas, assume no prazo
        noPrazo++;
      }
    });

    const concluidasNoPrazoCount = noPrazo;
    const concluidasComAtrasoCount = comAtraso;

    const percentualConcluido = total > 0 ? Math.round((concluidasTotal / total) * 100) : 0;
    
    const percentualPrazo = concluidasTotal > 0 ? Math.round((concluidasNoPrazoCount / concluidasTotal) * 100) : 100;

    // Média de Atraso (apenas das atrasadas ou concluídas com atraso)
    let somaDiasAtraso = 0;
    let qtdAtrasoParaMedia = 0;
    dados.forEach(e => {
      if (e.dataPrevista) {
        const dPrev = new Date(e.dataPrevista);
        dPrev.setHours(0,0,0,0);
        
        // Para itens concluídos usa dataReal, para outros usa hoje
        let dReal;
        if (e.status === 'concluido' || e.status === 'concluido_atraso') {
           if (e.dataReal) dReal = new Date(e.dataReal);
           else dReal = new Date(); // Fallback
        } else {
           dReal = new Date();
        }
        dReal.setHours(0,0,0,0);

        // Verifica se está atrasado (por status ou data)
        const isLateStatus = e.status === 'atrasado' || e.status === 'concluido_atraso';
        const isLateDate = dReal.getTime() > dPrev.getTime();

        if (isLateStatus || (isLateDate && (e.status === 'atrasado' || e.status === 'concluido' || e.status === 'concluido_atraso'))) {
          const diffTime = Math.abs(dReal.getTime() - dPrev.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
          somaDiasAtraso += diffDays;
          qtdAtrasoParaMedia++;
        }
      }
    });
    const mediaAtraso = qtdAtrasoParaMedia > 0 ? Math.round(somaDiasAtraso / qtdAtrasoParaMedia) : 0;

    // Top Gargalos (Áreas com mais atrasos)
    const areasMap = {};
    dados.forEach(e => {
      if (e.status === 'atrasado') {
        const area = e.area || 'Sem Área';
        areasMap[area] = (areasMap[area] || 0) + 1;
      }
    });
    const topGargalos = Object.entries(areasMap)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([area, count]) => ({ area, count }));

    // Desempenho por Área
    const areaStats = {};
    dados.forEach(e => {
      const area = e.area || 'Sem Área';
      if (!areaStats[area]) areaStats[area] = { total: 0, concluidas: 0 };
      areaStats[area].total++;
      if (e.status === 'concluido' || e.status === 'concluido_atraso') areaStats[area].concluidas++;
    });
    const desempenhoPorArea = Object.entries(areaStats).map(([area, stats]) => ({
      nome: area,
      total: stats.total,
      concluidas: stats.concluidas,
      percentual: stats.total > 0 ? Math.round((stats.concluidas / stats.total) * 100) : 0
    })).sort((a, b) => b.percentual - a.percentual);

    // Desempenho por Responsável
    const respStats = {};
    dados.forEach(e => {
      const resp = e.responsavel || 'Sem Responsável';
      if (!respStats[resp]) respStats[resp] = { total: 0, concluidas: 0 };
      respStats[resp].total++;
      if (e.status === 'concluido' || e.status === 'concluido_atraso') respStats[resp].concluidas++;
    });
    const desempenhoPorResponsavel = Object.entries(respStats).map(([resp, stats]) => ({
      nome: resp,
      total: stats.total,
      concluidas: stats.concluidas,
      percentual: stats.total > 0 ? Math.round((stats.concluidas / stats.total) * 100) : 0
    })).sort((a, b) => b.percentual - a.percentual);

    // Desempenho por Empresa
    const empStats = {};
    dados.forEach(e => {
      const emp = e.empresaNome || empresaDados?.nome || empresaAtual?.nome || 'Empresa';
      if (!empStats[emp]) empStats[emp] = { total: 0, concluidas: 0 };
      empStats[emp].total++;
      if (e.status === 'concluido' || e.status === 'concluido_atraso') empStats[emp].concluidas++;
    });
    const desempenhoPorEmpresa = Object.entries(empStats).map(([emp, stats]) => ({
      nome: emp,
      total: stats.total,
      concluidas: stats.concluidas,
      percentual: stats.total > 0 ? Math.round((stats.concluidas / stats.total) * 100) : 0
    })).sort((a, b) => b.percentual - a.percentual);

    // Ranking de Apoio (Quem mais executou tarefas de outros)
    const apoioStats = {};
    dados.forEach(e => {
      if (e.executadoPor && e.responsavel) {
        const executor = String(e.executadoPor).trim();
        const responsavel = String(e.responsavel).trim();
        if (executor && responsavel && executor.toLowerCase() !== responsavel.toLowerCase()) {
           if (!apoioStats[executor]) apoioStats[executor] = 0;
           apoioStats[executor]++;
        }
      }
    });
    const rankingApoio = Object.entries(apoioStats)
      .map(([nome, count]) => ({ nome, count }))
      .sort((a, b) => b.count - a.count)


    setKpis({
      total,
      concluidas: concluidasTotal,
      concluidasNoPrazo: concluidasNoPrazoCount,
      concluidasComAtraso: concluidasComAtrasoCount,
      pendentes,
      emAndamento,
      atrasadas,
      percentualConcluido,
      percentualPrazo,
      mediaAtraso,
      topGargalos,
      desempenhoPorArea,
      desempenhoPorResponsavel,
      desempenhoPorEmpresa,
      rankingApoio
    });
  };

  // Dados para o Gráfico de Rosca
  const chartData = [
    { key: 'concluidas_no_prazo', label: 'Concluídas no Prazo', value: kpis.concluidasNoPrazo, color: '#22c55e', twColor: 'green' },
    { key: 'concluidas_atraso', label: 'Concluídas c/ Atraso', value: kpis.concluidasComAtraso, color: '#f97316', twColor: 'orange' },
    { key: 'em_andamento', label: 'Em Andamento', value: kpis.emAndamento, color: '#3b82f6', twColor: 'blue' },
    { key: 'pendentes', label: 'Pendentes', value: kpis.pendentes, color: '#eab308', twColor: 'yellow' },
    { key: 'atrasadas', label: 'Atrasadas', value: kpis.atrasadas, color: '#ef4444', twColor: 'red' },
  ];

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let accumulatedOffset = 0;
  const totalChart = kpis.total || 1;

  if (loadingPermissoes || loadingProfile || (authUser && !userProfile) || (userProfile && !userProfile.perfilAcesso && !userProfile.perfilIncompleto)) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Carregando permissões...</p>
      </div>
    );
  }

  if (!empresaAtual && !viewAllCompanies) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500 mb-4">Nenhuma empresa selecionada</p>
        <a href="/empresas" className="text-primary-600 hover:underline">
          Criar ou selecionar uma empresa
        </a>
      </div>
    );
  }

  // Restrição removida
  const autorizado = true;

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Dashboard do Fechamento</h1>
            <p className="text-slate-500">Acompanhe o progresso do fechamento contábil</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <select
            value={periodoSelecionado?.id || ''}
            onChange={(e) => {
              const periodo = periodos.find(p => p.id === e.target.value);
              setPeriodoSelecionado(periodo);
            }}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {periodos.length === 0 && <option value="">Nenhum período</option>}
            {periodos.map(p => (
              <option key={p.id} value={p.id}>
                {p.mes}/{p.ano}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
        {/* Progresso do Fechamento */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-4 h-full">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Progresso do Fechamento</h2>
          
          <div className="flex flex-wrap xl:flex-nowrap items-center gap-6 justify-center">
            {/* Gráfico de Rosca */}
            <div className="relative w-[340px] h-[340px] shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 transform">
                <circle cx="50" cy="50" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="12" />
                {kpis.total > 0 && chartData.map((segment, i) => {
                  const segmentLength = (segment.value / totalChart) * circumference;
                  const offset = accumulatedOffset;

                  accumulatedOffset += segmentLength;
                  return (
                    <g key={i}>
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="none"
                        stroke={segment.color}
                        strokeWidth="12"
                        strokeDasharray={`${segmentLength} ${circumference}`}
                        strokeDashoffset={-offset}
                        className="transition-all duration-1000 ease-out"
                      />
                    </g>
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-bold text-slate-800">{kpis.percentualConcluido}%</span>
                <span className="text-xl text-slate-500 font-medium uppercase">Concluído</span>
              </div>
            </div>

            {/* Legenda */}
            <div className="flex flex-col gap-3">
              {chartData.map((item) => (
                <StatusBadge 
                  key={item.key}
                  color={item.twColor} 
                  label={item.label} 
                  count={item.value}
                  onClick={() => setSelectedStatus(item.key)}
                  className="min-w-[140px]"
                />
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col gap-6">
          {/* Cards de Indicadores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card 
              title="Conclusão Geral"
              value={`${kpis.percentualConcluido}%`}
              subtitle={`${kpis.concluidas}/${kpis.total} etapas finalizadas`}
              icon={<Activity className="w-6 h-6" />} 
              color="blue"
            />
            <Card
              title="Aderência ao Prazo"
              value={`${kpis.percentualPrazo}%`}
              subtitle="Das etapas concluídas"
              icon={<Target className="w-6 h-6" />}
              color={kpis.percentualPrazo >= 90 ? "green" : kpis.percentualPrazo >= 70 ? "orange" : "red"}
            />
            <Card
              title="Etapas em Atraso"
              value={kpis.atrasadas}
              subtitle="Requerem atenção imediata"
              icon={<AlertTriangle className="w-6 h-6" />}
              color={kpis.atrasadas === 0 ? "green" : "red"}
            />
            <Card
              title="Média de Atraso"
              value={`${kpis.mediaAtraso} dias`}
              subtitle="Nas entregas fora do prazo"
              icon={<Clock className="w-6 h-6" />}
              color="orange"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Desempenho por Área */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h2 className="text-xl font-semibold text-slate-800 mb-4">Desempenho por Área</h2>
              <div className="h-[200px] flex items-end gap-2 overflow-x-auto custom-scrollbar pb-2">
                {kpis.desempenhoPorArea.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-base text-slate-400">
                    Nenhum dado disponível
                  </div>
                ) : (
                  kpis.desempenhoPorArea.map((item, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-2 min-w-[50px] flex-1 h-full justify-end group">
                      <span className="text-sm font-bold text-slate-700">{item.percentual}%</span>
                      <div className="w-full max-w-[40px] flex-1 bg-slate-100 rounded-t-lg relative overflow-hidden">
                        <div 
                          className="absolute bottom-0 left-0 right-0 bg-blue-500 hover:bg-blue-600 transition-all duration-500 rounded-t-lg"
                          style={{ height: `${item.percentual}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium truncate w-full text-center max-w-[60px]" title={item.nome}>
                        {item.nome.split(' ')[0]}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Gargalos */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h2 className="text-xl font-semibold text-slate-800 mb-4">Principais Gargalos</h2>
              <p className="text-base text-slate-500 mb-4">Áreas com mais atrasos</p>
              
              <div className="space-y-4">
                {kpis.topGargalos.length === 0 ? (
                  <p className="text-base text-slate-400 text-center py-4">Nenhum gargalo identificado</p>
                ) : (
                  kpis.topGargalos.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-base font-medium text-slate-700">{item.area}</span>
                      <span className="text-sm font-bold bg-red-100 text-red-700 px-2 py-1 rounded-full">
                        {item.count} atrasadas
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos de Desempenho */}
      <div className="grid grid-cols-1 gap-6 mb-6">

        {/* Evolução por Empresas */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Evolução por Empresas</h2>
          <div className="space-y-5">
            {kpis.desempenhoPorEmpresa.length === 0 ? (
               <p className="text-base text-slate-400 text-center py-4">Nenhum dado disponível</p>
            ) : (
              kpis.desempenhoPorEmpresa.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-base font-medium text-slate-700">
                    <span>{item.nome}</span>
                    <span className="font-bold text-green-600">{item.percentual}%</span>
                  </div>
                  <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-600 rounded-full transition-all duration-500"
                      style={{ width: `${item.percentual}%` }}
                    />
                  </div>
                  <div className="text-sm text-slate-400 text-right">
                    {item.concluidas}/{item.total} etapas concluídas
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Desempenho por Responsável */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div 
            className="flex items-center justify-between mb-4 cursor-pointer"
            onClick={() => setShowResponsavel(!showResponsavel)}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-800">Desempenho por Responsável</h2>
              <div className="group relative" onClick={(e) => e.stopPropagation()}>
                <Info className="w-4 h-4 text-slate-400 cursor-help" />
                <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-slate-800 text-white text-sm rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none font-normal">
                  O percentual indica a taxa de conclusão (Concluídas/Total). Clique em um usuário para ver o Radar de Performance detalhado.
                  <div className="absolute top-full right-1 border-4 border-transparent border-t-slate-800"></div>
                </div>
              </div>
            </div>
            {showResponsavel ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
          </div>
          {showResponsavel && (
          <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
            {kpis.desempenhoPorResponsavel.length === 0 ? (
              <p className="text-base text-slate-400 text-center py-4">Nenhum dado disponível</p>
            ) : (
              kpis.desempenhoPorResponsavel.map((item, idx) => (
                <div 
                  key={idx}
                  onClick={() => setSelectedUser(item.nome)}
                  className="cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors group"
                >
                  <div className="flex justify-between text-base mb-1">
                    <span className="font-medium text-slate-700">{item.nome}</span>
                    <span className="text-slate-500">{item.concluidas}/{item.total} ({item.percentual}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 rounded-full transition-all duration-500" 
                      style={{ width: `${item.percentual}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
          )}
        </div>

        {/* Ranking de Apoio (Podium) */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <div>
              <h2 className="text-xl font-semibold text-slate-800">Campeões de Apoio</h2>
              <p className="text-sm text-slate-500">Quem mais executou atividades de outros</p>
            </div>
          </div>
          
          {kpis.rankingApoio.length === 0 ? (
             <p className="text-base text-slate-400 text-center py-4">Nenhum dado disponível</p>
          ) : (
            <div className="flex items-end justify-center gap-2 sm:gap-4 h-48 pt-4">  
              {/* 2nd Place */}
              <div className="flex flex-col items-center w-1/3 group">
                {kpis.rankingApoio[1] ? (
                  <>
                    <div className="mb-2 text-center transition-transform group-hover:-translate-y-1">
                      <span className="block text-sm font-bold text-slate-600 truncate max-w-[80px] sm:max-w-[120px]">{kpis.rankingApoio[1].nome}</span>
                      <span className="text-[10px] text-slate-400 font-medium">{kpis.rankingApoio[1].count} tarefas</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-t-lg h-24 flex items-end justify-center pb-2 relative border-t-4 border-slate-300">
                       <div className="text-3xl font-bold text-slate-400">2</div>
                    </div>
                  </>
                ) : <div className="w-full h-24" />}
              </div>
              
              {/* 1st Place */}
              <div className="flex flex-col items-center w-1/3 group">
                {kpis.rankingApoio[0] ? (
                  <>
                    <div className="mb-2 text-center transition-transform group-hover:-translate-y-1">
                      <div className="text-yellow-500 mb-1 animate-bounce">👑</div>
                      <span className="block text-base font-bold text-slate-800 truncate max-w-[90px] sm:max-w-[140px]">{kpis.rankingApoio[0].nome}</span>
                      <span className="text-sm text-slate-500 font-medium">{kpis.rankingApoio[0].count} tarefas</span>
                    </div>
                    <div className="w-full bg-yellow-100 border-t-4 border-yellow-400 rounded-t-lg h-32 flex items-end justify-center pb-2 shadow-sm relative">
                       <div className="text-4xl font-bold text-yellow-600">1</div>
                    </div>
                  </>
                ) : <div className="w-full h-32" />}
              </div>

              {/* 3rd Place */}
              <div className="flex flex-col items-center w-1/3 group">
                {kpis.rankingApoio[2] ? (
                  <>
                    <div className="mb-2 text-center transition-transform group-hover:-translate-y-1">
                      <span className="block text-sm font-bold text-slate-600 truncate max-w-[80px] sm:max-w-[120px]">{kpis.rankingApoio[2].nome}</span>
                      <span className="text-[10px] text-slate-400 font-medium">{kpis.rankingApoio[2].count} tarefas</span>
                    </div>
                    <div className="w-full bg-orange-100 rounded-t-lg h-16 flex items-end justify-center pb-2 relative border-t-4 border-orange-200">
                       <div className="text-2xl font-bold text-orange-400">3</div>
                    </div>
                  </>
                ) : <div className="w-full h-16" />}
              </div>
            </div>
          )}
          {kpis.rankingApoio.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <button 
                onClick={() => setShowApoio(!showApoio)}
                className="w-full flex items-center justify-between text-base font-semibold text-slate-700 hover:text-slate-900 transition-colors mb-2"
              >
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-orange-500" />
                  <span>Lista de Apoio</span>
                </div>
                {showApoio ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
              
              {showApoio && (
                <div className="space-y-3 animate-fadeIn">
                  {kpis.rankingApoio.map((item, index) => {
                    const percentual = Math.round((item.count / kpis.total) * 100) || 0;
                    return (
                      <div key={index} className="group">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-base font-medium text-slate-600">{item.nome}</span>
                          <span className="text-sm font-bold text-slate-400 group-hover:text-slate-600 transition-colors">
                            {item.count} tarefas ({percentual}%)
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-orange-500 rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${percentual}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}


        </div>
      </div>

      {/* Modal Radar de Performance */}
      {selectedUser && (
        <RadarModal 
          userName={selectedUser} 
          allEtapas={etapas} 
          onClose={() => setSelectedUser(null)} 
        />
      )}

      {/* Modal Detalhes por Status */}
      {selectedStatus && (
        <StatusDetailsModal
          statusType={selectedStatus}
          etapas={etapas}
          onClose={() => setSelectedStatus(null)}
        />
      )}
    </div>
  );
}

// Função auxiliar para processar dados (Reutiliza lógica da Importação/Etapas)
function processData(data, existingSteps = []) {
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
      id: existing ? existing.id : null,
      nome: nome,
      area: getVal(['ÁREA', 'área', 'area', 'Área']) || '',
      responsavel: getVal(['ATRIBUÍDO PARA', 'atribuído para', 'atribuido para', 'Responsável', 'responsavel', 'Responsavel', 'Owner']) || '',
      dataPrevista: dataPrevista,
      dataReal: dataReal,
      ordem: ordem,
      codigo: (codigo !== undefined && codigo !== null) ? String(codigo) : '',
      status: status,
      executadoPor: getVal(['EXECUTADO POR', 'Executado Por', 'Executado por', 'executado por', 'ExecutadoPor', 'executadoPor', 'Executor', 'executor', 'Quem executou', 'Realizado por', 'Executado p/', 'Executado P/', 'Executado']) || '',
      observacoes: getVal(['Observações', 'observacoes', 'Observação', 'observação', 'Observacao', 'observacao', 'Obs', 'obs', 'Comentários', 'comentarios']) || ''
    });
  });

  return etapasValidadas;
}
function Card({ title, value, subtitle, icon, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    cyan: 'bg-cyan-50 text-cyan-600',
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    green: 'bg-green-50 text-green-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base text-slate-500">{title}</p>
          <p className="text-4xl font-bold text-slate-800 mt-1">{value}</p>
          <p className="text-base text-slate-400 mt-1">{subtitle}</p>
        </div>
        <div className={`p-3 rounded-xl ${colors[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function RadarModal({ userName, allEtapas, onClose }) {
  const userTasks = allEtapas.filter(e => e.responsavel === userName);
  
  // Metrics Calculation
  const total = userTasks.length;
  const concluidas = userTasks.filter(e => e.status === 'concluido' || e.status === 'concluido_atraso').length;
  const atrasadas = userTasks.filter(e => e.status === 'atrasado').length;
  
  const concluidasNoPrazo = userTasks.filter(e => {
    if ((e.status !== 'concluido' && e.status !== 'concluido_atraso') || !e.dataReal || !e.dataPrevista) return false;
    const dReal = new Date(e.dataReal);
    dReal.setHours(0,0,0,0);
    const dPrev = new Date(e.dataPrevista);
    dPrev.setHours(0,0,0,0);
    return dReal.getTime() <= dPrev.getTime();
  }).length;

  // Calculate Max Volume across all users for normalization
  const counts = {};
  allEtapas.forEach(e => {
    const r = e.responsavel || 'Sem Responsável';
    counts[r] = (counts[r] || 0) + 1;
  });
  const maxTotal = Math.max(...Object.values(counts)) || 1;

  // Average Delay
  let somaDiasAtraso = 0;
  let countAtraso = 0;
  userTasks.forEach(e => {
     if (e.dataPrevista) {
        const dPrev = new Date(e.dataPrevista);
        dPrev.setHours(0,0,0,0);
        
        let dReal = e.dataReal ? new Date(e.dataReal) : new Date();
        dReal.setHours(0,0,0,0);

        // Considera atraso se a data real for maior que a prevista
        // Para itens concluídos, usa dataReal. Para atrasados, usa data atual.
        if (dReal.getTime() > dPrev.getTime() && (e.status === 'atrasado' || e.status === 'concluido_atraso' || e.status === 'concluido')) {
           const diffTime = Math.abs(dReal.getTime() - dPrev.getTime());
           const diff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
           somaDiasAtraso += diff;
           countAtraso++;
        }
     }
  });
  const mediaAtraso = countAtraso > 0 ? somaDiasAtraso / countAtraso : 0;

  const delegadas = userTasks.filter(e => {
    if (!e.executadoPor) return false;
    const executor = String(e.executadoPor).trim().toLowerCase();
    const responsavel = String(userName).trim().toLowerCase();
    return executor !== responsavel;
  }).length;

  const metrics = [
    { 
      label: 'Conclusão', 
      value: total > 0 ? Math.round((concluidas / total) * 100) : 0,
      desc: 'Taxa de finalização (Concluídas / Total).'
    },
    { 
      label: 'Pontualidade', 
      value: concluidas > 0 ? Math.round((concluidasNoPrazo / concluidas) * 100) : 0,
      desc: 'Qualidade da entrega no prazo (Concluídas no Prazo / Total Concluídas).'
    },
    { 
      label: 'Aderência', 
      value: total > 0 ? Math.round(((total - atrasadas) / total) * 100) : 0,
      desc: 'Saúde da carteira (Tarefas não atrasadas / Total).'
    },
    { 
      label: 'Volume', 
      value: Math.round((total / maxTotal) * 100),
      desc: 'Carga de trabalho relativa ao maior volume da equipe.'
    },
    { 
      label: 'Eficiência', 
      value: Math.max(0, 100 - Math.round(mediaAtraso * 5)),
      desc: 'Penaliza atrasos longos (100 - 5 pontos por dia de atraso médio).'
    },
    { 
      label: 'Delegação', 
      value: total > 0 ? Math.round((delegadas / total) * 100) : 0,
      desc: 'Tarefas executadas por terceiros (Executado Por ≠ Responsável).'
    }
  ];

  // Resumo dinâmico do perfil
  const eficiencia = metrics.find(m => m.label === 'Eficiência').value;
  const volume = metrics.find(m => m.label === 'Volume').value;
  let resumoPerfil = `O desempenho de ${userName} indica necessidade de atenção aos prazos de entrega.`;
  if (eficiencia >= 90) {
    resumoPerfil = volume >= 80 
      ? `Alta performance de ${userName} com alto volume de trabalho. Mantém a qualidade mesmo sob pressão.` 
      : volume <= 50 
        ? `Alta eficácia nas entregas, porém com volume de trabalho menor que a média da equipe.` 
        : `Excelente eficácia e consistência nas entregas por parte de ${userName}.`;
  } else if (eficiencia >= 70) {
    resumoPerfil = `Bom desempenho geral de ${userName}, com pontuais oportunidades de melhoria nos prazos.`;
  }

  // SVG Config
  const size = 300;
  const center = size / 2;
  const radius = 100;
  const angleSlice = 360 / metrics.length;

  const getPoint = (value, index) => {
    const angle = index * angleSlice - 90; // Start at top
    const r = (value / 100) * radius;
    const rad = (angle * Math.PI) / 180;
    return {
      x: center + r * Math.cos(rad),
      y: center + r * Math.sin(rad)
    };
  };

  const points = metrics.map((m, i) => getPoint(m.value, i)).map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 sticky top-0 z-10">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Radar de Performance</h3>
            <p className="text-base text-slate-500">{userName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        
        <div className="p-6 flex flex-col items-center">
          <div className="relative w-[300px] h-[300px]">
            <svg width={size} height={size} className="overflow-visible">
              {/* Background Grid */}
              {[20, 40, 60, 80, 100].map((level) => (
                <polygon
                  key={level}
                  points={metrics.map((_, i) => {
                    const p = getPoint(level, i);
                    return `${p.x},${p.y}`;
                  }).join(' ')}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
              ))}
              {/* Axes */}
              {metrics.map((_, i) => {
                const p = getPoint(100, i);
                return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeWidth="1" />;
              })}
              {/* Data Polygon */}
              <polygon points={points} fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6" strokeWidth="2" />
              {/* Data Points */}
              {metrics.map((m, i) => {
                const p = getPoint(m.value, i);
                return <circle key={i} cx={p.x} cy={p.y} r="4" fill="#3b82f6"><title>{m.label}: {m.value}%</title></circle>;
              })}
              {/* Labels */}
              {metrics.map((m, i) => {
                const p = getPoint(115, i);
                return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" className="text-[10px] fill-slate-500 font-medium uppercase">{m.label}</text>;
              })}
            </svg>
          </div>
          
          <div className="w-full mt-6 bg-blue-50 p-4 rounded-lg border border-blue-100 mb-4">
            <h4 className="text-base font-bold text-blue-800 mb-1">Resumo do Perfil</h4>
            <p className="text-base text-blue-700 leading-relaxed">{resumoPerfil}</p>
          </div>

          <div className="flex flex-col gap-3 w-full">
            {metrics.map((m, i) => (
              <div key={i} className="bg-slate-50 p-3 rounded-lg flex justify-between items-center">
                <div className="pr-4">
                  <div className="text-base font-semibold text-slate-700">{m.label}</div>
                  <div className="text-sm text-slate-500 mt-0.5 leading-relaxed">{m.desc}</div>
                </div>
                <div className="text-xl font-bold text-slate-800 whitespace-nowrap">{m.value}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusDetailsModal({ statusType, etapas, onClose }) {
  const getFilteredEtapas = () => {
    switch (statusType) {
      case 'concluidas_no_prazo':
        return etapas.filter(e => {
            if (e.status !== 'concluido' && e.status !== 'concluido_atraso') return false;
            if (e.status === 'concluido_atraso') return false;
            if (!e.dataReal || !e.dataPrevista) return true;
            const r = new Date(e.dataReal).setHours(0,0,0,0);
            const p = new Date(e.dataPrevista).setHours(0,0,0,0);
            return r <= p;
        });
      case 'concluidas_atraso':
        return etapas.filter(e => {
            if (e.status !== 'concluido' && e.status !== 'concluido_atraso') return false;
            if (e.status === 'concluido_atraso') return true;
            if (!e.dataReal || !e.dataPrevista) return false;
            const r = new Date(e.dataReal).setHours(0,0,0,0);
            const p = new Date(e.dataPrevista).setHours(0,0,0,0);
            return r > p;
        });
      case 'em_andamento':
        return etapas.filter(e => e.status === 'em_andamento');
      case 'pendentes':
        return etapas.filter(e => e.status === 'pendente');
      case 'atrasadas':
        return etapas.filter(e => e.status === 'atrasado');
      default:
        return [];
    }
  };

  const filtered = getFilteredEtapas();
  
  const getTitle = () => {
    switch (statusType) {
      case 'concluidas_no_prazo': return 'Etapas Concluídas no Prazo';
      case 'concluidas_atraso': return 'Etapas Concluídas com Atraso';
      case 'em_andamento': return 'Etapas em Andamento';
      case 'pendentes': return 'Etapas Pendentes';
      case 'atrasadas': return 'Etapas Atrasadas';
      default: return 'Detalhes';
    }
  };

  const calcularAtrasoHoras = (prevista, real) => {
    if (!prevista || !real) return '-';

    const diff = new Date(real) - new Date(prevista);
    if (diff <= 0) return '-';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[90vw] relative max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
          <div>
            <h3 className="text-xl font-bold text-slate-800">{getTitle()}</h3>
            <p className="text-base text-slate-500">{filtered.length} itens encontrados</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        
        <div className="overflow-auto custom-scrollbar p-0 flex-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Nenhuma etapa encontrada com este status.</div>
          ) : (
            <table className="w-full text-base text-left">
              <thead className="bg-slate-50 text-slate-600 font-medium sticky top-0 shadow-sm z-10">
                <tr>
                  <th className="p-3 border-b whitespace-nowrap">Código</th>
                  <th className="p-3 border-b min-w-[200px]">Etapa</th>
                  <th className="p-3 border-b whitespace-nowrap">Responsável</th>
                  <th className="p-3 border-b whitespace-nowrap">Executado Por</th>
                  <th className="p-3 border-b whitespace-nowrap">Prevista</th>
                  <th className="p-3 border-b whitespace-nowrap">Realizado</th>
                  <th className="p-3 border-b whitespace-nowrap text-center">Atraso (h)</th>
                  <th className="p-3 border-b min-w-[250px]">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-3 font-medium text-slate-700 whitespace-nowrap">{item.codigo || '-'}</td>
                    <td className="p-3 text-slate-600">{item.nome}</td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">{item.responsavel || 'Não atribuído'}</td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">{item.executadoPor || '-'}</td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">
                      {item.dataPrevista ? new Date(item.dataPrevista).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">
                      {item.dataReal ? new Date(item.dataReal).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="p-3 text-slate-600 whitespace-nowrap text-center">
                      {calcularAtrasoHoras(item.dataPrevista, item.dataReal)}
                    </td>
                    <td className="p-3 text-slate-600 whitespace-pre-wrap">
                      {item.observacoes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ color, label, count, onClick, className = '' }) {
  const colors = {
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };

  return (
    <div 
      className={`flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-slate-100 transition-all ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${colors[color]} ring-2 ring-white shadow-sm`} />
        <span className="text-sm text-slate-600 font-medium">{label}</span>
      </div>
      {count !== undefined && (
        <span className="text-sm font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md min-w-[1.5rem] text-center">{count}</span>
      )}
    </div>
  );
}
