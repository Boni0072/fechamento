/**
 * Script para gerar ícones PWA a partir do logo da empresa
 * Execute: node create-icons.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tentar usar sharp se disponível, senão usar canvas
let sharp;
try {
  sharp = await import('sharp').then(m => m.default);
} catch (e) {
  console.warn('Sharp não instalado. Tentando usar método alternativo...');
}

const publicDir = path.join(__dirname, 'public');
const sourceImage = path.join(publicDir, 'Secontaf1.png');

if (!fs.existsSync(sourceImage)) {
  console.error('❌ Arquivo não encontrado:', sourceImage);
  process.exit(1);
}

// Tamanhos necessários para PWA
const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-192-maskable.png', size: 192 },
  { name: 'icon-512-maskable.png', size: 512 },
];

async function createIcons() {
  if (!sharp) {
    console.error('❌ Erro: Sharp não está instalado.');
    console.log('\nPara usar este script, instale sharp:');
    console.log('  npm install --save-dev sharp');
    console.log('\nOu use uma ferramenta online:');
    console.log('  https://www.pwabuilder.com/');
    process.exit(1);
  }

  console.log('📦 Gerando ícones PWA...\n');

  try {
    for (const icon of sizes) {
      const outputPath = path.join(publicDir, icon.name);
      
      console.log(`  Criando ${icon.name} (${icon.size}x${icon.size})...`);
      
      await sharp(sourceImage)
        .resize(icon.size, icon.size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 } // Fundo transparente
        })
        .png()
        .toFile(outputPath);

      console.log(`  ✓ ${icon.name} criado com sucesso`);
    }

    console.log('\n✅ Todos os ícones foram criados com sucesso!\n');
    console.log('Arquivos gerados:');
    sizes.forEach(icon => {
      console.log(`  ✓ public/${icon.name}`);
    });
    console.log('\nOs ícones estão prontos para usar no manifest.json!');

  } catch (error) {
    console.error('❌ Erro ao gerar ícones:', error.message);
    process.exit(1);
  }
}

createIcons();
