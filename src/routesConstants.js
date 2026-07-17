import {
  LayoutDashboard,
  GitMerge,
  ListChecks,
  BarChart3,
  Landmark,
  Bell,
  Upload,
  Building2,
  Users,
  FileClock,
  Settings
} from 'lucide-react';

export const routesMetadata = [
  { path: "/", requiredPage: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/fluxograma", requiredPage: "fluxograma", label: "Fluxograma", icon: GitMerge },
  { path: "/etapas", requiredPage: "etapas", label: "Etapas", icon: ListChecks },
  { path: "/relatorios", requiredPage: "relatorios", label: "Relatórios", icon: BarChart3 },
  { path: "/imobilizado", requiredPage: "imobilizado", label: "Imobilizado", icon: Landmark },
  { path: "/notificacoes", requiredPage: "notificacoes", label: "Notificações", icon: Bell },
  { path: "/importacao", requiredPage: "importacao", label: "Importação", icon: Upload },
  { path: "/empresas", requiredPage: "empresas", label: "Empresas", icon: Building2 },
  { path: "/usuarios", requiredPage: "usuarios", label: "Usuários", icon: Users },
  { path: "/historico", requiredPage: "historico", label: "Histórico", icon: FileClock },
  { path: "/cadastros", requiredPage: "cadastros", label: "Cadastros", icon: Settings },
];