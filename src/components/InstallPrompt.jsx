import { useState, useEffect } from 'react';
import { Download, Smartphone, Monitor, X, AlertCircle, HelpCircle, CheckCircle } from 'lucide-react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installPlatform, setInstallPlatform] = useState('');
  const [showManualInstructions, setShowManualInstructions] = useState(false);
  const [isPWASupported, setIsPWASupported] = useState(true);
  const [isHTTPS, setIsHTTPS] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');

  useEffect(() => {
    // Verificar protocolo
    const https = window.location.protocol === 'https:';
    setIsHTTPS(https);
    console.log('🔒 HTTPS:', https);

    // Listener para o evento beforeinstallprompt do navegador
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log('✅ beforeinstallprompt disparado - PWA instalável!');
      setDebugInfo('PWA Instalável');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Detectar quando o app foi instalado
    const handleAppInstalled = () => {
      console.log('✅ App instalado com sucesso!');
      setDeferredPrompt(null);
      setShowInstallModal(false);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // Verificar suporte a PWA
    const checkPWASupport = () => {
      const isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
      setIsPWASupported(isSupported);
      console.log('📱 PWA suportado:', isSupported);
    };

    checkPWASupport();

    // Registrar o service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .then((registration) => {
          console.log('✅ Service Worker registrado:', registration);
          setDebugInfo(prev => prev ? `${prev} + SW Ativo` : 'SW Ativo');
        })
        .catch((error) => {
          console.warn('⚠️ Erro ao registrar Service Worker:', error);
          setDebugInfo(prev => prev ? `${prev} + SW Erro` : 'SW Erro');
        });
    }

    // Verificar se manifest está carregando
    fetch('/manifest.json')
      .then(r => {
        if (r.ok) {
          console.log('✅ Manifest.json carregado');
          setDebugInfo(prev => `${prev} + Manifest OK`);
        }
      })
      .catch(e => {
        console.warn('⚠️ Erro ao carregar manifest:', e);
        setDebugInfo(prev => `${prev} + Manifest Erro`);
      });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async (platform) => {
    if (!deferredPrompt) {
      setShowManualInstructions(true);
      return;
    }

    setInstallPlatform(platform);
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log(`✅ App instalado em ${platform}`);
      setShowInstallModal(false);
      alert('Aplicação instalada com sucesso! Você pode encontrar o atalho na sua tela inicial.');
    } else {
      console.log('❌ Instalação cancelada');
    }

    setDeferredPrompt(null);
  };

  return (
    <>
      {/* Botão flutuante para instalar - SEMPRE VISÍVEL */}
      <button
        onClick={() => setShowInstallModal(true)}
        className="fixed bottom-20 right-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-full p-3 shadow-lg hover:shadow-xl transition-all duration-300 z-40 animate-bounce"
        title="Instalar aplicação"
      >
        <Download className="w-6 h-6" />
      </button>

      {/* Modal de Instalação */}
      {showInstallModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
            <button
              onClick={() => {
                setShowInstallModal(false);
                setShowManualInstructions(false);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            {showManualInstructions ? (
              // Instruções manuais
              <div>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden">
                    <img 
                      src="/Secontaf1.png"
                      alt="Logo da empresa"
                      className="w-14 h-14 object-contain"
                    />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Instalar Manualmente</h2>
                  <p className="text-slate-300 text-sm">Siga as instruções para seu navegador</p>
                </div>

                <div className="space-y-4 mb-6">
                  {/* Chrome/Edge */}
                  <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-600">
                    <h3 className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-red-400" />
                      Chrome / Edge / Firefox
                    </h3>
                    <ol className="text-xs text-slate-300 space-y-1 list-decimal list-inside">
                      <li>Clique no menu (⋮) no canto superior direito</li>
                      <li>Procure por "Instalar app" ou "Instalar Fechamento"</li>
                      <li>Clique para instalar</li>
                    </ol>
                  </div>

                  {/* iOS Safari */}
                  <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-600">
                    <h3 className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-gray-300" />
                      iOS / Safari
                    </h3>
                    <ol className="text-xs text-slate-300 space-y-1 list-decimal list-inside">
                      <li>Toque em Compartilhar</li>
                      <li>Selecione "Adicionar à Tela inicial"</li>
                      <li>Escolha um nome e confirme</li>
                    </ol>
                  </div>

                  {/* Android */}
                  <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-600">
                    <h3 className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-green-400" />
                      Android
                    </h3>
                    <ol className="text-xs text-slate-300 space-y-1 list-decimal list-inside">
                      <li>No Chrome, toque no menu (⋮)</li>
                      <li>Selecione "Instalar app"</li>
                      <li>Confirme a instalação</li>
                    </ol>
                  </div>
                </div>

                <button
                  onClick={() => setShowManualInstructions(false)}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  Voltar
                </button>
              </div>
            ) : (
              // Interface principal
              <>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-gradient-to-tr from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden">
                    <img 
                      src="/Secontaf1.png"
                      alt="Logo da empresa"
                      className="w-14 h-14 object-contain"
                    />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Instalar Aplicação</h2>
                  <p className="text-slate-300 text-sm">
                    Instale o Fechamento Contábil em seu dispositivo para acessar de forma rápida e offline
                  </p>
                </div>

                {/* Aviso se não for HTTPS */}
                {typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && (
                  <div className="p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg mb-4 flex gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-200">
                      A instalação funciona melhor com HTTPS. Você está em modo desenvolvimento.
                    </p>
                  </div>
                )}

                {/* Status do PWA */}
                {!isHTTPS && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-yellow-400" />
                      <p className="text-yellow-300 font-semibold text-xs">⚠ Use HTTPS para instalar</p>
                    </div>
                    <p className="text-yellow-300 ml-6 text-xs">Veja HTTPS_SETUP.md para configurar certificados</p>
                  </div>
                )}

                {isHTTPS && (
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg mb-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <p className="text-green-300 font-semibold text-xs">✓ Pronto para instalar</p>
                    </div>
                  </div>
                )}

                <div className="space-y-3 mb-6">
                  {/* Opção Celular */}
                  <button
                    onClick={() => handleInstall('celular')}
                    disabled={installPlatform === 'celular'}
                    className="w-full p-4 bg-slate-900/50 border border-slate-600 hover:border-blue-500 rounded-lg transition-all hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-4"
                  >
                    <div className="bg-blue-500/20 p-2 rounded-lg">
                      <Smartphone className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="text-left flex-1">
                      <h3 className="text-white font-semibold text-sm">Celular/Tablet</h3>
                      <p className="text-slate-400 text-xs">iOS ou Android</p>
                    </div>
                    {installPlatform === 'celular' && (
                      <span className="text-green-400 text-xs font-semibold">Instalando...</span>
                    )}
                  </button>

                  {/* Opção Desktop */}
                  <button
                    onClick={() => handleInstall('desktop')}
                    disabled={installPlatform === 'desktop'}
                    className="w-full p-4 bg-slate-900/50 border border-slate-600 hover:border-purple-500 rounded-lg transition-all hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-4"
                  >
                    <div className="bg-purple-500/20 p-2 rounded-lg">
                      <Monitor className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="text-left flex-1">
                      <h3 className="text-white font-semibold text-sm">Desktop</h3>
                      <p className="text-slate-400 text-xs">Windows, Mac ou Linux</p>
                    </div>
                    {installPlatform === 'desktop' && (
                      <span className="text-green-400 text-xs font-semibold">Instalando...</span>
                    )}
                  </button>
                </div>

                <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 mb-6">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    ✓ Vantagens da instalação:
                  </h3>
                  <ul className="space-y-2 text-xs text-slate-300">
                    <li className="flex gap-2">
                      <span className="text-green-400">•</span>
                      <span>Acesso rápido na tela inicial</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-green-400">•</span>
                      <span>Funcionamento offline (modo leitura)</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-green-400">•</span>
                      <span>Sem anúncios ou endereço URL visível</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-green-400">•</span>
                      <span>Atualizações automáticas</span>
                    </li>
                  </ul>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowInstallModal(false)}
                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => setShowManualInstructions(true)}
                    className="flex-1 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    Instruções
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
