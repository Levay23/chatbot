# Restaurante AI - CRM + WhatsApp + Panel Administrativo

Este proyecto es un sistema integral para la gestión de un restaurante, automatizando la atención al cliente mediante WhatsApp e IA (Gemini) y proporcionando un panel de control para la administración de pedidos y clientes.

## 🚀 Tecnologías
- **Backend**: Node.js, Express, Venom-bot (WhatsApp), SQLite (better-sqlite3), Google Gemini API.
- **Frontend**: React (Vite), TailwindCSS, Lucide React.

## 📋 Requisitos Previos
- Node.js (v18 o superior recomendado)
- Una API Key de Google Gemini.

## 🛠️ Instalación y Configuración

1. **Backend**:
   - Ve a la carpeta `backend/`.
   - Crea un archivo `.env` (ya existe uno de ejemplo) y configura:
     ```env
     PORT=3000
     GEMINI_API_KEY=TU_API_KEY_AQUI
     ADMIN_USER=admin
     ADMIN_PASS=admin123
     ```
   - Instala las dependencias (si no lo has hecho):
     ```bash
     npm install
     ```

2. **Frontend**:
   - Ve a la carpeta `frontend/`.
   - Instala las dependencias:
     ```bash
     npm install
     ```

## 🏃 Cómo Ejecutar

1. **Iniciar el Backend**:
   Desde la carpeta `backend/`:
   ```bash
   node server.js
   ```
   *Nota: La primera vez que lo ejecutes, aparecerá un código QR en la terminal. Escanéalo con tu WhatsApp (como WhatsApp Web).*

2. **Iniciar el Frontend**:
   Desde la carpeta `frontend/`:
   ```bash
   npm run dev
   ```
   Abre la URL que te indique (usualmente `http://localhost:5173`).

## 🔄 Flujo del Sistema
1. **Cliente escribe**: El bot recibe el mensaje por WhatsApp.
2. **IA Procesa**: Se envía el historial (últimos 5 mjs) y el menú a Gemini.
3. **Respuesta**: El bot responde automáticamente. Si detecta intención de compra (confirmación), crea un pedido en la base de datos.
4. **CRM**: El administrador puede ver los clientes, sus conversaciones y gestionar los pedidos desde el panel web.

## 📂 Estructura
- `/backend`: Servidor, base de datos SQLite, servicios de IA y WhatsApp.
- `/frontend`: Dashboard administrativo en React.
