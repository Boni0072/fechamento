import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDatabase, ref, onValue, remove, set, push } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { getPeriodos, getEtapas, getAreas, getResponsaveis, criarEtapa, atualizarEtapa, deletarEtapa, getStatusColor, getStatusLabel, importarEtapas } from '../services/database';
import { Plus, Edit2, Trash2, X, Check, Filter, RefreshCw, Settings } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function Etapas() {
  const navigate = useNavigate();
  const { empresaAtual } = useAuth();
  const { loading: loadingPermissoes, autorizado, user } = usePermissao('etapas');
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
    if (!empresaAtual) return;
    
    // Busca dados atualizados da empresa em tempo real (para garantir que temos o spreadsheetId mais recente)
    const db = getDatabase();
    const empresaRef = ref(db, `tenants/${empresaAtual.id}`);
    const unsubEmpresa = onValue(empresaRef, (snapshot) => {
      setEmpresaDados({ id: empresaAtual.id, ...snapshot.val() });
    });

    const unsubPeriodos = getPeriodos(empresaAtual.id, (data) => {
      setPeriodos(data);
      if (data.length > 0 && !periodoSelecionado) {
        setPeriodoSelecionado(data[0]);
      }
    });
    
    const unsubAreas = getAreas(empresaAtual.id, setAreas);
    const unsubResp = getResponsaveis(empresaAtual.id, setResponsaveis);
    
    return () => {
      unsubEmpresa();
      unsubPeriodos();
      unsubAreas();
      unsubResp();
    };
  }, [empresaAtual]);

  useEffect(() => {
    if (!empresaAtual || !periodoSelecionado) return;
    
    setLoadingData(true);
    const unsubscribe = getEtapas(empresaAtual.id, periodoSelecionado.id, (data) => {
      // Filtra duplicatas por ID para evitar erro de chaves duplicadas no React
      const uniqueData = data.filter((item, index, self) => 
        index === self.findIndex((t) => t.id === item.id)
      );
      
      // Filtra também duplicatas lógicas (mesmo nome/código) para garantir visualização limpa
      const uniqueByContent = uniqueData.filter((item, index, self) => 
        index === self.findIndex((t) => (t.codigo && t.codigo === item.codigo) || (!t.codigo && t.nome === item.nome))
      );

      setEtapas(uniqueByContent);
      setLoadingData(false);
    });
    return () => unsubscribe();
  }, [empresaAtual, periodoSelecionado]);

  if (loadingPermissoes) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Carregando permissões...</p>
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (etapaEditando) {
      await atualizarEtapa(
        empresaAtual.id,
        periodoSelecionado.id,
        etapaEditando.id,
        form,
        user.id,
        user.name
      );
    } else {
      await criarEtapa(empresaAtual.id, periodoSelecionado.id, form);
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
      ordem: etapas.length + 1,
      observacoes: ''
    });
  };

  const formatDateForInput = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().slice(0, 16);
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

  const handleDeletar = async (etapaId) => {
    if (confirm('Deseja realmente excluir esta etapa?')) {
      await deletarEtapa(empresaAtual.id, periodoSelecionado.id, etapaId);
    }
  };

  const handleDeletarTodas = async () => {
    if (etapas.length === 0) return;

    if (window.confirm(`ATENÇÃO: Tem certeza que deseja excluir TODAS as ${etapas.length} etapas deste período? Esta ação é irreversível.`)) {
      setSyncing(true);
      
      const pId = periodoSelecionado?.id;
      if (!pId) {
        alert("Erro: Período inválido ou não selecionado.");
        setSyncing(false);
        return;
      }

      try {
        const db = getDatabase();
        // Remove o nó "etapas" inteiro dentro do período selecionado
        // Isso é muito mais rápido e garante que tudo seja apagado, mesmo itens com IDs problemáticos
        const etapasRef = ref(db, `tenants/${empresaAtual.id}/periodos/${pId}/etapas`);
        await remove(etapasRef);
        setEtapas([]); // Limpa a lista visualmente de imediato para feedback instantâneo
        alert("Todas as etapas foram excluídas com sucesso.");
      } catch (error) {
        console.error("Erro ao excluir todas as etapas:", error);
        alert("Ocorreu um erro ao tentar excluir todas as etapas: " + error.message);
      } finally {
        setSyncing(false);
      }
    }
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
  };

  const etapasFiltradas = etapas.filter(etapa => {
    if (filtros.area && etapa.area !== filtros.area) return false;
    if (filtros.responsavel && etapa.responsavel !== filtros.responsavel) return false;
    if (filtros.status && etapa.status !== filtros.status) return false;
    return true;
  });

  if (!empresaAtual) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Selecione uma empresa para gerenciar etapas</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <img src="/contabil.png" alt="Logo Contábil" className="w-36 h-36 object-contain" />
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
            onClick={handleSync}
            disabled={syncing || loadingData}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
              !(empresaDados || empresaAtual)?.spreadsheetId 
                ? 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200' 
                : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
            } ${syncing || loadingData ? 'opacity-50 cursor-wait' : ''}`}
            title={!(empresaDados || empresaAtual)?.spreadsheetId ? "Clique para saber como configurar" : "Atualizar dados da planilha Google"}
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>

          <button
            onClick={() => navigate('/empresas')}
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
            title="Configurações da Empresa"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={handleDeletarTodas}
            disabled={etapas.length === 0 || syncing}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Excluir todas as etapas deste período"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Excluir Todas</span>
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
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            Nova Etapa
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Área</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Responsável</th>
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
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
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
                  <td className="px-4 py-3 text-sm text-slate-600">{etapa.area || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{etapa.responsavel || '-'}</td>
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
                        onClick={() => handleDeletar(etapa.id)}
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
const processData = (data, existingSteps = []) => {
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
      codigo: (codigo !== undefined && codigo !== null) ? codigo : '',
      observacoes: getVal(['Observações', 'observacoes']) || '',
      status: status,
      concluidoEm: concluidoEm,
      quemConcluiu: quemConcluiu
    });
  });

  return etapasValidadas;
};
