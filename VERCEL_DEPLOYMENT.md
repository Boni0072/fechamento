# 🚀 Guia de Deployment no Vercel

## Erro Resolvido
Se estava recebendo erro `Failed to load resource: /src/main.jsx 404`:
- ✅ Vite config atualizado com configuração de build
- ✅ vercel.json criado
- ✅ Variáveis de ambiente configuradas

## Passos para Fazer Deploy no Vercel

### 1. Conectar Repositório
```bash
# Fazer push do código para GitHub
git add .
git commit -m "Atualizar config para Vercel"
git push origin main
```

### 2. Criar Projeto no Vercel
1. Acesse: https://vercel.com/new
2. Selecione seu repositório
3. Vercel detectará automaticamente que é um projeto Vite

### 3. Configurar Variáveis de Ambiente
No dashboard do Vercel, vá em **Settings → Environment Variables** e adicione:

```
VITE_FIREBASE_API_KEY = AIzaSyAHLusZnZueNB5hewPSz1XznUB3xMygvyw
VITE_FIREBASE_AUTH_DOMAIN = fechamentooba.firebaseapp.com
VITE_FIREBASE_DATABASE_URL = https://fechamentooba-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID = fechamentooba
VITE_FIREBASE_STORAGE_BUCKET = fechamentooba.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID = 508432978183
VITE_FIREBASE_APP_ID = 1:508432978183:web:d316c127c4882ee85f35a2
```

### 4. Deploy
Clique em **Deploy** e aguarde a conclusão.

---

## Estrutura do Build

```
📁 fechamento_firebase/
├── 📄 vite.config.js          ✅ Configurado com build
├── 📄 vercel.json             ✅ Configuração Vercel
├── 📄 .vercelignore           ✅ Arquivos ignorados
├── 📄 .env                    ✅ Variáveis locais (NÃO commitar)
├── 📄 .gitignore              ✅ Atualizado
├── 📁 dist/                   (Gerado após build)
└── 📁 src/
    └── main.jsx               ✅ Entry point
```

---

## Verificação Pós-Deploy

✅ URL pública disponível  
✅ Login funciona  
✅ Firebase conectado  
✅ Service Worker registrado  

---

## Troubleshooting

### "404 on main.jsx"
- Verifique se as variáveis de ambiente estão definidas no Vercel
- Confirme que `npm run build` funciona localmente:
  ```bash
  npm run build
  npm run preview
  ```

### "Firebase 403"
- Adicione domínio do Vercel nas Regras de CORS do Firebase
- Vá em **Firebase Console → Realtime Database → Rules**

### "Módulos não encontrados"
- Verifique se `pnpm-lock.yaml` está no git
- Ou remova e deixe Vercel usar `npm install`

---

## Comandos Úteis

```bash
# Testar build localmente
npm run build
npm run preview

# Limpar cache
rm -rf dist node_modules
npm install
npm run build
```

---

## Arquivos Criados/Atualizados

| Arquivo | Propósito |
|---------|-----------|
| `vite.config.js` | Adicionado `build` config |
| `vercel.json` | Novo - Config Vercel |
| `.vercelignore` | Novo - Arquivos ignorados |
| `.env.example` | Novo - Referência de vars |
| `.gitignore` | Atualizado |

---

## Próximos Passos

1. ✅ Fazer push das mudanças
2. ✅ Conectar repo no Vercel  
3. ✅ Adicionar variáveis de ambiente
4. ✅ Trigger deploy automático

🎉 **Done!** Seu app estará online em `https://seu-projeto.vercel.app`
