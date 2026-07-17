# 🔍 Tela Branca no Vercel - Guia de Solução

## 🆘 Seu app está mostrando tela em branco no Vercel?

Isto geralmente significa que o app foi deployado, mas há um erro que impede o React de renderizar.

---

## 🔧 PASSO 1: Diagnosticar o Problema

### Abra a página de diagnóstico:
```
https://seu-app-no-vercel.vercel.app/diagnostico
```

Se conseguir ver uma página com informações, significa que o JavaScript está carregando.

### Se vir tela branca MESMO nessa URL:
1. Abra **DevTools (F12)**
2. Vá para a aba **Console**
3. Procure por mensagens de erro em VERMELHO
4. **Copie o erro completo** e compare com a seção abaixo

---

## ⚠️ PROBLEMA #1: Variáveis de Ambiente Não Definidas

### Sintomas:
- Console mostra: `❌ [Firebase] Variáveis de ambiente FALTANDO`
- Console mostra: `⚠️ O app não conseguiu conectar ao Firebase`

### Solução:

1. **Acesse o Vercel:**
   - https://vercel.com/dashboard
   - Selecione seu projeto

2. **Vá em Settings:**
   - Clique em **Settings** (ou Configurações)
   - Procure por **Environment Variables**

3. **Adicione as variáveis:**
   ```
   VITE_FIREBASE_API_KEY = AIzaSyAHLusZnZueNB5hewPSz1XznUB3xMygvyw
   VITE_FIREBASE_AUTH_DOMAIN = fechamentooba.firebaseapp.com
   VITE_FIREBASE_DATABASE_URL = https://fechamentooba-default-rtdb.firebaseio.com
   VITE_FIREBASE_PROJECT_ID = fechamentooba
   VITE_FIREBASE_STORAGE_BUCKET = fechamentooba.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID = 508432978183
   VITE_FIREBASE_APP_ID = 1:508432978183:web:d316c127c4882ee85f35a2
   ```

4. **Redeployar:**
   - Vá em **Deployments**
   - Clique nos três pontinhos (⋮) do último deploy
   - Clique em **Redeploy** (sem usar cache)

5. **Espere 1-2 minutos** e recarregue

---

## ⚠️ PROBLEMA #2: Erro de Auth (Autenticação)

### Sintomas:
- Console mostra erros sobre Firebase Auth
- Erros de CORS ou "permission denied"

### Solução:

1. **Adicione seu domínio Vercel no Firebase:**
   - Acesse: https://console.firebase.google.com
   - Selecione o projeto: `fechamentooba`
   - Vá em **Authentication → Settings**
   - Procure por **Authorized domains**
   - Clique em **Add domain**
   - Digite: `seu-app.vercel.app`

2. **Redeployar no Vercel** (veja Problema #1, passo 4)

---

## ⚠️ PROBLEMA #3: Erro de React

### Sintomas:
- Console mostra um erro vermelho com "React", "Error", ou nome de função
- Exemplo: `TypeError: Cannot read property 'xxx' of undefined`

### Solução:

1. **Copie o erro completo do console**
2. **Verifique o passo 1 (Problema #1)**
   - Provavelmente as variáveis de ambiente ainda não estão definidas
3. **Se o erro persistir:**
   - Verifique que todas as 7 variáveis estão no Vercel
   - Verifique que nenhuma variável tem espaços em branco

---

## 🧪 TESTANDO LOCALMENTE

Se quer testar antes de fazer deploy:

```bash
# Build production
npm run build

# Preview do build
npm run preview
```

Acesse `http://localhost:4173` e veja se funciona.

---

## 📋 Checklist de Solução

- [ ] Abri `/diagnostico` e consegui ver a página
- [ ] Verifiquei o Console (F12) e copiei os erros
- [ ] Adicionei as 7 variáveis Firebase no Vercel Settings
- [ ] Fiz Redeploy no Vercel (sem cache)
- [ ] Esperei 2-3 minutos
- [ ] Recarreguei a página no navegador
- [ ] Fiz hard refresh (Ctrl+Shift+R)

---

## 🆘 Ainda não funciona?

### Debug avançado:

1. **Limpe o cache do Vercel:**
   - Deployments → (três pontinhos) → **Clear Cache & Redeploy**

2. **Verifique o build log:**
   - Vá em **Deployments**
   - Clique no último deploy
   - Procure por erros na seção **Build** (não Production)
   - Se houver erro de compilação, corrija em local

3. **Teste localmente primeiro:**
   ```bash
   npm run build
   npm run preview
   # Se der erro, não vai funcionar no Vercel também
   ```

4. **Variáveis case-sensitive:**
   - `VITE_FIREBASE_API_KEY` (não `vite_firebase_api_key`)
   - Devem começar com `VITE_`

---

## 📞 Informações Úteis

| Variável | Valor |
|----------|-------|
| Projeto Firebase | fechamentooba |
| Auth Domain | fechamentooba.firebaseapp.com |
| Database URL | https://fechamentooba-default-rtdb.firebaseio.com |

---

## ✅ Confirmação de Sucesso

Quando funcionar, você verá:
1. ✓ Tela de login
2. ✓ Campo de email/senha ou Google
3. ✓ Sem tela branca
4. ✓ Console sem erros vermelhos (só warnings amarelos OK)

---

**Dúvidas?** Verifique o console (F12) → aba Console → procure por mensagens em vermelho.

