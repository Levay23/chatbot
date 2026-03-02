import axios from 'axios';
import { getAIContext, saveMessage } from './memoryService.js';
import { classifyIntent, getFilteredMenu, buildSystemPrompt } from './salesEngine.js';
import db from '../database/db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_NAME = 'llama3-70b-8192'; // Regresamos al 70B: Mayor cuota de tokens y mejor razonamiento JSON

export const processMessage = async (customer, incomingMessage) => {
    console.log(`🧠 [AI - Groq 8B] Procesando mensaje de ${customer.phone}: "${incomingMessage}"`);

    try {
        // 1. Guardar mensaje del usuario en memoria/DB
        saveMessage(customer.id, 'user', incomingMessage);

        // 2. Obtener configuración (saludos, etc.)
        const configEntries = db.prepare('SELECT key, value FROM config_bot').all();
        const config = configEntries.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});

        // 3. Clasificar intención y filtrar menú dinámicamente
        const mode = classifyIntent(incomingMessage);
        const filteredMenu = getFilteredMenu(incomingMessage);

        // 4. Obtener contexto enriquecido (Memoria + Perfil)
        const context = getAIContext(customer.id);

        // 5. Construir System Prompt dinámico
        const dynamicPrompt = buildSystemPrompt(mode, context.memory, context.profile, filteredMenu, config);

        // 5. Preparar historial para Groq (Solo los últimos 6 mensajes)
        const messages = [
            { role: "system", content: dynamicPrompt },
            ...context.messages.map(msg => ({
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
                    max_tokens: 450, // Reducido para evitar limites de Groq TPM (429)
                    top_p: 1,
                    stream: false
                }, {
                    headers: {
                        'Authorization': `Bearer ${GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000 // 10 segundos (más rápido)
                });

                aiResponse = response.data.choices[0].message.content;
                break;
            } catch (error) {
                attempts++;
                console.error(`⚠️ Intento ${attempts} fallido:`, error.response?.data || error.message);
                if (attempts === maxAttempts) throw error;
                await new Promise(resolve => setTimeout(resolve, attempts * 1000));
            }
        }

        if (aiResponse) {
            // Guardar respuesta de la IA en memoria/DB
            saveMessage(customer.id, 'assistant', aiResponse);
            return aiResponse;
        }

        return "Lo siento, estamos un poco ocupados. Por favor repíteme tu mensaje en un momento.";

    } catch (error) {
        console.error('❌ Error en AI Service (Groq 8B):', error.message);
        return "Lo siento, hubo un pequeño error. ¿Puedes intentar de nuevo?";
    }
};
