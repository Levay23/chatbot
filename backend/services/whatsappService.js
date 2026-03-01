import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { getOrCreateCustomer, createOrder } from './memoryService.js';
import { processMessage } from './aiService.js';
import { exec } from 'child_process';
import db from '../database/db.js';

let clientInstance = null;
let isWhatsAppReady = false;
let io = null;

export const setIO = (socketIo) => {
    io = socketIo;
    console.log('🔌 Socket.io vinculado a WhatsAppService');
};

export const startWhatsApp = async () => {
    try {
        console.log('--- INICIANDO BOT (whatsapp-web.js) ---');

        clientInstance = new Client({
            authStrategy: new LocalAuth({ clientId: 'restaurant-bot' }),
            puppeteer: {
                headless: false,
                executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        clientInstance.on('qr', (qr) => {
            console.log('\n📱 Escanea este código QR con tu WhatsApp:');
            qrcode.generate(qr, { small: true });
        });

        clientInstance.on('ready', () => {
            isWhatsAppReady = true;
            console.log('✅ WhatsApp conectado y listo!');
            exec('start http://localhost:5173/dashboard');
        });

        clientInstance.on('message', async (msg) => {
            const clientState = await clientInstance.getState().catch(() => 'UNKNOWN');
            console.log(`📩 [${new Date().toLocaleTimeString()}] Recibido de ${msg.from}: ${msg.body || (msg.hasMedia ? '[MULTIMEDIA]' : '')}`);

            try {
                // Verificar si el bot está activo en la BD
                const botActiveConfig = db.prepare("SELECT value FROM config_bot WHERE key = 'bot_active'").get();
                const isBotActive = botActiveConfig ? botActiveConfig.value === 'true' : true;

                if (!isBotActive) return;
                if (msg.from.includes('@g.us')) return;

                const contact = await msg.getContact();
                const name = contact.pushname || contact.name || 'Cliente';
                const customer = getOrCreateCustomer(msg.from, name);

                // --- MANEJO DE COMPROBANTES (MULTIMEDIA) ---
                if (msg.hasMedia) {
                    console.log('📸 Multimedia detectada. Verificando si es un comprobante...');
                    const lastOrder = db.prepare(`
                        SELECT id FROM orders 
                        WHERE customer_id = ? AND payment_method = 'Transferencia' AND status = 'PENDING'
                        ORDER BY created_at DESC LIMIT 1
                    `).get(customer.id);

                    if (lastOrder) {
                        try {
                            const media = await msg.downloadMedia();
                            if (media) {
                                // Convertir a DataURL o guardar en disco (aquí usamos DataURL para simplicidad de visualización inmediata)
                                const receiptData = `data:${media.mimetype};base64,${media.data}`;

                                db.prepare('UPDATE orders SET receipt = ? WHERE id = ?').run(receiptData, lastOrder.id);
                                console.log(`✅ Comprobante vinculado al pedido #${lastOrder.id}`);

                                if (io) {
                                    io.emit('order_updated', { id: lastOrder.id, hasReceipt: true });
                                }

                                return msg.reply('✅ *¡Recibido!* Hemos recibido tu comprobante. En un momento un asesor lo verificará para procesar tu pedido. ¡Gracias!');
                            }
                        } catch (mediaErr) {
                            console.error('❌ Error descargando multimedia:', mediaErr.message);
                        }
                    }
                }

                if (!msg.body) return;

                console.log('🧠 IA: Procesando...');
                let aiResponse = await processMessage(customer, msg.body);

                if (aiResponse) {
                    // --- DETECTAR Y PROCESAR PEDIDO JSON ---
                    // USAMOS GREEDY (.*) para asegurar que tome todo hasta el último ']'
                    const orderMatch = aiResponse.match(/\[ORDEN_JSON:(.*)\]/s);

                    if (orderMatch) {
                        try {
                            // Extraer solo la parte del JSON (entre llaves)
                            let jsonRaw = orderMatch[1].trim();

                            // Limpiar caracteres de control y saltos de línea que rompen JSON.parse
                            let cleanJson = jsonRaw
                                .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ") // Elimina caracteres de control
                                .trim();

                            console.log('📦 Intentando parsear JSON limpiado:', cleanJson);
                            const orderData = JSON.parse(cleanJson);
                            console.log('✅ PEDIDO PARSEADO CORRECTAMENTE');

                            // 1. Actualizar dirección si viene en el JSON
                            if (orderData.direccion) {
                                db.prepare('UPDATE customers SET address = ? WHERE id = ?').run(orderData.direccion, customer.id);
                                console.log('📍 Dirección actualizada.');
                            }

                            // 2. Crear orden en la DB
                            // Mapear items a formato DB si es necesario
                            const productsForOrder = orderData.items.map(i => ({
                                name: i.name,
                                quantity: i.quantity,
                                price: i.price
                            }));

                            const orderId = createOrder(customer.phone, productsForOrder, orderData.total, orderData.metodo_pago || 'Efectivo');

                            if (orderId && io) {
                                console.log(`🚀 Notificando al Panel pedido #${orderId}`);
                                io.emit('new_order', { id: orderId, status: 'PENDING' });
                            }

                            // 3. LIMPIAR EL MENSAJE (Quitar el JSON para que el cliente no lo vea)
                            aiResponse = aiResponse.replace(/\[ORDEN_JSON:.*?\]/gs, '').trim();

                        } catch (jsonErr) {
                            console.error('❌ Error parseando JSON de orden:', jsonErr.message);
                        }
                    }

                    // Enviar respuesta limpia
                    console.log(`📤 Enviando respuesta (${aiResponse.length} chars)...`);
                    try {
                        await msg.reply(aiResponse);
                        console.log('✅ Enviado con éxito.');
                    } catch (replyErr) {
                        const chat = await msg.getChat();
                        await chat.sendMessage(aiResponse);
                        console.log('✅ Enviado vía chat.sendMessage (fallback).');
                    }
                }
            } catch (err) {
                console.error('❌ Error en el flujo de mensaje:', err);
            }
        });

        await clientInstance.initialize();

    } catch (error) {
        isWhatsAppReady = false;
        console.error('❌ ERROR CRÍTICO:', error.message);
    }
};

export const toggleBot = (state) => {
    db.prepare("UPDATE config_bot SET value = ? WHERE key = 'bot_active'").run(state ? 'true' : 'false');
    return state;
};

export const getStatus = () => {
    const config = db.prepare("SELECT value FROM config_bot WHERE key = 'bot_active'").get();
    return {
        connected: isWhatsAppReady,
        active: config ? config.value === 'true' : true
    };
};

export const getClient = () => clientInstance;
