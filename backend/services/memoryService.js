import db from '../database/db.js';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const SUMMARY_MODEL = 'llama-3.1-8b-instant';

/**
 * Guarda un mensaje en el historial persistente
 */
export const saveMessage = (customerId, role, content) => {
    db.prepare('INSERT INTO conversations (customer_id, role, message) VALUES (?, ?, ?)').run(customerId, role, content);

    // Verificar si necesitamos resumir (cada 20 mensajes)
    const count = db.prepare('SELECT COUNT(*) as total FROM conversations WHERE customer_id = ?').get(customerId).total;
    if (count > 0 && count % 20 === 0) {
        summarizeConversation(customerId);
    }
};

/**
 * Genera un resumen de la conversación y lo guarda en memory_summary
 */
export const summarizeConversation = async (customerId) => {
    console.log(`📝 Generando resumen de memoria para cliente ID: ${customerId}...`);
    try {
        const history = db.prepare('SELECT role, message FROM conversations WHERE customer_id = ? ORDER BY timestamp ASC').all(customerId);
        const existingSummary = db.prepare('SELECT summary_text FROM memory_summary WHERE customer_id = ?').get(customerId);

        const conversationText = history.map(m => `${m.role}: ${m.message}`).join('\n');
        const prompt = `Eres un experto en perfilación de clientes para un restaurante. 
        Analiza la siguiente conversación y el resumen previo (si existe).
        Genera un NUEVO resumen conciso que incluya:
        1. Gustos y preferencias del cliente.
        2. Alergias o notas importantes (ej: "sin cebolla").
        3. Historial de lo que suele pedir.
        4. Tono o personalidad del cliente.
        
        RESUMEN PREVIO: ${existingSummary ? existingSummary.summary_text : 'Ninguno'}
        
        CONVERSACIÓN RECIENTE:
        ${conversationText}
        
        RESPONDE SOLO EL RESUMEN EN MENOS DE 150 PALABRAS.`;

        const response = await axios.post(GROQ_URL, {
            model: SUMMARY_MODEL,
            messages: [{ role: "system", content: prompt }],
            temperature: 0.3,
            max_tokens: 300
        }, {
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` }
        });

        const newSummary = response.data.choices[0].message.content;
        db.prepare(`
            INSERT INTO memory_summary (customer_id, summary_text, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(customer_id) DO UPDATE SET summary_text = excluded.summary_text, updated_at = CURRENT_TIMESTAMP
        `).run(customerId, newSummary);

        console.log(`✅ Memoria actualizada para cliente ${customerId}`);
    } catch (error) {
        console.error('❌ Error al resumir memoria:', error.message);
    }
};

/**
 * Obtiene el contexto optimizado para la IA
 */
export const getAIContext = (customerId) => {
    // 1. Obtener los últimos 6 mensajes
    const lastMessages = db.prepare(`
        SELECT role, message as content FROM conversations 
        WHERE customer_id = ? 
        ORDER BY timestamp DESC LIMIT 6
    `).all(customerId).reverse();

    // 2. Obtener resumen de memoria
    const summary = db.prepare('SELECT summary_text FROM memory_summary WHERE customer_id = ?').get(customerId);

    // 3. Obtener perfil del cliente
    const profile = db.prepare('SELECT total_orders, preferences, notes FROM customers WHERE id = ?').get(customerId);

    return {
        messages: lastMessages,
        memory: summary ? summary.summary_text : "Cliente nuevo o sin historial previo.",
        profile: {
            total_orders: profile?.total_orders || 0,
            preferences: profile?.preferences || "No detectadas",
            notes: profile?.notes || "Ninguna"
        }
    };
};

/**
 * Actualiza el perfil basado en un pedido exitoso
 */
export const updateCustomerProfile = (customerId, orderData) => {
    const customer = db.prepare('SELECT total_orders, preferences FROM customers WHERE id = ?').get(customerId);
    const newTotal = (customer?.total_orders || 0) + 1;

    // Lógica simple de preferencias (se puede mejorar con IA luego)
    let prefs = customer?.preferences || "";
    orderData.items.forEach(item => {
        if (!prefs.includes(item.product_name)) {
            prefs += (prefs ? ", " : "") + item.product_name;
        }
    });

    db.prepare('UPDATE customers SET total_orders = ?, preferences = ? WHERE id = ?')
        .run(newTotal, prefs, customerId);
};

// --- COMPATIBILIDAD CON CÓDIGO ANTERIOR ---
// Estos métodos se mantienen para no romper el whatsappService mientras migramos todo
export const getContextForAI = (customerId) => {
    const ctx = getAIContext(customerId);
    return ctx.messages;
};

/**
 * Obtiene el historial de mensajes de un cliente para el dashboard
 */
export const getHistory = (customerId, limit = 50) => {
    return db.prepare(`
        SELECT role, message as content, timestamp 
        FROM conversations 
        WHERE customer_id = ? 
        ORDER BY timestamp DESC LIMIT ?
    `).all(customerId, limit).reverse();
};

export const getOrCreateCustomer = (phone, name) => {
    let customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
    if (!customer) {
        const result = db.prepare('INSERT INTO customers (phone, name) VALUES (?, ?)').run(phone, name);
        customer = { id: result.lastInsertRowid, phone, name };
    }
    return customer;
};

export const createOrder = (phone, items, total, paymentMethod) => {
    const customer = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
    if (!customer) return null;

    const info = db.prepare('INSERT INTO orders (customer_id, total, payment_method) VALUES (?, ?, ?)').run(customer.id, total, paymentMethod);
    const orderId = info.lastInsertRowid;

    for (const item of items) {
        db.prepare('INSERT INTO order_items (order_id, product_name, quantity, price) VALUES (?, ?, ?, ?)').run(orderId, item.name, item.quantity, item.price);
    }

    // Actualizar perfil tras crear orden
    updateCustomerProfile(customer.id, { items });

    return orderId;
};
