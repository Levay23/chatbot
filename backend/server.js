import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { startWhatsApp, setIO as setWhatsAppIO } from './services/whatsappService.js';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import db from './database/db.js';

import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customers.js';
import orderRoutes, { setIO } from './routes/orders.js';
import botRoutes from './routes/bot.js';
import productRoutes from './routes/products.js';
import configRoutes from './routes/config.js';
import reportsRoutes from './routes/reports.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
    }
});

app.use(cors());
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/products', productRoutes);
app.use('/api/config', configRoutes);
app.use('/api/reports', reportsRoutes);

// Set Socket.IO instance for routes that need it
setIO(io);
setWhatsAppIO(io);

// Force bot to start OFF by default
db.prepare("UPDATE config_bot SET value = 'false' WHERE key = 'bot_active'").run();
console.log('🤖 Bot inicializado en estado: APAGADO');

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, async () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log('Iniciando servicio de WhatsApp...');
    await startWhatsApp();
});
