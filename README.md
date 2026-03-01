# 🥘 El Rincón del Sancocho - AI Chatbot & Dashboard

Sistema integral de gestión gastronómica que combina **Inteligencia Artificial (Groq/Llama 3)**, **WhatsApp Web** y un **Dashboard Administrativo Professional** para automatizar la toma de pedidos y el control de cocina en tiempo real.

---

## 🚀 Características Principales

### 🤖 Mesero Virtual Inteligente (WhatsApp)
- **Cerebro Llama 3 (via Groq)**: Respuestas instantáneas y naturales con un límite de hasta **14,400 mensajes por día**.
- **Toma de Pedidos Automática**: La IA detecta la intención de compra y genera un JSON estructurado que se inserta automáticamente en la base de datos.
- **Detección de Comprobantes**: El bot identifica fotos de transferencias y las vincula al pedido del cliente para verificación manual.
- **Personalidad Configurable**: Saludos, despedidas e instrucciones de pago editables desde el panel.

### 📊 Dashboard de Control (Administración)
- **Gestión en Tiempo Real**: Notificaciones inmediatas vía **Socket.IO** cuando entra un pedido.
- **Flujo de Cocina**: Columnas interactivas (Nuevos, En Cocina, Listos) para mover pedidos con un solo click.
- **Alertas de Transferencia**: Pedidos por Nequi/Banco resaltan en naranja con aviso de **"VERIFICAR PAGO"** parpadeante.
- **Visor de Recibos**: Haz click en la miniatura del comprobante para verlo en pantalla completa con alta resolución.
- **Cierre de Caja**: Informe diario automático con top de productos vendidos y recaudación por método de pago.

### ⚙️ Gestión de Catálogo
- **Control de Disponibilidad**: Apaga o enciende productos o categorías completas al instante.
- **Edición en Caliente**: Cambia precios, nombres o categorías sin reiniciar el sistema.

---

## �️ Stack Tecnológico

- **Backend**: Node.js, Express, `whatsapp-web.js`, SQLite (`better-sqlite3`), Socket.io.
- **IA**: Groq API (Modelo Llama-3.3-70b-versatile).
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide React (Icons).
- **Seguridad**: JWT para el panel y estado "Default OFF" para el bot al arrancar el servidor.

---

## 📋 Requisitos Previos

- **Node.js**: v18.0 o superior.
- **Groq API Key**: Necesaria para que el bot responda.
- **WhatsApp**: Un número activo para escanear el código QR.

---

## � Instalación y Configuración

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/Levay23/chatbot.git
   cd chatbot
   ```

2. **Backend**:
   ```bash
   cd backend
   npm install
   ```
   Crea un archivo `.env` en `backend/` con lo siguiente:
   ```env
   PORT=3000
   GROQ_API_KEY=tu_api_key_de_groq
   JWT_SECRET=una_clave_segura_para_el_login
   ```

3. **Frontend**:
   ```bash
   cd ../frontend
   npm install
   ```

---

## 🏃 Ejecución del Sistema

### Opción A: Script Automático (Windows)
Ejecuta el archivo `ejecutar_sistema.bat` en la raíz del proyecto. Este script:
1. Limpia procesos antiguos.
2. Inicia el servidor de WhatsApp/API.
3. Inicia el Dashboard Administrativo.

### Opción B: Manual
1. **Servidor**: En `backend/`, ejecuta `npm start`. Escanea el QR que aparece en la consola.
2. **Panel**: En `frontend/`, ejecuta `npm run dev` y entra a `http://localhost:5173`.

---

## �️ Seguridad y Buenas Prácticas
- **Secrets Protection**: El proyecto incluye un `.gitignore` robusto que protege bases de datos, llaves API y sesiones de WhatsApp.
- **Inicio Seguro**: El bot siempre inicia **APAGADO**. Debes entrar al dashboard y encenderlo manualmente después de verificar que los precios y el menú estén correctos.

---

## � Desarrollado para
**El Rincón del Sancocho** - *Sabor que enamora.* 🍲🍗🥩
✨ Implementado por **Levay23** con ayuda de **Antigravity AI**.
