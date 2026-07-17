#!/usr/bin/env python3
"""
Script para gerar ícones PWA a partir do logo da empresa
Uso: python create-icons.py
Requer: Pillow (pip install Pillow)
"""

import os
import sys
from PIL import Image

def create_icons():
    """Gera ícones PWA a partir do logo"""
    
    # Caminhos
    public_dir = os.path.dirname(os.path.abspath(__file__)) + '/public'
    source_image = os.path.join(public_dir, 'Secontaf1.png')
    
    # Verificar se arquivo existe
    if not os.path.exists(source_image):
        print(f"❌ Arquivo não encontrado: {source_image}")
        sys.exit(1)
    
    # Tamanhos necessários
    sizes = [
        ('icon-192.png', 192),
        ('icon-512.png', 512),
        ('icon-192-maskable.png', 192),
        ('icon-512-maskable.png', 512),
    ]
    
    try:
        print("📦 Gerando ícones PWA...\n")
        
        # Abrir imagem original
        img = Image.open(source_image).convert('RGBA')
        
        for filename, size in sizes:
            output_path = os.path.join(public_dir, filename)
            
            print(f"  Criando {filename} ({size}x{size})...")
            
            # Criar ícone com fundo transparente
            icon = Image.new('RGBA', (size, size), (255, 255, 255, 0))
            
            # Redimensionar imagem mantendo proporção
            img_resized = img.copy()
            img_resized.thumbnail((size, size), Image.Resampling.LANCZOS)
            
            # Calcular posição para centralizar
            x = (size - img_resized.width) // 2
            y = (size - img_resized.height) // 2
            
            # Colar imagem no centro
            icon.paste(img_resized, (x, y), img_resized)
            
            # Salvar
            icon.save(output_path, 'PNG')
            print(f"  ✓ {filename} criado com sucesso")
        
        print("\n✅ Todos os ícones foram criados com sucesso!\n")
        print("Arquivos gerados:")
        for filename, _ in sizes:
            print(f"  ✓ public/{filename}")
        print("\nOs ícones estão prontos para usar no manifest.json!")
        
    except ImportError:
        print("❌ Erro: Pillow não está instalado.")
        print("\nPara usar este script, instale Pillow:")
        print("  pip install Pillow")
        print("\nOu use uma ferramenta online:")
        print("  https://www.pwabuilder.com/")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Erro ao gerar ícones: {e}")
        sys.exit(1)

if __name__ == '__main__':
    create_icons()
