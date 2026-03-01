@echo off
echo ==========================================
echo LIMPIANDO PROCESOS ANTERIORES...
taskkill /F /IM node.exe /T > NUL 2>&1
echo ==========================================
echo INICIANDO SISTEMA RESTAURANTE AI
echo ==========================================

:: Abrir terminal para el Backend
start "Backend - WhatsApp Bot" cmd /k "cd backend && node server.js"

:: Esperar 5 segundos antes de abrir el frontend
timeout /t 5 /nobreak > NUL

:: Abrir terminal para el Frontend
start "Frontend - Admin Panel" cmd /k "cd frontend && npm run dev"

echo.
echo ==========================================
echo AMBOS SERVICIOS ESTAN EN EJECUCION
echo.
echo 1. Revisa la ventana de Backend para el QR
echo 2. Entra al link mostrado en el Frontend 
echo ==========================================
pause
