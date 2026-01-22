import { createContext, useContext, useState, useEffect } from 'react';
import { auth, loginWithGoogle, logout, onAuthChange } from '../services/firebase';
import { criarEmpresa, getEmpresas, getUsuario } from '../services/database';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [empresaAtual, setEmpresaAtual] = useState(null);
  const [empresas, setEmpresas] = useState([]);

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch additional user data from Realtime Database
        const unsubscribeDb = getUsuario(firebaseUser.uid, (dbUserData) => {
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            ...dbUserData // Merge database user data
          });
          setLoading(false);
        });
        return () => unsubscribeDb(); // Cleanup for db listener
      } else {
        setUser(null);
        setEmpresaAtual(null);
        setEmpresas([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Carregar empresas quando usuário logar
  useEffect(() => {
    if (user) {
      const unsubscribe = getEmpresas(user.id, (empresasData) => {
        setEmpresas(empresasData);
        // Selecionar primeira empresa se não houver selecionada
        if (!empresaAtual && empresasData.length > 0) {
          setEmpresaAtual(empresasData[0]);
        }
      });
      return () => unsubscribe();
    }
  }, [user]);

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
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
      throw error;
    }
  };

  const handleCriarEmpresa = async (dados) => {
    if (!user) return;
    const empresaId = await criarEmpresa(user.id, dados);
    return empresaId;
  };

  const selecionarEmpresa = (empresa) => {
    setEmpresaAtual(empresa);
    localStorage.setItem('empresaAtualId', empresa.id);
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
