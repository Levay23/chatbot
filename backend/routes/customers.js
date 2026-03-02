import express from 'express';
import db from '../database/db.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { getHistory } from '../services/memoryService.js';
import { getWhatsAppClient, isWhatsAppConnected } from '../services/whatsappService.js';

const router = express.Router();
router.use(verifyToken);

// Obtener todos los clientes con estadísticas de pedidos
router.get('/', (req, res) => {
    try {
        const customers = db.prepare(`
            SELECT
                c.id,
                c.phone,
                c.name,
                c.address,
                c.created_at,
                COUNT(o.id)            AS total_orders,
                COALESCE(SUM(o.total), 0) AS total_spent,
                MAX(o.created_at)      AS last_order_at
            FROM customers c
            LEFT JOIN orders o ON o.customer_id = c.id
            GROUP BY c.id
            ORDER BY last_order_at DESC NULLS LAST
        `).all();
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Obtener el historial de un cliente
router.get('/:id/history', (req, res) => {
    try {
        const history = getHistory(req.params.id, 50);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Enviar mensaje individual a un cliente por su phone
router.post('/:id/send-message', async (req, res) => {
    if (!isWhatsAppConnected()) {
        return res.status(503).json({ error: 'WhatsApp no está conectado.' });
    }
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Mensaje vacío.' });

    try {
        const customer = db.prepare('SELECT phone FROM customers WHERE id = ?').get(req.params.id);
        if (!customer) return res.status(404).json({ error: 'Cliente no encontrado.' });

        const client = getWhatsAppClient();
        await client.sendMessage(customer.phone, message.trim());
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Enviar mensaje masivo a una lista de IDs
router.post('/broadcast', async (req, res) => {
    if (!isWhatsAppConnected()) {
        return res.status(503).json({ error: 'WhatsApp no está conectado.' });
    }
    const { ids, message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Mensaje vacío.' });
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Sin destinatarios.' });

    const client = getWhatsAppClient();
    const results = [];

    for (const id of ids) {
        try {
            const customer = db.prepare('SELECT phone, name FROM customers WHERE id = ?').get(id);
            if (!customer) { results.push({ id, ok: false, error: 'No encontrado' }); continue; }
            await client.sendMessage(customer.phone, message.trim());
            results.push({ id, ok: true, name: customer.name });
            // Pequeña pausa entre mensajes para no saturar WA
            await new Promise(r => setTimeout(r, 700));
        } catch (err) {
            results.push({ id, ok: false, error: err.message });
        }
    }

    const sent = results.filter(r => r.ok).length;
    res.json({ sent, failed: results.length - sent, results });
});

export default router;
