#!/bin/bash
# Script para gerar certificados SSL autoassinados para localhost

CERT_DIR=".cert"

# Criar diretório se não existir
if [ ! -d "$CERT_DIR" ]; then
  mkdir -p "$CERT_DIR"
fi

# Verificar se os certificados já existem
if [ -f "$CERT_DIR/cert.pem" ] && [ -f "$CERT_DIR/key.pem" ]; then
  echo "✓ Certificados SSL já existem em .cert/"
  exit 0
fi

echo "Gerando certificados SSL para localhost..."

# Gerar chave privada e certificado autoassinado
openssl req -x509 -newkey rsa:4096 -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" -days 365 -nodes \
  -subj "/C=BR/ST=Brasil/L=Brasil/O=Secontaf/CN=localhost"

if [ $? -eq 0 ]; then
  echo "✓ Certificados gerados com sucesso em .cert/"
  echo ""
  echo "Para usar HTTPS em localhost:"
  echo "1. npm install"
  echo "2. npm run dev"
  echo ""
  echo "O navegador pode avisar que o certificado não é confiável."
  echo "Clique em 'Avançado' e prossiga para localhost:3000"
else
  echo "✗ Erro ao gerar certificados"
  exit 1
fi
