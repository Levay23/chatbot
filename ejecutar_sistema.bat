@echo off
color 0B
echo ===================================================
echo   INICIANDO EL RINCON DEL SANCOCHO - CHAT IA
echo ===================================================
echo.
echo [1/2] LIMPIANDO PROCESOS ANTERIORES...
taskkill /F /IM node.exe /T > NUL 2>&1
echo [OK] Procesos limpios.
echo.
echo [2/2] INICIANDO SERVICIOS...
echo.

:: Abrir terminal para el Backend
start "Backend - WhatsApp Bot" cmd /k "cd backend && node server.js"

:: Esperar 5 segundos antes de abrir el frontend
timeout /t 5 /nobreak > NUL

:: Abrir terminal para el Frontend
start "Frontend - Admin Panel" cmd /k "cd frontend && npm run dev"

echo ===================================================
echo   SISTEMA EN EJECUCION
echo ===================================================
echo.
echo [1] BACKEND: Escanea el QR si no lo has hecho.
echo [2] FRONTEND: Entra al Panel Admin (link arriba).
echo.
echo [INFO] Nuevas funciones ACTIVAS:
echo - Reportes PDF/Excel en Facturacion.
echo - Especial del dia en Config Bot.
echo - Notificaciones automaticas de pedidos.
echo ===================================================
pause
