/**
 * Serviço de autenticação OAuth2 com Microsoft Graph / Outlook
 * Fluxo seguro sem armazenar senhas
 */

const OUTLOOK_CONFIG = {
  clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID || '',
  redirectUri: `${window.location.origin}/auth/outlook/callback`,
  scopes: ['Mail.Read', 'Mail.ReadWrite', 'offline_access'],
  authority: 'https://login.microsoftonline.com/common/oauth2/v2.0',
};

export const initiate_outlook_auth = () => {
  if (!OUTLOOK_CONFIG.clientId) {
    console.error('VITE_MICROSOFT_CLIENT_ID não configurado');
    throw new Error('Aplicação não configurada para conectar com Outlook. Configure VITE_MICROSOFT_CLIENT_ID nas variáveis de ambiente.');
  }

  const params = new URLSearchParams({
    client_id: OUTLOOK_CONFIG.clientId,
    redirect_uri: OUTLOOK_CONFIG.redirectUri,
    response_type: 'code',
    scope: OUTLOOK_CONFIG.scopes.join(' '),
    prompt: 'select_account',
    response_mode: 'fragment'
  });

  const authUrl = `${OUTLOOK_CONFIG.authority}/authorize?${params.toString()}`;
  window.location.href = authUrl;
};

export const handle_outlook_callback = async (code) => {
  if (!code) {
    throw new Error('Código de autorização não recebido');
  }

  try {
    // Chama Cloud Function para trocar código por token
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    const tokenUrl = import.meta.env.VITE_OUTLOOK_TOKEN_URL || 
      `https://us-central1-${projectId}.cloudfunctions.net/exchangeOutlookToken`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    if (!response.ok) {
      throw new Error('Falha ao obter token de acesso');
    }

    const { accessToken, refreshToken } = await response.json();
    return { accessToken, refreshToken };
  } catch (err) {
    console.error('Erro ao processar callback do Outlook:', err);
    throw err;
  }
};

export const fetch_outlook_folders = async (accessToken) => {
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const data = await response.json();
    return data.value?.map(folder => ({
      id: folder.id,
      displayName: folder.displayName,
      childFolderCount: folder.childFolderCount
    })) || [];
  } catch (err) {
    console.error('Erro ao buscar pastas do Outlook:', err);
    throw err;
  }
};

export const fetch_outlook_user_info = async (accessToken) => {
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error('Erro ao buscar dados do usuário do Outlook:', err);
    throw err;
  }
};
