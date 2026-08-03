import { createContext, useContext, useState, useEffect } from 'react';
import { auth, logout, onAuthChange, firestore, signInWithEmailAndPassword } from '../firebase';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { criarEmpresa, getEmpresas } from '../services/database';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [empresaAtual, setEmpresaAtual] = useState(null);
  const [empresas, setEmpresas] = useState([]);

  useEffect(() => {
    const unsubscribeAuth = onAuthChange(async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          setEmpresaAtual(null);
          setEmpresas([]);
          localStorage.removeItem('empresaAtualId');
          localStorage.removeItem('visaoConsolidada');
          setLoading(false);
          return;
        }

        setLoading(true);
        let currentUserData = {
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        };

        const userId = firebaseUser.uid;

        // 1. Get all company IDs associated with the user
        const userDirRef = doc(firestore, 'users_directory', userId);
        let empresasIds = [];

        try {
          if (!auth.currentUser) {
            console.warn("[Auth] Firestore READ abortado: currentUser ainda é null");
          }
          
          console.log(`[Firestore READ] Caminho: users_directory/${userId} | User: ${firebaseUser.email}`);
          const userDirSnap = await getDoc(userDirRef);
          
          if (userDirSnap.exists()) {
              const data = userDirSnap.data();
              empresasIds = data.empresasAcesso || (data.empresaId ? [data.empresaId] : []);
          } else {
              console.warn(`[Auth] Documento users_directory/${userId} não encontrado. Criando padrão...`);
              console.log(`[Firestore WRITE] Caminho: users_directory/${userId}`);
              const defaultDir = {
                email: firebaseUser.email,
                empresasAcesso: [],
                perfilAcesso: 'Usuário',
                createdAt: new Date().toISOString()
              };
              await setDoc(userDirRef, defaultDir);
          }
        } catch (dirError) {
          console.error("Firestore Error [users_directory]", {
            code: dirError.code,
            message: dirError.message,
            path: `users_directory/${userId}`,
            authenticatedUID: auth.currentUser?.uid
          });
          
          setUser(currentUserData);
          setEmpresas([]);
          setLoading(false);
          return;
        }

        if (empresasIds.length === 0) {
          setEmpresas([]);
          setEmpresaAtual(null);
          setUser(currentUserData);
          setLoading(false);
          return;
        }

        // 2. Fetch details for all companies - handling permission errors individually
        const validEmpresas = [];
        for (const id of empresasIds) {
          try {
            console.log(`[Firestore READ] Caminho: tenants/${id}`);
            const companyDoc = await getDoc(doc(firestore, 'tenants', id));
            if (companyDoc.exists()) {
              validEmpresas.push({ id: companyDoc.id, ...companyDoc.data() });
            }
          } catch (err) {
            console.error("Firestore Error [tenants]", {
              code: err.code,
              message: err.message,
              path: `tenants/${id}`
            });
          }
        }
        setEmpresas(validEmpresas);

        // 3. Determine the company to load
        const savedEmpresaId = localStorage.getItem('empresaAtualId');
        // Se o usuário estava na "Visão Consolidada", mantém a visão consolidada após recarregar
        const isConsolidatedView = localStorage.getItem('visaoConsolidada') === 'true';
        let companyToLoad = null;
        
        if (!isConsolidatedView) {
          companyToLoad = validEmpresas.find(e => e.id === savedEmpresaId) || validEmpresas[0] || null;
        }
        
        if (!companyToLoad) {
          setEmpresaAtual(null);
          // Se está na visão consolidada, carrega o perfil base com permissões do diretório global
          if (isConsolidatedView) {
            try {
              const userDirSnapFresh = await getDoc(userDirRef);
              if (userDirSnapFresh.exists()) {
                const dirData = userDirSnapFresh.data();
                currentUserData = {
                  ...currentUserData,
                  perfilAcesso: dirData.perfilAcesso || 'Master',
                  paginasAcesso: dirData.paginasAcesso || ['dashboard', 'empresas', 'etapas', 'importacao', 'relatorios', 'historico', 'cadastros', 'notificacoes', 'fluxograma', 'usuarios'],
                };
              }
            } catch (e) {
              console.error("Erro ao carregar permissões globais:", e);
            }
          }
          setUser(currentUserData);
          setLoading(false);
          return;
        }

        // 4. Fetch the user's profile for that specific company
        const userProfileRef = doc(firestore, 'tenants', companyToLoad.id, 'usuarios', userId);
        console.log(`[Firestore READ] Caminho: tenants/${companyToLoad.id}/usuarios/${userId}`);
        const profileSnap = await getDoc(userProfileRef);

        if (profileSnap.exists()) {
          currentUserData = { ...currentUserData, ...profileSnap.data() };
        } else {
          console.warn(`Perfil não encontrado para ${userId}. Criando perfil padrão.`);
          const isOwner = companyToLoad?.ownerId === userId;
          const defaultRole = isOwner ? 'Master' : 'Admin';
          const defaultProfile = {
            email: currentUserData.email,
            name: currentUserData.name,
            role: 'admin',
            perfilAcesso: defaultRole,
            paginasAcesso: ['dashboard', 'empresas', 'etapas', 'importacao', 'relatorios', 'historico', 'cadastros', 'notificacoes', 'fluxograma', 'usuarios'],
            createdAt: new Date().toISOString()
          };
          console.log(`[Firestore WRITE] Caminho: tenants/${companyToLoad.id}/usuarios/${userId}`);
          await setDoc(userProfileRef, defaultProfile);
          currentUserData = { ...currentUserData, ...defaultProfile };
        }

        setUser(currentUserData);
        // Define a empresa apenas após garantir que o usuário e perfil estão carregados
        setEmpresaAtual(companyToLoad);

      } catch (error) {
        console.error("Erro ao carregar dados de autenticação:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const handleLoginEmail = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Erro ao fazer login com email/senha:', error);
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
      localStorage.removeItem('visaoConsolidada');
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
      const userProfileRef = doc(firestore, 'tenants', empresaId, 'usuarios', user.id);
      await setDoc(userProfileRef, {
        email: user.email,
        name: user.name || user.email.split('@')[0],
        cargo: 'Dono',
        perfilAcesso: 'Master',
        paginasAcesso: ['dashboard', 'empresas', 'etapas', 'importacao', 'relatorios', 'historico', 'cadastros', 'notificacoes', 'fluxograma', 'usuarios'],
        createdAt: new Date().toISOString()
      }, { merge: true });

      // Adiciona a nova empresa ao diretório global de empresas do usuário
      const userDirRef = doc(firestore, 'users_directory', user.id);
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

  const selecionarEmpresa = async (empresa) => {
    if (!user) {
      return;
    }

    // Caso "Visão Consolidada" (empresa === null)
    if (!empresa) {
      // Se já está na visão consolidada, não faz nada
      if (!empresaAtual) {
        return;
      }
      setLoading(true);
      // Limpa a empresa atual e o localStorage
      localStorage.removeItem('empresaAtualId');
      // Marca que o usuário está na visão consolidada
      localStorage.setItem('visaoConsolidada', 'true');
      setEmpresaAtual(null);
      // Restaura o usuário base (sem dados de perfil específico da empresa)
      // Preserva perfilAcesso e paginasAcesso para manter as permissões na visão consolidada
      const baseUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        photoURL: user.photoURL,
        perfilAcesso: user.perfilAcesso,
        paginasAcesso: user.paginasAcesso,
      };
      setUser(baseUser);
      setLoading(false);
      return;
    }

    // Se a empresa selecionada é a mesma, não faz nada
    if (empresa.id === empresaAtual?.id) {
      return;
    }

    setLoading(true);
    
    // 1. Update localStorage and state
    localStorage.setItem('empresaAtualId', empresa.id);
    localStorage.removeItem('visaoConsolidada');
    setEmpresaAtual(empresa);

    const userId = user.id;

    // 2. Define the base user object without old profile data
    const baseUser = {
      id: userId,
      email: user.email,
      name: user.name,
      photoURL: user.photoURL,
    };

    // 3. Fetch the new profile
    const userProfileRef = doc(firestore, 'tenants', empresa.id, 'usuarios', userId);
    const profileSnap = await getDoc(userProfileRef);

    if (profileSnap.exists()) {
      // 4. Merge base user with new profile
      setUser({ ...baseUser, ...profileSnap.data() });
    } else {
      // If the user has no profile in the new company, create one.
      console.warn(`Perfil não encontrado para ${userId} na empresa ${empresa.id}. Criando perfil padrão.`);
      const isOwner = empresa?.ownerId === userId;
      const defaultRole = isOwner ? 'Master' : 'Admin';
      const defaultProfile = {
        email: baseUser.email,
        name: baseUser.name,
        role: 'admin',
        perfilAcesso: defaultRole,
        paginasAcesso: ['dashboard', 'empresas', 'etapas', 'importacao', 'relatorios', 'historico', 'cadastros', 'notificacoes', 'fluxograma', 'usuarios'],
        createdAt: new Date().toISOString()
      };
      await setDoc(userProfileRef, defaultProfile);
      setUser({ ...baseUser, ...defaultProfile });
    }

    setLoading(false);
  };

  const value = {
    user,
    loading,
    empresaAtual,
    empresas,
    login: handleLoginEmail,    
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
