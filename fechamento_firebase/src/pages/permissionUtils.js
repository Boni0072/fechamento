export const checkPermission = (u, pageId) => {
  if (!u) return false;

  // Admin e Master têm acesso a tudo
  // Verifica perfilAcesso, cargo ou role para compatibilidade
  const userRole = u.perfilAcesso || u.cargo || u.role;
  // Verificação mais robusta e case-insensitive para admins e donos
  if (userRole && ['admin', 'master', 'dono'].includes(String(userRole).toLowerCase())) return true;

  // Se não for admin, verifica as páginas de acesso (suporta paginasAcesso ou permissoes)
  const userAccess = u.paginasAcesso || u.permissoes;

  // Se 'paginasAcesso' não existir, for nulo ou indefinido, nega o acesso.
  if (!userAccess) return false;

  let list = [];
  if (Array.isArray(userAccess)) {
    list = userAccess;
  } else if (typeof userAccess === 'string') {
    // Garante que mesmo uma string vazia não quebre a lógica
    list = userAccess.split(',').map(p => p.trim()).filter(p => p);
  } else if (typeof userAccess === 'object' && userAccess !== null) {
    // Suporta tanto array-like object {0: 'page'} quanto map {page: true}
    const values = Object.values(userAccess);
    if (values.some(v => typeof v === 'string')) {
      list = values;
    } else {
      list = Object.keys(userAccess);
    }
  }

  // A verificação final garante que cada item da lista seja uma string antes de comparar
  return list.some(p => p && String(p).trim().toLowerCase() === String(pageId).toLowerCase());
};