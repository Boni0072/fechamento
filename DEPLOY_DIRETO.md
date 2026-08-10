# 🚀 DEPLOY DIRETO (Sem listar projetos)

## ✅ Você já está logado! Agora faça o deploy direto:

### Opção 1: Se você sabe o nome do projeto (mais comum)

```bash
firebase deploy --only functions --project fechamentooba
```

**Se não for `fechamentooba`, tente outros nomes comuns:**
- `fechamento-contabil`
- `fechamento-main`
- `redeoba`

---

### Opção 2: Descobrir o nome do projeto automaticamente

Execute este comando para ver o projeto configurado:

```bash
cat .firebaserc
```

OU

```bash
cat firebase.json
```

Você verá algo como:
```json
{
  "projects": {
    "default": "NOME_DO_PROJETO"
  }
}
```

Anote o nome do projeto e use:
```bash
firebase deploy --only functions --project NOME_DO_PROJETO
```

---

### Opção 3: Tentar deploy sem especificar projeto

Se o projeto já estiver configurado no `.firebaserc`:

```bash
firebase deploy --only functions
```

---

## 🎯 COMANDO RECOMENDADO (tente nesta ordem):

### 1. Primeiro, tente:
```bash
firebase deploy --only functions --project fechamentooba
```

### 2. Se não funcionar, descubra o nome do projeto:
```bash
cat .firebaserc
```

### 3. Use o nome que aparecer:
```bash
firebase deploy --only functions --project NOME_QUE_APARECEU
```

---

## ✅ Exemplo Prático:

Se o `.firebaserc` mostrar:
```json
{
  "projects": {
    "default": "fechamento-123abc"
  }
}
```

Execute:
```bash
firebase deploy --only functions --project fechamento-123abc
```

---

## 🆘 Se NADA funcionar:

### Verifique se o Firebase está inicializado:

```bash
ls -la
```

Você deve ver os arquivos:
- `.firebaserc`
- `firebase.json`

### Se não existirem, inicialize:

```bash
firebase init
```

Selecione:
- Functions
- Use o projeto existente
- Não instale dependências agora (já estão instaladas)

Depois:
```bash
firebase deploy --only functions
```

---

## 📝 RESUMO RÁPIDO:

1. ✅ Login: OK
2. ❌ Listar projetos: ERRO (rede)
3. ✅ SOLUÇÃO: Use o nome do projeto diretamente

**Tente agora:**
```bash
firebase deploy --only functions --project fechamentooba
```

**Se não for `fechamentooba`, descubra com:**
```bash
cat .firebaserc
```

E use o nome que aparecer!