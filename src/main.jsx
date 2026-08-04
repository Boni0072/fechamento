import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { registerServiceWorker } from './services/pwaService'

// Debug: Log para verificar ambiente
console.log('🔍 Environment:', {
  mode: import.meta.env.MODE,
  dev: import.meta.env.DEV,
  prod: import.meta.env.PROD,
  firebase_api_key: import.meta.env.VITE_FIREBASE_API_KEY ? '✓ Definido' : '✗ Não definido',
  firebase_project_id: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'unknown',
  url: window.location.href,
  root_element: document.getElementById('root'),
});

// Registrar Service Worker para PWA
registerServiceWorker().catch(error => {
  console.warn('PWA não disponível:', error);
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('❌ ERRO CRÍTICO: Elemento "root" não encontrado no HTML!');
  document.body.innerHTML = '<div style="padding:20px;background:red;color:white;font-family:monospace;">ERRO: Elemento root não encontrado. Verifique index.html</div>';
} else {
  console.log('✓ Elemento root encontrado. Iniciando React...');
  
  try {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
        </ThemeProvider>
      </React.StrictMode>,
    );
    console.log('✓ React renderizado com sucesso');
  } catch (error) {
    console.error('❌ ERRO ao renderizar React:', error);
    rootElement.innerHTML = `<div style="padding:20px;background:red;color:white;font-family:monospace;"><strong>Erro de Renderização:</strong><br/>${error.message}</div>`;
  }
}
