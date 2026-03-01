import express from 'express';
import db from '../database/db.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(verifyToken);

// GET all products
router.get('/', (req, res) => {
    try {
        const products = db.prepare('SELECT * FROM products ORDER BY category, id').all();
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST create product
router.post('/', (req, res) => {
    const { name, price, category, active = 1 } = req.body;
    try {
        db.prepare('INSERT INTO products (name, price, category, active) VALUES (?, ?, ?, ?)').run(name, price, category, active);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚠️  RUTAS ESTÁTICAS PRIMERO — antes de /:id
//     Express resuelve rutas en orden de declaración.
//     Si /:id va primero, "bulk" y "category" se tratan
//     como IDs dinámicos y nunca llegan a sus handlers.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// PUT bulk update availability (MUST be before /:id)
router.put('/bulk/availability', (req, res) => {
    const { products } = req.body;
    try {
        if (!products || !Array.isArray(products)) {
            return res.status(400).json({ error: 'Se requiere un array de productos' });
        }
        const stmt = db.prepare('UPDATE products SET active = ? WHERE id = ?');
        for (const p of products) {
            stmt.run(p.active, parseInt(p.id));
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT rename category (MUST be before /:id)
router.put('/category/rename', (req, res) => {
    const { oldCategory, newCategory } = req.body;
    try {
        if (!oldCategory || !newCategory) {
            return res.status(400).json({ error: 'oldCategory y newCategory son requeridos' });
        }
        db.prepare('UPDATE products SET category = ? WHERE category = ?').run(newCategory, oldCategory);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT update product — va DESPUÉS de las rutas estáticas
router.put('/:id', (req, res) => {
    const { name, price, category, active } = req.body;
    try {
        db.prepare('UPDATE products SET name = ?, price = ?, category = ?, active = ? WHERE id = ?')
            .run(name, price, category, active, req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE product
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
