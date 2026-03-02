import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { getOrCreateCustomer, getAIContext, updateCustomerState } from './memoryService.js';
import { processMessage, transcribeAudio } from './aiService.js';
import { createOrderFromState } from './orderService.js';
import { classifyIntent } from './salesEngine.js';
import { exec } from 'child_process';
import db from '../database/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
                    try {
                        const media = await msg.downloadMedia();
                        if (media) {
                            const lastOrder = db.prepare('SELECT id FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1').get(customer.id);
                            if (!lastOrder) {
                                await msg.reply("😅 Disculpa, no encontré tu pedido pendiente en el sistema. ¿Podrías confirmarme qué pediste para verificar?");
                                return;
                            }

                            const extension = media.mimetype.split('/')[1]?.split(';')[0] || 'jpg';
                            const fileName = `receipt_${lastOrder.id}_${Date.now()}.${extension}`;
                            const publicPath = path.join(__dirname, '../public/receipts', fileName);
                            const dbUrl = `/public/receipts/${fileName}`;

                            // Guardar archivo físico
                            fs.writeFileSync(publicPath, Buffer.from(media.data, 'base64'));

                            // Actualizar DB con la URL en vez del Base64 pesado
                            db.prepare('UPDATE orders SET receipt = ? WHERE id = ?').run(dbUrl, lastOrder.id);
                            updateCustomerState(customer.id, 'COMPLETED');

                            if (io) io.emit('order_updated', { id: lastOrder.id, hasReceipt: true, receiptUrl: dbUrl });
                            await msg.reply("✅ *¡Recibido!* Muchas gracias por tu pago. Ya estamos procesando tu pedido.");
                            return;
                        }
                    } catch (mediaErr) {
                        console.error('❌ Error procesando comprobante:', mediaErr.message);
                        await msg.reply("⚠️ Hubo un problema al procesar tu imagen. Por favor, intenta enviarla de nuevo.");
                        return;
                    }
                } else if (msg.hasMedia && currentStep === 'AWAITING_RECEIPT') {
                    await msg.reply("😅 Disculpa, no encontré tu pedido pendiente en el sistema. ¿Podrías confirmarme qué pediste para verificar?");
                    return;
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
                        const currentNotes = db.prepare('SELECT notes FROM customers WHERE id = ?').get(customer.id)?.notes || null;
                        const order = createOrderFromState(customer.id, 'Efectivo', null, null, currentNotes);
                        if (order && io) {
                            io.emit('new_order', { id: order.orderId, status: 'PENDING' });
                            updateCustomerState(customer.id, 'COMPLETED');
                        }
                        await msg.reply("✅ *¡Listo!* Tu pedido en efectivo ha sido registrado. Lo llevaremos lo antes posible. ¡Gracias!");
                        return;
                    } else if (m.includes('transferencia') || m.includes('nequi') || m === '2') {
                        const currentNotes = db.prepare('SELECT notes FROM customers WHERE id = ?').get(customer.id)?.notes || null;
                        const order = createOrderFromState(customer.id, 'Transferencia', null, null, currentNotes);
                        if (!order) {
                            await msg.reply("😅 Amigo, tuve un problemita técnico anotando tu pedido. ¿Me confirmas de nuevo qué deseas pedir para asegurarme de que todo esté perfecto? 🙏");
                            updateCustomerState(customer.id, 'BROWSING');
                            return;
                        }
                        updateCustomerState(customer.id, 'AWAITING_RECEIPT');
                        const paymentInfo = db.prepare("SELECT value FROM config_bot WHERE key = 'payment_info'").get()?.value || "Por favor transfiere a Nequi: 3207008433";
                        await msg.reply(paymentInfo);
                        return;
                    }
                }

                // --- 3. PROCESAMIENTO CON IA (BROWSING / CHAT / RECOMENDACIONES) ---
                console.log('🧠 IA: Procesando...');

                // Detectar intención de "Confirmar pedido" para saltar a AWAITING_ADDRESS
                const intent = classifyIntent(msg.body);
                if (intent === 'CONFIRM_PRODUCTS' && currentStep === 'BROWSING') {
                    // Verificar si ya hay un carrito guardado
                    const checkCart = db.prepare('SELECT current_cart FROM customers WHERE id = ?').get(customer.id);
                    if (!checkCart?.current_cart) {
                        await msg.reply("😉 ¡Me encanta tu entusiasmo! Pero dime primero qué te gustaría pedir para poder anotar todo bien.");
                        return;
                    }
                    updateCustomerState(customer.id, 'AWAITING_ADDRESS');
                    await msg.reply("🙌 ¡Excelente elección! Para finalizar, por favor regálame tu **Nombre completo** y **Dirección de entrega**.");
                    return;
                }

                let aiResponse = await processMessage(customer, msg.body);

                if (aiResponse) {
                    // --- EXTRACCIÓN DE CARRITO HTML-LIKE (<cart>) ---
                    const cartMatch = aiResponse.match(/<cart>([\s\S]*?)<\/cart>/i);
                    if (cartMatch) {
                        try {
                            const cartJson = JSON.parse(cartMatch[1].trim());
                            if (cartJson && cartJson.items && cartJson.items.length > 0) {
                                console.log(`🛒 Carrito extraído para ${customer.phone}:`, cartJson);
                                updateCustomerState(customer.id, currentStep, cartJson);
                            }
                        } catch (e) {
                            console.error('❌ Error parseando <cart> de la IA:', e.message);
                        }
                    }

                    // --- EXTRACCIÓN DE NOTAS (<notes>) ---
                    const notesMatch = aiResponse.match(/<notes>([\s\S]*?)<\/notes>/i);
                    if (notesMatch) {
                        const notes = notesMatch[1].trim();
                        console.log(`📝 Notas extraídas para ${customer.phone}:`, notes);
                        db.prepare('UPDATE customers SET notes = ? WHERE id = ?').run(notes, customer.id);
                    }

                    // --- EXTRACCIÓN DE ESTADO (<state>) ---
                    const stateMatch = aiResponse.match(/<state>([\s\S]*?)<\/state>/i);
                    if (stateMatch) {
                        const newState = stateMatch[1].trim();
                        console.log(`📌 IA solicitó cambio de estado para ${customer.phone} a: ${newState}`);
                        updateCustomerState(customer.id, newState);
                        currentStep = newState; // Actualizar localmente para el resto del ciclo
                    }

                    // --- EXTRACCIÓN DE CREACIÓN DE ORDEN (<create_order>) ---
                    const orderMatch = aiResponse.match(/<create_order>([\s\S]*?)<\/create_order>/i);
                    if (orderMatch) {
                        const paymentMethod = orderMatch[1].trim();
                        console.log(`📦 IA solicitó creación de orden (${paymentMethod}) para ${customer.phone}`);

                        // Obtener notas actuales del cliente antes de crear la orden
                        const currentNotes = db.prepare('SELECT notes FROM customers WHERE id = ?').get(customer.id)?.notes || null;

                        // Validación de Seguridad: No crear orden si no hay dirección mínima
                        const checkCust = db.prepare('SELECT address FROM customers WHERE id = ?').get(customer.id);
                        if (!checkCust?.address || checkCust.address.length < 5) {
                            console.log(`⚠️ IA intentó crear orden para ${customer.phone} sin dirección. Corrigiendo estado.`);
                            updateCustomerState(customer.id, 'AWAITING_ADDRESS');
                            await msg.reply("😅 ¡Casi lo tengo! Pero antes de confirmar el pago, por favor regálame tu **Nombre y Dirección exacta** para saber a dónde llevarte el pedido pronto.");
                            return;
                        }

                        const order = createOrderFromState(customer.id, paymentMethod, null, null, currentNotes);
                        if (order && io) {
                            io.emit('new_order', { id: order.orderId, status: 'PENDING' });
                            db.prepare('UPDATE customers SET notes = NULL WHERE id = ?').run(customer.id);

                            // RESPUESTA AUTOMÁTICA DE PAGO (Failsafe)
                            if (paymentMethod.toLowerCase().includes('transferencia')) {
                                const paymentInfo = db.prepare("SELECT value FROM config_bot WHERE key = 'payment_info'").get()?.value || "Nequi: 3207008433";
                                setTimeout(async () => {
                                    await clientInstance.sendMessage(msg.from, `💳 *Datos de Pago:*\n${paymentInfo}\n\nPor favor envíame el comprobante por aquí mismo para procesar tu pedido. ✅`);
                                }, 1500);
                            }
                        } else {
                            console.error(`❌ Falló la creación de orden para ${customer.phone}. Notificando error.`);
                            await msg.reply("😅 Amigo, tuve un problemita técnico anotando tu pedido exacto. ¿Me confirmas de nuevo los platos para asegurarme de que todo esté perfecto? 🙏");
                            // Revertir estado si la IA lo cambió pero la orden falló
                            updateCustomerState(customer.id, 'BROWSING');
                            return;
                        }
                    }

                    // Limpieza: Quitar etiquetas auxiliares antes de enviar al usuario
                    aiResponse = aiResponse.replace(/<cart>[\s\S]*?<\/cart>/gi, '').trim();
                    aiResponse = aiResponse.replace(/<notes>[\s\S]*?<\/notes>/gi, '').trim();
                    aiResponse = aiResponse.replace(/<state>[\s\S]*?<\/state>/gi, '').trim();
                    aiResponse = aiResponse.replace(/<create_order>[\s\S]*?<\/create_order>/gi, '').trim();
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
