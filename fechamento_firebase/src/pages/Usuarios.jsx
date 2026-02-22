import { useState, useEffect } from 'react';
import { getApp, initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, collection, doc, updateDoc, deleteDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { Users, User, Plus, Pencil, Trash2, Eye, EyeOff, Camera, Mail, Shield, X } from 'lucide-react';

const PAGINAS_DISPONIVEIS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'empresas', label: 'Empresas' },
  { id: 'etapas', label: 'Etapas' },
  { id: 'importacao', label: 'Importação' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'historico', label: 'Histórico' },
  { id: 'cadastros', label: 'Cadastros' },
  { id: 'notificacoes', label: 'Notificações' },
  { id: 'fluxograma', label: 'Fluxograma' },
  { id: 'usuarios', label: 'Usuários' }
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

export default function Usuarios() {
  const { empresaAtual } = useAuth();
  const { loading: permissaoLoading, user: authUser } = usePermissao('usuarios');
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados do Modal e Formulário
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
    if (authUser?.id && empresaAtual?.id) {
      setLoadingProfile(true);
      const db = getFirestore();
      const userRef = doc(db, 'tenants', empresaAtual.id, 'usuarios', authUser.id);
      const unsubscribe = onSnapshot(userRef, (snapshot) => {
        const data = snapshot.data();
        setUserProfile(data ? { ...authUser, ...data } : authUser);
        setLoadingProfile(false);
      });
      return () => unsubscribe();
    } else {
      setLoadingProfile(false);
    }
  }, [authUser, empresaAtual]);

  useEffect(() => {
    if (!permissaoLoading && !loadingProfile && empresaAtual?.id) {
      const db = getFirestore();
      const usersRef = collection(db, 'tenants', empresaAtual.id, 'usuarios');
      const unsubscribe = onSnapshot(usersRef, (snapshot) => {
        const lista = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        setUsuarios(lista);
        setLoading(false);
      });
      return () => unsubscribe();
    }
  }, [empresaAtual, permissaoLoading, loadingProfile]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
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
          empresaId: empresasAcessoFinal[0], // Empresa principal (para carregar primeiro)
          email: dados.email,
          perfilAcesso: dados.perfilAcesso,
          paginasAcesso: paginasAcessoFinal,
          empresasAcesso: empresasAcessoFinal
        }, { merge: true });

        setMensagem({ tipo: 'sucesso', texto: 'Usuário atualizado com sucesso!' });
      } else {
        const app = getApp();
        let secondaryApp;
        try {
          secondaryApp = initializeApp(app.options, 'SecondaryApp');
        } catch (e) {
          secondaryApp = getApp('SecondaryApp');
        }
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
            empresasAcesso: empresasAcessoFinal,
            createdAt: new Date().toISOString()
          };

          // 1. Salva em cada empresa selecionada (Tenant)
          for (const empId of empresasAcessoFinal) {
            await setDoc(doc(db, 'tenants', empId, 'usuarios', user.uid), commonData);
          }
          
          // 2. Adiciona ao diretório global para login
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
      limparFormulario();
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
      alert('Você não pode excluir seu próprio usuário enquanto está logado. Peça a outro administrador para realizar esta ação ou saia e entre com outra conta.');
      return;
    }

    if (window.confirm('Tem certeza que deseja excluir este usuário?') && empresaAtual?.id) {
      try {
        const db = getFirestore();
        
        // 1. Tenta remover do diretório global (Login) - Melhor esforço
        // Envolvemos em try/catch isolado para que falhas aqui não impeçam a exclusão na empresa
        try {
          await deleteDoc(doc(db, 'users_directory', uid));
        } catch (dirError) {
          console.warn("Aviso: Não foi possível remover do diretório global:", dirError);
        }

        // 2. Remove do cadastro da empresa (Tenant) - Obrigatório
        await deleteDoc(doc(db, 'tenants', empresaAtual.id, 'usuarios', uid));
        
        // Atualiza a lista visualmente de imediato
        setUsuarios(prev => prev.filter(u => u.uid !== uid));
        setMensagem({ tipo: 'sucesso', texto: 'Usuário excluído com sucesso!' });
        setTimeout(() => setMensagem({ tipo: '', texto: '' }), 3000);
      } catch (error) {
        console.error("Erro ao excluir:", error);
        setMensagem({ tipo: 'erro', texto: 'Erro ao excluir usuário: ' + error.message });
      }
    }
  };

  const limparFormulario = () => {
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
    setAvatarPreview(null);
    setModoEdicao(false);
    setUsuarioEditandoId(null);
    setMostrarSenha(false);
  };

  if (permissaoLoading || loadingProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Carregando permissões...</p>
      </div>
    );
  }

  if (!empresaAtual) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Selecione uma empresa para gerenciar usuários.</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Usuários</h1>
            <p className="text-slate-500">Gerencie o acesso à sua empresa</p>
          </div>
        </div>
        
        <button
          onClick={() => {
            limparFormulario();
            setExibirModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Adicionar Usuário
        </button>
      </div>

      {mensagem.texto && (
        <div className={`p-4 mb-6 rounded-lg flex items-center gap-2 ${
          mensagem.tipo === 'sucesso' ? 'bg-green-50 text-green-700 border border-green-200' : 
          mensagem.tipo === 'erro' ? 'bg-red-50 text-red-700 border border-red-200' : 
          'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          {mensagem.tipo === 'sucesso' && <Shield className="w-5 h-5" />}
          {mensagem.texto}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-medium">
            <tr>
              <th className="p-4">Nome</th>
              <th className="p-4">Email</th>
              <th className="p-4">Cargo</th>
              <th className="p-4">Perfil</th>
              <th className="p-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {usuarios.map((usuario) => (
              <tr key={usuario.uid} className="hover:bg-slate-50">
                <td className="p-4 font-medium text-slate-700 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
                    {usuario.avatar ? (
                      <img src={usuario.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  {usuario.nome || 'Sem nome'}
                </td>
                <td className="p-4 text-slate-600">{usuario.email}</td>
                <td className="p-4 text-slate-600">{usuario.cargo || '-'}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    usuario.perfilAcesso === 'Master' ? 'bg-purple-100 text-purple-700' :
                    usuario.perfilAcesso === 'Admin' ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {usuario.perfilAcesso || 'Usuário'}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleEditar(usuario)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleExcluir(usuario.uid)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan="5" className="p-8 text-center text-slate-500">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Cadastro/Edição */}
      {exibirModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">
                {modoEdicao ? 'Editar Usuário' : 'Novo Usuário'}
              </h3>
              <button onClick={() => setExibirModal(false)} className="p-1 hover:bg-slate-100 rounded-full text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="flex justify-center mb-4">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border-4 border-white shadow-md">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-10 h-10 text-slate-300" />
                    )}
                  </div>
                  <label className="absolute bottom-0 right-0 bg-primary-600 p-2 rounded-full cursor-pointer hover:bg-primary-700 transition-colors shadow-sm">
                    <Camera className="w-4 h-4 text-white" />
                    <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  name="nome"
                  required
                  value={dados.nome}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Ex: João Silva"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    name="email"
                    required
                    value={dados.email}
                    onChange={handleChange}
                    disabled={modoEdicao}
                    className={`w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 ${modoEdicao ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                    placeholder="email@empresa.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
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
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 pr-10"
                    placeholder={modoEdicao ? "Deixe em branco para manter" : "Mínimo 6 caracteres"}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha(!mostrarSenha)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cargo</label>
                  <input
                    type="text"
                    name="cargo"
                    value={dados.cargo}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Perfil</label>
                  <select
                    name="perfilAcesso"
                    value={dados.perfilAcesso}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="Usuário">Usuário</option>
                    <option value="Gerente">Gerente</option>
                    <option value="Admin">Admin</option>
                    <option value="Master">Master</option>
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
              
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setExibirModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  {modoEdicao ? 'Salvar' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
