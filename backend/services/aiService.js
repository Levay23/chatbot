import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';
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
const MODEL_NAME = 'llama-3.3-70b-versatile'; // Restaurado a 3.3

export const processMessage = async (customer, incomingMessage) => {
    console.log(`🧠 [AI - Groq] Procesando mensaje de ${customer.phone}: "${incomingMessage}"`);

    try {
        // 1. Guardar mensaje del usuario en memoria/DB
        saveMessage(customer.id, 'user', incomingMessage);

        // 2. Obtener contexto enriquecido (Memoria + Perfil + Estado)
        const context = getAIContext(customer.id);
        const currentStep = context.state.current_step;

        // 3. Clasificar intención y filtrar menú dinámicamente
        const mode = classifyIntent(incomingMessage);
        const filteredMenu = getFilteredMenu(incomingMessage);

        // 4. Obtener configuración
        const configEntries = db.prepare('SELECT key, value FROM config_bot').all();
        const config = configEntries.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});

        // 5. Construir System Prompt dinámico
        const dynamicPrompt = buildSystemPrompt(mode, context, filteredMenu, config);

        // 6. Preparar historial para Groq (Últimos 8 mensajes para ahorrar tokens)
        const messages = [
            { role: "system", content: dynamicPrompt },
            ...context.messages.slice(-8).map(msg => ({
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.content
            }))
        ];

        // 7. Temperatura fija más baja para mayor estabilidad y menos repetición
        const temperature = 0.4;

        let aiResponse = "";
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                const response = await axios.post(GROQ_URL, {
                    model: MODEL_NAME,
                    messages: messages,
                    temperature: temperature,
                    max_tokens: 350,
                    top_p: 1,
                    stream: false
                }, {
                    headers: {
                        'Authorization': `Bearer ${GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
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
            saveMessage(customer.id, 'assistant', aiResponse);
            return aiResponse;
        }

        return "Lo siento, estamos un poco ocupados. Por favor repíteme tu mensaje en un momento.";

    } catch (error) {
        console.error('❌ Error en AI Service:', error.message);
        return "Lo siento, hubo un pequeño error. ¿Puedes intentar de nuevo?";
    }
};

/**
 * Transcribe un audio usando Groq Whisper
 * @param {Buffer} audioBuffer - El buffer del audio descargado
 * @param {string} mimetype - El tipo de archivo (ej: audio/ogg; codecs=opus)
 * @returns {Promise<string>} - El texto transcrito
 */
export const transcribeAudio = async (audioBuffer, mimetype) => {
    console.log(`🎙️ [AI - Whisper] Transcribiendo audio (${mimetype})...`);

    try {
        const formData = new FormData();

        // Convertir buffer a stream legible para form-data
        const stream = Readable.from(audioBuffer);

        // Determinar extensión basándose en mimetype (Whisper prefiere .ogg, .mp3, .wav)
        const filename = mimetype.includes('ogg') ? 'audio.ogg' : 'audio.mp3';

        formData.append('file', stream, { filename, contentType: mimetype });
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', 'es');
        formData.append('response_format', 'text');

        const response = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            timeout: 20000
        });

        const transcription = typeof response.data === 'string' ? response.data : response.data.text;
        console.log(`📝 Transcripción exitosa: "${transcription}"`);
        return transcription;

    } catch (error) {
        console.error('❌ Error en Transcripción Whisper:', error.response?.data || error.message);
        throw new Error('No pude entender el audio, ¿podrías repetírmelo por texto?');
    }
};
