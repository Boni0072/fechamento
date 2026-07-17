# 🎨 Usar Logo da Empresa como Ícone PWA

## Como Gerar Ícones

Existem 3 opções:

---

## ✅ Opção 1: Script Python (RECOMENDADO)

**Mais fácil e não requer dependências npm extras**

### Windows:
```bash
.\create-icons.bat
```

### Mac/Linux:
```bash
bash create-icons.sh
```

### O que faz:
- Redimensiona `/public/Secontaf1.png`
- Cria versões de 192x192 e 512x512
- Salva em `public/` automaticamente

---

## 2️⃣ Opção 2: Ferramenta Online (MAIS RÁPIDA)

Se não quiser instalar nada:

1. Acesse: **https://www.pwabuilder.com/**
2. Upload de `/public/Secontaf1.png`
3. Gere os ícones
4. Download e coloque em `public/`

---

## 3️⃣ Opção 3: Manual com ImageMagick

```bash
# Redimensionar para 192x192
convert Secontaf1.png -resize 192x192 icon-192.png

# Redimensionar para 512x512
convert Secontaf1.png -resize 512x512 icon-512.png
```

---

## 📋 Depois de gerar os ícones

Os seguintes arquivos devem aparecer em `public/`:

```
public/
├── Secontaf1.png          ← Original (já existe)
├── icon-192.png           ← NOVO
├── icon-512.png           ← NOVO
├── icon-192-maskable.png  ← NOVO
├── icon-512-maskable.png  ← NOVO
└── manifest.json          ← Já configurado
```

---

## ✅ Verificar se funcionou

O `manifest.json` já está configurado para usar esses ícones.

Veja em `public/manifest.json`:
```json
{
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    ...
  ]
}
```

---

## 🚀 Pronto!

Agora quando instalar o app:
- ✅ Ícone aparecerá na tela inicial
- ✅ Ícone do menu será o logo da empresa
- ✅ Splash screen usará o logo

---

## 🆘 Erros comuns

### "Python não encontrado"
Instale Python: https://www.python.org/

### "Pillow não instalado"
Execute:
```bash
pip install Pillow
# ou
pip3 install Pillow
```

### "Arquivo não encontrado"
Certifique-se de que `public/Secontaf1.png` existe

---

**Dica**: Execute `npm run dev` após gerar os ícones para testar!
