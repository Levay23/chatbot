import db from './db.js';

console.log('🔄 Actualizando esquema para Memoria e IA Pro...');

try {
    // 1. Actualizar tabla customers
    // SQLite no soporta múltiples ADD COLUMN en una sola sentencia de forma estándar en versiones antiguas,
    // pero better-sqlite3 lo maneja bien si lo hacemos uno por uno para mayor seguridad.
    const columns = [
        { name: 'last_order_date', type: 'DATETIME' },
        { name: 'total_orders', type: 'INTEGER DEFAULT 0' },
        { name: 'preferences', type: 'TEXT' }, // JSON string
        { name: 'notes', type: 'TEXT' }
    ];

    for (const col of columns) {
        try {
            db.prepare(`ALTER TABLE customers ADD COLUMN ${col.name} ${col.type}`).run();
            console.log(`✅ Columna ${col.name} añadida a customers.`);
        } catch (e) {
            if (e.message.includes('duplicate column name')) {
                console.log(`ℹ️ La columna ${col.name} ya existe.`);
            } else {
                throw e;
            }
        }
    }

    // 2. Crear tabla conversations (Historial completo persistente)
    db.prepare(`
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            message TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(customer_id) REFERENCES customers(id)
        )
    `).run();
    console.log('✅ Tabla conversations lista.');

    // 3. Crear tabla memory_summary (Resúmenes de IA)
    db.prepare(`
        CREATE TABLE IF NOT EXISTS memory_summary (
            customer_id INTEGER PRIMARY KEY,
            summary_text TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(customer_id) REFERENCES customers(id)
        )
    `).run();
    console.log('✅ Tabla memory_summary lista.');

    console.log('🚀 Esquema actualizado con éxito.');
} catch (error) {
    console.error('❌ Error actualizando esquema:', error.message);
    process.exit(1);
}
