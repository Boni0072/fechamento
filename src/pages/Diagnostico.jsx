import React, { useEffect, useState } from 'react';

export default function DiagnosticPage() {
  const [diagnostics, setDiagnostics] = useState({
    environment: {},
    firebase: {},
    dom: {},
    errors: []
  });

  useEffect(() => {
    const diag = {
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY ? '✓' : '✗',
        VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'undefined',
        VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'undefined',
        URL: window.location.href,
        User_Agent: navigator.userAgent,
      },
      dom: {
        root_element_exists: !!document.getElementById('root'),
        document_ready: document.readyState,
        body_children: document.body.children.length,
      },
      firebase: {
        modules_loaded: true
      },
      errors: []
    };

    // Check console errors
    const originalError = console.error;
    const errors = [];
    console.error = (...args) => {
      errors.push(args.join(' '));
      originalError(...args);
    };

    setDiagnostics(diag);
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', background: '#f5f5f5' }}>
      <h1>🔍 Diagnóstico - Fechamento Contábil</h1>
      
      <section style={{ marginTop: '20px' }}>
        <h2>Environment</h2>
        <pre style={{ background: '#fff', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}>
          {JSON.stringify(diagnostics.environment, null, 2)}
        </pre>
      </section>

      <section style={{ marginTop: '20px' }}>
        <h2>DOM</h2>
        <pre style={{ background: '#fff', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}>
          {JSON.stringify(diagnostics.dom, null, 2)}
        </pre>
      </section>

      <section style={{ marginTop: '20px' }}>
        <h2>Firebase</h2>
        <pre style={{ background: '#fff', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}>
          {JSON.stringify(diagnostics.firebase, null, 2)}
        </pre>
      </section>

      <section style={{ marginTop: '20px' }}>
        <h2>Próximas Ações</h2>
        <ul>
          <li>✓ Verifique se o root element existe no DOM</li>
          <li>✓ Verifique se as variáveis Firebase estão definidas</li>
          <li>✓ Abra DevTools (F12) e veja a aba Console para erros</li>
          <li>✓ Verifique em Settings → Environment Variables no Vercel</li>
        </ul>
      </section>

      <section style={{ marginTop: '20px', background: '#ffe6e6', padding: '10px', borderRadius: '4px' }}>
        <h3>🆘 Se vir esta página, significa:</h3>
        <p>O JavaScript foi carregado, mas a página está em branco.</p>
        <p>Abra o DevTools (F12) → Console para ver os erros específicos.</p>
      </section>
    </div>
  );
}
