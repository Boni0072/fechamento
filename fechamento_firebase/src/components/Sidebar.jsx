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
              ? 'bg-primary-600 text-white'
              : 'text-slate-300 hover:bg-slate-700'
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

  return (
    <aside className={`${collapsed ? 'w-20' : 'w-64'} bg-slate-800 text-white min-h-screen flex flex-col transition-all duration-300`}>
      {/* Logo & Toggle */}
      <div className={`p-4 border-b border-slate-700 flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && <h1 className="text-lg font-bold text-primary-400 truncate">Fechamento Contabíl</h1>}
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Seletor de Empresa */}
      {empresaAtual && (
        <div className="p-4 border-b border-slate-700">
          {collapsed ? (
            <div className="flex justify-center" title={empresaAtual.nome}>
              <button 
                onClick={() => setCollapsed(false)}
                className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center hover:bg-slate-600 transition-colors"
              >
                <Building2 className="w-5 h-5 text-slate-300" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowEmpresas(!showEmpresas)}
              className="w-full flex items-center justify-between text-sm bg-slate-700 rounded-lg p-2 hover:bg-slate-600 transition-colors"
            >
              <span className="truncate">{empresaAtual.nome}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showEmpresas ? 'rotate-180' : ''}`} />
            </button>
          )}
          
          {!collapsed && showEmpresas && empresas.length > 1 && (
            <div className="mt-2 bg-slate-700 rounded-lg overflow-hidden">
              {empresas.map(empresa => (
                <button
                  key={empresa.id}
                  onClick={() => {
                    selecionarEmpresa(empresa);
                    setShowEmpresas(false);
                  }}
                  className={`w-full text-left p-2 text-sm hover:bg-slate-600 transition-colors ${
                    empresa.id === empresaAtual.id ? 'bg-slate-600' : ''
                  }`}
                >
                  {empresa.nome}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Menu */}
      <nav className="flex-1 p-4 overflow-y-auto overflow-x-hidden">
        <ul className="space-y-1">
          {menuItems.map(item => (
            <MenuItem key={item.path} item={item} collapsed={collapsed} />
          ))}
        </ul>
      </nav>

      {/* Usuário */}
      <div className="p-4 border-t border-slate-700">
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
                <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white font-bold text-xs">
                  {nomeExibicao.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <button
              onClick={logout}
              title="Sair"
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
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
                <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-bold">
                  {nomeExibicao.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{nomeExibicao}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
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
