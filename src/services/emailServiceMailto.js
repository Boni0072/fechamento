/**
 * Serviço de envio de e-mail usando mailto (Outlook padrão)
 * Funciona IMEDIATAMENTE sem precisar de deploy ou configuração
 */

/**
 * Envia e-mail abrindo o Outlook automaticamente
 * @param {Object} dadosEtapa - Dados da etapa
 */
export const enviarEmailOutlook = async (dadosEtapa) => {
  try {
    console.log('📧 Abrindo Outlook para enviar e-mail...');
    
    const destinatario = dadosEtapa.usuarioNotificacao || dadosEtapa.emailResponsavel;
    const assunto = encodeURIComponent(`Etapa Concluída: ${dadosEtapa.nome}`);
    
    const corpo = encodeURIComponent(`
Olá ${dadosEtapa.responsavel || 'Usuário'},

A etapa "${dadosEtapa.nome}" foi concluída com sucesso!

Detalhes:
- Código: ${dadosEtapa.codigo || 'N/A'}
- Empresa: ${dadosEtapa.empresa || 'N/A'}
- Responsável: ${dadosEtapa.responsavel || 'N/A'}
- Executado por: ${dadosEtapa.executadoPor || 'Sistema'}
- Data de Conclusão: ${new Date().toLocaleString('pt-BR')}

Acesse o sistema para mais detalhes.

Atenciosamente,
Sistema de Fechamento Contábil - Rede OBA
    `.trim());
    
    // Cria o link mailto
    const mailtoLink = `mailto:${destinatario}?subject=${assunto}&body=${corpo}`;
    
    // Abre o Outlook em uma nova aba
    window.open(mailtoLink, '_blank');
    
    console.log('✅ Outlook aberto com sucesso!');
    console.log('📧 Destinatário:', destinatario);
    
    return { 
      success: true, 
      method: 'outlook',
      message: 'Outlook aberto. Clique em Enviar para enviar o e-mail.',
      mailtoLink 
    };
    
  } catch (error) {
    console.error('❌ Erro ao abrir Outlook:', error);
    throw error;
  }
};

/**
 * Envia e-mail com alertas visuais e sonoros
 * @param {Object} dadosEtapa - Dados da etapa
 * @param {Object} alertFunctions - Funções de alerta
 */
export const enviarEmailComAlertasOutlook = async (dadosEtapa, alertFunctions = {}) => {
  const { alertSuccess, alertError } = alertFunctions;
  
  try {
    // Som de sucesso
    const { playNotificationSound, NOTIFICATION_TYPES } = await import('../components/NotificationAlert');
    playNotificationSound(NOTIFICATION_TYPES.SUCCESS);
    
    // Mostra alerta
    if (alertSuccess) {
      alertSuccess(
        `📧 Abrindo Outlook para enviar notificação...`,
        3000
      );
    }
    
    // Abre Outlook
    const result = await enviarEmailOutlook(dadosEtapa);
    
    // Segundo som para confirmar
    setTimeout(() => {
      playNotificationSound(NOTIFICATION_TYPES.INFO);
    }, 300);
    
    console.log('✅ Outlook aberto:', result);
    
    // Mostra mensagem de sucesso
    if (alertSuccess) {
      alertSuccess(
        `✅ Outlook aberto! Clique em "Enviar" no Outlook.`,
        5000
      );
    }
    
    return result;
    
  } catch (error) {
    console.error('Erro ao abrir Outlook:', error);
    
    // Som de erro
    const { playNotificationSound, NOTIFICATION_TYPES } = await import('../components/NotificationAlert');
    playNotificationSound(NOTIFICATION_TYPES.ERROR);
    
    // Mostra erro
    if (alertError) {
      alertError(
        '❌ Erro ao abrir Outlook. Verifique se o Outlook está instalado.',
        5000
      );
    }
    
    throw error;
  }
};

export default {
  enviarEmailOutlook,
  enviarEmailComAlertasOutlook
};