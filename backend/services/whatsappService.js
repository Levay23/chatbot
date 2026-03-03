import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import { getOrCreateCustomer, getAIContext, updateCustomerState } from './memoryService.js';
import { processMessage, transcribeAudio, synthesizeSpeech } from './aiService.js';
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

export const getWhatsAppClient = () => clientInstance;
export const isWhatsAppConnected = () => isWhatsAppReady;

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
                if (msg.type === 'audio' || msg.type === 'ptt' || msg.hasMedia && (msg.mimetype?.includes('audio') || msg.body?.includes('.ogg'))) {
                    console.log(`🎙️ Procesando nota de voz de ${msg.from}...`);
                    try {
                        const media = await msg.downloadMedia();
                        if (media) {
                            console.log(`📥 Media descargada (${media.mimetype}), enviando a Whisper...`);
                            const audioBuffer = Buffer.from(media.data, 'base64');
                            const transcription = await transcribeAudio(audioBuffer, media.mimetype);

                            if (transcription && transcription.trim().length > 0) {
                                console.log(`🎤 Transcripción exitosa para ${msg.from}: "${transcription}"`);
                                msg.body = transcription; // Inyectamos el texto para que siga el flujo normal
                            } else {
                                console.warn(`⚠️ Transcripción vacía o nula para ${msg.from}`);
                                await msg.reply("😅 Amigo, el audio me llegó vacío o no pude entenderlo. ¿Me lo repites o me lo escribes?");
                                return;
                            }
                        } else {
                            console.error(`❌ No se pudo descargar la media de ${msg.from}`);
                            await msg.reply("⚠️ Tuve un problema al descargar tu audio. ¿Podrías enviarlo de nuevo?");
                            return;
                        }
                    } catch (transcErr) {
                        console.error('❌ Error crítico en flujo de audio:', transcErr.message);
                        await msg.reply("😅 Disculpa, mi sistema de oído está fallando un poco. ¿Podrías escribirme tu pedido por ahora?");
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

                // ESTADO: Esperando Nombre y Dirección
                if (currentStep === 'AWAITING_ADDRESS') {
                    // Aceptar cualquier respuesta mayor a 5 chars como dirección válida
                    // (no limitamos a "calle", "cra", etc. porque pueden ser descripciones)
                    if (msg.body.trim().length > 5) {
                        // Si el cliente dio datos, la IA los habrá capturado en <data>
                        // Guardar también directamente aquí como fallback
                        const existing = db.prepare('SELECT address FROM customers WHERE id = ?').get(customer.id);
                        if (!existing?.address || existing.address.length < 5) {
                            db.prepare('UPDATE customers SET address = ? WHERE id = ?').run(msg.body, customer.id);
                        }
                        // Dejar que la IA responda, ella detectará y usará <state>AWAITING_PAYMENT</state>
                    }
                }

                // ESTADO: Esperando Método de Pago
                if (currentStep === 'AWAITING_PAYMENT') {
                    if (m.includes('efectivo') || m.trim() === '1') {
                        const currentNotes = db.prepare('SELECT notes FROM customers WHERE id = ?').get(customer.id)?.notes || null;
                        const order = createOrderFromState(customer.id, 'Efectivo', null, null, currentNotes);
                        if (order && io) {
                            io.emit('new_order', { id: order.orderId, status: 'PENDING' });
                            updateCustomerState(customer.id, 'COMPLETED');
                        }
                        await msg.reply("✅ *¡Pedido registrado!* Te llevaremos tu pedido lo antes posible. Gracias 🙌");
                        return;
                    } else if (m.includes('transferencia') || m.includes('nequi') || m.includes('transfer') || m.trim() === '2') {
                        const currentNotes = db.prepare('SELECT notes FROM customers WHERE id = ?').get(customer.id)?.notes || null;
                        const order = createOrderFromState(customer.id, 'Transferencia', null, null, currentNotes);
                        if (!order) {
                            await msg.reply("😅 Tuve un problemita técnico. ¿Me confirmas tu pedido de nuevo?");
                            updateCustomerState(customer.id, 'BROWSING');
                            return;
                        }
                        updateCustomerState(customer.id, 'AWAITING_RECEIPT');
                        const paymentInfoRow = db.prepare("SELECT value FROM config_bot WHERE key = 'payment_info'").get();
                        const paymentText = paymentInfoRow?.value || "Nequi: 3207008433 - Luis Castillo";
                        await msg.reply(`💳 *Datos para tu transferencia:*\n\n${paymentText}\n\nEnvíame la foto del comprobante cuando hayas pagado. ✅`);
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

                    // --- EXTRACCIÓN DE DATOS DE CLIENTE (<data>) ---
                    const dataMatch = aiResponse.match(/<data>([\s\S]*?)<\/data>/i);
                    if (dataMatch) {
                        try {
                            const userData = JSON.parse(dataMatch[1].trim());
                            if (userData.name) db.prepare('UPDATE customers SET name = ? WHERE id = ?').run(userData.name, customer.id);
                            if (userData.address) db.prepare('UPDATE customers SET address = ? WHERE id = ?').run(userData.address, customer.id);
                            console.log(`👤 Datos de cliente actualizados para ${customer.phone}:`, userData);
                        } catch (e) {
                            console.error('❌ Error parseando <data> de la IA:', e.message);
                        }
                    }

                    // --- EXTRACCIÓN DE ESTADO (<state>) ---
                    const stateMatch = aiResponse.match(/<state>([\s\S]*?)<\/state>/i);
                    if (stateMatch) {
                        let newState = stateMatch[1].trim();

                        // GUARD: No permitir estados de pago sin dirección
                        const checkCust = db.prepare('SELECT address FROM customers WHERE id = ?').get(customer.id);
                        const hasAddress = checkCust?.address && checkCust.address.length >= 5;

                        if ((newState === 'AWAITING_PAYMENT' || newState === 'AWAITING_RECEIPT' || newState === 'COMPLETED') && !hasAddress) {
                            console.log(`🛡️ Bloqueando salto de estado ilegal a ${newState} para ${customer.phone}`);
                            newState = 'AWAITING_ADDRESS';
                        }

                        console.log(`📌 Cambio de estado para ${customer.phone} a: ${newState}`);
                        updateCustomerState(customer.id, newState);
                        currentStep = newState;
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
                    aiResponse = aiResponse.replace(/<data>[\s\S]*?<\/data>/gi, '').trim();
                    aiResponse = aiResponse.replace(/<state>[\s\S]*?<\/state>/gi, '').trim();
                    aiResponse = aiResponse.replace(/<create_order>[\s\S]*?<\/create_order>/gi, '').trim();
                    aiResponse = aiResponse.replace(/```json[\s\S]*?```/gi, '').trim();
                    aiResponse = aiResponse.replace(/\{[\s\S]*?\}/gi, '').trim();

                    if (aiResponse) {
                        try {
                            // Obtener configuración de voz del bot
                            const voiceModeConfig = db.prepare("SELECT value FROM config_bot WHERE key = 'bot_voice_mode'").get();
                            const voiceMode = voiceModeConfig ? voiceModeConfig.value : 'text'; // default 'text'

                            if (voiceMode === 'text') {
                                try {
                                    await msg.reply(aiResponse);
                                } catch (replyErr) {
                                    const chat = await msg.getChat();
                                    await chat.sendMessage(aiResponse);
                                }
                            } else {
                                // Generar audio para 'both' o 'voice'
                                const audioBuffer = await synthesizeSpeech(aiResponse);

                                if (audioBuffer) {
                                    const media = new MessageMedia('audio/mp3', audioBuffer.toString('base64'), 'response.mp3');

                                    if (voiceMode === 'both') {
                                        // Texto + Voz
                                        try {
                                            await msg.reply(aiResponse);
                                        } catch (replyErr) {
                                            const chat = await msg.getChat();
                                            await chat.sendMessage(aiResponse);
                                        }
                                        await clientInstance.sendMessage(msg.from, media, { sendAudioAsVoice: true });
                                    } else if (voiceMode === 'voice') {
                                        // Solo Voz
                                        await clientInstance.sendMessage(msg.from, media, { sendAudioAsVoice: true });
                                    }
                                } else {
                                    // Fallback si falla la síntesis: enviar texto
                                    try {
                                        await msg.reply(aiResponse);
                                    } catch (replyErr) {
                                        const chat = await msg.getChat();
                                        await chat.sendMessage(aiResponse);
                                    }
                                }
                            }
                        } catch (respErr) {
                            console.error('❌ Error enviando respuesta (voz/texto):', respErr.message);
                            // Fallback final
                            await msg.reply(aiResponse).catch(() => { });
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
