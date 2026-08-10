/**
 * Serviço de envio de e-mail ALTERNATIVO (sem Cloud Function)
 * Usa EmailJS ou método mailto como fallback
 */

/**
 * Envia e-mail usando método mailto (abre Outlook)
 * @param {Object} dadosEtapa - Dados da etapa
 */
export const enviarEmailComFallback = (dadosEtapa) => {
  try {
    console.log('📧 Usando método alternativo (mailto)...');
    
    const destinatario = dadosEtapa.usuarioNotificacao || dadosEtapa.emailResponsavel;
    const assunto = encodeURIComponent(`Etapa Concluída: ${dadosEtapa.nome}`);
    
    const corpo = encodeURIComponent(`
Olá ${dadosEtapa.responsavel || ''},

A etapa "${dadosEtapa.nome}" foi concluída com sucesso!

Detalhes:
- Empresa: ${dadosEtapa.empresa || 'N/A'}
- Responsável: ${dadosEtapa.responsavel || 'N/A'}
- Executado por: ${dadosEtapa.executadoPor || 'Sistema'}
- Data: ${new Date().toLocaleString('pt-BR')}

Acesse o sistema para mais detalhes.

Atenciosamente,
Sistema de Fechamento Contábil
    `.trim());
    
    // Abre o cliente de e-mail padrão
    const mailtoLink = `mailto:${destinatario}?subject=${assunto}&body=${corpo}`;
    window.open(mailtoLink, '_blank');
    
    console.log('✅ E-mail aberto no Outlook:', mailtoLink);
    return { success: true, method: 'mailto' };
    
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail:', error);
    throw error;
  }
};

/**
 * Envia e-mail usando EmailJS (serviço terceiro)
 * Não precisa de Cloud Function!
 * 
 * Para usar:
 * 1. Crie conta em https://www.emailjs.com/
 * 2. Configure um serviço de e-mail (Outlook/Gmail)
 * 3. Obtenha: Service ID, Template ID, Public Key
 * 4. Adicione no código abaixo
 */
export const enviarEmailComEmailJS = async (dadosEtapa) => {
  try {
    console.log('📧 Usando EmailJS...');
    
    // Verifica se EmailJS está carregado
    if (typeof emailjs === 'undefined') {
      throw new Error('EmailJS não está carregado');
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
      data_conclusao: new Date().toLocaleString('pt-BR')
    };
    
    // Envia e-mail
    const response = await emailjs.send(
      'SEU_SERVICE_ID',      // Substitua pelo seu Service ID
      'SEU_TEMPLATE_ID',     // Substitua pelo seu Template ID
      templateParams,
      'SEU_PUBLIC_KEY'       // Substitua pela sua Public Key
    );
    
    console.log('✅ E-mail enviado via EmailJS:', response);
    return { success: true, method: 'emailjs', data: response };
    
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail via EmailJS:', error);
    throw error;
  }
};

/**
 * Envia e-mail usando API direta (requer backend)
 * Esta é uma solução temporária até o deploy funcionar
 */
export const enviarEmailComAPI = async (dadosEtapa) => {
  try {
    console.log('📧 Usando API alternativa...');
    
    // Tenta usar uma API pública de e-mail
    // ATENÇÃO: Esta é uma solução temporária e pode não ser confiável
    
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        service_id: 'SEU_SERVICE_ID',
        template_id: 'SEU_TEMPLATE_ID',
        user_id: 'SEU_PUBLIC_KEY',
        template_params: {
          to_email: dadosEtapa.usuarioNotificacao,
          subject: `Etapa Concluída: ${dadosEtapa.nome}`,
          nome_etapa: dadosEtapa.nome,
          empresa: dadosEtapa.empresa || 'N/A',
          responsavel: dadosEtapa.responsavel || 'N/A'
        }
      })
    });
    
    if (response.ok) {
      console.log('✅ E-mail enviado via API');
      return { success: true, method: 'api' };
    } else {
      throw new Error('Erro na API de e-mail');
    }
    
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail via API:', error);
    throw error;
  }
};

/**
 * Função principal que tenta múltiplos métodos
 * Tenta: 1. Cloud Function, 2. EmailJS, 3. Mailto
 */
export const enviarEmailRobusto = async (dadosEtapa, alertFunctions = {}) => {
  const { alertSuccess, alertError } = alertFunctions;
  
  // Método 1: Tentar Cloud Function (se deploy funcionar)
  try {
    console.log('🔍 Tentando Cloud Function...');
    const { enviarEmailNotificacaoEtapa } = await import('./emailService');
    const result = await enviarEmailNotificacaoEtapa(dadosEtapa);
    
    if (alertSuccess) {
      alertSuccess('✅ E-mail enviado automaticamente!', 4000);
    }
    
    return { success: true, method: 'cloud-function' };
    
  } catch (error) {
    console.warn('⚠️ Cloud Function falhou, tentando método alternativo...');
    
    // Método 2: Tentar EmailJS
    try {
      const result = await enviarEmailComEmailJS(dadosEtapa);
      
      if (alertSuccess) {
        alertSuccess('✅ E-mail enviado via EmailJS!', 4000);
      }
      
      return { success: true, method: 'emailjs' };
      
    } catch (error) {
      console.warn('⚠️ EmailJS falhou, usando mailto...');
      
      // Método 3: Fallback para mailto (abre Outlook)
      try {
        const result = enviarEmailComFallback(dadosEtapa);
        
        if (alertSuccess) {
          alertSuccess('📧 Outlook aberto. Clique em enviar.', 4000);
        }
        
        return { success: true, method: 'mailto' };
        
      } catch (error) {
        console.error('❌ Todos os métodos falharam:', error);
        
        if (alertError) {
          alertError('❌ Erro ao enviar e-mail. Verifique sua conexão.', 5000);
        }
        
        throw error;
      }
    }
  }
};

export default {
  enviarEmailComFallback,
  enviarEmailComEmailJS,
  enviarEmailComAPI,
  enviarEmailRobusto
};