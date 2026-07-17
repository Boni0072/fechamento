import React, { useEffect, useRef, useState } from 'react';

export default function ImobilizadoEmAndamento() {
  const embedContainerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);

  // Power BI configuration
  // Substitua os valores abaixo com as credenciais do seu relatório Power BI
  const EMBED_ACCESS_TOKEN = 'YOUR_EMBED_ACCESS_TOKEN';
  const EMBED_URL = 'YOUR_EMBED_URL';
  const REPORT_ID = 'YOUR_REPORT_ID';
  const TOKEN_TYPE = '0'; // 0 = AAD, 1 = Embed

  useEffect(() => {
    let isMounted = true;

    const loadPowerBI = async () => {
      try {
        // Carrega a biblioteca Power BI Client se não estiver carregada
        if (!window['powerbi-client']) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/powerbi-client@2.22.0/dist/powerbi.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Falha ao carregar biblioteca Power BI'));
            document.head.appendChild(script);
          });
        }

        if (!isMounted) return;

        const models = window['powerbi-client'].models;

        const config = {
          type: 'report',
          tokenType: TOKEN_TYPE === '0' ? models.TokenType.Aad : models.TokenType.Embed,
          accessToken: EMBED_ACCESS_TOKEN,
          embedUrl: EMBED_URL,
          id: REPORT_ID,
          permissions: models.Permissions.All,
          settings: {
            panes: {
              filters: { visible: true },
              pageNavigation: { visible: true }
            },
            bars: {
              statusBar: { visible: true }
            }
          }
        };

        const embedContainer = embedContainerRef.current;
        const powerbiReport = window.powerbi.embed(embedContainer, config);

        // Evento: relatório carregado
        powerbiReport.on('loaded', () => {
          if (isMounted) {
            setLoading(false);
            setReport(powerbiReport);
          }
        });

        // Evento: erro no relatório
        powerbiReport.on('error', (event) => {
          console.error('Power BI Error:', event.detail);
          if (isMounted) {
            setError(event.detail?.message || 'Erro ao carregar o relatório Power BI');
            setLoading(false);
          }
        });

        // Evento: relatório renderizado
        powerbiReport.on('rendered', () => {
          console.log('Power BI report rendered successfully');
        });

      } catch (err) {
        console.error('Error loading Power BI:', err);
        if (isMounted) {
          setError(err.message || 'Erro ao carregar a biblioteca Power BI');
          setLoading(false);
        }
      }
    };

    loadPowerBI();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Imobilizado em Andamento</h1>
        <p className="text-slate-500 text-sm mt-1">Relatório Power BI - Acompanhamento de imobilizados</p>
      </div>

      <div className="flex-1 bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-slate-500">Carregando relatório...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-96">
            <div className="text-center p-6">
              <div className="text-red-500 text-4xl mb-4">⚠️</div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Erro ao carregar relatório</h3>
              <p className="text-slate-500">{error}</p>
              <p className="text-slate-400 text-sm mt-2">
                Verifique se as credenciais do Power BI estão configuradas corretamente.
              </p>
            </div>
          </div>
        )}

        <div
          ref={embedContainerRef}
          className="w-full h-full min-h-[600px]"
          style={{ display: loading || error ? 'none' : 'block' }}
        />
      </div>
    </div>
  );
}