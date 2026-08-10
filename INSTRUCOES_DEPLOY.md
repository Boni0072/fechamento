# ⚠️ SIGA ESTES COMANDOS EXATAMENTE

## 🎯 Você está no Git Bash - Use comandos corretos!

### ❌ NÃO use:
```bash
cd C:\Users\01702317\...
```

### ✅ USE:
```bash
cd /c/Users/01702317/Desktop/PROGRAMAS/fechamento-main/fechamento_firebase
```

---

## 📝 COMANDOS NA ORDEM CORRETA:

### 1. Navegar para a pasta (COPIE E COLE):
```bash
cd /c/Users/01702317/Desktop/PROGRAMAS/fechamento-main/fechamento_firebase
```

### 2. Fazer login (COPIE E COLE):
```bash
firebase login --reauth
```
**Isso vai abrir uma janela no navegador. Faça login com sua conta Google.**

### 3. Listar projetos (COPIE E COLE):
```bash
firebase projects:list
```
**Anote o project_id do projeto (ex: fechamentooba)**

### 4. Selecionar projeto (SUBSTITUA pelo seu project_id):
```bash
firebase use --add
```
**Digite o project_id que você anotou no passo 3**

### 5. Fazer deploy (COPIE E COLE):
```bash
firebase deploy --only functions
```

---

## ✅ COMANDO TUDO EM UM (se já souber o project_id):

```bash
cd /c/Users/01702317/Desktop/PROGRAMAS/fechamento-main/fechamento_firebase && firebase login --reauth && firebase deploy --only functions --project SEU_PROJECT_ID_AQUI
```

**Substitua `SEU_PROJECT_ID_AQUI` pelo nome do seu projeto!**

---

## 🎯 Depois do deploy bem-sucedido:

Você verá:
```
✔  functions: sendNotificationEmail(us-central1) created successfully
✔  Deploy complete!
```

---

## 🧪 Teste:

1. **Recarregue a página** (Ctrl + F5)
2. **Conclua uma etapa**
3. **Verifique:**
   - ✅ Não aparece erro CORS
   - ✅ Alerta visual aparece
   - 🔊 Som toca
   - 📧 E-mail é enviado automaticamente

---

## 🆘 Se der erro de autenticação:

Execute novamente:
```bash
firebase login --reauth
```

## 🆘 Se der erro de projeto:

Execute:
```bash
firebase use --add
```

E selecione o projeto correto.

---

## ⚠️ LEMBRE-SE:

- **NÃO** use `C:\` no Git Bash, use `/c/`
- **NÃO** esqueça de fazer login
- **NÃO** esqueça de selecionar o projeto
- **SIM** o deploy resolve o erro CORS!