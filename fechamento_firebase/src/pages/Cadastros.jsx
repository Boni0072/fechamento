import { useState, useEffect } from 'react';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { 
  getPeriodos, criarPeriodo, atualizarPeriodo,
  getAreas, criarArea, deletarArea,
  getResponsaveis, criarResponsavel, deletarResponsavel,
  getTemplates, criarTemplate, deletarTemplate
} from '../services/database';
import { Plus, Trash2, Calendar, Users, FolderTree, FileText } from 'lucide-react';
import { checkPermission } from './permissionUtils';

export default function Cadastros() {
  const { empresaAtual } = useAuth();
  const { loading: loadingPermissoes, user: authUser } = usePermissao('cadastros');
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [tab, setTab] = useState('periodos');
  
  const [periodos, setPeriodos] = useState([]);
  const [areas, setAreas] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [templates, setTemplates] = useState([]);

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
    if (!empresaAtual) return;
    
    const unsubPeriodos = getPeriodos(empresaAtual.id, setPeriodos);
    const unsubAreas = getAreas(empresaAtual.id, setAreas);
    const unsubResp = getResponsaveis(empresaAtual.id, setResponsaveis);
    const unsubTemplates = getTemplates(empresaAtual.id, setTemplates);
    
    return () => {
      unsubPeriodos();
      unsubAreas();
      unsubResp();
      unsubTemplates();
    };
  }, [empresaAtual]);

  if (loadingPermissoes || loadingProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Carregando permissões...</p>
      </div>
    );
  }

  if (!empresaAtual) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Selecione uma empresa para gerenciar cadastros</p>
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

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center gap-4 mb-6">
        <img src="/contabil.png" alt="Logo Contábil" className="w-36 h-36 object-contain" />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cadastros</h1>
          <p className="text-slate-500">Gerencie períodos, áreas, responsáveis e templates</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200">
        <TabButton active={tab === 'periodos'} onClick={() => setTab('periodos')} icon={<Calendar className="w-4 h-4" />} label="Períodos" />
        <TabButton active={tab === 'areas'} onClick={() => setTab('areas')} icon={<FolderTree className="w-4 h-4" />} label="Áreas" />
        <TabButton active={tab === 'responsaveis'} onClick={() => setTab('responsaveis')} icon={<Users className="w-4 h-4" />} label="Responsáveis" />
        <TabButton active={tab === 'templates'} onClick={() => setTab('templates')} icon={<FileText className="w-4 h-4" />} label="Templates" />
      </div>

      {/* Conteúdo */}
      {tab === 'periodos' && <PeriodosTab empresaId={empresaAtual.id} periodos={periodos} />}
      {tab === 'areas' && <AreasTab empresaId={empresaAtual.id} areas={areas} />}
      {tab === 'responsaveis' && <ResponsaveisTab empresaId={empresaAtual.id} responsaveis={responsaveis} areas={areas} />}
      {tab === 'templates' && <TemplatesTab empresaId={empresaAtual.id} templates={templates} areas={areas} responsaveis={responsaveis} />}
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

function PeriodosTab({ empresaId, periodos }) {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(new Date().getFullYear());

  const handleCriar = async () => {
    await criarPeriodo(empresaId, { mes, ano });
  };

  const handleFechar = async (periodoId) => {
    await atualizarPeriodo(empresaId, periodoId, { status: 'fechado' });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex gap-4 mb-6">
        <select
          value={mes}
          onChange={(e) => setMes(parseInt(e.target.value))}
          className="px-3 py-2 border border-slate-200 rounded-lg"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(2000, i, 1).toLocaleString('pt-BR', { month: 'long' })}
            </option>
          ))}
        </select>
        
        <input
          type="number"
          value={ano}
          onChange={(e) => setAno(parseInt(e.target.value))}
          className="w-24 px-3 py-2 border border-slate-200 rounded-lg"
        />
        
        <button
          onClick={handleCriar}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          Criar Período
        </button>
      </div>

      <div className="space-y-2">
        {periodos.map(periodo => (
          <div key={periodo.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <span className="font-medium text-slate-800">
                {periodo.mes}/{periodo.ano}
              </span>
              <span className={`ml-3 text-xs px-2 py-1 rounded-full ${
                periodo.status === 'aberto' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {periodo.status === 'aberto' ? 'Aberto' : 'Fechado'}
              </span>
            </div>
            {periodo.status === 'aberto' && (
              <button
                onClick={() => handleFechar(periodo.id)}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Fechar período
              </button>
            )}
          </div>
        ))}
        {periodos.length === 0 && (
          <p className="text-slate-500 text-center py-8">Nenhum período cadastrado</p>
        )}
      </div>
    </div>
  );
}

function AreasTab({ empresaId, areas }) {
  const [nome, setNome] = useState('');

  const handleCriar = async () => {
    if (!nome.trim()) return;
    await criarArea(empresaId, { nome });
    setNome('');
  };

  const handleDeletar = async (areaId) => {
    if (confirm('Deseja excluir esta área?')) {
      await deletarArea(empresaId, areaId);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex gap-4 mb-6">
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome da área"
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg"
        />
        <button
          onClick={handleCriar}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      <div className="space-y-2">
        {areas.map(area => (
          <div key={area.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <span className="text-slate-800">{area.nome}</span>
            <button
              onClick={() => handleDeletar(area.id)}
              className="p-1 text-slate-400 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {areas.length === 0 && (
          <p className="text-slate-500 text-center py-8">Nenhuma área cadastrada</p>
        )}
      </div>
    </div>
  );
}

function ResponsaveisTab({ empresaId, responsaveis, areas }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [area, setArea] = useState('');

  const handleCriar = async () => {
    if (!nome.trim()) return;
    await criarResponsavel(empresaId, { nome, email, area });
    setNome('');
    setEmail('');
    setArea('');
  };

  const handleDeletar = async (respId) => {
    if (confirm('Deseja excluir este responsável?')) {
      await deletarResponsavel(empresaId, respId);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome"
          className="px-3 py-2 border border-slate-200 rounded-lg"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="px-3 py-2 border border-slate-200 rounded-lg"
        />
        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg"
        >
          <option value="">Área</option>
          {areas.map(a => (
            <option key={a.id} value={a.nome}>{a.nome}</option>
          ))}
        </select>
        <button
          onClick={handleCriar}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      <div className="space-y-2">
        {responsaveis.map(resp => (
          <div key={resp.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <span className="font-medium text-slate-800">{resp.nome}</span>
              {resp.email && <span className="text-sm text-slate-500 ml-2">{resp.email}</span>}
              {resp.area && <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded ml-2">{resp.area}</span>}
            </div>
            <button
              onClick={() => handleDeletar(resp.id)}
              className="p-1 text-slate-400 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {responsaveis.length === 0 && (
          <p className="text-slate-500 text-center py-8">Nenhum responsável cadastrado</p>
        )}
      </div>
    </div>
  );
}

function TemplatesTab({ empresaId, templates, areas, responsaveis }) {
  const [nome, setNome] = useState('');
  const [area, setArea] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [ordem, setOrdem] = useState(1);

  const handleCriar = async () => {
    if (!nome.trim()) return;
    await criarTemplate(empresaId, { nome, area, responsavel, ordem });
    setNome('');
    setArea('');
    setResponsavel('');
    setOrdem(templates.length + 1);
  };

  const handleDeletar = async (templateId) => {
    if (confirm('Deseja excluir este template?')) {
      await deletarTemplate(empresaId, templateId);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <p className="text-sm text-slate-500 mb-4">
        Templates são modelos de etapas que podem ser aplicados automaticamente a novos períodos.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome da etapa"
          className="px-3 py-2 border border-slate-200 rounded-lg"
        />
        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg"
        >
          <option value="">Área</option>
          {areas.map(a => (
            <option key={a.id} value={a.nome}>{a.nome}</option>
          ))}
        </select>
        <select
          value={responsavel}
          onChange={(e) => setResponsavel(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg"
        >
          <option value="">Responsável</option>
          {responsaveis.map(r => (
            <option key={r.id} value={r.nome}>{r.nome}</option>
          ))}
        </select>
        <input
          type="number"
          value={ordem}
          onChange={(e) => setOrdem(parseInt(e.target.value))}
          placeholder="D+"
          min="0"
          className="px-3 py-2 border border-slate-200 rounded-lg"
        />
        <button
          onClick={handleCriar}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      <div className="space-y-2">
        {templates.sort((a, b) => a.ordem - b.ordem).map(template => (
          <div key={template.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-slate-500">D+{template.ordem}</span>
              <span className="font-medium text-slate-800">{template.nome}</span>
              {template.area && <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded">{template.area}</span>}
              {template.responsavel && <span className="text-sm text-slate-500">{template.responsavel}</span>}
            </div>
            <button
              onClick={() => handleDeletar(template.id)}
              className="p-1 text-slate-400 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {templates.length === 0 && (
          <p className="text-slate-500 text-center py-8">Nenhum template cadastrado</p>
        )}
      </div>
    </div>
  );
}
