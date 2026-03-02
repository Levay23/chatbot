import db from './db.js';

console.log('🔄 Actualizando esquema para Máquina de Estados (v3)...');

try {
    const columns = [
        { name: 'current_step', type: "TEXT DEFAULT 'BROWSING'" },
        { name: 'current_cart', type: 'TEXT' }, // JSON string con el carrito actual
        { name: 'updated_at', type: 'DATETIME' }
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

    console.log('🚀 Esquema v3 actualizado con éxito.');
} catch (error) {
    console.error('❌ Error actualizando esquema v3:', error.message);
    process.exit(1);
}
