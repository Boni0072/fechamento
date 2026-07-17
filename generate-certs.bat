@echo off
REM Script para gerar certificados SSL autoassinados para localhost no Windows

setlocal enabledelayedexpansion

set CERT_DIR=.cert

REM Criar diretório se não existir
if not exist "%CERT_DIR%" (
  mkdir "%CERT_DIR%"
)

REM Verificar se os certificados já existem
if exist "%CERT_DIR%\cert.pem" if exist "%CERT_DIR%\key.pem" (
  echo ✓ Certificados SSL já existem em .cert/
  exit /b 0
)

echo Gerando certificados SSL para localhost...
echo.

REM Verificar se openssl está disponível
where openssl >nul 2>nul
if %errorlevel% neq 0 (
  echo ✗ OpenSSL não está instalado ou não está no PATH
  echo.
  echo Opções:
  echo 1. Instalar Git for Windows (inclui OpenSSL)
  echo    https://git-scm.com/download/win
  echo.
  echo 2. Instalar OpenSSL separadamente
  echo    https://slproweb.com/products/Win32OpenSSL.html
  echo.
  echo 3. Usar WSL (Windows Subsystem for Linux) e executar generate-certs.sh
  exit /b 1
)

REM Gerar certificado
openssl req -x509 -newkey rsa:4096 -keyout "%CERT_DIR%\key.pem" -out "%CERT_DIR%\cert.pem" -days 365 -nodes -subj "/C=BR/ST=Brasil/L=Brasil/O=Secontaf/CN=localhost"

if %errorlevel% equ 0 (
  echo.
  echo ✓ Certificados gerados com sucesso em .cert/
  echo.
  echo Para usar HTTPS em localhost:
  echo 1. npm install
  echo 2. npm run dev
  echo.
  echo O navegador pode avisar que o certificado não é confiável.
  echo Clique em "Avançado" e prossiga para https://localhost:3000
) else (
  echo.
  echo ✗ Erro ao gerar certificados
  exit /b 1
)

endlocal
