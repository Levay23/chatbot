import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { getOrCreateCustomer } from './memoryService.js';
import { processMessage } from './aiService.js';
import { processOrderJSON } from './orderService.js';
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
                    // Procesamiento silencioso de comprobantes (solicitado por el usuario)
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

                                return; // Proceso silencioso, el usuario verifica en el panel
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
                    // 1. Extraer JSON robustamente (buscando [ORDEN_JSON:...] o *ORDEN_JSON:*)
                    let jsonContentToParse = null;
                    const orderMatch = aiResponse.match(/(?:\[|\*)?ORDEN_JSON:?(?:\]|\*)?([\s\S]*?)(?:\]|$)/i);

                    if (orderMatch) {
                        jsonContentToParse = orderMatch[1];
                    } else {
                        // Búsqueda de rescate: a veces Llama olvida el ORDEN_JSON y pone solo el bloque o lo envuelve en markdown
                        const looseMatch = aiResponse.match(/\{[\s\S]*?"items"[\s\S]*?"total"[\s\S]*?\}/i);
                        if (looseMatch) {
                            jsonContentToParse = looseMatch[0];
                        }
                    }

                    if (jsonContentToParse) {
                        try {
                            // Extraer solo lo que esté entre llaves { }
                            const jsonMatch = jsonContentToParse.match(/\{[\s\S]*\}/);

                            if (jsonMatch) {
                                const jsonRaw = jsonMatch[0];
                                const cleanJson = jsonRaw.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").trim();

                                console.log('📦 Intentando procesar pedido JSON...');
                                const orderData = JSON.parse(cleanJson);

                                if (orderData && orderData.items) {
                                    const result = processOrderJSON(customer.id, orderData);
                                    if (result && result.orderId && io) {
                                        console.log(`🚀 Notificando al Panel pedido #${result.orderId}`);
                                        io.emit('new_order', { id: result.orderId, status: 'PENDING' });
                                    }
                                }
                            }
                        } catch (jsonErr) {
                            console.error('❌ Error parseando JSON de orden:', jsonErr.message);
                        }
                    }

                    // 2. LIMPIEZA TOTAL: Quitar CUALQUIER mención de ORDEN_JSON y lo que le siga que parezca JSON
                    aiResponse = aiResponse.replace(/(?:\[|\*)?ORDEN_JSON:?[\s\S]*/gi, '').trim();
                    // Limpieza ultra-agresiva: Si la IA escupe JSON crudo accidentalmente (ej: "metodo_pago": "efectivo")
                    aiResponse = aiResponse.replace(/("metodo_pago"|"nombre_cliente"|"product_name"|"direccion"\s*:)[^]*/gi, '').trim();
                    aiResponse = aiResponse.replace(/```json[\s\S]*?```/gi, '').trim();
                    aiResponse = aiResponse.replace(/\{[\s\S]*?\}/gi, '').trim(); // Elimina cualquier bloque de llaves sobrante
                    // Limpia brackets o comas sueltas al final resultantes de un JSON roto
                    aiResponse = aiResponse.replace(/[\}\]\s,]*$/g, '').trim();

                    // 3. Enviar respuesta limpia
                    if (aiResponse) {
                        console.log(`📤 Enviando respuesta (${aiResponse.length} chars)...`);
                        try {
                            await msg.reply(aiResponse);
                        } catch (replyErr) {
                            const chat = await msg.getChat();
                            await chat.sendMessage(aiResponse);
                        }
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
