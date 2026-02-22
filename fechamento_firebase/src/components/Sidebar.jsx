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
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
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

const MenuItem = ({ item, collapsed, theme }) => {
  const meta = routesMetadata.find(r => r.path === item.path);
  let pageId = meta?.requiredPage;

  // Fallback: se não encontrar metadata, tenta deduzir pelo path (ex: '/etapas' -> 'etapas')
  if (!pageId) {
    pageId = item.path === '/' ? 'dashboard' : item.path.replace('/', '').toLowerCase();
  }

  const { loading, autorizado } = usePermissao(pageId);

  if (loading) return null;
  if (!autorizado) return null;

  return (
    <li>
      <NavLink
        to={item.path}
        style={({ isActive }) => ({
          backgroundColor: isActive ? theme.activeItem : 'transparent',
          color: isActive ? '#ffffff' : theme.text,
        })}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
            isActive
              ? 'shadow-sm'
              : 'hover:bg-white/10'
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
  const [collapsed, setCollapsed] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [logo, setLogo] = useState('/hunterDouglas.png');
  const [theme, setTheme] = useState({
    bg: '#111827',
    text: '#cbd5e1', // slate-300
    activeItem: '#ea580c' // orange-600
  });

  // Listener para Aparência (Logo e Cores)
  useEffect(() => {
    const db = getFirestore();
    let unsubscribe = () => {};

    if (empresaAtual?.id) {
      // Aparência da Empresa
      unsubscribe = onSnapshot(doc(db, 'tenants', empresaAtual.id), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.appearance) {
            setLogo(data.appearance.logo || '/hunterDouglas.png');
            setTheme({
              bg: data.appearance.sidebarColor || '#111827',
              text: data.appearance.sidebarTextColor || '#cbd5e1',
              activeItem: data.appearance.primaryColor || '#ea580c'
            });
          } else {
             setLogo('/hunterDouglas.png');
             setTheme({ bg: '#111827', text: '#cbd5e1', activeItem: '#ea580c' });
          }
        }
      });
    } else {
       // Aparência Global (Consolidado)
       unsubscribe = onSnapshot(doc(db, 'system_settings', 'global_appearance'), (docSnap) => {
         if (docSnap.exists()) {
            const data = docSnap.data();
            setLogo(data.logo || '/hunterDouglas.png');
            setTheme({
              bg: data.sidebarColor || '#111827',
              text: data.sidebarTextColor || '#cbd5e1',
              activeItem: data.primaryColor || '#ea580c'
            });
         } else {
            setLogo('/hunterDouglas.png');
            setTheme({ bg: '#111827', text: '#cbd5e1', activeItem: '#ea580c' });
         }
       });
    }
    return () => unsubscribe();
  }, [empresaAtual?.id]);

  const nomeExibicao = user?.nome || user?.name || user?.displayName || user?.email || 'Usuário';
  const avatarUrl = user?.avatar || user?.photoURL;

  const handleSelecao = (empresa) => {
    // Ao passar null, o AuthContext limpa a empresa atual, 
    // o que ativa o modo 'viewAllCompanies' no Dashboard.
    selecionarEmpresa(empresa);
    setShowEmpresas(false);
  };

  return (
    <aside 
      className={`${collapsed ? 'w-20' : 'w-64'} min-h-screen flex flex-col transition-all duration-300`}
      style={{ backgroundColor: theme.bg, color: theme.text }}
    >
      {/* Logo & Toggle */}
      <div className="p-4 border-b border-white/10 flex flex-col items-center relative">
        <img src={logo} alt="Logo Contábil" className="w-36 h-36 object-contain" />
        
        {!collapsed && <h1 className="text-lg font-bold truncate mt-2" style={{ color: theme.text }}>Fechamento Contábil</h1>}
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-gray-800 text-slate-400 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Seletor de Empresa */}
      <div className="p-4 border-b border-white/10">
        {collapsed ? (
          <div className="flex justify-center">
            <button 
              onClick={() => setCollapsed(false)}
              className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
              title={empresaAtual ? empresaAtual.nome : 'Consolidado'}
            >
              <Building2 className="w-5 h-5" style={{ color: !empresaAtual ? theme.activeItem : theme.text }} />
            </button>
          </div>
        ) : (
          <div className="relative">
            <label className="text-xs text-slate-500 mb-1 block px-1">Visualização:</label>
            <button
              onClick={() => setShowEmpresas(!showEmpresas)}
              style={{ borderColor: !empresaAtual ? theme.activeItem : 'rgba(255,255,255,0.1)' }}
              className={`w-full flex items-center justify-between text-sm rounded-lg p-2 transition-colors border bg-white/5 hover:bg-white/10 ${
                !empresaAtual 
                  ? '' 
                  : ''
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
                  className="w-full text-left p-2.5 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
                  style={{ 
                    backgroundColor: !empresaAtual ? theme.activeItem : 'transparent',
                    color: !empresaAtual ? '#fff' : '#cbd5e1'
                  }}
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
                      className="w-full text-left p-2.5 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
                      style={{ 
                        backgroundColor: empresaAtual && empresa.id === empresaAtual.id ? theme.activeItem : 'transparent',
                        color: empresaAtual && empresa.id === empresaAtual.id ? '#fff' : '#cbd5e1'
                      }}
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
            <MenuItem key={item.path} item={item} collapsed={collapsed} theme={theme} />
          ))}
        </ul>
      </nav>

      {/* Usuário */}
      <div className="p-4 border-t border-white/10">
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
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: theme.activeItem }}>
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
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: theme.activeItem }}>
                  {nomeExibicao.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: theme.text }}>{nomeExibicao}</p>
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
