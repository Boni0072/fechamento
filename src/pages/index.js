const functions = require("firebase-functions");
const imaps = require("imap-simple");
const https = require("https");
const querystring = require("querystring");

/**
 * Troca o código de autorização OAuth2 por um token de acesso do Microsoft Graph
 */
exports.exchangeOutlookToken = functions.https.onRequest(async (request, response) => {
  // CORS
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    return response.status(200).send("");
  }

  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { code } = request.body;

    if (!code) {
      return response.status(400).json({ error: "Código de autorização é obrigatório." });
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI || `${process.env.VITE_APP_URL || 'http://localhost:3000'}/auth/outlook/callback`;

    if (!clientId || !clientSecret) {
      return response.status(500).json({ error: "Configuração OAuth2 incompleta no servidor." });
    }

    const tokenData = querystring.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: 'Mail.Read Mail.ReadWrite offline_access'
    });

    const tokenOptions = {
      hostname: 'login.microsoftonline.com',
      path: '/common/oauth2/v2.0/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': tokenData.length
      }
    };

    return new Promise((resolve) => {
      const req = https.request(tokenOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const tokenResponse = JSON.parse(data);
            if (tokenResponse.access_token) {
              resolve(response.status(200).json({
                accessToken: tokenResponse.access_token,
                refreshToken: tokenResponse.refresh_token,
                expiresIn: tokenResponse.expires_in
              }));
            } else {
              resolve(response.status(400).json({ error: tokenResponse.error_description || 'Falha ao obter token' }));
            }
          } catch (err) {
            resolve(response.status(500).json({ error: 'Erro ao processar resposta do Microsoft' }));
          }
        });
      });

      req.on('error', () => {
        resolve(response.status(500).json({ error: 'Erro ao conectar ao Microsoft Login' }));
      });

      req.write(tokenData);
      req.end();
    });
  } catch (error) {
    console.error("OAuth2 Token Exchange Error:", error);
    return response.status(500).json({ error: "Erro ao processar autorização" });
  }
});

/**
 * Busca as pastas de uma conta de e-mail via IMAP.
 * Esta função é chamada pelo frontend.
 */
exports.getEmailFolders = functions.https.onRequest(async (request, response) => {
  // Habilita CORS manualmente para todos os casos
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type");

  // Responde a preflight requests (OPTIONS)
  if (request.method === "OPTIONS") {
    return response.status(200).send("");
  }

  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { email, password, provider, host, port } = request.body;

    if (!email || !password) {
      return response.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    const imapHost = host || (provider === "microsoft" ? "outlook.office365.com" : "imap.gmail.com");
    const imapPort = Number(port) || 993;

    // Configurações IMAP para provedores comuns
    const imapConfig = {
      imap: {
        user: email,
        password: password,
        host: imapHost,
        port: imapPort,
        tls: true,
        authTimeout: 10000,
        tlsOptions: {
          rejectUnauthorized: false,
        },
      },
    };

    // Conecta ao servidor IMAP
    const connection = await imaps.connect(imapConfig);
    
    // Busca a lista de caixas de correio (pastas)
    const boxes = await connection.getBoxes();
    connection.end();

    const collectFolderNames = (boxMap, parentPath = '') => {
      const names = [];
      Object.entries(boxMap || {}).forEach(([name, boxInfo]) => {
        const delimiter = boxInfo?.delimiter || '/';
        const fullName = parentPath ? `${parentPath}${delimiter}${name}` : name;
        if (fullName && fullName.trim() !== '') {
          names.push(fullName);
        }
        if (boxInfo?.children) {
          names.push(...collectFolderNames(boxInfo.children, fullName));
        }
      });
      return names;
    };

    const folderNames = collectFolderNames(boxes).filter(name => name && name.trim() !== '');

    // Retorna a lista de pastas para o frontend
    return response.status(200).json({ folders: [...new Set(folderNames)] });
  } catch (error) {
    console.error("IMAP Connection Error:", error);
    return response.status(500).json({ 
      error: "Falha ao conectar à conta de e-mail. Verifique suas credenciais e as configurações de segurança da conta (ex: Senha de Aplicativo no Microsoft 365 ou Acesso a app menos seguro no Gmail)."
    });
  }
});