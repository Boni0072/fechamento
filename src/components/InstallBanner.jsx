import { useState, useEffect } from 'react';
import { Download, X, AlertCircle } from 'lucide-react';

export default function InstallBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [isHTTPS, setIsHTTPS] = useState(false);
  const [browserSupport, setBrowserSupport] = useState('');

  useEffect(() => {
    // Verificar se é HTTPS
    const protocol = window.location.protocol;
    setIsHTTPS(protocol === 'https:');

    // Detectar navegador
    const ua = navigator.userAgent;
    if (ua.includes('Chrome') && !ua.includes('Edge')) {
      setBrowserSupport('chrome');
    } else if (ua.includes('Edge')) {
      setBrowserSupport('edge');
    } else if (ua.includes('Firefox')) {
      setBrowserSupport('firefox');
    } else if (ua.includes('Safari')) {
      setBrowserSupport('safari');
    }

    // Mostrar banner se está em HTTPS ou localhost
    const shouldShow = protocol === 'https:' || window.location.hostname === 'localhost';
    setShowBanner(shouldShow);
  }, []);

  if (!showBanner) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-3 flex items-center justify-between gap-4 z-30 shadow-lg">
      <div className="flex items-center gap-3 flex-1">
        <img 
          src="/Secontaf1.png" 
          alt="Logo" 
          className="w-5 h-5 object-contain"
        />
        <div className="text-sm">
          <p className="font-semibold">
            {isHTTPS ? '✓ Pronto para instalar!' : '⚠ Certifique-se de estar em HTTPS'}
          </p>
          <p className="text-xs opacity-90">
            {isHTTPS 
              ? 'Procure por "Instalar" ou "Adicionar app" no menu do navegador' 
              : 'Use HTTPS para habilitar a instalação completa do app'}
          </p>
        </div>
      </div>
      <button
        onClick={() => setShowBanner(false)}
        className="p-2 hover:bg-white/20 rounded transition-colors flex-shrink-0"
        title="Fechar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
