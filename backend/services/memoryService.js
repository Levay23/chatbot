import db from '../database/db.js';

export const getContextForAI = (customerId) => {
    // Aumentamos el historial para mejor contexto
    const messages = db.prepare('SELECT role, content FROM messages WHERE customer_id = ? ORDER BY timestamp DESC LIMIT 8').all(customerId);
    return messages.reverse();
};

export const getHistory = (customerId, limit = 10) => {
    const messages = db.prepare(`SELECT role, content, timestamp FROM messages WHERE customer_id = ? ORDER BY timestamp DESC LIMIT ?`).all(customerId, limit);
    return messages.reverse();
};

export const saveMessage = (customerId, role, content) => {
    const stmt = db.prepare('INSERT INTO messages (customer_id, role, content) VALUES (?, ?, ?)');
    stmt.run(customerId, role, content);
};

export const getOrCreateCustomer = (phone, name = 'Cliente') => {
    let customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
    if (!customer) {
        const info = db.prepare('INSERT INTO customers (phone, name) VALUES (?, ?)').run(phone, name);
        customer = { id: info.lastInsertRowid, phone, name };
    }
    return customer;
};

export const updateCustomerAddress = (phone, address) => {
    db.prepare('UPDATE customers SET address = ? WHERE phone = ?').run(address, phone);
};

export const createOrder = (phone, products, total, paymentMethod = 'Efectivo') => {
    const customer = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
    if (!customer) return null;

    const orderResult = db.prepare(
        'INSERT INTO orders (customer_id, total, status, payment_method) VALUES (?, ?, ?, ?)'
    ).run(customer.id, total, 'PENDING', paymentMethod);

    const orderId = orderResult.lastInsertRowid;

    for (const item of products) {
        db.prepare(
            'INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)'
        ).run(orderId, null, item.name, item.quantity, item.price);
    }

    return orderId;
};
