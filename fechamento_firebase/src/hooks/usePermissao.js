import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function usePermissao(pagina) {
  const { user, loading: authLoading } = useAuth();
  const [autorizado, setAutorizado] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      if (user) {
        // Normaliza lista de páginas (garante array)
        const paginasUser = Array.isArray(user.paginasAcesso) ? user.paginasAcesso : Object.values(user.paginasAcesso || {});
        
        // Verifica: Master OU Admin OU se a página está na lista (ignorando case)
        const isAuthorized = user.perfilAcesso === 'Master' || 
                             user.perfilAcesso === 'Admin' || 
                             (pagina && paginasUser.some(p => String(p).toLowerCase() === String(pagina).toLowerCase()));
                             
        setAutorizado(isAuthorized);
      } else {
        setAutorizado(false);
      }
      setLoading(false);
    }
  }, [user, authLoading, pagina]);
  
  return { loading, autorizado, user };
}