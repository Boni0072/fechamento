# Comandos para Fazer Deploy da Cloud Function

## 📋 Pré-requisitos

1. **Firebase CLI instalado** (você já tem, pois conseguiu executar o comando)
2. **Credenciais válidas** (você precisa fazer login novamente)
3. **Projeto Firebase configurado**

## 🚀 Passo a Passo

### Passo 1: Navegar até a pasta correta

Você já está na pasta correta:
```bash
cd ~/Desktop/PROGRAMAS/fechamento-main/fechamento-main/fechamento_firebase
```

**OU** use o caminho relativo:
```bash
cd fechamento_firebase
```

### Passo 2: Fazer login no Firebase

```bash
firebase login --reauth
```

Isso vai abrir uma janela no navegador para você fazer login.

### Passo 3: Verificar projetos disponíveis

```bash
firebase projects:list
```

Anote o **project_id** do projeto (deve ser algo como `fechamentooba` ou similar).

### Passo 4: Selecionar o projeto

```bash
firebase use --add
```

Quando perguntar o projeto, digite o project_id que você anotou no passo 3.

### Passo 5: Fazer deploy da Cloud Function

```bash
firebase deploy --only functions
```

## ✅ Comandos Completos (copie e cole):

```bash
# 1. Navegar para a pasta
cd ~/Desktop/PROGRAMAS/fechamento-main/fechamento-main/fechamento_firebase

# 2. Fazer login
firebase login --reauth

# 3. Listar projetos
firebase projects:list

# 4. Selecionar projeto (substitua pelo seu project_id)
firebase use --add

# 5. Fazer deploy
firebase deploy --only functions
```

## 🎯 Ou use o comando direto (se já souber o project_id):

```bash
cd ~/Desktop/PROGRAMAS/fechamento-main/fechamento-main/fechamento_firebase
firebase deploy --only functions --project fechamentooba
```

**Substitua `fechamentooba` pelo nome do seu projeto!**

## 📝 Verificar se deu certo:

Após o deploy, você verá:
```
✔  functions: sendNotificationEmail(us-central1) created successfully
✔  Deploy complete!
```

## 🆘 Se ainda não funcionar:

1. **Verifique se o arquivo .firebaserc existe:**
   ```bash
   cat .firebaserc
   ```

2. **Verifique se o arquivo firebase.json existe:**
   ```bash
   cat firebase.json
   ```

3. **Teste a autenticação:**
   ```bash
   firebase login --list
   ```

## ⚠️ IMPORTANTE:

- **NÃO** use caminhos com `C:\` no Git Bash, use `/c/` ou caminhos relativos
- **NÃO** esqueça de fazer login novamente se as credenciais expiraram
- **NÃO** esqueça de selecionar o projeto antes do deploy

## 🎯 Depois do deploy:

1. Recarregue a página (Ctrl + F5)
2. Conclua uma etapa
3. O erro CORS vai desaparecer!