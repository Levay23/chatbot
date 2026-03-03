@echo off
color 0A
echo ===================================================
echo   Instalador de El Rincon del Sancocho - ChatIA
echo ===================================================
echo.

:: 1. Verificar si Node.js esta instalado
node -v >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js no esta instalado.
    echo Por favor descarga e instala Node.js desde: https://nodejs.org/
    echo Luego de instalarlo, vuelve a ejecutar este archivo.
    pause
    exit /b
)
echo [OK] Node.js esta instalado.
echo.

:: 2. Instalar dependencias del Backend
echo === Instalando dependencias del Backend... ===
cd backend
call npm install
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Hubo un problema instalando el Backend.
    pause
    exit /b
)
cd ..
echo [OK] Backend instalado correctamente.
echo.

:: 3. Instalar dependencias del Frontend
echo === Instalando dependencias del Panel de Control (Frontend)... ===
cd frontend
call npm install
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Hubo un problema instalando el Frontend.
    pause
    exit /b
)

:: 4. Construir el Frontend
echo === Construyendo el Panel de Control... ===
call npm run build
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Hubo un problema al compilar el Frontend.
    pause
    exit /b
)
cd ..
echo [OK] Frontend instalado y compilado correctamente.
echo.

echo ===================================================
echo   ¡INSTALACION COMPLETADA CON EXITO!
echo ===================================================
echo.
echo Para iniciar el sistema en el futuro, simplemente da doble clic en:
echo ejecutar_sistema.bat
echo.
pause
