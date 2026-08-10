/**
 * Serviço de envio de e-mail com alertas visuais e sonoros
 * Envia automaticamente via Cloud Function
 */

import { enviarEmailNotificacaoEtapa } from './emailService';
import { playNotificationSound, NOTIFICATION_TYPES } from '../components/NotificationAlert';

/**
 * Envia e-mail de notificação de etapa com alertas
 * @param {Object} dadosEtapa - Dados da etapa
 * @param {Object} alertFunctions - Funções de alerta (alertSuccess, alertError)
 */
export const enviarEmailComAlertas = async (dadosEtapa, alertFunctions = {}) => {
  const { alertSuccess, alertError } = alertFunctions;
  
  try {
    // Reproduz som de sucesso
    playNotificationSound(NOTIFICATION_TYPES.SUCCESS);
    
    // Mostra notificação visual
    if (alertSuccess) {
      alertSuccess(
        `📧 Enviando notificação da etapa: ${dadosEtapa.nome}`,
        4000
      );
    }
    
    // Envia e-mail automaticamente via Cloud Function
    const result = await enviarEmailNotificacaoEtapa(dadosEtapa);
    
    // Segundo som para confirmar envio
    setTimeout(() => {
      playNotificationSound(NOTIFICATION_TYPES.INFO);
    }, 300);
    
    console.log('✅ E-mail enviado com sucesso:', result);
    
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error);
    
    // Reproduz som de erro
    playNotificationSound(NOTIFICATION_TYPES.ERROR);
    
    // Mostra notificação de erro
    if (alertError) {
      alertError(
        '❌ Erro ao enviar e-mail. Tente novamente.',
        5000
      );
    }
    
    throw error;
  }
};

export default {
  enviarEmailComAlertas
};