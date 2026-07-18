# Configuração OAuth2 Microsoft 365 / Outlook

## Visão Geral
O app agora usa **OAuth2** para conectar com Outlook/Microsoft 365 de forma segura, sem armazenar senhas.

## Passo 1: Registrar Aplicação no Azure AD

1. Acesse [Azure Portal](https://portal.azure.com)
2. Vá em **Azure Active Directory** → **App registrations** → **New registration**
3. Preencha:
   - **Name**: `Fechamento App`
   - **Supported account types**: `Accounts in this organizational directory only` (para contas corporativas)
   - **Redirect URI**: `http://localhost:3000/auth/outlook/callback` (local) ou `https://seu-dominio.com/auth/outlook/callback` (produção)
4. Clique em **Register**

## Passo 2: Configurar Permissões

1. Na aplicação registrada, vá em **API Permissions**
2. Clique em **Add a permission** → **Microsoft Graph**
3. Selecione **Delegated permissions** e procure por:
   - `Mail.Read`
   - `Mail.ReadWrite`
   - `offline_access`
4. Clique em **Add permissions**
5. Clique em **Grant admin consent** (se for admin)

## Passo 3: Criar Secret

1. Vá em **Certificates & secrets**
2. Clique em **New client secret**
3. Descrição: `OAuth2 Access Secret`
4. Expiração: `24 months`
5. Clique em **Add**
6. **Copie o valor** (você não verá novamente!)

## Passo 4: Obter Client ID

1. Vá em **Overview**
2. Copie o **Application (client) ID**

## Passo 5: Configurar Variáveis de Ambiente

### No Vercel:
1. Vá para **Settings** → **Environment Variables**
2. Adicione:
   ```
   VITE_MICROSOFT_CLIENT_ID=<seu-client-id>
   MICROSOFT_CLIENT_ID=<seu-client-id>
   MICROSOFT_CLIENT_SECRET=<seu-secret>
   MICROSOFT_REDIRECT_URI=https://seu-dominio.vercel.app/auth/outlook/callback
   ```

### Localmente (.env):
```
VITE_MICROSOFT_CLIENT_ID=<seu-client-id>
VITE_FIREBASE_PROJECT_ID=seu-projeto-firebase
```

## Passo 6: Deploy das Cloud Functions

As Cloud Functions precisam ter as variáveis de ambiente configuradas:

```bash
firebase functions:config:set \
  microsoft.clientId="seu-client-id" \
  microsoft.clientSecret="seu-secret" \
  microsoft.redirectUri="sua-redirect-uri"
```

Ou via Firebase Console:
1. Vá para **Functions** → Selecione `exchangeOutlookToken`
2. Edite as environment variables

## Fluxo de Uso

1. **User clica em "Mail" na empresa**
2. **Modal abre com botão "Conectar com Outlook"**
3. **User clica no botão**
4. **Microsoft login abre em nova aba**
5. **User autoriza a aplicação**
6. **Callback page processa o token e retorna para o modal**
7. **Pastas do Outlook aparecem para seleção**
8. **User seleciona a pasta e clica "Salvar"**
9. **Conexão salva no Firestore**

## Troubleshooting

### "Aplicação não configurada para conectar com Outlook"
- Verifique se `VITE_MICROSOFT_CLIENT_ID` está definido em `.env`

### "Erro ao obter token de acesso"
- Verifique as variáveis de ambiente nas Cloud Functions
- Verifique se o `MICROSOFT_REDIRECT_URI` está exato (não esqueça o `/callback`)
- Verifique se as permissões foram concedidas no Azure AD

### "Falha ao buscar pastas"
- O token pode ter expirado (token válido por 60 minutos)
- Implemente refresh token (próxima versão)

## Segurança

✅ **Vantagens do OAuth2:**
- Senhas nunca são compartilhadas com a aplicação
- Tokens de curta duração (60 minutos)
- Revogação de acesso é instantânea
- Microsoft gerencia a segurança

## Próximos Passos

- [ ] Implementar Refresh Tokens
- [ ] Sincronização automática de pastas
- [ ] Cache de tokens no Firestore
- [ ] Suporte a Gmail com OAuth2
