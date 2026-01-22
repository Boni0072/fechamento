import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { getDatabase, ref, onValue, set, push, remove } from 'firebase/database';
import { getPeriodos, getEtapas } from '../services/database';
import { BarChart3, Clock, AlertTriangle, CheckCircle2, TrendingUp, Activity, Target, X, Info, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function Dashboard() {
  const navigate = useNavigate();
  const { empresaAtual } = useAuth();
  const { loading: loadingPermissoes, autorizado, user } = usePermissao('dashboard');
  const [periodos, setPeriodos] = useState([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [empresaDados, setEmpresaDados] = useState(null);
  const [syncing, setSyncing] = useState(false);
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
    desempenhoPorResponsavel: []
  });

  useEffect(() => {
    if (!empresaAtual) return;
    
    // Busca dados atualizados da empresa em tempo real
    const db = getDatabase();
    const empresaRef = ref(db, `tenants/${empresaAtual.id}`);
    const unsubEmpresa = onValue(empresaRef, (snapshot) => {
      setEmpresaDados({ id: empresaAtual.id, ...snapshot.val() });
    });

    const unsubscribe = getPeriodos(empresaAtual.id, (data) => {
      setPeriodos(data);
      if (data.length > 0 && !periodoSelecionado) {
        setPeriodoSelecionado(data[0]);
      }
    });
    return () => {
      unsubscribe();
      unsubEmpresa();
    };
  }, [empresaAtual]);

  useEffect(() => {
    if (!empresaAtual || !periodoSelecionado) return;
    const unsubscribe = getEtapas(empresaAtual.id, periodoSelecionado.id, (data) => {
      // 1. Filtra duplicatas técnicas (mesmo ID)
      const uniqueById = data.filter((item, index, self) => 
        index === self.findIndex((t) => t.id === item.id)
      );
      
      // 2. Filtra duplicatas lógicas (mesmo Nome ou Código) para evitar visualização repetida
      const uniqueByContent = uniqueById.filter((item, index, self) => 
        index === self.findIndex((t) => (t.codigo && t.codigo === item.codigo) || (!t.codigo && t.nome === item.nome))
      );

      setEtapas(uniqueByContent);
      calcularKpis(uniqueByContent);
    });
    return () => unsubscribe();
  }, [empresaAtual, periodoSelecionado]);

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
  };

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
      desempenhoPorResponsavel
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

  if (loadingPermissoes) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Carregando permissões...</p>
      </div>
    );
  }

  if (!autorizado) {
    if (!user) {
      return <Navigate to="/login" replace />;
    }
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Acesso não autorizado.</p>
      </div>
    );
  }

  if (!empresaAtual) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500 mb-4">Nenhuma empresa selecionada</p>
        <a href="/empresas" className="text-primary-600 hover:underline">
          Criar ou selecionar uma empresa
        </a>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <img src="/contabil.png" alt="Logo Contábil" className="w-36 h-36 object-contain" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Dashboard do Fechamento</h1>
            <p className="text-slate-500">Acompanhe o progresso do fechamento contábil</p>
          </div>
        </div>
        
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors mr-3 ${
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
        {/* Progresso do Fechamento */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-4 h-full">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Progresso do Fechamento</h2>
          
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
                <span className="text-lg text-slate-500 font-medium uppercase">Concluído</span>
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
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Desempenho por Área</h2>
              <div className="h-[200px] flex items-end gap-2 overflow-x-auto custom-scrollbar pb-2">
                {kpis.desempenhoPorArea.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-sm text-slate-400">
                    Nenhum dado disponível
                  </div>
                ) : (
                  kpis.desempenhoPorArea.map((item, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-2 min-w-[50px] flex-1 h-full justify-end group">
                      <span className="text-xs font-bold text-slate-700">{item.percentual}%</span>
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
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Principais Gargalos</h2>
              <p className="text-sm text-slate-500 mb-4">Áreas com mais atrasos</p>
              
              <div className="space-y-4">
                {kpis.topGargalos.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">Nenhum gargalo identificado</p>
                ) : (
                  kpis.topGargalos.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">{item.area}</span>
                      <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded-full">
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

        {/* Desempenho por Responsável */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Desempenho por Responsável</h2>
            <div className="group relative">
              <Info className="w-4 h-4 text-slate-400 cursor-help" />
              <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none font-normal">
                O percentual indica a taxa de conclusão (Concluídas/Total). Clique em um usuário para ver o Radar de Performance detalhado.
                <div className="absolute top-full right-1 border-4 border-transparent border-t-slate-800"></div>
              </div>
            </div>
          </div>
          <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
            {kpis.desempenhoPorResponsavel.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Nenhum dado disponível</p>
            ) : (
              kpis.desempenhoPorResponsavel.map((item, idx) => (
                <div 
                  key={idx}
                  onClick={() => setSelectedUser(item.nome)}
                  className="cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors group"
                >
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700">{item.nome}</span>
                    <span className="text-slate-500">{item.concluidas}/{item.total} ({item.percentual}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full transition-all duration-500" 
                      style={{ width: `${item.percentual}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
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
      observacoes: getVal(['Observações', 'observacoes']) || '',
      status: status,
      concluidoEm: concluidoEm,
      quemConcluiu: quemConcluiu
    });
  });

  return etapasValidadas;
};

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
          <p className="text-sm text-slate-500">{title}</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{value}</p>
          <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
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
            <h3 className="text-lg font-bold text-slate-800">Radar de Performance</h3>
            <p className="text-sm text-slate-500">{userName}</p>
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
            <h4 className="text-sm font-bold text-blue-800 mb-1">Resumo do Perfil</h4>
            <p className="text-sm text-blue-700 leading-relaxed">{resumoPerfil}</p>
          </div>

          <div className="flex flex-col gap-3 w-full">
            {metrics.map((m, i) => (
              <div key={i} className="bg-slate-50 p-3 rounded-lg flex justify-between items-center">
                <div className="pr-4">
                  <div className="text-sm font-semibold text-slate-700">{m.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{m.desc}</div>
                </div>
                <div className="text-lg font-bold text-slate-800 whitespace-nowrap">{m.value}%</div>
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl relative max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{getTitle()}</h3>
            <p className="text-sm text-slate-500">{filtered.length} itens encontrados</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        
        <div className="overflow-y-auto custom-scrollbar p-0 flex-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Nenhuma etapa encontrada com este status.</div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 font-medium sticky top-0 shadow-sm">
                <tr>
                  <th className="p-3 border-b">Código</th>
                  <th className="p-3 border-b">Etapa</th>
                  <th className="p-3 border-b">Responsável</th>
                  <th className="p-3 border-b">Prevista</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-3 font-medium text-slate-700 whitespace-nowrap">{item.codigo || '-'}</td>
                    <td className="p-3 text-slate-600">{item.nome}</td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">{item.responsavel || 'Não atribuído'}</td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">
                      {item.dataPrevista ? new Date(item.dataPrevista).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
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
        <span className="text-xs text-slate-600 font-medium">{label}</span>
      </div>
      {count !== undefined && (
        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md min-w-[1.5rem] text-center">{count}</span>
      )}
    </div>
  );
}
