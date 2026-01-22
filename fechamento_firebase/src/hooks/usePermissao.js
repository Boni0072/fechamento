import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function usePermissao(pagina) {
  const { user, loading: authLoading } = useAuth();
  const [autorizado, setAutorizado] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      if (user) {
        const isAuthorized = user.perfilAcesso === 'Admin' || 
                             (pagina && Object.values(user.paginasAcesso || {}).includes(pagina));
        setAutorizado(isAuthorized);
      } else {
        setAutorizado(false);
      }
      setLoading(false);
    }
  }, [user, authLoading, pagina]);
  
  return { loading, autorizado, user };
}