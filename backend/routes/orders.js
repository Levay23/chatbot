import express from 'express';
import db from '../database/db.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(verifyToken);

let io = null;
export const setIO = (socketIo) => { io = socketIo; };

// GET all orders with customer info and items
router.get('/', (req, res) => {
    try {
        const orders = db.prepare(`
            SELECT 
                o.id, o.total, o.status, o.payment_method, o.receipt, o.created_at,
                c.name as cliente, c.phone as telefono, c.address as direccion,
                json_group_array(
                    json_object('cantidad', oi.quantity, 'nombre', oi.product_name, 'precio', oi.price)
                ) as items
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            LEFT JOIN order_items oi ON oi.order_id = o.id
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `).all();

        const processed = orders.map(o => ({
            ...o,
            items: o.items ? JSON.parse(o.items).filter(i => i.nombre) : []
        }));

        res.json(processed);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST create manual order
router.post('/', (req, res) => {
    const { nombre, telefono, direccion, metodo_pago, carrito } = req.body;
    try {
        // Upsert customer
        let customer = db.prepare('SELECT id FROM customers WHERE phone = ?').get(telefono);
        if (!customer) {
            db.prepare('INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)').run(nombre, telefono, direccion);
            customer = db.prepare('SELECT id FROM customers WHERE phone = ?').get(telefono);
        } else {
            db.prepare('UPDATE customers SET name = ?, address = ? WHERE id = ?').run(nombre, direccion, customer.id);
        }

        // Calculate total
        const total = carrito.reduce((sum, i) => sum + i.cantidad * parseFloat(i.precio), 0);

        // Create order
        const orderResult = db.prepare(
            'INSERT INTO orders (customer_id, total, status, payment_method) VALUES (?, ?, ?, ?)'
        ).run(customer.id, total, 'PENDING', metodo_pago || 'Efectivo');

        const orderId = orderResult.lastInsertRowid;

        // Insert items
        for (const item of carrito) {
            db.prepare(
                'INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)'
            ).run(orderId, item.producto_id || null, item.nombre, item.cantidad, item.precio);
        }

        if (io) io.emit('new_order', { id: orderId, status: 'PENDING' });

        res.json({ success: true, id: orderId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE order
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM order_items WHERE order_id = ?').run(req.params.id);
        db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
        if (io) io.emit('order_deleted', parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST update order status + notify customer via WhatsApp
router.post('/:id/estado', async (req, res) => {
    const { estado } = req.body;
    try {
        db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(estado, req.params.id);
        if (io) io.emit('order_updated', { id: parseInt(req.params.id), estado });

        // WhatsApp notification
        const order = db.prepare(`
            SELECT o.id, c.phone, c.name 
            FROM orders o JOIN customers c ON o.customer_id = c.id 
            WHERE o.id = ?
        `).get(req.params.id);

        if (order) {
            let msg = '';
            if (estado === 'PREPARING') msg = `🧑‍🍳 *¡Hola ${order.name}!* Tu orden *#${order.id}* fue aceptada y ya está en cocina.`;
            if (estado === 'READY') msg = `🛵 *¡Buenas noticias ${order.name}!* Tu orden *#${order.id}* está lista y en camino.`;
            if (estado === 'DELIVERED') msg = `✅ *¡Orden entregada!* Gracias por preferirnos, ${order.name}. ¡Vuelve pronto!`;

            if (msg) {
                try {
                    const { getWhatsAppClient } = await import('../services/whatsappService.js');
                    const client = getWhatsAppClient();
                    if (client) {
                        const jid = order.phone.includes('@') ? order.phone : `${order.phone}@c.us`;
                        await client.sendMessage(jid, msg);
                    }
                } catch (e) {
                    console.error('Error enviando notificación WA:', e.message);
                }
            }
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
