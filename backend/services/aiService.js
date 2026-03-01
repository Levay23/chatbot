import axios from 'axios';
import db from '../database/db.js';
import { getContextForAI, saveMessage } from './memoryService.js';
import { systemPrompt } from '../prompts/systemPrompt.js';
import dotenv from 'dotenv';
dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_NAME = 'llama-3.3-70b-versatile';

export const processMessage = async (customer, incomingMessage) => {
    console.log(`🧠 [AI - Groq] Procesando mensaje de ${customer.phone}: "${incomingMessage}"`);

    try {
        // Guardar mensaje del usuario en memoria/DB
        saveMessage(customer.id, 'user', incomingMessage);

        // Obtener configuración (saludos, etc.)
        const configEntries = db.prepare('SELECT key, value FROM config_bot').all();
        const config = configEntries.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});

        // Obtener productos activos para el menú dinámico
        const products = db.prepare('SELECT name, price, category FROM products WHERE active = 1').all();
        const availableItems = products.map(p => `- ${p.name}`).join(', ');

        // Construir prompt del sistema dinámico
        let dynamicSystemPrompt = `${systemPrompt}\n\n`;
        dynamicSystemPrompt += `REGLAS DE RESPUESTA CONFIGURADAS (USA ESTOS SALUDOS):
- BIENVENIDA: ${config.greeting || 'Hola'}
- DESPEDIDA: ${config.farewell || 'Gracias'}
- PAGO: ${config.payment_info || 'Efectivo o Nequi'}

ESTADO DEL INVENTARIO HOY (Solo ofrece estos productos):
${availableItems || 'Actualmente estamos actualizando el menú.'}\n`;

        // Obtener historial de mensajes (formato: { role, content })
        const history = getContextForAI(customer.id);

        // Preparar mensajes para Groq
        const messages = [
            { role: "system", content: dynamicSystemPrompt },
            ...history.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.content
            }))
        ];

        let aiResponse = "";
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                const response = await axios.post(GROQ_URL, {
                    model: MODEL_NAME,
                    messages: messages,
                    temperature: 0.6,
                    max_tokens: 2048,
                    top_p: 1,
                    stream: false
                }, {
                    headers: {
                        'Authorization': `Bearer ${GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 20000 // 20 segundos de timeout
                });

                aiResponse = response.data.choices[0].message.content;
                break; // Éxito
            } catch (error) {
                attempts++;
                console.error(`⚠️ Intento ${attempts} fallido:`, error.response?.data || error.message);

                if (attempts < maxAttempts) {
                    const waitTime = attempts * 2000;
                    console.log(`Reintentando en ${waitTime}ms...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                    throw error;
                }
            }
        }

        if (aiResponse) {
            // Guardar respuesta de la IA en memoria/DB (Rol assistant para cumplir CHECK constraint)
            saveMessage(customer.id, 'assistant', aiResponse);
            return aiResponse;
        }

        return "Lo siento, en este momento tengo mucha demanda. ¿Podrías repetirme eso en un momento?";

    } catch (error) {
        console.error('❌ Error en AI Service (Groq):', error.response?.data || error.message);
        return "Lo siento, ocurrió un error interno. Por favor intenta de nuevo en unos segundos.";
    }
};
