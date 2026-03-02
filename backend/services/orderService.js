import db from '../database/db.js';

/**
 * Valida y procesa un pedido JSON generado por la IA
 */
export const processOrderJSON = (customerId, orderData) => {
    console.log(`📦 Procesando pedido JSON para cliente ${customerId}...`);

    try {
        if (!orderData.items || !Array.isArray(orderData.items)) {
            throw new Error('Formato de ítems inválido');
        }

        // 1. Validar productos y PRECIOS reales desde la BD (No confiar en la IA)
        let totalReal = 0;
        const validatedItems = [];

        for (const item of orderData.items) {
            // Buscamos el producto por nombre (aproximado o exacto)
            const product = db.prepare('SELECT id, name, price, active FROM products WHERE name LIKE ?').get(`%${item.product_name}%`);

            if (product && product.active) {
                const qty = item.quantity || 1;
                const price = product.price;
                totalReal += (price * qty);
                validatedItems.push({
                    product_id: product.id,
                    name: product.name,
                    quantity: qty,
                    price: price
                });
            } else {
                console.warn(`⚠️ Producto no encontrado o inactivo: ${item.product_name}`);
            }
        }

        if (validatedItems.length === 0) {
            throw new Error('No se encontraron productos válidos en el pedido');
        }

        // 2. Insertar orden en la DB
        const paymentMethod = orderData.metodo_pago || 'Efectivo';
        const notes = orderData.notes || '';

        const stmt = db.prepare('INSERT INTO orders (customer_id, total, payment_method, notes) VALUES (?, ?, ?, ?)');
        const info = stmt.run(customerId, totalReal, paymentMethod, notes);
        const orderId = info.lastInsertRowid;

        // 3. Insertar items
        const itemStmt = db.prepare('INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)');
        for (const item of validatedItems) {
            itemStmt.run(orderId, item.product_id, item.name, item.quantity, item.price);
        }

        // 4. Actualizar perfil del cliente (total_orders, preferences, name, address)
        const currentOrders = db.prepare('SELECT total_orders, preferences, name, address FROM customers WHERE id = ?').get(customerId);
        const newTotal = (currentOrders?.total_orders || 0) + 1;

        // Actualizar datos de envío si se recibieron
        const newName = orderData.nombre_cliente || currentOrders?.name;
        const newAddress = orderData.direccion || currentOrders?.address;

        let prefs = currentOrders?.preferences || "";
        validatedItems.forEach(item => {
            if (!prefs.includes(item.name)) {
                prefs += (prefs ? ", " : "") + item.name;
            }
        });

        db.prepare('UPDATE customers SET name = ?, address = ?, total_orders = ?, preferences = ?, last_order_date = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newName, newAddress, newTotal, prefs, customerId);

        console.log(`✅ Pedido #${orderId} creado con total real: $${totalReal}`);
        return { orderId, total: totalReal, items: validatedItems };

    } catch (error) {
        console.error('❌ Error en OrderService:', error.message);
        return null;
    }
};
