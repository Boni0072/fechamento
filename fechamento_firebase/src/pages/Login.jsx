import { useState, useEffect } from 'react';
import { getApp, initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, LogIn, Settings, Building2, User, CheckCircle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Estados para o Modo Admin (Criação de Clientes)
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [masterUser, setMasterUser] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [newClientData, setNewClientData] = useState({ nomeEmpresa: '', cnpj: '', nomeUser: '', emailUser: '', senhaUser: '' });
  const [showUpdateCreds, setShowUpdateCreds] = useState(false);
  const [newAdminUser, setNewAdminUser] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');

  // ====== CONFIGURAÇÃO DAS LOGOS FLUTUANTES ======
  // Para adicionar ou remover logos, edite o array abaixo
  // id: identificador único
  // duration: duração da animação em segundos
  // size: tamanho da logo em pixels (ex: 150, 200, 250, 300)
  const floatingLogos = [
    { id: 1, duration: 15, size: 50 },
    { id: 2, duration: 18, size: 50 },
    { id: 3, duration: 20, size: 50 },
    { id: 4, duration: 22, size: 50 },
    { id: 5, duration: 17, size: 50 },
    
    
    // Adicione mais logos aqui se quiser:
    // { id: 6, duration: 19, size: 50 },
    // { id: 7, duration: 16, size: 50 },
  ];
  // ===============================================

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      let msg = 'Erro ao fazer login.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        msg = 'Email ou senha incorretos.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Muitas tentativas. Tente novamente mais tarde.';
      }
      setError(msg);
      setLoading(false);
    }
  };

  // Função para autenticar o Admin (Você)
  const handleAdminAuth = async (e) => {
    e.preventDefault();
    const DEFAULT_USER = "J@taia01";
    const DEFAULT_PASS = "123456";
    
    setLoading(true);
    try {
      const db = getFirestore();
      // Tenta buscar credenciais personalizadas no banco
      const docSnap = await getDoc(doc(db, 'system_settings', 'admin_access'));
      const data = docSnap.data();
      
      const validUser = data?.user || DEFAULT_USER;
      const validPass = data?.password || DEFAULT_PASS;
      
      if (masterUser === validUser && masterPassword === validPass) {
        setIsAdminAuthenticated(true);
        setError('');
        // Preenche o formulário de alteração com os dados atuais
        setNewAdminUser(validUser);
        setNewAdminPass(validPass);
      } else {
        setError('Usuário ou senha incorretos.');
      }
    } catch (err) {
      console.error("Erro ao verificar credenciais:", err);
      // Fallback para o padrão se der erro (ex: primeiro acesso ou sem internet)
      if (masterUser === DEFAULT_USER && masterPassword === DEFAULT_PASS) {
        setIsAdminAuthenticated(true);
        setError('');
        setNewAdminUser(DEFAULT_USER);
        setNewAdminPass(DEFAULT_PASS);
      } else {
        setError('Erro de autenticação.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCredentials = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const db = getFirestore();
      await setDoc(doc(db, 'system_settings', 'admin_access'), {
        user: newAdminUser,
        password: newAdminPass
      });
      alert('Credenciais de administrador atualizadas com sucesso!');
      setShowUpdateCreds(false);
    } catch (err) {
      console.error(err);
      setError('Erro ao atualizar credenciais: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Função para criar o Cliente (Empresa + Usuário Master)
  const handleCreateClient = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let secondaryApp;

    try {
      // Usa uma instância secundária do Firebase para criar o usuário SEM deslogar ou logar automaticamente
      const app = getApp();
      
      try {
        secondaryApp = getApp('SecondaryApp');
      } catch (e) {
        secondaryApp = initializeApp(app.options, 'SecondaryApp');
      }

      const secondaryAuth = getAuth(secondaryApp);
      const db = getFirestore(secondaryApp);

      // 1. Criar Usuário no Authentication
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newClientData.emailUser, newClientData.senhaUser);
      const newUser = userCredential.user;
      
      // Atualizar nome do perfil
      await updateProfile(newUser, { displayName: newClientData.nomeUser });

      // 2. Criar a Empresa (Tenant)
      const novaEmpresaRef = await addDoc(collection(db, 'tenants'), {
        nome: newClientData.nomeEmpresa,
        cnpj: newClientData.cnpj,
        createdAt: new Date().toISOString(),
        createdBy: 'SystemAdmin'
      });
      const empresaId = novaEmpresaRef.id;


      // 3. Adicionar Usuário como Master na Empresa
      await setDoc(doc(db, 'tenants', empresaId, 'usuarios', newUser.uid), {
        nome: newClientData.nomeUser,
        email: newClientData.emailUser,
        cargo: 'Dono / Master',
        perfilAcesso: 'Master',
        paginasAcesso: ['dashboard', 'empresas', 'etapas', 'importacao', 'relatorios', 'historico', 'cadastros', 'notificacoes', 'fluxograma', 'usuarios'],
        createdAt: new Date().toISOString()
      });

      // 4. Atualizar Diretório Global (Vínculo para Login)
      await setDoc(doc(db, 'users_directory', newUser.uid), {
        empresaId: empresaId,
        email: newClientData.emailUser,
        perfilAcesso: 'Master',
        paginasAcesso: ['dashboard', 'empresas', 'etapas', 'importacao', 'relatorios', 'historico', 'cadastros', 'notificacoes', 'fluxograma', 'usuarios']
      });

      alert(`Cliente "${newClientData.nomeEmpresa}" criado com sucesso!\nUsuário: ${newClientData.emailUser}`);
      setShowAdminModal(false);
      setNewClientData({ nomeEmpresa: '', cnpj: '', nomeUser: '', emailUser: '', senhaUser: '' });
      setIsAdminAuthenticated(false);
      setMasterPassword('');
    } catch (err) {
      console.error(err);
      let msg = 'Erro ao criar cliente.';
      if (err.code === 'auth/email-already-in-use') msg = 'Este email já está em uso.';
      if (err.code === 'auth/weak-password') msg = 'A senha deve ter pelo menos 6 caracteres.';
      if (msg === 'Erro ao criar cliente.' && err.message) msg = `Erro: ${err.message}`;
      setError(msg);
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (e) {
          console.error("Erro ao limpar app secundário:", e);
        }
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-slate-900">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 w-full h-full">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 animate-gradient-xy"></div>
        
        {/* Logos batendo nas bordas - geradas dinamicamente */}
        {floatingLogos.map((logo) => (
          <div key={logo.id} className={`logo-bounce-${logo.id}`}>
            <img 
              src="/Secontaf1.png"
              alt="Logo Secontaf"
              onError={(e) => console.log(`Erro ao carregar imagem ${logo.id}`)}
              onLoad={() => console.log(`Imagem ${logo.id} carregada com sucesso`)}
            />
          </div>
        ))}
        
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-600 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-blue-600 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-[-20%] left-[20%] w-96 h-96 bg-pink-600 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      {/* Login Card */}
      <div className="relative z-10 bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 animate-fadeIn">
        <div className="text-center mb-8">
          {/* Logo principal no card */}
          <div className="w-20 h-20 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg animate-float overflow-hidden">
            <img 
              src="/Secontaf1.png"
              alt="Secontaf" 
              className="w-16 h-16 object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Bem-vindo</h1>
          <p className="text-blue-200">Sistema de Fechamento Contábil </p>
         
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-3 rounded-lg mb-6 text-sm backdrop-blur-sm animate-shake">
            {error}
          </div>
        )}

        {/* Email/Password Form */}
        <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
          <div className="relative group">
            <Mail className="absolute left-3 top-3 w-5 h-5 text-blue-300 group-focus-within:text-blue-400 transition-colors" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email corporativo"
              className="w-full bg-slate-800/50 border border-slate-600 text-white placeholder-slate-400 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
          
          <div className="relative group">
            <Lock className="absolute left-3 top-3 w-5 h-5 text-blue-300 group-focus-within:text-blue-400 transition-colors" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              className="w-full bg-slate-800/50 border border-slate-600 text-white placeholder-slate-400 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Entrar</span>
                <LogIn className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Link Secontaf abaixo do botão */}
        <div className="text-center">
          <a 
            href="https://secontaf.com.br" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-lg font-bold text-blue-300 hover:text-blue-400 transition-colors inline-block hover:underline"
          >
            secontaf.com.br
          </a>
          <p className="text-blue-200 text-sm mt-1"></p>
        </div>
      </div>

      {/* Botão Admin Discreto */}
      <button 
        onClick={() => setShowAdminModal(true)}
        className="absolute bottom-4 right-4 p-2 text-slate-600 hover:text-slate-400 transition-colors z-20"
        title="Área Administrativa"
      >
        <Settings className="w-5 h-5 opacity-50 hover:opacity-100" />
      </button>

      {/* Modal Admin */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg p-6 relative">
            <button 
              onClick={() => { setShowAdminModal(false); setError(''); setIsAdminAuthenticated(false); setMasterPassword(''); setMasterUser(''); setShowUpdateCreds(false); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>

            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Settings className="w-6 h-6 text-blue-500" />
              Administração do Sistema
            </h2>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-3 rounded-lg mb-6 text-sm">
                {error}
              </div>
            )}

            {!isAdminAuthenticated ? (
              <form onSubmit={handleAdminAuth} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Usuário Admin</label>
                  <input
                    type="text"
                    value={masterUser}
                    onChange={(e) => setMasterUser(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-600 text-white rounded-lg py-2 px-4 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="Usuário"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Senha Admin</label>
                  <input
                    type="password"
                    value={masterPassword}
                    onChange={(e) => setMasterPassword(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-600 text-white rounded-lg py-2 px-4 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="Senha"
                  />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50">
                  {loading ? 'Verificando...' : 'Acessar'}
                </button>
              </form>
            ) : (
              <>
              {showUpdateCreds ? (
                <form onSubmit={handleUpdateCredentials} className="space-y-4 mb-6 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                  <h3 className="text-sm font-bold text-white mb-2">Alterar Credenciais de Acesso</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Novo Usuário</label>
                    <input
                      type="text"
                      value={newAdminUser}
                      onChange={(e) => setNewAdminUser(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Nova Senha</label>
                    <input
                      type="text"
                      value={newAdminPass}
                      onChange={(e) => setNewAdminPass(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowUpdateCreds(false)} className="flex-1 py-2 bg-slate-600 text-white rounded-lg text-sm hover:bg-slate-500">Cancelar</button>
                    <button type="submit" disabled={loading} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">{loading ? 'Salvando...' : 'Salvar Novos Dados'}</button>
                  </div>
                </form>
              ) : (
                <div className="flex justify-end mb-4">
                  <button onClick={() => setShowUpdateCreds(true)} className="text-xs text-blue-400 hover:text-blue-300 hover:underline">Alterar usuário/senha de admin</button>
                </div>
              )}

              <form onSubmit={handleCreateClient} className="space-y-4">
                <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
                  <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="w-4 h-4" /> Dados da Empresa
                  </h3>
                  <input
                    type="text"
                    required
                    placeholder="Nome da Empresa"
                    value={newClientData.nomeEmpresa}
                    onChange={(e) => setNewClientData({...newClientData, nomeEmpresa: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="CNPJ (Opcional)"
                    value={newClientData.cnpj}
                    onChange={(e) => setNewClientData({...newClientData, cnpj: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
                  <h3 className="text-sm font-bold text-green-400 uppercase tracking-wider flex items-center gap-2">
                    <User className="w-4 h-4" /> Usuário Master (Dono)
                  </h3>
                  <input
                    type="text"
                    required
                    placeholder="Nome do Responsável"
                    value={newClientData.nomeUser}
                    onChange={(e) => setNewClientData({...newClientData, nomeUser: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Email de Acesso"
                    value={newClientData.emailUser}
                    onChange={(e) => setNewClientData({...newClientData, emailUser: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <input
                    type="password"
                    required
                    placeholder="Senha Provisória"
                    value={newClientData.senhaUser}
                    onChange={(e) => setNewClientData({...newClientData, senhaUser: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? 'Criando...' : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Criar Cliente
                    </>
                  )}
                </button>
              </form>
              </>
            )}
          </div>
        </div>
      )}
      

      {/* Custom Animations Styles */}
      <style>{`
        /* Logos flutuantes - GRANDES E VISÍVEIS */
        ${floatingLogos.map(logo => `
        .logo-bounce-${logo.id} {
          position: absolute;
          pointer-events: none;
          z-index: 1;
          animation: bounce-diagonal-${logo.id} ${logo.duration}s linear infinite;
        }
        
        .logo-bounce-${logo.id} img {
          width: ${logo.size}px !important;
          height: ${logo.size}px !important;
          object-fit: contain;
          filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5));
          opacity: 0.85;
        }
        `).join('\n')}
      
        /* Animações estilo DVD screensaver - batendo nas bordas */
        @keyframes bounce-diagonal-1 {
          0% { 
            top: 0%; 
            left: 0%; 
            transform: translate(0, 0);
          }
          25% { 
            top: calc(80% - 250px); 
            left: calc(70% - 250px); 
            transform: translate(0, 0) rotate(90deg);
          }
          50% { 
            top: 0%; 
            left: calc(100% - 250px); 
            transform: translate(0, 0) rotate(180deg);
          }
          75% { 
            top: calc(70% - 250px); 
            left: 0%; 
            transform: translate(0, 0) rotate(270deg);
          }
          100% { 
            top: 0%; 
            left: 0%; 
            transform: translate(0, 0) rotate(360deg);
          }
        }
        
        @keyframes bounce-diagonal-2 {
          0% { 
            top: calc(100% - 250px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0);
          }
          25% { 
            top: 0%; 
            left: calc(30% - 250px); 
            transform: translate(0, 0) rotate(90deg);
          }
          50% { 
            top: calc(80% - 250px); 
            left: 0%; 
            transform: translate(0, 0) rotate(180deg);
          }
          75% { 
            top: 0%; 
            left: calc(70% - 250px); 
            transform: translate(0, 0) rotate(270deg);
          }
          100% { 
            top: calc(100% - 250px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0) rotate(360deg);
          }
        }
        
        @keyframes bounce-diagonal-3 {
          0% { 
            top: calc(50% - 125px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0);
          }
          25% { 
            top: 0%; 
            left: calc(50% - 125px); 
            transform: translate(0, 0) rotate(90deg);
          }
          50% { 
            top: calc(50% - 125px); 
            left: 0%; 
            transform: translate(0, 0) rotate(180deg);
          }
          75% { 
            top: calc(100% - 250px); 
            left: calc(50% - 125px); 
            transform: translate(0, 0) rotate(270deg);
          }
          100% { 
            top: calc(50% - 125px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0) rotate(360deg);
          }
        }
        
        @keyframes bounce-diagonal-4 {
          0% { 
            top: calc(30% - 125px); 
            left: 0%; 
            transform: translate(0, 0);
          }
          25% { 
            top: calc(100% - 250px); 
            left: calc(80% - 250px); 
            transform: translate(0, 0) rotate(90deg);
          }
          50% { 
            top: 0%; 
            left: calc(20% - 125px); 
            transform: translate(0, 0) rotate(180deg);
          }
          75% { 
            top: calc(60% - 250px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0) rotate(270deg);
          }
          100% { 
            top: calc(30% - 125px); 
            left: 0%; 
            transform: translate(0, 0) rotate(360deg);
          }
        }
        
        @keyframes bounce-diagonal-5 {
          0% { 
            top: calc(80% - 250px); 
            left: calc(50% - 125px); 
            transform: translate(0, 0);
          }
          25% { 
            top: calc(20% - 125px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0) rotate(90deg);
          }
          50% { 
            top: calc(100% - 250px); 
            left: calc(10% - 125px); 
            transform: translate(0, 0) rotate(180deg);
          }
          75% { 
            top: 0%; 
            left: calc(80% - 125px); 
            transform: translate(0, 0) rotate(270deg);
          }
          100% { 
            top: calc(80% - 250px); 
            left: calc(50% - 125px); 
            transform: translate(0, 0) rotate(360deg);
          }
        }
        
        @keyframes bounce-diagonal-6 {
          0% { 
            top: calc(40% - 125px); 
            left: calc(80% - 250px); 
            transform: translate(0, 0);
          }
          25% { 
            top: calc(90% - 250px); 
            left: calc(20% - 125px); 
            transform: translate(0, 0) rotate(90deg);
          }
          50% { 
            top: calc(10% - 125px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0) rotate(180deg);
          }
          75% { 
            top: calc(100% - 250px); 
            left: calc(60% - 125px); 
            transform: translate(0, 0) rotate(270deg);
          }
          100% { 
            top: calc(40% - 125px); 
            left: calc(80% - 250px); 
            transform: translate(0, 0) rotate(360deg);
          }
        }
        
        @keyframes bounce-diagonal-7 {
          0% { 
            top: 0%; 
            left: calc(60% - 125px); 
            transform: translate(0, 0);
          }
          25% { 
            top: calc(70% - 250px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0) rotate(90deg);
          }
          50% { 
            top: calc(100% - 250px); 
            left: calc(40% - 125px); 
            transform: translate(0, 0) rotate(180deg);
          }
          75% { 
            top: calc(30% - 125px); 
            left: 0%; 
            transform: translate(0, 0) rotate(270deg);
          }
          100% { 
            top: 0%; 
            left: calc(60% - 125px); 
            transform: translate(0, 0) rotate(360deg);
          }
        }
        
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        @keyframes gradient-xy {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-xy {
          background-size: 200% 200%;
          animation: gradient-xy 15s ease infinite;
        }
      `}</style>
    </div>
  );
}