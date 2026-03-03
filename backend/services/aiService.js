import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';
import { getAIContext, saveMessage } from './memoryService.js';
import { classifyIntent, getFilteredMenu, buildSystemPrompt } from './salesEngine.js';
import db from '../database/db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { EdgeTTS } from 'node-edge-tts';
import fs from 'fs/promises';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_KEY_2 = process.env.GROQ_API_KEY_2;
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

        // Rotación automática de API Keys al detectar 429
        const apiKeys = [GROQ_API_KEY, GROQ_API_KEY_2].filter(Boolean);
        let aiResponse = "";

        for (const apiKey of apiKeys) {
            try {
                console.log(`🔑 Usando API Key ${apiKeys.indexOf(apiKey) + 1}...`);
                const response = await axios.post(GROQ_URL, {
                    model: MODEL_NAME,
                    messages: messages,
                    temperature: 0.4,
                    max_tokens: 350,
                    top_p: 1,
                    stream: false
                }, {
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    timeout: 10000
                });
                aiResponse = response.data.choices[0].message.content;
                break; // Éxito, salir del loop
            } catch (error) {
                if (error.response?.status === 429) {
                    console.warn(`⚠️ Key ${apiKeys.indexOf(apiKey) + 1} agotada. Rotando a la siguiente...`);
                    continue;
                }
                throw error;
            }
        }

        if (!aiResponse) {
            console.error('❌ Todas las API Keys están agotadas.');
            return "Estoy un poco ocupado en este momento 😅. Escríbeme en unos minutos y te atiendo rápido. ¡Gracias por tu paciencia!";
        }

        saveMessage(customer.id, 'assistant', aiResponse);
        return aiResponse;

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
    // Limpiar mimetype (ej: "audio/ogg; codecs=opus" -> "audio/ogg")
    const cleanMimeType = mimetype.split(';')[0].trim();
    console.log(`🎙️ [AI - Whisper] Transcribiendo audio (${cleanMimeType}), tamaño: ${audioBuffer.length} bytes...`);

    const apiKeys = [GROQ_API_KEY, GROQ_API_KEY_2].filter(Boolean);

    for (const apiKey of apiKeys) {
        try {
            const formData = new FormData();

            // Usar el Buffer directamente es más robusto que un Stream en muchas versiones de form-data
            const extension = cleanMimeType.includes('ogg') ? 'ogg' :
                cleanMimeType.includes('mp4') ? 'm4a' :
                    cleanMimeType.includes('mpeg') ? 'mp3' : 'mp3';
            const filename = `audio.${extension}`;

            formData.append('file', audioBuffer, { filename, contentType: cleanMimeType });
            formData.append('model', 'whisper-large-v3-turbo');
            formData.append('language', 'es');
            formData.append('response_format', 'json');

            const response = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
                headers: { ...formData.getHeaders(), 'Authorization': `Bearer ${apiKey}` },
                timeout: 25000
            });

            const transcription = response.data.text;
            if (!transcription || transcription.trim().length === 0) {
                console.warn('⚠️ Transcripción vacía recibida.');
                return null;
            }

            console.log(`📝 Transcripción exitosa: "${transcription}"`);
            return transcription;
        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            if (error.response?.status === 429) {
                console.warn(`⚠️ Key ${apiKeys.indexOf(apiKey) + 1} agotada para audio. Rotando...`);
                continue;
            }
            console.error('❌ Error en Transcripción Whisper:', errorMsg);
            // Si es un error de formato o archivo inválido, no sirve rotar keys
            if (errorMsg.includes('format') || errorMsg.includes('valid media')) break;

            throw new Error('No pude entender el audio, ¿podrías repetírmelo por texto?');
        }
    }

    return null;
};

/**
 * Sintetiza texto a voz usando Edge TTS
 * @param {string} text - El texto a convertir
 * @returns {Promise<Buffer>} - El buffer del audio MP3
 */
export const synthesizeSpeech = async (text) => {
    let tempPath = null;
    try {
        console.log(`🔊 [AI - TTS] Sintetizando voz (Salome): "${text.substring(0, 50)}..."`);

        // Limpiar el texto de emojis, markdown y moneda para que la voz sea natural
        const cleanText = text
            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu, '') // Eliminar Emojis
            .replace(/\*/g, '') // Eliminar negritas
            .replace(/_/g, '')  // Eliminar cursivas
            .replace(/#/g, '')  // Eliminar símbolos de encabezado
            .replace(/!/g, '')  // Eliminar exclamaciones excesivas (opcional, pero ayuda al tono)
            .replace(/COP/gi, '') // Eliminar moneda
            .replace(/dólares/gi, '')
            .replace(/dólar/gi, '')
            .replace(/pesos/gi, '')
            .replace(/\$/g, '')   // Eliminar símbolo de peso
            .replace(/\[.*?\]/g, '') // Eliminar bloques tipo JSON o anotaciones
            .replace(/\s+/g, ' ') // Normalizar espacios
            .trim();

        if (!cleanText) return null;

        const tts = new EdgeTTS({
            voice: 'es-CO-SalomeNeural',
            lang: 'es-CO',
            outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
        });

        tempPath = path.join(os.tmpdir(), `tts_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp3`);

        await tts.ttsPromise(cleanText, tempPath);

        const buffer = await fs.readFile(tempPath);

        // Limpieza asíncrona
        fs.unlink(tempPath).catch(err => console.error('⚠️ Error limpiando TTS temp:', err));

        return buffer;
    } catch (error) {
        console.error('❌ Error crítico en Síntesis de Voz:', error);
        if (tempPath) fs.unlink(tempPath).catch(() => { });
        return null;
    }
};
