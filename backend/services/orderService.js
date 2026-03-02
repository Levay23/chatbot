import db from '../database/db.js';
import { updateCustomerProfile, updateCustomerState } from './memoryService.js';

/**
 * Crea una orden basada en el estado actual guardado en la DB (current_cart)
 */
export const createOrderFromState = (customerId, paymentMethod, name = null, address = null) => {
    console.log(`📦 Creando pedido desde estado para cliente ${customerId}...`);

    try {
        const customer = db.prepare('SELECT current_cart, name, address FROM customers WHERE id = ?').get(customerId);
        if (!customer || !customer.current_cart) {
            throw new Error('No hay un carrito activo para este cliente');
        }

        const cart = JSON.parse(customer.current_cart);
        if (!cart.items || cart.items.length === 0) {
            throw new Error('El carrito está vacío');
        }

        // 1. Validar productos y calcular total real
        let totalReal = 0;
        const validatedItems = [];

        for (const item of cart.items) {
            const product = db.prepare('SELECT id, name, price, active FROM products WHERE name LIKE ?').get(`%${item.product_name || item.name}%`);

            if (product && product.active) {
                const qty = item.quantity || 1;
                totalReal += (product.price * qty);
                validatedItems.push({
                    product_id: product.id,
                    name: product.name,
                    quantity: qty,
                    price: product.price
                });
            }
        }

        if (validatedItems.length === 0) throw new Error('No hay productos válidos');

        // 2. Insertar orden
        const finalName = name || customer.name || 'Cliente';
        const finalAddress = address || customer.address || 'Recoge en local';

        const info = db.prepare('INSERT INTO orders (customer_id, total, payment_method) VALUES (?, ?, ?)')
            .run(customerId, totalReal, paymentMethod);
        const orderId = info.lastInsertRowid;

        // 3. Insertar items
        const itemStmt = db.prepare('INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)');
        for (const item of validatedItems) {
            itemStmt.run(orderId, item.product_id, item.name, item.quantity, item.price);
        }

        // 4. Actualizar perfil y Resetear estado
        db.prepare('UPDATE customers SET name = ?, address = ?, current_cart = NULL WHERE id = ?')
            .run(finalName, finalAddress, customerId);

        updateCustomerProfile(customerId, { items: validatedItems });
        updateCustomerState(customerId, 'COMPLETED');

        console.log(`✅ Pedido #${orderId} creado con éxito.`);
        return { orderId, total: totalReal };

    } catch (error) {
        console.error('❌ Error en createOrderFromState:', error.message);
        return null;
    }
};

/**
 * (Deprecado) Procesa JSON de la IA - Se mantiene por compatibilidad temporal
 */
export const processOrderJSON = (customerId, orderData) => {
    console.log("⚠️ Llamada a processOrderJSON (Deprecado). Redirigiendo...");
    // Intentar extraer datos y guardar en cart antes de procesar si fuera necesario, 
    // pero el nuevo flujo debería usar createOrderFromState.
    return null;
};
