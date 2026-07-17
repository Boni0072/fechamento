// Utility para registrar e gerenciar o Service Worker para PWA

export async function registerServiceWorker() {
  // Verificar se o navegador suporta Service Workers
  if (!('serviceWorker' in navigator)) {
    console.log('Service Workers não são suportados neste navegador');
    return null;
  }

  try {
    // Registrar o service worker
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/'
    });

    console.log('✓ Service Worker registrado com sucesso:', registration);

    // Escutar atualizações
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Nova versão disponível
          console.log('✓ Nova versão do app disponível');
          notifyUserAboutUpdate();
        }
      });
    });

    // Verificar atualizações a cada hora
    setInterval(() => {
      registration.update();
    }, 60 * 60 * 1000);

    return registration;
  } catch (error) {
    console.error('✗ Erro ao registrar Service Worker:', error);
    return null;
  }
}

// Notificar usuário sobre atualização disponível
function notifyUserAboutUpdate() {
  // Você pode mostrar um toast ou modal aqui
  if (window.confirm('Uma nova versão do app está disponível. Deseja recarregar?')) {
    window.location.reload();
  }
}

// Unregistrar service worker (para limpeza)
export async function unregisterServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (let registration of registrations) {
      await registration.unregister();
    }
    console.log('✓ Service Workers removidos');
  } catch (error) {
    console.error('✗ Erro ao remover Service Workers:', error);
  }
}

// Verificar se o app está instalado
export function isAppInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

// Detectar se o navegador suporta instalação de PWA
export function isPWASupported() {
  return 'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
}
