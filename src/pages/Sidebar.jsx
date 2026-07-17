import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  GitMerge,
  ListChecks,
  BarChart3,
  Archive,
  Bell,
  Upload,
  Building2,
  Users,
  LogOut,
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const paginas = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/fluxograma', label: 'Fluxograma', icon: GitMerge },
  { path: '/etapas', label: 'Etapas', icon: ListChecks },
  { path: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { path: '/imobilizado', label: 'Imobilizado', icon: Archive },
  { path: '/notificacoes', label: 'Notificações', icon: Bell },
  { path: '/importacao', label: 'Importação', icon: Upload },
  { path: '/empresas', label: 'Empresas', icon: Building2 },
  { path: '/usuarios', label: 'Usuários', icon: Users },
];

export default function Sidebar() {
  const { user, empresaAtual, empresas, selecionarEmpresa, logout } = useAuth();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Estilos que você pode personalizar
  const linkStyle = "flex items-center p-[14px] rounded-xl text-sm font-medium transition-all duration-200 ease-in-out h-12";
  const activeLinkStyle = "bg-[linear-gradient(135deg,rgba(53,218,179,1),rgba(38,184,224,1))] text-[#04120e] shadow-[0_0_18px_rgba(53,218,179,0.25)]";
  const inactiveLinkStyle = "text-[var(--text)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]";

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64'} flex flex-col p-4 bg-[var(--sidebar)] border border-[var(--border)] shadow-lg transition-all duration-200`}>
      {/* 1. Cabeçalho */}
      <div className="relative flex flex-col items-center text-center py-8">
        <div className={`${isCollapsed ? 'w-20 h-20' : 'w-36 h-36'} rounded-[44px] bg-[var(--surface)] flex items-center justify-center overflow-hidden shrink-0 shadow-sm border border-[var(--border)] mb-4 transition-all duration-200`}>
          {empresaAtual?.appearance?.logo ?
            (<img src={empresaAtual.appearance.logo} alt="Logo" className="w-full h-full object-cover transition-all duration-200" />) :
            (<Building2 className={`${isCollapsed ? 'w-10 h-10' : 'w-20 h-20'} text-[var(--text-muted)] transition-all duration-200`} />)
          }
        </div>
        <h1 className={`font-semibold text-[var(--text)] transition-all duration-200 ${isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>Fechamento Contábil</h1>
        <button
          type="button"
          onClick={() => setIsCollapsed(prev => !prev)}
          className="absolute right-4 top-4 p-2 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors"
          title={isCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* 2. Área de Visualização */}
      <div className={`${isCollapsed ? 'hidden' : 'px-2 mb-4'}`}>
        <label className="text-xs font-semibold text-[var(--text-muted)] opacity-80 tracking-wider px-2">VISUALIZAÇÃO</label>
        <select
          value={empresaAtual?.id || 'todos'}
          onChange={(e) => {
            const id = e.target.value;
            if (id === 'todos') {
              selecionarEmpresa(null);
            } else {
              const emp = empresas.find(emp => emp.id === id);
              if (emp) selecionarEmpresa(emp);
            }
          }}
          className="w-full mt-2 !py-2.5 !px-3 text-sm border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)] focus:border-[var(--accent)] focus:ring-[var(--accent-soft)]"
        >
          <option value="todos">Visão Consolidada</option>
          {empresas.map(emp => (
            <option key={emp.id} value={emp.id} className="bg-[var(--surface)] text-[var(--text)]">{emp.nome}</option>
          ))}
        </select>
        <hr className="mt-6 border-[var(--border)]" />
      </div>

      {/* 3. Menu Principal */}
      <nav className="flex-1 space-y-2 px-2">
        {paginas.map((pagina) => {
          const Icon = pagina.icon;
          const isActive = location.pathname === pagina.path;
          return (
            <NavLink
              key={pagina.path}
              to={pagina.path}
              className={`${linkStyle} ${isActive ? activeLinkStyle : inactiveLinkStyle} group ${isCollapsed ? 'justify-center' : ''}`}
            >
              <div className="w-10 flex-shrink-0 flex items-center justify-center">
                <Icon className={`w-5 h-5 transition-colors duration-200 ${isActive ? 'text-white' : 'text-[var(--text-muted)]'}`} />
              </div>
              <span className={`transition-colors duration-200 ${isActive ? 'text-white' : 'text-[var(--text)]'} ${isCollapsed ? 'hidden' : 'inline-block'}`}>{pagina.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* 4. Rodapé */}
      <div className="mt-auto pt-6 px-2">
        <div className={`flex items-center justify-between p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] ${isCollapsed ? 'justify-center' : ''}`}>
          <div className={`flex items-center gap-3 overflow-hidden ${isCollapsed ? 'justify-center' : ''}`}>
            <div className="w-9 h-9 rounded-full bg-[var(--surface-2)] flex items-center justify-center overflow-hidden shrink-0">
              {user?.avatar ? (
                <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <Users className="w-5 h-5 text-[var(--text-muted)]" />
              )}
            </div>
            <div className={`text-sm overflow-hidden transition-all duration-200 ${isCollapsed ? 'hidden' : ''}`}>
              <p className="font-semibold text-[var(--text)] truncate">{user?.nome || 'Usuário'}</p>
              <p className="text-xs text-[var(--text-muted)] truncate">{user?.perfilAcesso || 'Perfil'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NavLink to="/perfil" title="Configurações do Perfil" className="p-2 text-[var(--text-muted)] hover:bg-[var(--surface-2)] rounded-full transition-colors">
              <Settings className="w-4 h-4" />
            </NavLink>
            <button onClick={logout} title="Sair do sistema" className="p-2 text-[var(--text-muted)] hover:bg-[var(--surface-2)] rounded-full transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
