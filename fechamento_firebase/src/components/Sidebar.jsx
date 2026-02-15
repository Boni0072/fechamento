import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  GitBranch, 
  ListChecks, 
  FileText, 
  Bell, 
  History, 
  Upload, 
  Settings,
  Building2,
  Users,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { getDatabase, ref, onValue } from 'firebase/database';
import { usePermissao } from '../hooks/usePermissao';
import { routesMetadata } from '../routesConstants';

const menuItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/fluxograma', icon: GitBranch, label: 'Fluxograma' },
  { path: '/etapas', icon: ListChecks, label: 'Etapas' },
  { path: '/relatorios', icon: FileText, label: 'Relatórios' },
  { path: '/notificacoes', icon: Bell, label: 'Notificações' },
  { path: '/historico', icon: History, label: 'Histórico' },
  { path: '/importacao', icon: Upload, label: 'Importação' },
  { path: '/cadastros', icon: Settings, label: 'Cadastros' },
  { path: '/empresas', icon: Building2, label: 'Empresas' },
  { path: '/usuarios', icon: Users, label: 'Usuários' },
];

const MenuItem = ({ item, collapsed }) => {
  const meta = routesMetadata.find(r => r.path === item.path);
  const pageId = meta?.requiredPage;
  const { loading, autorizado } = usePermissao(pageId);

  return (
    <li>
      <NavLink
        to={item.path}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
            isActive
              ? 'bg-orange-600 text-white'
              : 'text-slate-300 hover:bg-gray-400 hover:text-white'
          } ${collapsed ? 'justify-center' : ''}`
        }
        title={collapsed ? item.label : ''}
      >
        <item.icon className="w-5 h-5 flex-shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </NavLink>
    </li>
  );
};

export default function Sidebar() {
  const { user, logout, empresaAtual, empresas, selecionarEmpresa } = useAuth();
  const [showEmpresas, setShowEmpresas] = useState(false);
  const [dbUser, setDbUser] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setDbUser(null);
    setImgError(false);
    if (user?.uid && empresaAtual?.id) {
      const db = getDatabase();
      const userRef = ref(db, `tenants/${empresaAtual.id}/usuarios/${user.uid}`);
      const unsubscribe = onValue(userRef, (snapshot) => {
        setDbUser(snapshot.val());
      });
      return () => unsubscribe();
    }
  }, [user?.uid, empresaAtual?.id]);

  const nomeExibicao = dbUser?.nome || user?.displayName || user?.email || 'Usuário';
  const avatarUrl = dbUser?.avatar || user?.photoURL;

  const handleSelecao = (empresa) => {
    // Ao passar null, o AuthContext limpa a empresa atual, 
    // o que ativa o modo 'viewAllCompanies' no Dashboard.
    selecionarEmpresa(empresa);
    setShowEmpresas(false);
  };

  return (
    <aside className={`${collapsed ? 'w-20' : 'w-64'} bg-gray-900 text-white min-h-screen flex flex-col transition-all duration-300`}>
      {/* Logo & Toggle */}
      <div className="p-4 border-b border-gray-800 flex flex-col items-center relative">
        <img src="/hunterDouglas.png" alt="Logo Contábil" className="w-36 h-36 object-contain" />
        
        {!collapsed && <h1 className="text-lg font-bold text-white truncate mt-2">Fechamento Contábil</h1>}
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-gray-800 text-slate-400 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Seletor de Empresa */}
      <div className="p-4 border-b border-gray-800">
        {collapsed ? (
          <div className="flex justify-center">
            <button 
              onClick={() => setCollapsed(false)}
              className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-gray-700 transition-colors"
              title={empresaAtual ? empresaAtual.nome : 'Consolidado'}
            >
              <Building2 className={`w-5 h-5 ${!empresaAtual ? 'text-orange-500' : 'text-white'}`} />
            </button>
          </div>
        ) : (
          <div className="relative">
            <label className="text-xs text-slate-500 mb-1 block px-1">Visualização:</label>
            <button
              onClick={() => setShowEmpresas(!showEmpresas)}
              className={`w-full flex items-center justify-between text-sm rounded-lg p-2 transition-colors border ${
                !empresaAtual 
                  ? 'bg-orange-600/10 border-orange-600/50 text-orange-500' 
                  : 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Building2 className="w-4 h-4 flex-shrink-0" />
                <span className="truncate font-medium">
                  {empresaAtual ? empresaAtual.nome : '📊 Consolidado (Geral)'}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${showEmpresas ? 'rotate-180' : ''}`} />
            </button>

            {showEmpresas && (
              <div className="absolute z-50 mt-1 w-full bg-gray-800 rounded-lg shadow-xl border border-gray-700 overflow-hidden max-h-60 overflow-y-auto">
                <button
                  onClick={() => handleSelecao(null)}
                  className={`w-full text-left p-2.5 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2 ${!empresaAtual ? 'bg-orange-600 text-white' : 'text-slate-300'}`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Consolidado (Todas)</span>
                </button>
                
                <div className="border-t border-gray-700 my-1"></div>

                {empresas && empresas.length > 0 ? (
                  empresas.map(empresa => (
                    <button
                      key={empresa?.id}
                      onClick={() => handleSelecao(empresa)}
                      className={`w-full text-left p-2.5 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2 ${empresaAtual && empresa.id === empresaAtual.id ? 'bg-orange-600 text-white' : 'text-slate-300'}`}
                    >
                      <Building2 className="w-4 h-4" />
                      <span className="truncate">{empresa.nome}</span>
                    </button>
                  ))
                ) : (
                  <div className="p-2 text-xs text-slate-500 text-center italic">Nenhuma empresa encontrada</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Menu */}
      <nav className="flex-1 p-4 overflow-y-auto overflow-x-hidden">
        <ul className="space-y-1">
          {menuItems.map(item => (
            <MenuItem key={item.path} item={item} collapsed={collapsed} />
          ))}
        </ul>
      </nav>

      {/* Usuário */}
      <div className="p-4 border-t border-gray-800">
        {collapsed ? (
          <div className="flex flex-col items-center gap-4">
            <div title={nomeExibicao}>
              {avatarUrl && !imgError ? (
                <img 
                  src={avatarUrl} 
                  alt={nomeExibicao} 
                  className="w-8 h-8 rounded-full object-cover" 
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-white font-bold text-xs">
                  {nomeExibicao.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <button
              onClick={logout}
              title="Sair"
              className="p-2 text-slate-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3">
              {avatarUrl && !imgError ? (
                <img 
                  src={avatarUrl} 
                  alt={nomeExibicao} 
                  className="w-10 h-10 rounded-full object-cover" 
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-orange-600 flex items-center justify-center text-white font-bold">
                  {nomeExibicao.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-white">{nomeExibicao}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
