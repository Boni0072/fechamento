/**
 * Serviço de envio de e-mail automático via Cloud Function
 * Envia e-mail diretamente sem abrir Outlook
 */

const FIREBASE_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const CLOUD_FUNCTION_URL = `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net/sendNotificationEmail`;

/**
 * Envia e-mail de notificação de etapa AUTOMATICAMENTE
 * @param {Object} dadosEtapa - Dados da etapa
 */
export const enviarEmailNotificacaoEtapa = async (dadosEtapa) => {
  try {
    console.log('📧 Enviando e-mail automaticamente...');
    
    const executorName = dadosEtapa.executadoPor || dadosEtapa.responsavel || 'Sistema';
    
    const subject = `Etapa Concluída: ${dadosEtapa.nome}`;
    const body = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #28a745; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
            .footer { background-color: #f1f1f1; padding: 10px; text-align: center; font-size: 12px; color: #666; }
            .info { background-color: #e3f2fd; padding: 10px; margin: 10px 0; border-left: 4px solid #2196F3; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>✅ Etapa Concluída</h2>
            </div>
            <div class="content">
              <p>Olá!</p>
              <p>A etapa <strong>${dadosEtapa.nome}</strong> foi concluída com sucesso.</p>
              
              <div class="info">
                <p><strong>Código:</strong> ${dadosEtapa.codigo || 'N/A'}</p>
                <p><strong>Responsável:</strong> ${dadosEtapa.responsavel || 'N/A'}</p>
                <p><strong>Executado por:</strong> ${executorName}</p>
                <p><strong>Data de Conclusão:</strong> ${new Date().toLocaleString('pt-BR')}</p>
              </div>
              
              <p>Acesse o sistema para mais detalhes.</p>
            </div>
            <div class="footer">
              <p>Esta é uma mensagem automática. Por favor, não responda.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    console.log('📧 Enviando para:', dadosEtapa.usuarioNotificacao);
    console.log('📧 URL:', CLOUD_FUNCTION_URL);

    // Envia para a Cloud Function
    const response = await fetch(CLOUD_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: dadosEtapa.usuarioNotificacao,
        subject: subject,
        body: body,
        accessToken: null // Será preenchido pela Cloud Function com as credenciais padrão
      })
    });

    console.log('📧 Resposta:', { status: response.status, ok: response.ok });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ E-mail enviado com sucesso:', result);
      return { success: true, data: result };
    } else {
      const error = await response.json();
      console.error('❌ Erro ao enviar e-mail:', error);
      throw new Error(error.error || 'Erro ao enviar e-mail');
    }
    
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail:', error);
    throw error;
  }
};

/**
 * Envia e-mail genérico
 * @param {string} destinatario - E-mail do destinatário
 * @param {string} assunto - Assunto do e-mail
 * @param {string} mensagem - Mensagem do e-mail
 */
export const enviarEmailGenerico = async (destinatario, assunto, mensagem) => {
  try {
    const response = await fetch(CLOUD_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: destinatario,
        subject: assunto,
        body: mensagem,
        accessToken: null
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ E-mail enviado:', result);
      return { success: true, data: result };
    } else {
      throw new Error('Erro ao enviar e-mail');
    }
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail:', error);
    throw error;
  }
};

export default {
  enviarEmailNotificacaoEtapa,
  enviarEmailGenerico
};