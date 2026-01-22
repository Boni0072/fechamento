import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PerfilUsuario from './pages/PerfilUsuario.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Fluxograma from './pages/Fluxograma.jsx';
import Etapas from './pages/Etapas.jsx';
import Relatorios from './pages/Relatorios.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Historico from './pages/Historico.jsx';
import Empresas from './pages/Empresas.jsx';
import Cadastros from './pages/Cadastros.jsx';
import Notificacoes from './pages/Notificacoes.jsx';
import Importacao from './pages/Importacao.jsx';
import Login from './pages/Login.jsx';
import { useAuth } from './contexts/AuthContext';
import { usePermissao } from './hooks/usePermissao';

// Componente para capturar erros e mostrar na tela em vez de tela branca
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Erro capturado pelo Boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-50 text-red-800 font-mono">
          <h1 className="text-2xl font-bold mb-4">Algo deu errado (Tela Branca)</h1>
          <p className="mb-2">O erro abaixo impediu o carregamento da página:</p>
          <pre className="bg-white p-4 rounded border border-red-200 overflow-auto">
            {this.state.error && this.state.error.toString()}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const RotaProtegida = ({ children, requiredPage }) => {
  const auth = useAuth();
  const { loading: permissaoLoading, autorizado } = usePermissao(requiredPage);
  
  if (!auth) {
    console.error("Erro Crítico: AuthContext não encontrado. Verifique se o AuthProvider está envolvendo o App no main.jsx.");
    return <Navigate to="/login" replace />;
  }

  const { user, loading } = auth;

  if (loading || (requiredPage && permissaoLoading)) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    console.warn("Acesso negado: Usuário não detectado. Redirecionando para login.");
    return <Navigate to="/login" replace />;
  }

  // Bloqueio desativado para liberar acesso geral
  // if (requiredPage && !autorizado) {
  //   console.warn(`Acesso negado: Usuário não autorizado para a página ${requiredPage}. Redirecionando para o dashboard.`);
  //   return <Navigate to="/" replace />;
  // }

  return children;
};

export const routesConfig = [
  { path: "/", element: <Dashboard />, requiredPage: null, label: "Dashboard" },
  { path: "/perfil", element: <PerfilUsuario />, requiredPage: "PerfilUsuario", label: "Perfil" },
  { path: "/usuarios", element: <Usuarios />, requiredPage: "Usuarios", label: "Usuários" },
  { path: "/fluxograma", element: <Fluxograma />, requiredPage: "Fluxograma", label: "Fluxograma" },
  { path: "/etapas", element: <Etapas />, requiredPage: "Etapas", label: "Etapas" },
  { path: "/relatorios", element: <Relatorios />, requiredPage: "Relatorios", label: "Relatórios" },
  { path: "/historico", element: <Historico />, requiredPage: "Historico", label: "Histórico" },
  { path: "/empresas", element: <Empresas />, requiredPage: "Empresas", label: "Empresas" },
  { path: "/cadastros", element: <Cadastros />, requiredPage: "Cadastros", label: "Cadastros" },
  { path: "/notificacoes", element: <Notificacoes />, requiredPage: "Notificacoes", label: "Notificações" },
  { path: "/importacao", element: <Importacao />, requiredPage: "Importacao", label: "Importação" },
];

const App = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RotaProtegida><Layout /></RotaProtegida>}>
            {routesConfig.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={
                  route.requiredPage ? (
                    <RotaProtegida requiredPage={route.requiredPage}>
                      {route.element}
                    </RotaProtegida>
                  ) : (
                    route.element
                  )
                }
              />
            ))}
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;