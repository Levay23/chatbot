import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { getOrCreateCustomer, getAIContext, updateCustomerState } from './memoryService.js';
import { processMessage, transcribeAudio } from './aiService.js';
import { createOrderFromState } from './orderService.js';
import { classifyIntent } from './salesEngine.js';
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
                const botActiveConfig = db.prepare("SELECT value FROM config_bot WHERE key = 'bot_active'").get();
                const isBotActive = botActiveConfig ? botActiveConfig.value === 'true' : true;
                if (!isBotActive) return;
                if (msg.from.includes('@g.us')) return;

                const contact = await msg.getContact();
                const name = contact.pushname || contact.name || 'Cliente';
                const customer = getOrCreateCustomer(msg.from, name);
                const context = getAIContext(customer.id);
                let currentStep = context.state.current_step;

                // --- 0. MANEJO DE NOTAS DE VOZ (Transcripción) ---
                if (msg.type === 'audio' || msg.type === 'ptt') {
                    try {
                        const media = await msg.downloadMedia();
                        if (media) {
                            const audioBuffer = Buffer.from(media.data, 'base64');
                            const transcription = await transcribeAudio(audioBuffer, media.mimetype);

                            if (transcription) {
                                console.log(`🎤 Audio transcrito para ${msg.from}: ${transcription}`);
                                msg.body = transcription; // Inyectamos el texto para que siga el flujo normal
                            }
                        }
                    } catch (transcErr) {
                        console.error('❌ Error transcribiendo audio:', transcErr.message);
                        await msg.reply("😅 Amigo, no alcancé a escucharte bien. ¿Me lo puedes escribir o enviar de nuevo?");
                        return;
                    }
                }

                // --- 1. MANEJO DE COMPROBANTES (AWAITING_RECEIPT) ---
                if (msg.hasMedia && currentStep === 'AWAITING_RECEIPT') {
                    const media = await msg.downloadMedia();
                    if (media) {
                        const receiptData = `data:${media.mimetype};base64,${media.data}`;
                        const lastOrderId = db.prepare('SELECT id FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1').get(customer.id).id;
                        db.prepare('UPDATE orders SET receipt = ? WHERE id = ?').run(receiptData, lastOrderId);
                        updateCustomerState(customer.id, 'COMPLETED');

                        if (io) io.emit('order_updated', { id: lastOrderId, hasReceipt: true });
                        await msg.reply("✅ *¡Recibido!* Muchas gracias por tu pago. Ya estamos procesando tu pedido.");
                        return;
                    }
                }

                if (!msg.body) return;
                const m = msg.body.toLowerCase();

                // --- 2. LÓGICA DE ESTADOS DEL BACKEND ---

                // ESTADO: Esperando Dirección y Nombre
                if (currentStep === 'AWAITING_ADDRESS') {
                    // Intento simple de validar si hay dirección (mínimo 5 caracteres y no es una confirmación corta)
                    if (m.length > 8 && (m.includes('calle') || m.includes('cll') || m.includes('cra') || m.includes('carrera') || m.includes('av') || m.includes('#'))) {
                        db.prepare('UPDATE customers SET address = ? WHERE id = ?').run(msg.body, customer.id);
                        updateCustomerState(customer.id, 'AWAITING_PAYMENT');
                        await msg.reply("📍 *¡Perfecto!* Ya guardé tu dirección. ¿Cómo deseas realizar el pago?\n\n1. **Efectivo** 💵\n2. **Transferencia (Nequi)** 💳");
                        return;
                    }
                }

                // ESTADO: Esperando Método de Pago
                if (currentStep === 'AWAITING_PAYMENT') {
                    if (m.includes('efectivo') || m === '1') {
                        const order = createOrderFromState(customer.id, 'Efectivo');
                        if (order && io) io.emit('new_order', { id: order.orderId, status: 'PENDING' });
                        await msg.reply("✅ *¡Listo!* Tu pedido en efectivo ha sido registrado. Lo llevaremos lo antes posible. ¡Gracias!");
                        return;
                    } else if (m.includes('transferencia') || m.includes('nequi') || m === '2') {
                        updateCustomerState(customer.id, 'AWAITING_RECEIPT');
                        const paymentInfo = db.prepare("SELECT value FROM config_bot WHERE key = 'payment_info'").get()?.value || "Por favor transfiere a Nequi: 3207008433";
                        await msg.reply(paymentInfo);
                        createOrderFromState(customer.id, 'Transferencia'); // Creamos la orden de una vez
                        return;
                    }
                }

                // --- 3. PROCESAMIENTO CON IA (BROWSING / CHAT / RECOMENDACIONES) ---
                console.log('🧠 IA: Procesando...');

                // Detectar intención de "Confirmar pedido" para saltar a AWAITING_ADDRESS
                const intent = classifyIntent(msg.body);
                if (intent === 'CONFIRM_PRODUCTS' && currentStep === 'BROWSING') {
                    // Extraer carrito temporal antes de pasar al siguiente paso
                    // (En un sistema real, la IA ya habría ayudado a armar el cart en current_cart)
                    // Por ahora, simulamos que lo que tiene en mente es lo que guardaremos.
                    // Para que sea robusto, la IA debe "notar" los productos. 
                    // IMPLEMENTACIÓN: Si el usuario confirma, pasamos a pedir datos.
                    updateCustomerState(customer.id, 'AWAITING_ADDRESS');
                    await msg.reply("🙌 ¡Excelente elección! Para finalizar, por favor regálame tu **Nombre completo** y **Dirección de entrega**.");
                    return;
                }

                let aiResponse = await processMessage(customer, msg.body);

                if (aiResponse) {
                    // Limpieza simplificada (ya no buscamos JSON complejos de la IA)
                    aiResponse = aiResponse.replace(/```json[\s\S]*?```/gi, '').trim();
                    aiResponse = aiResponse.replace(/\{[\s\S]*?\}/gi, '').trim();

                    if (aiResponse) {
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
