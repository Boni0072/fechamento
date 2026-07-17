#!/bin/bash
# Script para gerar ícones PWA a partir do logo da empresa
# Requer Python com Pillow instalado

echo ""
echo "========================================"
echo "   Gerador de Ícones PWA"
echo "========================================"
echo ""

# Verificar se Python está instalado
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 não está instalado"
    echo ""
    echo "Instale com:"
    echo "  macOS: brew install python3"
    echo "  Ubuntu/Debian: sudo apt-get install python3"
    echo ""
    exit 1
fi

# Verificar se Pillow está instalado
python3 -c "from PIL import Image" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "❌ Pillow não está instalado"
    echo ""
    echo "Instalando Pillow..."
    pip3 install Pillow
    if [ $? -ne 0 ]; then
        echo "Erro ao instalar Pillow"
        exit 1
    fi
fi

echo ""
echo "Gerando ícones..."
python3 create-icons.py

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Pronto! Os ícones foram criados em public/"
    echo ""
else
    echo "❌ Erro ao gerar ícones"
    exit 1
fi
