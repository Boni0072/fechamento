import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate} from 'react-router-dom';
import { getFirestore, doc, onSnapshot, collection, getDocs, writeBatch, updateDoc, query, where, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { getPeriodos, getEtapas, getAreas, getResponsaveis, criarEtapa, atualizarEtapa, deletarEtapa, getStatusColor, getStatusLabel, importarEtapas } from '../services/database';
import { Plus, Edit2, Trash2, X, Check, Filter, RefreshCw, Settings } from 'lucide-react';
import * as XLSX from 'xlsx';
import { checkPermission } from "./permissionUtils";

import { getDatabase, ref, onValue } from "firebase/database";
export default function Etapas() {
  const navigate = useNavigate();
  const { empresaAtual, empresas, selecionarEmpresa } = useAuth();
  const { loading: loadingPermissoes, user: authUser } = usePermissao('etapas');
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [periodos, setPeriodos] = useState([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [areas, setAreas] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [empresaDados, setEmpresaDados] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [etapaEditando, setEtapaEditando] = useState(null);
  const [filtros, setFiltros] = useState({ area: '', responsavel: '', status: '' });
  const [syncing, setSyncing] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [isSyncingRef] = useState({ current: false }); // Usando state como ref estável ou useRef
  const [nextSync, setNextSync] = useState(15);
  const [autoSyncing, setAutoSyncing] = useState(false);

  const empresasParaBuscar = useMemo(() => {
    if (empresaAtual) return [empresaAtual];
    return empresas || [];
  }, [empresaAtual, empresas]);

  const viewAllCompanies = !empresaAtual;

  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    area: '',
    responsavel: '',
    dataPrevista: '',
    dataReal: '',
    ordem: 1,
    observacoes: ''
  });

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
    if (!empresasParaBuscar || empresasParaBuscar.length === 0) return;

    
    // Busca dados atualizados da empresa no Firestore (para garantir que temos o spreadsheetId mais recente)
    const db = getFirestore();
    let unsubEmpresa = () => {};

    if (empresaAtual) {
      const empresaRef = doc(db, 'tenants', empresaAtual.id);
      unsubEmpresa = onSnapshot(empresaRef, (snapshot) => {
        const data = snapshot.data();
        if (data) {
          setEmpresaDados({ id: empresaAtual.id, ...data });
        }
      });
    } else {
      setEmpresaDados(null);
    }

    const unsubscribes = [];
    const allPeriodsMap = new Map();

    empresasParaBuscar.forEach(emp => {
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
    
    return () => {
      unsubEmpresa();
      unsubscribes.forEach(u => u());
    };
  }, [empresasParaBuscar, empresaAtual]);

  useEffect(() => {
    if (!periodoSelecionado || !empresasParaBuscar || empresasParaBuscar.length === 0) {
      setEtapas([]);
      return;
    }
    
    setLoadingData(true);
    const unsubscribes = [];
    const etapasMap = new Map();

    empresasParaBuscar.forEach(emp => {
        const unsubPeriodos = getPeriodos(emp.id, (periodsData) => {
          const match = periodsData.find(p => p.mes === periodoSelecionado.mes && p.ano === periodoSelecionado.ano);
          if (match) {
            const unsubEtapas = getEtapas(emp.id, match.id, (etapasData) => {
              etapasData.forEach(e => {
                const uniqueId = `${emp.id}_${e.id}`;
                etapasMap.set(uniqueId, { ...e, originalId: e.id, empresaId: emp.id, empresaNome: emp.nome, periodoId: match.id });
              });
              const allEtapas = Array.from(etapasMap.values());
              setEtapas(allEtapas);
              
              // Deriva áreas e responsáveis para os filtros
              const uniqueAreas = [...new Set(allEtapas.map(e => e.area).filter(Boolean))].sort();
              setAreas(uniqueAreas.map((a, i) => ({ id: i, nome: a })));
              
              const uniqueResps = [...new Set(allEtapas.map(e => e.responsavel).filter(Boolean))].sort();
              setResponsaveis(uniqueResps.map((r, i) => ({ id: i, nome: r })));

              setLoadingData(false);
            });
            unsubscribes.push(unsubEtapas);
          }
        });
        unsubscribes.push(unsubPeriodos);
    });
    
    return () => unsubscribes.forEach(u => u());
  }, [periodoSelecionado, empresasParaBuscar]);

  useEffect(() => {
    if (!empresaAtual) return;

   const db = getDatabase();
    const googleTableRef = ref(db, `tenants/${empresaAtual.id}/tabelaGoogle`);

    const unsubscribe = onValue(googleTableRef, (snapshot) => {
     let data = snapshot.val();
      if (data) {
       // Process the data from Realtime Database and update state
        console.log("Data from Realtime Database:", data);
        setEtapas(processRealtimeData(data));
      }
     });

    return () => {
      unsubscribe();
    };
  }, [empresaAtual]);

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
    
    isSyncingRef.current = true;
    if (!isAuto) setSyncing(true);
    else setAutoSyncing(true);

    try {
      const sheetParam = dados.sheetName ? `&sheet=${encodeURIComponent(dados.sheetName)}` : '&gid=0';
      const url = `https://docs.google.com/spreadsheets/d/${dados.spreadsheetId}/gviz/tq?tqx=out:csv${sheetParam}&t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Erro ao conectar com a planilha.');
      
      const csvText = await response.text();
      const workbook = XLSX.read(csvText, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { raw: true });

      // Busca dados atuais do banco (Firestore) para comparação precisa
      const db = getFirestore();
      
      // Busca o ID real do período (necessário pois periodoSelecionado.id pode ser sintético na visão geral)
      const periodsSnapshot = await getDocs(collection(db, 'tenants', empresaAtual.id, 'periodos'));
      const periodsData = periodsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const realPeriod = periodsData.find(p => p.mes === periodoSelecionado.mes && p.ano === periodoSelecionado.ano);

      if (!realPeriod) {
        if (!isAuto) alert("Período não encontrado no banco de dados.");
        return;
      }

      const etapasRef = collection(db, 'tenants', empresaAtual.id, 'periodos', realPeriod.id, 'etapas');
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

        // Confirmação final de substituição
        if (processedSteps.length > 0) {
            // Prepara lista de operações (Batch)
            const operations = [];
            const keptIds = new Set();
            
            processedSteps.forEach(step => {
              const docRef = step.id ? doc(etapasRef, step.id) : doc(etapasRef);
              const { id, ...dados } = step;
              
              const stepData = {
                ...dados,
                createdAt: dados.createdAt || new Date().toISOString(),
                createdBy: dados.createdBy || userProfile?.uid || userProfile?.id || 'importacao',
                createdByName: dados.createdByName || userProfile?.nome || userProfile?.name || 'Importação'
              };

              operations.push({ type: 'set', ref: docRef, data: stepData });
              if (step.id) keptIds.add(step.id);
            });

            // Adiciona operações de exclusão para etapas que não estão mais na planilha
            currentDocs.forEach(doc => {
              if (!keptIds.has(doc.id)) {
                operations.push({ type: 'delete', ref: doc(etapasRef, doc.id) });
              }
            });


            // Executa operações em lotes
            const batchSize = 500;
            for (let i = 0; i < operations.length; i += batchSize) {
              const batch = writeBatch(db);
              const chunk = operations.slice(i, i + batchSize);
              
              chunk.forEach(op => {
                if (op.type === 'set') {
                  batch.set(op.ref, op.data);
                } else if (op.type === 'delete') {
                  batch.delete(op.ref);
                }
              });
              
              await batch.commit();
            }

            if (!isAuto) alert(`✅ Sincronização concluída!\n\n${processedSteps.length} etapas foram importadas/atualizadas.`);
        }
      } else {
        if (!isAuto) alert("Nenhuma etapa válida encontrada na planilha.");
      }
    } catch (error) {
      console.error('Erro na sincronização:', error);
      if (!isAuto) alert(`Erro ao sincronizar: ${error.message}`);
    } finally {
      isSyncingRef.current = false;
      if (!isAuto) setSyncing(false);
      else setAutoSyncing(false);
    }
  }, [empresaDados, empresaAtual, periodoSelecionado, userProfile, navigate, isSyncingRef]);

  const processRealtimeData = (data) => {
    //Transformar os dados do Realtime Database em um formato que o componente possa usar
    //Adaptar a estrutura de dados do Realtime Database para coincidir com o que as etapas esperam
     if (!data) return [];

    const etapasArray = Object.keys(data).map(key => {
      const etapa = data[key];
      return {
        id: key,

     dataReal: etapa.dataReal || '',

        nome: etapa.nome,
        descricao: etapa.descricao || '',
        area: etapa.area || '',
        responsavel: etapa.responsavel || '',
        dataPrevista: etapa.dataPrevista || '',
        dataReal: etapa.dataReal || '',
        ordem: etapa.ordem || 1,
        observacoes: etapa.observacoes || '',
        status: etapa.status || 'pendente'
      };
    });


    return etapasArray;
  };


  const formatDateForInput = (isoDate) => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!empresaAtual) {
      alert("Selecione uma empresa específica para criar etapas.");
      return;
    }
    
    if (!periodoSelecionado) {
      alert("Selecione um período.");
      return;
    }

    // Busca o ID real do período
    const db = getFirestore();
    const periodsSnapshot = await getDocs(collection(db, 'tenants', empresaAtual.id, 'periodos'));
    const periodsData = periodsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const realPeriod = periodsData.find(p => p.mes === periodoSelecionado.mes && p.ano === periodoSelecionado.ano);

    if (!realPeriod) {
      alert("Período não encontrado.");
      return;
    }

    if (etapaEditando) {
      await atualizarEtapa(empresaAtual.id, realPeriod.id, etapaEditando.originalId, form);

    } else {
      await criarEtapa(empresaAtual.id, realPeriod.id, form);
    }
    
    setShowModal(false);
    setEtapaEditando(null);
    setForm({
      nome: '',
      descricao: '',
      area: '',
      responsavel: '',
      dataPrevista: '',
      dataReal: '',
      ordem: 1,
      observacoes: ''
    });
  };

  const handleEditar = (etapa) => {
    setEtapaEditando(etapa);
    setForm({
      nome: etapa.nome || '',
      descricao: etapa.descricao || '',
      area: etapa.area || '',
      responsavel: etapa.responsavel || '',
      dataPrevista: etapa.dataPrevista || '',
      dataReal: etapa.dataReal || '',
      ordem: etapa.ordem || 1,
      observacoes: etapa.observacoes || ''
    });
    setShowModal(true);
  };

  const handleDeletar = async (etapa) => {
    if (window.confirm('Tem certeza que deseja excluir esta etapa?')) {
      const empId = etapa.empresaId;
      const perId = etapa.periodoId;
      const id = etapa.originalId;
      await deletarEtapa(empId, perId, id);
    }
  };

  const etapasFiltradas = etapas.filter(etapa => {
    if (filtros.area && etapa.area !== filtros.area) return false;
    if (filtros.responsavel && etapa.responsavel !== filtros.responsavel) return false;
    if (filtros.status && etapa.status !== filtros.status) return false;
    return true;
  });

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Etapas do Fechamento</h1>
            <p className="text-slate-500">Gerencie as etapas do fechamento contábil</p>
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
            onClick={() => navigate('/empresas')}
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
            title="Configurações da Empresa"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setEtapaEditando(null);
              setForm({
                nome: '',
                descricao: '',
                area: '',
                responsavel: '',
                dataPrevista: '',
                dataReal: '',
                ordem: etapas.length + 1,
                observacoes: ''
              });
              setShowModal(true);
            }}
            disabled={viewAllCompanies} // Criação só permitida em empresa específica
            className={`flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 ${viewAllCompanies ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={viewAllCompanies ? "Selecione uma empresa específica para criar etapas" : "Criar nova etapa"}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Etapa</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">Filtros:</span>
          
          <select
            value={filtros.area}
            onChange={(e) => setFiltros({ ...filtros, area: e.target.value })}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">Todas as áreas</option>
            {areas.map(a => (
              <option key={a.id} value={a.nome}>{a.nome}</option>
            ))}
          </select>
          
          <select
            value={filtros.responsavel}
            onChange={(e) => setFiltros({ ...filtros, responsavel: e.target.value })}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">Todos os responsáveis</option>
            {responsaveis.map(r => (
              <option key={r.id} value={r.nome}>{r.nome}</option>
            ))}
          </select>
          
          <select
            value={filtros.status}
            onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">Todos os status</option>
            <option value="concluido">Concluído</option>
            <option value="em_andamento">Em Andamento</option>
            <option value="pendente">Pendente</option>
            <option value="concluido_atraso">Concluído c/ Atraso</option>
            <option value="atrasado">Atrasado</option>
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">D+</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Código</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Etapa</th>
              {viewAllCompanies && <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Empresa</th>}
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Área</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Responsável</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Executado Por</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Data Prevista</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Hora Prevista</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Data Real</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Hora Real</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {etapasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                  Nenhuma etapa encontrada
                </td>
              </tr>
            ) : (
              etapasFiltradas.map((etapa, index) => (
                <tr key={etapa.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    D+{etapa.ordem || index}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{etapa.codigo || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-800">{etapa.nome}</td>
                  {viewAllCompanies && <td className="px-4 py-3 text-sm text-slate-600">{etapa.empresaNome}</td>}
                  <td className="px-4 py-3 text-sm text-slate-600">{etapa.area || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{etapa.responsavel || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{etapa.executadoPor || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {etapa.dataPrevista ? new Date(etapa.dataPrevista).toLocaleDateString('pt-BR') : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {etapa.dataPrevista ? new Date(etapa.dataPrevista).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {etapa.dataReal ? new Date(etapa.dataReal).toLocaleDateString('pt-BR') : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {etapa.dataReal ? new Date(etapa.dataReal).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full text-white ${getStatusColor(etapa.status)}`}>
                      {getStatusLabel(etapa.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditar(etapa)}
                        className="p-1 text-slate-400 hover:text-primary-600"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeletar(etapa)}
                        className="p-1 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-slideIn">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">
                {etapaEditando ? 'Editar Etapa' : 'Nova Etapa'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                  <input
                    type="text"
                    required
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                  <textarea
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                    rows={2}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Área</label>
                  <select
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    <option value="">Selecione</option>
                    {areas.map(a => (
                      <option key={a.id} value={a.nome}>{a.nome}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Responsável</label>
                  <select
                    value={form.responsavel}
                    onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    <option value="">Selecione</option>
                    {responsaveis.map(r => (
                      <option key={r.id} value={r.nome}>{r.nome}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Data Prevista</label>
                  <input
                    type="datetime-local"
                    value={formatDateForInput(form.dataPrevista)}
                    onChange={(e) => setForm({ ...form, dataPrevista: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Data Real</label>
                  <input
                    type="datetime-local"
                    value={formatDateForInput(form.dataReal)}
                    onChange={(e) => setForm({ ...form, dataReal: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ordem (D+)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.ordem}
                    onChange={(e) => setForm({ ...form, ordem: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Observações</label>
                  <textarea
                    value={form.observacoes}
                    onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                    rows={2}
                  />
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  {etapaEditando ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );





}

// Função auxiliar para processar dados (Reutiliza lógica da Importação)
function processData(data, existingSteps = []) {
  if (!Array.isArray(data)) return [];
  const etapasValidadas = [];
  const chavesProcessadas = new Set();
  const usedIds = new Set(); // Rastreia IDs já vinculados para permitir códigos duplicados em tarefas diferentes

  const formatarData = (valor) => {
    if (valor === null || valor === undefined || String(valor).trim() === '') return null;

    // 1. Número (Serial Excel)
    if (typeof valor === 'number') {
      // Ajuste de precisão: adiciona um pequeno epsilon para corrigir erros de ponto flutuante
      // onde uma data pode aparecer como 45291.99999 (dia anterior) em vez de 45292.0.
      // Math.floor garante que horários PM (ex: 45292.8) fiquem no mesmo dia.
      const valorAjustado = Math.floor(valor + 0.001);
      
      // 25569 é o offset de dias entre 1900 e 1970.
      // Adicionamos 12h (43200000ms) para garantir que a data fique no meio do dia UTC.
      const date = new Date((valorAjustado - 25569) * 86400 * 1000 + 43200000);
      return date.toISOString();
    }
    
    if (typeof valor === 'string') {
      const v = valor.trim();
      
      // 2. Formato DD/MM/AAAA (Estrito BR)
      const dmy = v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
      if (dmy) {
        const dia = parseInt(dmy[1], 10);
        const mes = parseInt(dmy[2], 10);
        let ano = parseInt(dmy[3], 10);
        
        if (ano < 100) ano += 2000;

        if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
             // Cria a data em UTC ao meio-dia para evitar problemas de fuso horário.
             const date = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
             if (!isNaN(date.getTime())) return date.toISOString();
        }
      }

      // 3. Formato ISO YYYY-MM-DD (ou similar)
      const ymd = v.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
      if (ymd) {
         const ano = parseInt(ymd[1], 10);
         const mes = parseInt(ymd[2], 10);
         const dia = parseInt(ymd[3], 10);
         // Cria a data em UTC ao meio-dia para evitar problemas de fuso horário.
         const date = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
         if (!isNaN(date.getTime())) return date.toISOString();
      }
    }
    return null;
  };

  const combinarDataHora = (dataISO, horaVal) => {
    if (!dataISO) return null;
    if (horaVal === undefined || horaVal === null || String(horaVal).trim() === '') return dataISO;
    
    // Extrai componentes da data base (que está em UTC 12:00)
    const dt = new Date(dataISO);
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth();
    const day = dt.getUTCDate();

    let hours = 0;
    let minutes = 0;

    if (typeof horaVal === 'number') {
      // Math.round para corrigir imprecisão de ponto flutuante do Excel (ex: 0.33333... deve ser 08:00 e não 07:59)
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
    
    // Cria data usando o fuso horário local do navegador para preservar o "horário de relógio" (Wall Time)
    // Isso evita que 08:00 vire 05:00 ou 11:00 devido a conversões de UTC
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
        // Retorna apenas se tiver valor válido (ignora células vazias para tentar próxima chave)
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return val;
        }
      }
      return undefined;
    };

    const nome = getVal(['TAREFA', 'tarefa', 'Nome', 'nome', 'Etapa', 'etapa', 'Etapas', 'etapas', 'Tarefas', 'tarefas', 'Atividade', 'atividade', 'Descrição', 'descricao', 'Item', 'item']);
    const codigo = getVal(['CODIGO', 'codigo', 'CÓDIGO', 'código', 'Codigo', 'Código', 'Cod', 'COD', 'ID', 'Id', 'Code']);
    
    if (!nome) return;

    // Evita processar linhas duplicadas na mesma planilha (mesmo código ou mesmo nome)
    const normalizeVal = (str) => str ? String(str).trim().replace(/\s+/g, ' ').toLowerCase() : '';
    // Chave única composta para permitir mesmo código com nomes diferentes
    const uniqueKey = `${codigo ? 'code:' + normalizeVal(codigo) : ''}|name:${normalizeVal(nome)}`;
    
    if (chavesProcessadas.has(uniqueKey)) return;
    chavesProcessadas.add(uniqueKey);

    const existing = existingSteps.find(e => {
      if (usedIds.has(e.id)) return false; // Ignora itens já vinculados nesta importação

      // Normalização para comparação segura
      const normalize = (str) => str ? String(str).trim().replace(/\s+/g, ' ').toLowerCase() : '';
      const codeA = normalize(codigo);
      const codeB = normalize(e.codigo);
      const nameA = normalize(nome);
      const nameB = normalize(e.nome);

      // 1. Match Forte: Código E Nome iguais
      if (codeA && codeB && codeA === codeB && nameA === nameB) return true;

      // 2. Match Código (se nome mudou, ou se é a "próxima" tarefa com mesmo código)
      if (codeA && codeB && codeA === codeB) return true;

      // 3. Match Nome (se código não existe ou mudou)
      if (nameA === nameB) {
        // Se ambos têm código e são diferentes, NÃO é a mesma tarefa
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
    
    // Busca status explícito na planilha (Coluna STATUS)
    let rawStatus = getVal(['STATUS', 'Status', 'status', 'SITUAÇÃO', 'Situação', 'situacao', 'Estado', 'estado']);
    let status = existing?.status || 'pendente';
    
    if (rawStatus) {
       const s = String(rawStatus).toLowerCase();
       if (s.includes('conclu')) status = 'concluido';
       else if (s.includes('atras')) status = 'atrasado';
       else if (s.includes('pendente')) status = 'pendente';
       else if (s.includes('andamento')) status = 'em_andamento';
    } else if (status === 'pendente' && rawDataReal !== undefined && rawDataReal !== null && String(rawDataReal).trim() !== '') {
      // Auto-concluir APENAS se não houver status explícito dizendo o contrário
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
      id: existing ? existing.id : null, // Preserva o ID para atualizar em vez de duplicar
      nome: nome,
      descricao: getVal(['Descrição', 'descricao']) || '',
      area: getVal(['ÁREA', 'área', 'area', 'Área']) || '',
      responsavel: getVal(['ATRIBUÍDO PARA', 'atribuído para', 'atribuido para', 'Responsável', 'responsavel', 'Responsavel', 'Owner']) || '',
      dataPrevista: dataPrevista,
      dataReal: dataReal,
      ordem: ordem,
      codigo: (codigo !== undefined && codigo !== null) ? String(codigo) : '',
      observacoes: getVal(['Observações', 'observacoes']) || '',
      status: status,
      concluidoEm: concluidoEm,
      quemConcluiu: quemConcluiu,
      executadoPor: getVal(['EXECUTADO POR', 'Executado Por', 'Executado por', 'executado por', 'ExecutadoPor', 'executadoPor', 'Executor', 'executor', 'Quem executou', 'Realizado por', 'Executado p/', 'Executado P/', 'Executado']) || ''
    });
  });

  return etapasValidadas;
}
