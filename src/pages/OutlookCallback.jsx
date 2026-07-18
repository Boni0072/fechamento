import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { handle_outlook_callback, fetch_outlook_folders, fetch_outlook_user_info } from '../services/outlookAuthService';

export default function OutlookCallback() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const processCallback = async () => {
      try {
        // Extrai o código de autorização da URL
        const params = new URLSearchParams(window.location.hash.substring(1));
        const code = params.get('code');
        const errorParam = params.get('error');

        if (errorParam) {
          throw new Error(`Erro de autorização: ${errorParam}`);
        }

        if (!code) {
          throw new Error('Código de autorização não recebido');
        }

        // Troca o código por um token de acesso
        const { accessToken, refreshToken } = await handle_outlook_callback(code);

        // Busca informações do usuário
        const userInfo = await fetch_outlook_user_info(accessToken);

        // Busca as pastas do usuário
        const folders = await fetch_outlook_folders(accessToken);

        // Armazena os dados na sessão/localStorage para o modal usar
        sessionStorage.setItem('outlookAccessToken', accessToken);
        sessionStorage.setItem('outlookRefreshToken', refreshToken);
        sessionStorage.setItem('outlookUserEmail', userInfo.mail || userInfo.userPrincipalName);
        sessionStorage.setItem('outlookFolders', JSON.stringify(folders));

        // Volta para a página anterior (Empresas)
        window.close();
        navigate(-1);
      } catch (err) {
        console.error('Erro ao processar callback do Outlook:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    processCallback();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Processando autorização...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">Erro: {error}</p>
          <button onClick={() => window.close()} className="px-4 py-2 bg-blue-600 text-white rounded">
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return null;
}
