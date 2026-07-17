const functions = require("firebase-functions");
const imaps = require("imap-simple");
const cors = require("cors")({ origin: true });

/**
 * Busca as pastas de uma conta de e-mail via IMAP.
 * Esta função é chamada pelo frontend.
 */
exports.getEmailFolders = functions.https.onRequest((request, response) => {
  // Habilita o CORS para permitir que o frontend (ex: localhost:3000) chame esta função
  cors(request, response, async () => {
    if (request.method !== "POST") {
      return response.status(405).send("Method Not Allowed");
    }

    const { email, password, provider } = request.body;

    if (!email || !password) {
      return response.status(400).send("E-mail e senha são obrigatórios.");
    }

    // Configurações IMAP para provedores comuns
    const imapConfig = {
      imap: {
        user: email,
        password: password,
        host: provider === "microsoft" ? "outlook.office365.com" : "imap.gmail.com",
        port: 993,
        tls: true,
        authTimeout: 10000, // Aumenta o timeout para 10s
        tlsOptions: {
          rejectUnauthorized: false,
        },
      },
    };

    try {
      // Conecta ao servidor IMAP
      const connection = await imaps.connect(imapConfig);
      
      // Busca a lista de caixas de correio (pastas)
      const boxes = await connection.getBoxes();
      connection.end();

      // Extrai e formata os nomes das pastas
      const folderNames = Object.keys(boxes).map(name => {
        // Para o Gmail, as subpastas vêm com o nome da pasta pai. Ex: '[Gmail]/Enviados'
        // Esta lógica limpa o nome para exibição.
        const parts = name.split(boxes[name].delimiter);
        return parts.pop();
      }).filter(name => name.trim() !== ''); // Remove nomes vazios

      // Retorna a lista de pastas para o frontend
      return response.status(200).json({ folders: [...new Set(folderNames)] }); // Usa Set para garantir nomes únicos
    } catch (error) {
      console.error("IMAP Connection Error:", error);
      return response.status(500).send("Falha ao conectar à conta de e-mail. Verifique suas credenciais e as configurações de segurança da conta (ex: Acesso a app menos seguro ou Senha de App no Google).");
    }
  });
});