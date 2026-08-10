/**
 * Serviço de envio de e-mail AUTOMÁTICO usando EmailJS
 * Envia diretamente sem abrir Outlook e sem precisar de deploy
 * 
 * CONFIGURAÇÃO:
 * 1. Acesse https://www.emailjs.com/
 * 2. Crie uma conta gratuita
 * 3. Adicione o serviço Outlook
 * 4. Crie um template
 * 5. Copie as credenciais abaixo
 */

// ========== CONFIGURE AQUI ==========
const EMAILJS_CONFIG = {
  SERVICE_ID: 'SEU_SERVICE_ID',        // Ex: 'gmail_service'
  TEMPLATE_ID: 'SEU_TEMPLATE_ID',      // Ex: 'template_abc123'
  PUBLIC_KEY: 'SEU_PUBLIC_KEY'         // Ex: 'user_abc123xyz'
};
// =======================================

/**
 * Inicializa o EmailJS (deve ser chamado uma vez)
 */
export const inicializarEmailJS = () => {
  // Carrega a biblioteca EmailJS dinamicamente
  return new Promise((resolve, reject) => {
    if (typeof emailjs !== 'undefined') {
      emailjs.init(EMAILILJS_CONFIG.PUBLIC_KEY);
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/emailjs-com@3/dist/email.min.js';
    script.onload = () => {
      emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

/**
 * Envia e-mail AUTOMATICAMENTE usando EmailJS
 * @param {Object} dadosEtapa - Dados da etapa
 */
export const enviarEmailAutomatico = async (dadosEtapa) => {
  try {
    console.log('📧 Enviando e-mail AUTOMATICAMENTE via EmailJS...');
    
    // Verifica se EmailJS está carregado
    if (typeof emailjs === 'undefined') {
      await inicializarEmailJS();
    }

    const destinatario = dadosEtapa.usuarioNotificacao || dadosEtapa.emailResponsavel;
    
    // Parâmetros do template
    const templateParams = {
      to_email: destinatario,
      subject: `Etapa Concluída: ${dadosEtapa.nome}`,
      nome_etapa: dadosEtapa.nome,
      empresa: dadosEtapa.empresa || 'N/A',
      responsavel: dadosEtapa.responsavel || 'N/A',
      executado_por: dadosEtapa.executadoPor || 'Sistema',
      data_conclusao: new Date().toLocaleString('pt-BR'),
      codigo: dadosEtapa.codigo || 'N/A'
    };

    console.log('📧 Enviando para:', destinatario);
    console.log('📧 Template params:', templateParams);

    // Envia o e-mail
    const response = await emailjs.send(
      EMAILJS_CONFIG.SERVICE_ID,
      EMAILJS_CONFIG.TEMPLATE_ID,
      templateParams
    );

    console.log('✅ E-mail enviado com sucesso:', response);
    return { 
      success: true, 
      method: 'emailjs',
      data: response 
    };

  } catch (error) {
    console.error('❌ Erro ao enviar e-mail:', error);
    throw error;
  }
};

/**
 * Envia e-mail com alertas visuais e sonoros
 * @param {Object} dadosEtapa - Dados da etapa
 * @param {Object} alertFunctions - Funções de alerta
 */
export const enviarEmailComAlertasAutomatico = async (dadosEtapa, alertFunctions = {}) => {
  const { alertSuccess, alertError } = alertFunctions;
  
  try {
    // Som de sucesso
    const { playNotificationSound, NOTIFICATION_TYPES } = await import('../components/NotificationAlert');
    playNotificationSound(NOTIFICATION_TYPES.SUCCESS);
    
    // Mostra alerta
    if (alertSuccess) {
      alertSuccess(
        `📧 Enviando notificação da etapa: ${dadosEtapa.nome}`,
        4000
      );
    }
    
    // Envia e-mail AUTOMATICAMENTE
    const result = await enviarEmailAutomatico(dadosEtapa);
    
    // Segundo som para confirmar
    setTimeout(() => {
      playNotificationSound(NOTIFICATION_TYPES.INFO);
    }, 300);
    
    console.log('✅ E-mail enviado com sucesso:', result);
    
    if (alertSuccess) {
      alertSuccess(
        `✅ E-mail enviado automaticamente para: ${dadosEtapa.usuarioNotificacao}`,
        5000
      );
    }
    
    return result;
    
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error);
    
    // Som de erro
    const { playNotificationSound, NOTIFICATION_TYPES } = await import('../components/NotificationAlert');
    playNotificationSound(NOTIFICATION_TYPES.ERROR);
    
    // Mostra erro
    if (alertError) {
      alertError(
        '❌ Erro ao enviar e-mail. Verifique as credenciais do EmailJS.',
        5000
      );
    }
    
    throw error;
  }
};

export default {
  inicializarEmailJS,
  enviarEmailAutomatico,
  enviarEmailComAlertasAutomatico
};