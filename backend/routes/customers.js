import express from 'express';
import db from '../database/db.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { getHistory } from '../services/memoryService.js';

const router = express.Router();
router.use(verifyToken);

// Obtener todos los clientes
router.get('/', (req, res) => {
    try {
        const customers = db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all();
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Obtener el historial de un cliente
router.get('/:id/history', (req, res) => {
    try {
        const history = getHistory(req.params.id, 50); // Muestra últimos 50 mjs
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
