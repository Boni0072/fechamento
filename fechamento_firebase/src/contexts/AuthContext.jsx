import { createContext, useContext, useState, useEffect } from 'react';
import { auth, loginWithGoogle, logout, onAuthChange } from '../services/firebase';
import { getFirestore, doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { criarEmpresa, getEmpresas } from '../services/database';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [empresaAtual, setEmpresaAtual] = useState(null);
  const [empresas, setEmpresas] = useState([]);

  useEffect(() => {
    const unsubscribeAuth = onAuthChange((firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setEmpresaAtual(null);
        setEmpresas([]);
        setLoading(false);
      } else {
        // Firebase Auth data is the base
        const baseUser = {
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        };
        // We set a base user object first, but loading is still true
        // until we get the profile from Firestore
        setUser(baseUser); 
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Effect to get user profile from Firestore when user or company changes
  useEffect(() => {
    if (user?.id && empresaAtual?.id) {
      setLoading(true); // Start loading profile data
      const db = getFirestore();
      const userProfileRef = doc(db, 'tenants', empresaAtual.id, 'usuarios', user.id);
      
      const unsubscribeProfile = onSnapshot(userProfileRef, (snapshot) => {
        if (snapshot.exists()) {
          const profileData = snapshot.data();
          // Merge auth data with firestore profile data.
          // IMPORTANTE: Recriamos o objeto com base nos dados de Auth para garantir
          // que não sobrem permissões antigas (stale data) de outras empresas.
          setUser(prevUser => ({
            id: prevUser.id,
            email: prevUser.email,
            name: prevUser.name,
            photoURL: prevUser.photoURL,
            ...profileData, // Aqui entram as permissões/páginas do Firestore
          }));
        } else {
          // Handle case where user exists in Auth but not in the tenant's user list
          console.warn(`Perfil não encontrado. Criando perfil padrão em: tenants/${empresaAtual.id}/usuarios/${user.id}`);
          
          // Verifica se o usuário é o dono da empresa para dar permissão Master
          const isOwner = empresaAtual?.ownerId === user.id;
          const defaultRole = isOwner ? 'Master' : 'Admin';

          // Auto-correção: Cria o perfil se não existir para liberar o acesso
          setDoc(userProfileRef, {
            email: user.email,
            name: user.name,
            role: 'admin',
            perfilAcesso: defaultRole, // Define Master se for o dono, senão Admin
            paginasAcesso: ['dashboard', 'empresas', 'etapas', 'importacao', 'relatorios', 'historico', 'cadastros', 'notificacoes', 'fluxograma', 'usuarios'],
            createdAt: new Date().toISOString()
          }).catch(err => console.error("Erro ao criar perfil automático:", err));

          // Resetamos para o usuário base para remover permissões antigas se o perfil não existir
          setUser(prevUser => ({
            id: prevUser.id,
            email: prevUser.email,
            name: prevUser.name,
            photoURL: prevUser.photoURL,
          }));
        }
        setLoading(false); // Finish loading after getting profile
      }, (error) => {
        console.error("Erro ao buscar perfil do usuário no Firestore:", error);
        setLoading(false);
      });

      return () => unsubscribeProfile();
    }

  }, [user?.id, empresaAtual?.id]); // Depend on user.id and empresaAtual.id

  // Load companies when user logs in
  useEffect(() => {
    if (user?.id) {
      const db = getFirestore();
      // Primeiro, buscamos o diretório do usuário para ver quais empresas ele tem acesso
      const userDirRef = doc(db, 'users_directory', user.id);
      
      const unsubscribeDir = onSnapshot(userDirRef, async (snapshot) => {
        let empresasIds = [];
        if (snapshot.exists()) {
          const data = snapshot.data();
          empresasIds = data.empresasAcesso || (data.empresaId ? [data.empresaId] : []);
        }

        // Também buscamos empresas onde ele é o owner (legado/retrocompatibilidade)
        const unsubscribeEmpresas = getEmpresas(user.id, (empresasOwner) => {
          const ownerIds = empresasOwner.map(e => e.id);
          // Unificamos as listas de IDs (sem duplicatas)
          const allEmpresasIds = [...new Set([...empresasIds, ...ownerIds])];
          
          if (allEmpresasIds.length > 0) {
            // Buscamos os detalhes de cada empresa
            const rtdb = getFirestore();
            const promises = allEmpresasIds.map(async (id) => {
              const empDoc = await getDoc(doc(rtdb, 'tenants', id));
              if (empDoc.exists()) {
                return { id: empDoc.id, ...empDoc.data() };
              }
              // Fallback para empresas que ainda estão no Realtime Database se necessário
              // Mas aqui o sistema parece estar migrando para Firestore tenants
              return null;
            });

            Promise.all(promises).then(results => {
              const validEmpresas = results.filter(e => e !== null);
              setEmpresas(validEmpresas);
              
              const savedEmpresaId = localStorage.getItem('empresaAtualId');
              const savedEmpresa = validEmpresas.find(e => e.id === savedEmpresaId);

              if (savedEmpresa) {
                setEmpresaAtual(savedEmpresa);
              } else if (validEmpresas.length > 0) {
                setEmpresaAtual(validEmpresas[0]);
              } else {
                setEmpresaAtual(null);
                setLoading(false);
              }
            });
          } else {
            setEmpresas([]);
            setEmpresaAtual(null);
            setLoading(false);
          }
        });

        return () => unsubscribeEmpresas();
      });

      return () => unsubscribeDir();
    }
  }, [user?.id]);

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error) {
      console.error('Erro ao fazer login:', error);
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setEmpresaAtual(null);
      setEmpresas([]);
      localStorage.removeItem('empresaAtualId');
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
      throw error;
    }
  };

  const handleCriarEmpresa = async (dados) => {
    if (!user) return;
    const empresaId = await criarEmpresa(user.id, dados);
    
    // Garante que o perfil do criador seja criado no Firestore com permissão Master imediatamente
    if (empresaId) {
      const db = getFirestore();
      const userProfileRef = doc(db, 'tenants', empresaId, 'usuarios', user.id);
      await setDoc(userProfileRef, {
        email: user.email,
        name: user.name || user.email.split('@')[0],
        cargo: 'Dono',
        perfilAcesso: 'Master',
        paginasAcesso: ['dashboard', 'empresas', 'etapas', 'importacao', 'relatorios', 'historico', 'cadastros', 'notificacoes', 'fluxograma', 'usuarios'],
        createdAt: new Date().toISOString()
      }, { merge: true });

      // Adiciona a nova empresa ao diretório global de empresas do usuário
      const userDirRef = doc(db, 'users_directory', user.id);
      const userDirSnap = await getDoc(userDirRef);
      let empresasAcesso = [empresaId];
      
      if (userDirSnap.exists()) {
        const currentData = userDirSnap.data();
        const currentEmpresas = currentData.empresasAcesso || (currentData.empresaId ? [currentData.empresaId] : []);
        empresasAcesso = [...new Set([...currentEmpresas, empresaId])];
      }

      await setDoc(userDirRef, {
        empresasAcesso: empresasAcesso,
        empresaId: empresasAcesso[0] // Mantém um ID principal para compatibilidade
      }, { merge: true });
    }
    
    return empresaId;
  };

  const selecionarEmpresa = (empresa) => {
    setEmpresaAtual(empresa);
    if (empresa) {
      localStorage.setItem('empresaAtualId', empresa.id);
    } else {
      localStorage.removeItem('empresaAtualId');
    }
  };

  const value = {
    user,
    loading,
    empresaAtual,
    empresas,
    login: handleLogin,
    logout: handleLogout,
    criarEmpresa: handleCriarEmpresa,
    selecionarEmpresa
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
