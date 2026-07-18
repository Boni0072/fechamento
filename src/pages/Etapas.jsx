import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate} from 'react-router-dom';
import { getFirestore, doc, onSnapshot, collection, getDocs, writeBatch, updateDoc, query, where, deleteDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { getPeriodos, getResponsaveis, criarEtapa, atualizarEtapa, deletarEtapa, getStatusColor, getStatusLabel } from '../services/database';
import { Plus, X, Filter, Settings, CheckCircle, RotateCcw, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { checkPermission } from "./permissionUtils";

import { getDatabase, ref, onValue, get, set } from "firebase/database";
export default function Etapas() {
  const navigate = useNavigate();
  const { empresaAtual, empresas, selecionarEmpresa } = useAuth();
  const { loading: loadingPermissoes, user: authUser, autorizado } = usePermissao('etapas');
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
  const [etapaDetalhe, setEtapaDetalhe] = useState(null); // State for details modal
  const [observacaoModal, setObservacaoModal] = useState(''); // State for observation text in modal
  const [pontoModal, setPontoModal] = useState(null); // 'positivo' | 'negativo' | null
  const [pontoAlvo, setPontoAlvo] = useState(null); // 'responsavel' | 'executor' | null
  const [filtros, setFiltros] = useState({ area: '', responsavel: '', status: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingData, setLoadingData] = useState(false);

  const empresasParaBuscar = useMemo(() => {
    if (empresaAtual) return [empresaAtual];
    return empresas || [];
  }, [empresaAtual, empresas]);

  const viewAllCompanies = !empresaAtual;

  const [form, setForm] = useState({
    nome: '',
    codigo: '',
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

  useEffect(() => {
    // Sync observation text when a detail modal is opened
    if (etapaDetalhe) {
      setObservacaoModal(etapaDetalhe.observacoes || '');
    }
  }, [etapaDetalhe]);

  if (!autorizado && !loadingPermissoes && !loadingProfile) return <div className="flex justify-center p-8 text-slate-500">Acesso não autorizado.</div>;

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
              allPeriodsMap.set(key, { ...p, id: key, realId: p.id });
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
    if (!empresaAtual) {
      setEtapas([]);
      setLoadingData(false);
      return;
    }

    if (etapas.length === 0) {
      setLoadingData(true);
    }

    const db = getDatabase();
    const googleTableRef = ref(db, `tenants/${empresaAtual.id}/tabelaGoogle`);

    const unsubscribe = onValue(googleTableRef, (snapshot) => {
      let data = snapshot.val();
      if (data) {
        // Process the data from Realtime Database and update state
        console.log("Data from Realtime Database:", data);
        // Add original index to each item for direct updates
        const allEtapas = processRealtimeData(data).map((e, index) => ({
          ...e, _originalIndex: index
        }));
        setEtapas(allEtapas);

        // Deriva áreas e responsáveis para os filtros a partir dos dados processados
        const uniqueAreas = [...new Set(allEtapas.map(e => e.area).filter(Boolean))].sort();
        setAreas(uniqueAreas.map((a, i) => ({ id: i, nome: a })));
        
        const uniqueResps = [...new Set(allEtapas.map(e => e.responsavel).filter(Boolean))].sort();
        setResponsaveis(uniqueResps.map((r, i) => ({ id: i, nome: r })));
      } else {
        setEtapas([]);
        setAreas([]);
        setResponsaveis([]);
      }
      setLoadingData(false);
    });

    return () => {
      unsubscribe();
    };
  }, [empresaAtual]);

  const processRealtimeData = (data) => {
    //Transformar os dados do Realtime Database em um formato que o componente possa usar
    //Adaptar a estrutura de dados do Realtime Database para coincidir com o que as etapas esperam.
    if (!data) return [];

    // Reutiliza a função de processamento de dados já existente no arquivo.
    // O segundo argumento é para mesclar com dados existentes, mas aqui vamos tratar
    // o Realtime Database como a fonte da verdade.
    return processData(data, []);
  };

  const handleConcluirEtapa = async (e, etapa) => {
    e.stopPropagation(); // Prevent modal from opening
    if (etapa._originalIndex === undefined) {
      alert("Erro: Não foi possível identificar a etapa original para atualizar.");
      return;
    }
    if (!empresaAtual?.id) return;

    const db = getDatabase();
    const tabelaRef = ref(db, `tenants/${empresaAtual.id}/tabelaGoogle`);

    try {
      const snapshot = await get(tabelaRef);
      const dataArray = snapshot.val();

      if (!Array.isArray(dataArray) || dataArray.length <= etapa._originalIndex) {
        alert("Erro: Dados dessincronizados. A página será recarregada.");
        window.location.reload();
        return;
      }

      const newDataArray = [...dataArray];
      const itemToUpdate = { ...newDataArray[etapa._originalIndex] };

      const status = (itemToUpdate['STATUS'] || '').toLowerCase();
      const isConcluido = status.includes('conclu');

      if (isConcluido) {
        if (window.confirm("Esta etapa já está concluída. Deseja marcá-la como pendente novamente?")) {
          delete itemToUpdate['TÉRMINO'];
          delete itemToUpdate['EXECUTADO POR'];
          itemToUpdate['STATUS'] = 'Pendente';
        } else {
          return; // User cancelled
        }
      } else {
        const now = new Date();
        const datePart = now.toLocaleDateString('pt-BR');
        const timePart = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        itemToUpdate['TÉRMINO'] = `${datePart} ${timePart}`;
        itemToUpdate['EXECUTADO POR'] = userProfile?.nome || authUser?.email || 'Sistema';
        itemToUpdate['STATUS'] = 'Concluído';
      }

      // 1. Atualiza o Realtime Database (Cache rápido do Dashboard)
      newDataArray[etapa._originalIndex] = itemToUpdate;
      await set(tabelaRef, newDataArray);

      // 2. Atualiza o Firestore (Banco permanente) para evitar discrepância
      if (etapa.id && etapa.periodoId) {
        const fs = getFirestore();
        const fsRef = doc(fs, 'tenants', empresaAtual.id, 'periodos', etapa.periodoId, 'etapas', etapa.id);
        
        const processedItem = processData([itemToUpdate])[0];
        await setDoc(fsRef, {
          status: processedItem.status,
          dataReal: processedItem.dataReal,
          executadoPor: processedItem.executadoPor,
          concluidoEm: processedItem.concluidoEm
        }, { merge: true });
      }
    } catch (error) {
      console.error("Erro ao concluir etapa:", error);
      alert("Ocorreu um erro ao tentar atualizar a etapa.");
    }
  };

  const handleSalvarObservacao = async () => {
    if (!etapaDetalhe || etapaDetalhe._originalIndex === undefined) return;
    const db = getDatabase();
    const tabelaRef = ref(db, `tenants/${empresaAtual.id}/tabelaGoogle`);
    const snapshot = await get(tabelaRef);
    const dataArray = [...(snapshot.val() || [])];
    dataArray[etapaDetalhe._originalIndex]['Observações'] = observacaoModal;
    
    if (pontoModal && pontoAlvo) {
      const pontoPrincipal = pontoModal === 'positivo' ? 'Positivo' : 'Negativo';
      const pontoOposto = pontoModal === 'positivo' ? 'Negativo' : 'Positivo';
      const nomeAlvo = pontoAlvo === 'responsavel' ? etapaDetalhe.responsavel : etapaDetalhe.executadoPor;
      const nomeOutro = pontoAlvo === 'responsavel' ? etapaDetalhe.executadoPor : etapaDetalhe.responsavel;

      // Ponto para o alvo selecionado
      dataArray[etapaDetalhe._originalIndex]['PONTO'] = pontoPrincipal;
      dataArray[etapaDetalhe._originalIndex]['PONTO_ALVO'] = nomeAlvo || '';
      dataArray[etapaDetalhe._originalIndex]['PONTO_TIPO'] = pontoAlvo;

      // Ponto oposto para o outro (se existir e for diferente)
      if (nomeOutro && nomeOutro !== nomeAlvo) {
        dataArray[etapaDetalhe._originalIndex]['PONTO_OPOSTO'] = pontoOposto;
        dataArray[etapaDetalhe._originalIndex]['PONTO_OPOSTO_ALVO'] = nomeOutro;
        dataArray[etapaDetalhe._originalIndex]['PONTO_OPOSTO_TIPO'] = pontoAlvo === 'responsavel' ? 'executor' : 'responsavel';
      }
    }
    
    await set(tabelaRef, dataArray);
    setEtapaDetalhe(null); // Close modal
    setPontoModal(null);
    setPontoAlvo(null);
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

    let realPeriodId = periodoSelecionado.realId;

    if (!realPeriodId) {
      const db = getFirestore();
      const periodsSnapshot = await getDocs(collection(db, 'tenants', empresaAtual.id, 'periodos'));
      const periodsData = periodsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const found = periodsData.find(p => parseInt(p.mes) === parseInt(periodoSelecionado.mes) && parseInt(p.ano) === parseInt(periodoSelecionado.ano));
      if (found) realPeriodId = found.id;
    }

    if (!realPeriodId) {
      alert("Período não encontrado.");
      return;
    }

    if (etapaEditando && (etapaEditando.id || etapaEditando.originalId)) {
      await atualizarEtapa(empresaAtual.id, realPeriodId, etapaEditando.id || etapaEditando.originalId, form);
    } else {
      // Se não tem ID (veio da planilha e não está no banco), cria uma nova
      const dados = { ...form };
      await criarEtapa(empresaAtual.id, realPeriodId, dados);
    }
    
    setShowModal(false);
    setEtapaEditando(null);
    setForm({
      nome: '',
      codigo: '',
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
      codigo: etapa.codigo || '',
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
      const id = etapa.id || etapa.originalId;
      
      if (!id) {
        alert("Esta etapa ainda não foi salva no banco de dados e não pode ser excluída por aqui. Exclua na planilha e sincronize.");
        return;
      }

      await deletarEtapa(empId, perId, id);
    }
  };

  const etapasFiltradas = etapas.filter(etapa => {
    if (filtros.area && etapa.area !== filtros.area) return false;
    if (filtros.responsavel && etapa.responsavel !== filtros.responsavel) return false;
    if (filtros.status && etapa.status !== filtros.status) return false;
    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      const nameMatch = etapa.nome?.toLowerCase().includes(lowerCaseSearchTerm);
      const codeMatch = etapa.codigo?.toLowerCase().includes(lowerCaseSearchTerm);
      if (!nameMatch && !codeMatch) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Etapas do Fechamento</h1>
            <p style={{ color: 'var(--text-muted)' }}>Gerencie as etapas do fechamento contábil</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <select
            value={periodoSelecionado?.id || ''}
            onChange={(e) => {
              const periodo = periodos.find(p => p.id === e.target.value);
              setPeriodoSelecionado(periodo);
            }}
            className="form-input"
          >
            {periodos.map(p => (
              <option key={p.id} value={p.id}>{p.mes}/{p.ano}</option>
            ))}
          </select>
          
          <button
            onClick={() => navigate('/empresas')}
            className="btn btn-secondary !p-2"
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
            className={`btn btn-primary ${viewAllCompanies ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={viewAllCompanies ? "Selecione uma empresa específica para criar etapas" : "Criar nova etapa"}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Etapa</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Filtros:</span>

          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" style={{ color: 'var(--text-dim)' }} />
            <input
              type="text"
              placeholder="Pesquisar por nome ou código da etapa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input w-full max-w-xs pl-9 text-sm"
            />
          </div>
          
          <select
            value={filtros.area}
            onChange={(e) => setFiltros({ ...filtros, area: e.target.value })}
            className="form-input text-sm"
          >
            <option value="">Todas as áreas</option>
            {areas.map(a => (
              <option key={a.id} value={a.nome}>{a.nome}</option>
            ))}
          </select>
          
          <select
            value={filtros.responsavel}
            onChange={(e) => setFiltros({ ...filtros, responsavel: e.target.value })}
            className="form-input text-sm"
          >
            <option value="">Todos os responsáveis</option>
            {responsaveis.map(r => (
              <option key={r.id} value={r.nome}>{r.nome}</option>
            ))}
          </select>
          
          <select
            value={filtros.status}
            onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
            className="form-input text-sm"
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
      <div className="card overflow-hidden">
        <table className="w-full table-fixed">
          <thead style={{ background: 'var(--surface-2)' }}>
            <tr>
              <th className="table-header">Código</th>
              <th className="table-header w-1/3">Etapa</th>
              <th className="table-header">Status</th>
              <th className="table-header text-center">Ações</th>
              {viewAllCompanies && <th className="table-header">Empresa</th>}
              <th className="table-header">Área</th>
              <th className="table-header">Responsável</th>
              <th className="table-header">Executado Por</th>
              <th className="table-header">Data Prevista</th>
              <th className="table-header">Hora Prevista</th>
              <th className="table-header">Data Real</th>
              <th className="table-header">Hora Real</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {etapasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                  Nenhuma etapa encontrada
                </td>
              </tr>
            ) : (
              etapasFiltradas.map((etapa, index) => (
                <tr 
                  key={etapa.id || `etapa-${index}`} 
                  className="table-row"
                  onClick={() => setEtapaDetalhe(etapa)}>
                  <td className="table-cell">{etapa.codigo || '-'}</td>
                  <td className="table-cell font-medium" style={{ color: 'var(--text)' }}>{etapa.nome}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm whitespace-nowrap ${getStatusColor(etapa.status)}`}>
                      {getStatusLabel(etapa.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {etapa.status?.includes('concluido') ? (
                      <button
                        onClick={(e) => handleConcluirEtapa(e, etapa)}
                        className="p-2 text-[var(--warning)] hover:bg-[var(--warning-soft)] rounded-full transition-colors"
                        title="Reabrir Etapa"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => handleConcluirEtapa(e, etapa)}
                        className="p-2 text-[var(--success)] hover:bg-[var(--success-soft)] rounded-full transition-colors"
                        title="Concluir Etapa"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                    )}
                  </td>
                  {viewAllCompanies && <td className="table-cell">{etapa.empresaNome}</td>}
                  <td className="table-cell">{etapa.area || '-'}</td>
                  <td className="table-cell">{etapa.responsavel || '-'}</td>
                  <td className="table-cell">{etapa.executadoPor || '-'}</td>
                  <td className="table-cell">
                    {etapa.dataPrevista ? new Date(etapa.dataPrevista).toLocaleDateString('pt-BR') : '-'}
                  </td>
                  <td className="table-cell">
                    {etapa.dataPrevista ? new Date(etapa.dataPrevista).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td className="table-cell">
                    {etapa.dataReal ? new Date(etapa.dataReal).toLocaleDateString('pt-BR') : '-'}
                  </td>
                  <td className="table-cell">
                    {etapa.dataReal ? new Date(etapa.dataReal).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="modal-content w-full max-w-lg">
            <div className="modal-header">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                {etapaEditando ? 'Editar Etapa' : 'Nova Etapa'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded">
                <X className="w-5 h-5" style={{ color: 'var(--text-dim)' }} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="form-label">Nome *</label>
                  <input
                    type="text"
                    required
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    className="form-input"
                  />
                </div>
                
                <div className="col-span-2">
                  <label className="form-label">Descrição</label>
                  <textarea
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    className="form-input"
                    rows={2}
                  />
                </div>
                
                <div>
                  <label className="form-label">Área</label>
                  <select
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                    className="form-input"
                  >
                    <option value="">Selecione</option>
                    {areas.map(a => (
                      <option key={a.id} value={a.nome}>{a.nome}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="form-label">Responsável</label>
                  <select
                    value={form.responsavel}
                    onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                    className="form-input"
                  >
                    <option value="">Selecione</option>
                    {responsaveis.map(r => (
                      <option key={r.id} value={r.nome}>{r.nome}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="form-label">Data Prevista</label>
                  <input
                    type="datetime-local"
                    value={formatDateForInput(form.dataPrevista)}
                    onChange={(e) => setForm({ ...form, dataPrevista: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                    className="form-input"
                  />
                </div>
                
                <div>
                  <label className="form-label">Data Real</label>
                  <input
                    type="datetime-local"
                    value={formatDateForInput(form.dataReal)}
                    onChange={(e) => setForm({ ...form, dataReal: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                    className="form-input"
                  />
                </div>
                
                <div>
                  <label className="form-label">Código</label>
                  <input
                    type="text"
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    className="form-input"
                  />
                </div>

                <div>
                  <label className="form-label">Ordem (D+)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.ordem}
                    onChange={(e) => setForm({ ...form, ordem: parseInt(e.target.value) })}
                    className="form-input"
                  />
                </div>
                
                <div className="col-span-2">
                  <label className="form-label">Observações</label>
                  <textarea
                    value={form.observacoes}
                    onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                    className="form-input"
                    rows={2}
                  />
                </div>
              </div>
              
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                >
                  {etapaEditando ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {etapaDetalhe && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="modal-content w-full max-w-2xl">
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
                  {etapaDetalhe.nome?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <h3 className="text-base font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
                    {etapaDetalhe.nome}
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{etapaDetalhe.codigo ? `Código: ${etapaDetalhe.codigo}` : 'Sem código'}</p>
                </div>
              </div>
              <button onClick={() => setEtapaDetalhe(null)} className="p-1.5 rounded-lg transition-colors" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            
            <div className="p-6 max-h-[70vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              {/* Status Banner */}
              <div className="flex items-center gap-3 p-4 rounded-lg mb-5" style={{ background: etapaDetalhe.status === 'concluido' ? 'rgba(53,218,179,0.08)' : etapaDetalhe.status === 'concluido_atraso' ? 'rgba(245,182,77,0.08)' : etapaDetalhe.status === 'atrasado' ? 'rgba(251,113,105,0.08)' : 'rgba(124,156,255,0.08)', border: `1px solid ${etapaDetalhe.status === 'concluido' ? 'rgba(53,218,179,0.2)' : etapaDetalhe.status === 'concluido_atraso' ? 'rgba(245,182,77,0.2)' : etapaDetalhe.status === 'atrasado' ? 'rgba(251,113,105,0.2)' : 'rgba(124,156,255,0.2)'}` }}>
                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm ${getStatusColor(etapaDetalhe.status)}`}>
                  {getStatusLabel(etapaDetalhe.status)}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {etapaDetalhe.status === 'concluido' ? 'Etapa finalizada dentro do prazo' : 
                   etapaDetalhe.status === 'concluido_atraso' ? 'Etapa finalizada com atraso' :
                   etapaDetalhe.status === 'atrasado' ? 'Etapa com prazo vencido' :
                   etapaDetalhe.status === 'em_andamento' ? 'Etapa em execução' :
                   'Etapa aguardando início'}
                </span>
              </div>

              {/* Info Cards Grid */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-4 rounded-lg" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
                      <svg className="w-3 h-3" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Área</span>
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{etapaDetalhe.area || '-'}</span>
                </div>

                <div className="p-4 rounded-lg" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
                      <svg className="w-3 h-3" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Responsável</span>
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{etapaDetalhe.responsavel || 'Não atribuído'}</span>
                </div>

                <div className="p-4 rounded-lg" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'var(--warning-soft)' }}>
                      <svg className="w-3 h-3" style={{ color: 'var(--warning)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Executado Por</span>
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{etapaDetalhe.executadoPor || '-'}</span>
                </div>

                <div className="p-4 rounded-lg" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'var(--info-soft)' }}>
                      <svg className="w-3 h-3" style={{ color: 'var(--info)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Ordem (D+)</span>
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{etapaDetalhe.ordem || '-'}</span>
                </div>
              </div>

              {/* Dates Section */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-4 rounded-lg" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(53,218,179,0.1)' }}>
                      <svg className="w-3 h-3" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Data Prevista</span>
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {etapaDetalhe.dataPrevista ? new Date(etapaDetalhe.dataPrevista).toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </span>
                </div>

                <div className="p-4 rounded-lg" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(245,182,77,0.1)' }}>
                      <svg className="w-3 h-3" style={{ color: 'var(--warning)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Data Real</span>
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {etapaDetalhe.dataReal ? new Date(etapaDetalhe.dataReal).toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </span>
                </div>
              </div>

              {/* Description */}
              {etapaDetalhe.descricao && (
                <div className="p-4 rounded-lg mb-5" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Descrição</span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{etapaDetalhe.descricao}</p>
                </div>
              )}

              {/* Observations */}
              <div className="p-4 rounded-lg" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Observações</span>
                </div>
                <textarea
                  value={observacaoModal}
                  onChange={(e) => setObservacaoModal(e.target.value)}
                  className="form-input w-full"
                  rows={3}
                  placeholder="Adicione observações sobre esta etapa..."
                  style={{ resize: 'vertical' }}
                />
                
                {/* Positive/Negative Point Buttons */}
                <div className="flex flex-col gap-3 mt-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Ponto:</span>
                    <button
                      type="button"
                      onClick={() => { setPontoModal(pontoModal === 'positivo' ? null : 'positivo'); if (pontoModal !== 'positivo') setPontoAlvo(null); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: pontoModal === 'positivo' ? 'rgba(53,218,179,0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${pontoModal === 'positivo' ? 'rgba(53,218,179,0.4)' : 'var(--border)'}`,
                        color: pontoModal === 'positivo' ? 'var(--accent)' : 'var(--text-muted)'
                      }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" /></svg>
                      Positivo
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPontoModal(pontoModal === 'negativo' ? null : 'negativo'); if (pontoModal !== 'negativo') setPontoAlvo(null); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: pontoModal === 'negativo' ? 'rgba(251,113,105,0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${pontoModal === 'negativo' ? 'rgba(251,113,105,0.4)' : 'var(--border)'}`,
                        color: pontoModal === 'negativo' ? 'var(--danger)' : 'var(--text-muted)'
                      }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" /></svg>
                      Negativo
                    </button>
                    {pontoModal && (
                      <button
                        type="button"
                        onClick={() => { setPontoModal(null); setPontoAlvo(null); }}
                        className="text-[10px] underline ml-1"
                        style={{ color: 'var(--text-dim)' }}
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  
                  {/* Target Selection */}
                  {pontoModal && (
                    <div className="flex items-center gap-3 ml-1 pl-3 py-2 rounded-lg" style={{ borderLeft: '2px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Atribuir para:</span>
                      {etapaDetalhe.responsavel && (
                        <button
                          type="button"
                          onClick={() => setPontoAlvo(pontoAlvo === 'responsavel' ? null : 'responsavel')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: pontoAlvo === 'responsavel' ? 'rgba(53,218,179,0.12)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${pontoAlvo === 'responsavel' ? 'rgba(53,218,179,0.35)' : 'var(--border)'}`,
                            color: pontoAlvo === 'responsavel' ? 'var(--accent)' : 'var(--text-muted)'
                          }}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          {etapaDetalhe.responsavel}
                        </button>
                      )}
                      {etapaDetalhe.executadoPor && (
                        <button
                          type="button"
                          onClick={() => setPontoAlvo(pontoAlvo === 'executor' ? null : 'executor')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: pontoAlvo === 'executor' ? 'rgba(53,218,179,0.12)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${pontoAlvo === 'executor' ? 'rgba(53,218,179,0.35)' : 'var(--border)'}`,
                            color: pontoAlvo === 'executor' ? 'var(--accent)' : 'var(--text-muted)'
                          }}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                          {etapaDetalhe.executadoPor}
                        </button>
                      )}
                      {!etapaDetalhe.responsavel && !etapaDetalhe.executadoPor && (
                        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Nenhum responsável ou executor definido</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setEtapaDetalhe(null)} className="btn btn-secondary">Cancelar</button>
              <button onClick={handleSalvarObservacao} className="btn btn-primary">Salvar Observações</button>
            </div>
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
      
      // Detecta se já é uma string ISO (já processada anteriormente) para evitar deslocamento duplo de fuso horário
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return v;
      
      // 2. Formato DD/MM/AAAA HH:mm (Estrito BR)
      const dmy = v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
      if (dmy) {
        const dia = parseInt(dmy[1], 10);
        const mes = parseInt(dmy[2], 10);
        let ano = parseInt(dmy[3], 10);
        const hora = dmy[4] ? parseInt(dmy[4], 10) : null;
        const min = dmy[5] ? parseInt(dmy[5], 10) : null;
        
        if (ano < 100) ano += 2000;

        if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
             if (hora !== null) {
               // Se tiver hora, usa o horário local para preservar o "relógio"
               const date = new Date(ano, mes - 1, dia, hora, min || 0, 0);
               if (!isNaN(date.getTime())) return date.toISOString();
             } else {
               // Se for só data, usa UTC meio-dia para evitar problemas de fuso
               const date = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
               if (!isNaN(date.getTime())) return date.toISOString();
             }
        }
      }

      // 3. Formato ISO YYYY-MM-DD HH:mm (ou similar)
      const ymd = v.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/);
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
      const v = horaVal.trim();
      // Verifica se é uma data ISO ou formato com data (ex: 1899-12-30T18:12:00)
      if (v.includes('T') || v.includes('-') || v.includes('/')) {
        const timeDate = new Date(v);
        if (!isNaN(timeDate.getTime())) {
          // Se tiver 'Z', usa UTC, senão usa local
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
      observacoes: getVal(['Observações', 'observacoes', 'Observação', 'observação', 'Observacao', 'observacao', 'OBSERVAÇÃO', 'Obs', 'obs']) || '',
      status: status,
      concluidoEm: concluidoEm || null,
      quemConcluiu: quemConcluiu || null,
      executadoPor: getVal(['EXECUTADO POR', 'Executado Por', 'Executado por', 'executado por', 'ExecutadoPor', 'executadoPor', 'Executor', 'executor', 'Quem executou', 'Realizado por', 'Executado p/', 'Executado P/', 'Executado']) || '',
      ponto: getVal(['PONTO', 'ponto', 'Ponto']) || ''
    });
  });

  return etapasValidadas;
}
