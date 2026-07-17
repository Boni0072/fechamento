# 🚀 RÁPIDO: Como Testar o Botão de Instalação

## Você está em: **localhost:3000**
## Precisa estar em: **https://localhost:3000**

---

## ⚡ 3 Passos Rápidos:

### 1️⃣ Gerar Certificados SSL

**Windows (PowerShell):**
```powershell
.\generate-certs.bat
```

**Mac/Linux:**
```bash
bash generate-certs.sh
```

### 2️⃣ Reiniciar o servidor

```bash
npm run dev
```

### 3️⃣ Aceitar certificado no navegador

O navegador abrirá em `https://localhost:3000`

- **Chrome/Edge**: Clique em "Avançado" → "Prosseguir para localhost"
- **Firefox**: "Aceitar risco e continuar"

---

## ✅ Agora você verá:

```
┌─────────────────────────────────────────────┐
│ ✓ Pronto para instalar! (banner verde)      │
│ Procure por "Instalar" ou "Adicionar app"   │
└─────────────────────────────────────────────┘
          + botão flutuante verde (download)
          + botão no navegador (instalar)
```

---

## 🆘 Não funcionou?

Verifique:
1. URL começa com `https://` (não `http://`)
2. Service Worker está ativo (F12 → Application → Service Workers)
3. Manifest carregou (F12 → Application → Manifest)

Se ainda não aparecer:
- Limpe o cache: F12 → Application → Clear storage → Clear site data
- Recarregue: Ctrl+Shift+R (hard refresh)

---

**Pronto?** Clique em "Instalar" quando ver o botão!
