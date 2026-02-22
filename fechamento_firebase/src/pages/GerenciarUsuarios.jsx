import React, { useState, useEffect } from 'react';
// Imports limpos
import { getApp, initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, updateDoc, deleteDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { User, Camera, Pencil, Trash2, Eye, EyeOff, LogOut } from 'lucide-react';
import { usePermissao } from '../hooks/usePermissao'; // Importar o hook de permissão
import { useAuth } from '../contexts/AuthContext';
import { checkPermission } from './permissionUtils';

const PAGINAS_DISPONIVEIS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'Empresas', label: 'Empresas' },
  { id: 'Etapas', label: 'Etapas' },
  { id: 'Importacao', label: 'Importação' },
  { id: 'Relatorios', label: 'Relatórios' },
  { id: 'Historico', label: 'Histórico' },
  { id: 'Cadastros', label: 'Cadastros' },
  { id: 'Notificacoes', label: 'Notificações' },
  { id: 'Fluxograma', label: 'Fluxograma' },
  { id: 'Usuarios', label: 'Usuários' }
];

// Função auxiliar para redimensionar imagem
const resizeImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

// Validação de força de senha
const validarSenhaForte = (senha) => {
  if (senha.length < 6) return "A senha deve ter pelo menos 6 caracteres.";
  if (!/\d/.test(senha)) return "A senha deve conter pelo menos um número.";
  if (!/[a-zA-Z]/.test(senha)) return "A senha deve conter pelo menos uma letra.";
  return null;
};

const GerenciarUsuarios = () => {
  const { empresaAtual } = useAuth();
  const { loading: permissaoLoading, user: authUser } = usePermissao('usuarios');
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (!authUser?.id || !empresaAtual?.id) {
      setLoadingProfile(false);
      return;
    }

    setLoadingProfile(true);
    const db = getFirestore();
    const userRef = doc(db, 'tenants', empresaAtual.id, 'usuarios', authUser.id);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      const data = snapshot.data();
      setUserProfile(data ? { ...authUser, ...data } : authUser);
      setLoadingProfile(false);
    });
    return () => unsubscribe();
  }, [authUser, empresaAtual]);

  // Restrição removida
  const autorizado = true;

  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exibirModal, setExibirModal] = useState(false);
  const [dados, setDados] = useState({
    nome: '',
    email: '',
    senha: '',
    cargo: '',
    telefone: '',
    perfilAcesso: 'Usuário',
    paginasAcesso: [],
    empresasAcesso: []
  });
  const { empresas } = useAuth();
  const [mensagem, setMensagem] = useState({ tipo: '', texto: '' });
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [usuarioEditandoId, setUsuarioEditandoId] = useState(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  useEffect(() => {
    if (!permissaoLoading && !loadingProfile && empresaAtual?.id) { // Só buscar usuários se estiver autorizado e com empresa
      // Busca a lista de usuários em tempo real
      const db = getFirestore();
      const usuariosRef = collection(db, 'tenants', empresaAtual.id, 'usuarios');
      const unsubscribe = onSnapshot(usuariosRef, (snapshot) => {
        const listaUsuarios = [];
        snapshot.forEach((doc) => {
          listaUsuarios.push({ uid: doc.id, ...doc.data() });
        });
        setUsuarios(listaUsuarios);
        setLoading(false);
      });
      setLoading(false); // Parar de carregar se não autorizado
    }
  }, [permissaoLoading, loadingProfile, autorizado, empresaAtual]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setDados(prev => ({ ...prev, [name]: value }));
  };

  const handlePaginaChange = (paginaId) => {
    setDados(prev => {
      const paginas = Array.isArray(prev.paginasAcesso) ? prev.paginasAcesso : [];
      if (paginas.includes(paginaId)) {
        return { ...prev, paginasAcesso: paginas.filter(id => id !== paginaId) };
      } else {
        return { ...prev, paginasAcesso: [...paginas, paginaId] };
      }
    });
  };

  const handleEmpresaChange = (empresaId) => {
    setDados(prev => {
      const empresasSel = Array.isArray(prev.empresasAcesso) ? prev.empresasAcesso : [];
      if (empresasSel.includes(empresaId)) {
        return { ...prev, empresasAcesso: empresasSel.filter(id => id !== empresaId) };
      } else {
        return { ...prev, empresasAcesso: [...empresasSel, empresaId] };
      }
    });
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const resizedImage = await resizeImage(file);
        setAvatarPreview(resizedImage);
      } catch (error) {
        console.error("Erro ao processar imagem:", error);
      }
    }
  };

  const handleResetSenha = async () => {
    if (!dados.email) return;
    if (!window.confirm(`Enviar email de redefinição de senha para ${dados.email}?`)) return;
    
    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, dados.email);
      setMensagem({ tipo: 'sucesso', texto: 'Email de redefinição enviado com sucesso!' });
    } catch (error) {
      console.error("Erro ao enviar email:", error);
      setMensagem({ tipo: 'erro', texto: 'Erro ao enviar email de redefinição.' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!empresaAtual) return;
    if (!empresaAtual?.id) return;
    setMensagem({ tipo: 'info', texto: modoEdicao ? 'Atualizando usuário...' : 'Criando usuário...' });

    // Garante que paginasAcesso seja um array e tenha pelo menos 'dashboard' se vazio
    let paginasAcessoFinal = Array.isArray(dados.paginasAcesso) ? dados.paginasAcesso : [];
    if (paginasAcessoFinal.length === 0) {
        paginasAcessoFinal = ['dashboard'];
    }

    // Garante que empresasAcesso tenha pelo menos a empresa atual
    let empresasAcessoFinal = Array.isArray(dados.empresasAcesso) ? dados.empresasAcesso : [];
    if (empresasAcessoFinal.length === 0) {
        empresasAcessoFinal = [empresaAtual.id];
    }

    // Validação de senha (se fornecida)
    if (dados.senha) {
      const erroSenha = validarSenhaForte(dados.senha);
      if (erroSenha) {
        setMensagem({ tipo: 'erro', texto: erroSenha });
        return;
      }
    }

    try {
      const db = getFirestore();
      if (modoEdicao) {
        const commonData = {
          nome: dados.nome,
          cargo: dados.cargo,
          telefone: dados.telefone,
          perfilAcesso: dados.perfilAcesso,
          avatar: avatarPreview,
          paginasAcesso: paginasAcessoFinal,
          empresasAcesso: empresasAcessoFinal
        };

        if (dados.senha) {
          commonData.senha = dados.senha;
        }

        // 1. Salva em cada empresa selecionada (Tenant)
        for (const empId of empresasAcessoFinal) {
          await setDoc(doc(db, 'tenants', empId, 'usuarios', usuarioEditandoId), {
            ...commonData,
            email: dados.email
          }, { merge: true });
        }

        // 2. Atualiza diretório global (vínculo principal)
        await setDoc(doc(db, 'users_directory', usuarioEditandoId), {
          empresaId: empresasAcessoFinal[0],
          email: dados.email,
          perfilAcesso: dados.perfilAcesso,
          paginasAcesso: paginasAcessoFinal,
          empresasAcesso: empresasAcessoFinal
        }, { merge: true });

        setMensagem({ tipo: 'sucesso', texto: 'Usuário atualizado com sucesso!' });
      } else {
        // Cria uma instância secundária para não deslogar o admin atual
        const app = getApp();
        const secondaryApp = initializeApp(app.options, 'SecondaryApp');
        const secondaryAuth = getAuth(secondaryApp);

        try {
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, dados.email, dados.senha);
          const user = userCredential.user;

          const commonData = {
            nome: dados.nome,
            email: dados.email,
            cargo: dados.cargo,
            telefone: dados.telefone,
            perfilAcesso: dados.perfilAcesso,
            avatar: avatarPreview,
            paginasAcesso: paginasAcessoFinal,
            empresasAcesso: empresasAcessoFinal
          };

          // 1. Salva em cada empresa selecionada (Tenant)
          for (const empId of empresasAcessoFinal) {
            await setDoc(doc(db, 'tenants', empId, 'usuarios', user.uid), commonData);
          }

          // 2. Cria o vínculo no diretório global para permitir o login
          await setDoc(doc(db, 'users_directory', user.uid), {
            empresaId: empresasAcessoFinal[0],
            email: dados.email,
            perfilAcesso: dados.perfilAcesso,
            paginasAcesso: paginasAcessoFinal,
            empresasAcesso: empresasAcessoFinal
          });
          setMensagem({ tipo: 'sucesso', texto: 'Usuário criado com sucesso!' });
        } finally {
          await deleteApp(secondaryApp);
        }
      }

      setExibirModal(false);
      setAvatarPreview(null);
      setModoEdicao(false);
      setUsuarioEditandoId(null);
      setMostrarSenha(false);
      
      // Limpa o formulário
      setDados({
        nome: '',
        email: '',
        senha: '',
        cargo: '',
        telefone: '',
        perfilAcesso: 'Usuário',
        paginasAcesso: [],
        empresasAcesso: [empresaAtual.id]
      });
      
      setTimeout(() => setMensagem({ tipo: '', texto: '' }), 3000);

    } catch (error) {
      console.error("Erro ao salvar usuário:", error);
      let msgErro = 'Erro ao salvar usuário.';
      if (error.code === 'auth/email-already-in-use') msgErro = 'Este email já está em uso.';
      if (error.code === 'auth/weak-password') msgErro = 'A senha deve ter pelo menos 6 caracteres.';
      setMensagem({ tipo: 'erro', texto: msgErro });
    }
  };

  const handleEditar = (usuario) => {
    setModoEdicao(true);
    setUsuarioEditandoId(usuario.uid);
    setDados({
      nome: usuario.nome || '',
      email: usuario.email || '',
      senha: '',
      cargo: usuario.cargo || '',
      telefone: usuario.telefone || '',
      perfilAcesso: usuario.perfilAcesso || 'Usuário',
      paginasAcesso: usuario.paginasAcesso ? (Array.isArray(usuario.paginasAcesso) ? usuario.paginasAcesso : Object.values(usuario.paginasAcesso)) : [],
      empresasAcesso: usuario.empresasAcesso || [empresaAtual.id]
    });
    setAvatarPreview(usuario.avatar || null);
    setMostrarSenha(false);
    setExibirModal(true);
  };

  const handleExcluir = async (uid) => {
    if (authUser && (uid === authUser.id || uid === authUser.uid)) {
      alert('Você não pode excluir seu próprio usuário enquanto está logado.');
      return;
    }

    if (window.confirm('Tem certeza que deseja excluir este usuário?') && empresaAtual?.id) {
      try {
        const db = getFirestore();
        
        // Tenta remover do diretório global também (se existir)
        try {
          await deleteDoc(doc(db, 'users_directory', uid));
        } catch (e) {
          console.warn('Erro ao remover do diretório global:', e);
        }

        const usuarioRef = doc(db, 'tenants', empresaAtual.id, 'usuarios', uid);
        await deleteDoc(usuarioRef);
        
        // Atualiza a lista visualmente de imediato
        setUsuarios(prev => prev.filter(u => u.uid !== uid));
        setMensagem({ tipo: 'sucesso', texto: 'Usuário excluído com sucesso!' });
      } catch (error) {
        console.error("Erro ao excluir:", error);
        setMensagem({ tipo: 'erro', texto: 'Erro ao excluir usuário: ' + error.message });
      }
    }
  };

  const handleLogout = async () => {
    try {
      const auth = getAuth();
      await signOut(auth);
    } catch (error) {
      console.error("Erro ao sair:", error);
    }
  };

  if (loading || permissaoLoading || loadingProfile || (authUser && !userProfile)) return <div className="flex justify-center p-8">Carregando...</div>;

  if (!empresaAtual) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Selecione uma empresa para gerenciar usuários.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-800">Gerenciar Usuários</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 border-r pr-6 border-gray-200">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{userProfile?.nome || userProfile?.name || userProfile?.email}</p>
              <p className="text-xs text-gray-500">{userProfile?.perfilAcesso || 'Usuário'}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
              title="Sair do sistema"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={() => {
              setModoEdicao(false);
              setUsuarioEditandoId(null);
              setDados({
                nome: '',
                email: '',
                senha: '',
                cargo: '',
                telefone: '',
                perfilAcesso: 'Usuário',
                paginasAcesso: []
              });
              setAvatarPreview(null);
              setMostrarSenha(false);
              setExibirModal(true);
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center shadow-sm"
          >
            <span className="mr-2 text-xl font-bold">+</span> Adicionar Usuário
          </button>
        </div>
      </div>

      {mensagem.texto && (
        <div className={`p-4 mb-6 rounded-md ${
          mensagem.tipo === 'sucesso' ? 'bg-green-50 text-green-700 border border-green-200' : 
          mensagem.tipo === 'erro' ? 'bg-red-50 text-red-700 border border-red-200' : 
          'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          {mensagem.texto}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cargo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Perfil</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {usuarios.map((usuario) => (
              <tr key={usuario.uid} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      {usuario.avatar ? (
                        <img className="h-10 w-10 rounded-full object-cover" src={usuario.avatar} alt="" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                          <User className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{usuario.nome || 'Sem nome'}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">{usuario.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">{usuario.cargo || '-'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    usuario.perfilAcesso === 'Admin' ? 'bg-purple-100 text-purple-800' : 
                    usuario.perfilAcesso === 'Gerente' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {usuario.perfilAcesso || 'Usuário'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleEditar(usuario)}
                    className="text-indigo-600 hover:text-indigo-900 mr-4"
                    title="Editar"
                  >
                    <Pencil className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleExcluir(usuario.uid)}
                    className="text-red-600 hover:text-red-900"
                    title="Excluir"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan="4" className="px-6 py-8 text-center text-gray-500">Nenhum usuário encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Cadastro */}
      {exibirModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 animate-fade-in-down">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4 border-b pb-2">{modoEdicao ? 'Editar Usuário' : 'Novo Usuário'}</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-4 border-white shadow-md">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-12 h-12 text-gray-300" />
                      )}
                    </div>
                    <label className="absolute bottom-0 right-0 bg-blue-600 p-2 rounded-full cursor-pointer hover:bg-blue-700 transition-colors shadow-sm group">
                      <Camera className="w-4 h-4 text-white" />
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handleAvatarChange} 
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                  <input
                    type="text"
                    name="nome"
                    required
                    value={dados.nome}
                    onChange={handleChange}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ex: João Silva"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={dados.email}
                    onChange={handleChange}
                    disabled={modoEdicao}
                    className={`w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${modoEdicao ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    placeholder="email@empresa.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {modoEdicao ? 'Nova Senha (Opcional)' : 'Senha Provisória'}
                  </label>
                  <div className="relative">
                    <input
                      type={mostrarSenha ? "text" : "password"}
                      name="senha"
                      required={!modoEdicao}
                      minLength="6"
                      value={dados.senha}
                      onChange={handleChange}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                      placeholder={modoEdicao ? "Deixe em branco para manter a atual" : "Mínimo 6 caracteres"}
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    >
                      {mostrarSenha ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                    <input
                      type="text"
                      name="cargo"
                      value={dados.cargo}
                      onChange={handleChange}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Perfil</label>
                    <select
                      name="perfilAcesso"
                      value={dados.perfilAcesso}
                      onChange={handleChange}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Usuário">Usuário</option>
                      <option value="Gerente">Gerente</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </div>
                </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Empresas com Acesso</label>
                <div className="grid grid-cols-1 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 max-h-32 overflow-y-auto custom-scrollbar mb-4">
                  {empresas && empresas.map(emp => (
                    <label key={emp.id} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-100 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={Array.isArray(dados.empresasAcesso) && dados.empresasAcesso.includes(emp.id)}
                        onChange={() => handleEmpresaChange(emp.id)}
                        className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4 border-slate-300"
                      />
                      <span className="text-sm text-slate-700 font-medium">{emp.nome}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Páginas de Acesso</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 max-h-40 overflow-y-auto custom-scrollbar">
                  {PAGINAS_DISPONIVEIS.map(pagina => (
                    <label key={pagina.id} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-100 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={Array.isArray(dados.paginasAcesso) && dados.paginasAcesso.includes(pagina.id)}
                        onChange={() => handlePaginaChange(pagina.id)}
                        className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4 border-slate-300"
                      />
                      <span className="text-sm text-slate-700">{pagina.label}</span>
                    </label>
                  ))}
                </div>
              </div>
                
                <div className="flex justify-end space-x-3 mt-8 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => { setExibirModal(false); setAvatarPreview(null); setModoEdicao(false); setUsuarioEditandoId(null); }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    {modoEdicao ? 'Salvar Alterações' : 'Cadastrar Usuário'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GerenciarUsuarios;