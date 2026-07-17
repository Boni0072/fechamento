# 🔐 Como Habilitar o Botão "Abrir no App" do Navegador

## ❌ Problema
O botão "Instalar App" ou "Abrir no App" não aparece na barra do navegador.

## ✅ Solução
O navegador **só mostra o botão de instalação em HTTPS** (ou em localhost com certificado).

---

## 📋 Passo 1: Gerar Certificados SSL

### Windows (PowerShell):
```powershell
.\generate-certs.bat
```

### Mac/Linux (Bash):
```bash
bash generate-certs.sh
```

### O que ele faz?
- Cria uma pasta `.cert/` com certificados SSL autoassinados
- Permite servir em `https://localhost:3000`
- Válido por 365 dias

---

## 🚀 Passo 2: Iniciar o servidor

```bash
npm run dev
```

O navegador abrirá automaticamente em `https://localhost:3000` (note o HTTPS).

---

## ⚠️ Certificado não confiável?

Isso é normal! O certificado é autoassinado. Clique em:
- Chrome/Edge: **Avançado** → **Prosseguir para localhost**
- Firefox: **Aceitar risco e continuar**

---

## ✓ Verificar se PWA está habilitado

1. Abra **DevTools** (F12)
2. Vá para **Application** (ou **Aplicativos**)
3. Verifique:
   - ✓ **Service Workers** (deve estar ativo)
   - ✓ **Manifest** (deve carregar sem erros)

---

## 🎯 Agora você verá:

1. **Banner no topo** - "✓ Pronto para instalar!"
2. **Botão flutuante verde** - Ícone de download
3. **Botão do navegador** - "Instalar" ou "Adicionar app" na barra do navegador

---

## 🌐 Em Produção (Vercel)

Você **não precisa fazer nada**! O Vercel já serve com HTTPS automaticamente.

O botão "Abrir no app" aparecerá automaticamente no navegador do usuário.

---

## 📱 Testando a Instalação

Após habilitar HTTPS:

### Desktop (Chrome/Edge):
1. Clique no ícone de download na barra
2. Selecione "Instalar"
3. App aparece na tela inicial do Windows

### Mobile (Android Chrome):
1. Menu (⋮) → "Instalar app"
2. App aparece na tela inicial

### iOS (Safari):
1. Compartilhar → "Adicionar à Tela inicial"
2. Selecione "Adicionar"

---

## 🔧 Troubleshooting

### "Certificado expirou"
Regenere os certificados:
```bash
rm -rf .cert/
npm run dev  # ou execute generate-certs.bat/sh novamente
```

### "Service Worker não está registrado"
Verifique o console (F12) para erros. Limpe o cache:
```
DevTools → Application → Clear storage → Clear site data
```

### "Ainda não vejo o botão de instalar"
Certifique-se de:
- ✓ Estar em `https://localhost:3000` (não http)
- ✓ Service Worker estar ativo (DevTools → Application)
- ✓ Manifest.json está carregando (DevTools → Application → Manifest)

---

## 📚 Mais informações

- [MDN - PWA](https://developer.mozilla.org/docs/Web/Progressive_web_apps)
- [Google Developers - PWA](https://developers.google.com/web/progressive-web-apps)
- [Vite HTTPS](https://vitejs.dev/config/server-options.html#server-https)

---

**Status**: ✅ Pronto para testar instalação do PWA
