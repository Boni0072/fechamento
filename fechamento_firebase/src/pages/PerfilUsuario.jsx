import React, { useState, useEffect } from 'react';
import { getDatabase, ref, update, onValue } from 'firebase/database';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Função auxiliar para redimensionar imagem (movida para o topo para evitar erros de referência)
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

const PerfilUsuario = () => {
  const navigate = useNavigate();
  const { user, empresaAtual } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState({
    nome: '',
    email: '',
    cargo: '',
    telefone: '',
    perfilAcesso: 'Usuário', // Valor padrão caso não esteja definido
    avatar: ''
  });
  const [mensagem, setMensagem] = useState({ tipo: '', texto: '' });
  const [avatarPreview, setAvatarPreview] = useState(null);

  useEffect(() => {
    let unsubscribeDb = null; // Variável para armazenar a função de limpeza do banco

    if (user && empresaAtual) {
      // Busca dados adicionais do usuário no Realtime Database (dentro do Tenant)
      try {
        const db = getDatabase();
        // MUDANÇA AQUI: Caminho agora inclui o ID da empresa (tenant)
        const userRef = ref(db, `tenants/${empresaAtual.id}/usuarios/${user.uid}`);
        
        // Atribui a função de limpeza à variável externa
        unsubscribeDb = onValue(userRef, (snapshot) => {
          const userData = snapshot.val();
          if (userData) {
            setDados(prev => ({
              ...prev,
              ...userData,
              // Garante valores padrão para evitar undefined e erros de input
              nome: userData.nome || '',
              cargo: userData.cargo || '',
              telefone: userData.telefone || '',
              avatar: userData.avatar || '',
              email: user.email || userData.email || ''
            }));
            if (userData.avatar) setAvatarPreview(userData.avatar);
          } else {
            setDados(prev => ({
              ...prev,
              nome: user.displayName || '',
              email: user.email || ''
            }));
          }
          setLoading(false);
        }, (error) => {
          console.error("Erro ao carregar dados:", error);
          setLoading(false);
        });
      } catch (error) {
        console.error("Erro ao inicializar banco de dados:", error);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }

    return () => {
      if (unsubscribeDb) unsubscribeDb();
    };
  }, [user, empresaAtual]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setDados(prev => ({ ...prev, [name]: value }));
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const resizedImage = await resizeImage(file);
        setAvatarPreview(resizedImage);
        setDados(prev => ({ ...prev, avatar: resizedImage }));
      } catch (error) {
        console.error("Erro ao processar imagem:", error);
        setMensagem({ tipo: 'erro', texto: 'Erro ao processar a imagem.' });
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !empresaAtual) return;

    try {
      setMensagem({ tipo: 'info', texto: 'Salvando alterações...' });
      
      // Atualiza os dados no Realtime Database
      const db = getDatabase();
      // MUDANÇA AQUI: Salva no caminho do tenant
      const usuarioRef = ref(db, `tenants/${empresaAtual.id}/usuarios/${user.uid}`);
      await update(usuarioRef, {
        nome: dados.nome,
        cargo: dados.cargo,
        telefone: dados.telefone,
        avatar: dados.avatar
        // O perfilAcesso geralmente não é editado pelo próprio usuário
      });

      setMensagem({ tipo: 'sucesso', texto: 'Perfil atualizado com sucesso!' });
      
      // Limpa mensagem após 3 segundos
      setTimeout(() => setMensagem({ tipo: '', texto: '' }), 3000);
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      setMensagem({ tipo: 'erro', texto: 'Erro ao salvar as alterações.' });
    }
  };

  if (loading) return <div className="flex justify-center p-8">Carregando...</div>;

  if (!user) return <Navigate to="/login" replace />;

  if (!empresaAtual) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500 mb-4">Selecione uma empresa para editar seu perfil.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6 border-b pb-2">
        <div className="flex items-center gap-4">
          <img src="/contabil.png" alt="Logo Contábil" className="w-36 h-36 object-contain" />
          <h1 className="text-2xl font-bold text-gray-800">Meu Perfil</h1>
        </div>
        {dados.perfilAcesso === 'Admin' && (
          <button
            onClick={() => navigate('/usuarios')}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors"
          >
            Gerenciar Usuários
          </button>
        )}
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

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-4 border-white shadow-md">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Perfil" className="w-full h-full object-cover" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16 text-gray-300">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              )}
            </div>
            <label className="absolute bottom-0 right-0 bg-blue-600 p-2 rounded-full cursor-pointer hover:bg-blue-700 transition-colors shadow-sm group">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path>
                <circle cx="12" cy="13" r="3"></circle>
              </svg>
              <input 
                type="file" 
                className="hidden" 
                accept="image/*" 
                onChange={handleAvatarChange} 
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
            <input
              type="text"
              name="nome"
              value={dados.nome}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Seu nome completo"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={dados.email}
              disabled
              className="w-full p-2 border border-gray-200 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">O email não pode ser alterado.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cargo / Função</label>
            <input
              type="text"
              name="cargo"
              value={dados.cargo}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ex: Analista Financeiro"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
            <input
              type="tel"
              name="telefone"
              value={dados.telefone}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="(00) 00000-0000"
            />
          </div>
        </div>

        <div className="border-t pt-4 mt-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Perfil de Acesso</label>
          <div className="bg-gray-50 p-3 rounded-md border border-gray-200 inline-block">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {dados.perfilAcesso || 'Usuário Padrão'}
            </span>
            <span className="ml-2 text-sm text-gray-500">
              (Definido pelo administrador)
            </span>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Salvar Alterações
          </button>
        </div>
      </form>
    </div>
  );
};

export default PerfilUsuario;