import React from 'react';
import { routesMetadata } from './routesConstants';
import Dashboard from './pages/Dashboard.jsx';
import PerfilUsuario from './pages/PerfilUsuario.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Fluxograma from './pages/Fluxograma.jsx';
import Etapas from './pages/Etapas.jsx';
import Relatorios from './pages/Relatorios.jsx';
import Historico from './pages/Historico.jsx';
import Empresas from './pages/Empresas.jsx';
import Cadastros from './pages/Cadastros.jsx';
import Notificacoes from './pages/Notificacoes.jsx';
import Importacao from './pages/Importacao.jsx';

const components = {
  "/": <Dashboard />,
  "/perfil": <PerfilUsuario />,
  "/usuarios": <Usuarios />,
  "/fluxograma": <Fluxograma />,
  "/etapas": <Etapas />,
  "/relatorios": <Relatorios />,
  "/historico": <Historico />,
  "/empresas": <Empresas />,
  "/cadastros": <Cadastros />,
  "/notificacoes": <Notificacoes />,
  "/importacao": <Importacao />,
};

export const routesConfig = routesMetadata.map(route => ({
  ...route,
  element: components[route.path]
}));