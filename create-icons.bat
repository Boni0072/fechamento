@echo off
REM Script para gerar ícones PWA a partir do logo da empresa
REM Requer Python com Pillow instalado

echo.
echo ========================================
echo   Gerador de Ícones PWA
echo ========================================
echo.

REM Verificar se Python está instalado
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Python não está instalado ou não está no PATH
    echo.
    echo Opções:
    echo   1. Instalar Python: https://www.python.org/downloads/
    echo   2. Usar ferramenta online: https://www.pwabuilder.com/
    echo.
    pause
    exit /b 1
)

echo Verificando Pillow...
python -c "from PIL import Image" >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Pillow não está instalado
    echo.
    echo Instalando Pillow...
    pip install Pillow
    if %errorlevel% neq 0 (
        echo Erro ao instalar Pillow
        pause
        exit /b 1
    )
)

echo.
echo Gerando ícones...
python create-icons.py
if %errorlevel% equ 0 (
    echo.
    echo ✅ Pronto! Os ícones foram criados em public/
    echo.
) else (
    echo ❌ Erro ao gerar ícones
    pause
    exit /b 1
)

pause
