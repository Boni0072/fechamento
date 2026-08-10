# Configurar EmailJS com as Credenciais Fornecidas

## 📧 Credenciais do E-mail:
- **E-mail:** fechamento.contabil@redeoba.com.br
- **Senha:** W)233852259849ub

## 🚀 Passo a Passo para Configurar:

### 1. Acesse o EmailJS
- URL: https://www.emailjs.com/
- Clique em "Sign Up" ou "Get Started"

### 2. Faça Cadastro
- Use o e-mail: **fechamento.contabil@redeoba.com.br**
- Crie uma senha (pode usar a mesma: W)233852259849ub)
- Confirme o cadastro

### 3. Adicione o Serviço Outlook
1. No dashboard, clique em **"Add a Service"**
2. Selecione **"Outlook"** (ou "Hotmail")
3. Clique em **"Connect Account"**
4. Faça login com:
   - **E-mail:** fechamento.contabil@redeoba.com.br
   - **Senha:** W)233852259849ub
5. Clique em **"Allow"** para permitir acesso
6. **COPIE O SERVICE ID** (ex: `outlook_123abc`)

### 4. Crie um Template de E-mail
1. Vá em **"Email Templates"**
2. Clique em **"Create New Template"**
3. Configure assim:

**Nome do Template:** Notificação de Etapa Concluída

**Assunto (Subject):**
```
Etapa Concluída: {{nome_etapa}}
```

**Conteúdo (Body):**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #28a745; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .footer { background-color: #f1f1f1; padding: 10px; text-align: center; font-size: 12px; color: #666; }
    .info { background-color: #e3f2fd; padding: 10px; margin: 10px 0; border-left: 4px solid #2196F3; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>✅ Etapa Concluída</h2>
    </div>
    <div class="content">
      <p>Olá <strong>{{responsavel}}</strong>!</p>
      <p>A etapa <strong>{{nome_etapa}}</strong> foi concluída com sucesso.</p>
      
      <div class="info">
        <p><strong>Código:</strong> {{codigo}}</p>
        <p><strong>Empresa:</strong> {{empresa}}</p>
        <p><strong>Responsável:</strong> {{responsavel}}</p>
        <p><strong>Executado por:</strong> {{executado_por}}</p>
        <p><strong>Data de Conclusão:</strong> {{data_conclusao}}</p>
      </div>
      
      <p>Acesse o sistema para mais detalhes.</p>
    </div>
    <div class="footer">
      <p>Esta é uma mensagem automática. Por favor, não responda.</p>
      <p>Sistema de Fechamento Contábil - Rede OBA</p>
    </div>
  </div>
</body>
</html>
```

4. Clique em **"Save"**
5. **COPIE O TEMPLATE ID** (ex: `template_abc123xyz`)

### 5. Obtenha a Public Key
1. Clique no ícone de perfil (canto superior direito)
2. Vá em **"Account"**
3. Role até **"API Keys"**
4. **COPIE A PUBLIC KEY** (ex: `user_abc123xyz`)

### 6. Configure no Código

Edite o arquivo: `fechamento-main/fechamento_firebase/src/services/emailServiceEmailJS.js`

Substitua estas linhas:

```javascript
const EMAILJS_CONFIG = {
  SERVICE_ID: 'SEU_SERVICE_ID',        // Ex: 'gmail_service'
  TEMPLATE_ID: 'SEU_TEMPLATE_ID',      // Ex: 'template_abc123'
  PUBLIC_KEY: 'SEU_PUBLIC_KEY'         // Ex: 'user_abc123xyz'
};
```

Por:

```javascript
const EMAILJS_CONFIG = {
  SERVICE_ID: 'COLOQUE_AQUI_O_SERVICE_ID',
  TEMPLATE_ID: 'COLOQUE_AQUI_O_TEMPLATE_ID',
  PUBLIC_KEY: 'COLOQUE_AQUI_A_PUBLIC_KEY'
};
```

**Exemplo:**
```javascript
const EMAILJS_CONFIG = {
  SERVICE_ID: 'outlook_123abc',
  TEMPLATE_ID: 'template_xyz789',
  PUBLIC_KEY: 'user_abc123xyz'
};
```

### 7. Instale a Biblioteca EmailJS

```bash
cd /c/Users/01702317/Desktop/PROGRAMAS/fechamento-main/fechamento_firebase
npm install emailjs-com
```

### 8. Teste

1. **Recarregue a página** (Ctrl + F5)
2. **Conclua uma etapa**
3. **Verifique:**
   - ✅ Alerta visual aparece
   - 🔊 Som toca
   - 📧 E-mail é enviado AUTOMATICAMENTE
   - ✅ NÃO precisa clicar em nada

## 📋 Resumo das Credenciais:

- **E-mail:** fechamento.contabil@redeoba.com.br
- **Senha:** W)233852259849ub
- **Service ID:** (você obtém no passo 3)
- **Template ID:** (você obtém no passo 4)
- **Public Key:** (você obtém no passo 5)

## 🎯 Após configurar:

O sistema vai enviar e-mail AUTOMATICAMENTE quando uma etapa for concluída, sem precisar de deploy e sem erro CORS!

## 🆘 Se precisar de ajuda:

1. Verifique se o Service ID está correto
2. Verifique se o Template ID está correto
3. Verifique se a Public Key está correta
4. Verifique se o e-mail e senha do Outlook estão corretos
5. Teste o envio diretamente no EmailJS primeiro