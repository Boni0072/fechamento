import React, { useEffect, useState } from 'react';
import './NotificationAlert.css';

/**
 * Componente de Alerta Visual e Sonoro
 * Exibe notificações com animação e som
 */

// Tipos de notificação
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// Cores por tipo
const TYPE_COLORS = {
  [NOTIFICATION_TYPES.SUCCESS]: '#28a745',
  [NOTIFICATION_TYPES.ERROR]: '#dc3545',
  [NOTIFICATION_TYPES.WARNING]: '#ffc107',
  [NOTIFICATION_TYPES.INFO]: '#17a2b8'
};

// Ícones por tipo (emoji)
const TYPE_ICONS = {
  [NOTIFICATION_TYPES.SUCCESS]: '✅',
  [NOTIFICATION_TYPES.ERROR]: '❌',
  [NOTIFICATION_TYPES.WARNING]: '⚠️',
  [NOTIFICATION_TYPES.INFO]: 'ℹ️'
};

/**
 * Hook para gerenciar notificações
 */
export const useNotification = () => {
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = NOTIFICATION_TYPES.INFO, duration = 5000) => {
    setNotification({ message, type, id: Date.now() });
    
    // Reproduz som
    playNotificationSound(type);
    
    // Remove automaticamente após duration
    if (duration > 0) {
      setTimeout(() => {
        setNotification(null);
      }, duration);
    }
  };

  const hideNotification = () => {
    setNotification(null);
  };

  return { notification, showNotification, hideNotification };
};

/**
 * Função para reproduzir som de notificação
 * Usa Web Audio API para gerar sons
 */
export const playNotificationSound = (type = NOTIFICATION_TYPES.INFO) => {
  try {
    // Cria contexto de áudio
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // Conecta os nós
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Configura o som baseado no tipo
    switch (type) {
      case NOTIFICATION_TYPES.SUCCESS:
        // Som agradável (nota alta)
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        break;
      
      case NOTIFICATION_TYPES.ERROR:
        // Som de erro (nota baixa)
        oscillator.frequency.value = 200;
        oscillator.type = 'sawtooth';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        break;
      
      case NOTIFICATION_TYPES.WARNING:
        // Som de alerta (média)
        oscillator.frequency.value = 500;
        oscillator.type = 'square';
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        break;
      
      case NOTIFICATION_TYPES.INFO:
      default:
        // Som informativo
        oscillator.frequency.value = 600;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        break;
    }

    // Toca o som
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

  } catch (error) {
    console.error('Erro ao reproduzir som:', error);
    // Fallback: tenta usar beep do sistema
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleR4GP5ra16V5HgY/mtrXpXkeBj+a2teleR4GP5ra16V5HgY/mtrXpXkeBj+a2teleR4GPw==');
      audio.play().catch(() => {});
    } catch (e) {
      // Silencia erro se não conseguir tocar som
    }
  }
};

/**
 * Componente de Notificação Visual
 */
const NotificationAlert = ({ notification, onClose }) => {
  if (!notification) return null;

  const { message, type, id } = notification;
  const backgroundColor = TYPE_COLORS[type] || TYPE_COLORS[NOTIFICATION_TYPES.INFO];
  const icon = TYPE_ICONS[type] || TYPE_ICONS[NOTIFICATION_TYPES.INFO];

  return (
    <div 
      className="notification-alert"
      style={{ backgroundColor }}
      onClick={onClose}
    >
      <div className="notification-content">
        <span className="notification-icon">{icon}</span>
        <span className="notification-message">{message}</span>
      </div>
      <button className="notification-close" onClick={onClose}>
        ×
      </button>
    </div>
  );
};

/**
 * Provider de Notificações
 * Envolve a aplicação para gerenciar notificações globalmente
 */
export const NotificationProvider = ({ children }) => {
  const { notification, showNotification, hideNotification } = useNotification();

  return (
    <>
      {children}
      <NotificationAlert 
        notification={notification} 
        onClose={hideNotification}
      />
    </>
  );
};

/**
 * Hook simplificado para usar em componentes
 */
export const useAlert = () => {
  const { showNotification } = useNotification();

  const alertSuccess = (message, duration = 5000) => {
    showNotification(message, NOTIFICATION_TYPES.SUCCESS, duration);
  };

  const alertError = (message, duration = 5000) => {
    showNotification(message, NOTIFICATION_TYPES.ERROR, duration);
  };

  const alertWarning = (message, duration = 5000) => {
    showNotification(message, NOTIFICATION_TYPES.WARNING, duration);
  };

  const alertInfo = (message, duration = 5000) => {
    showNotification(message, NOTIFICATION_TYPES.INFO, duration);
  };

  return {
    alertSuccess,
    alertError,
    alertWarning,
    alertInfo,
    showNotification
  };
};

export default NotificationAlert;