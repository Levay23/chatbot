import express from 'express';
import db from '../database/db.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(verifyToken);

// GET all config
router.get('/', (req, res) => {
    try {
        const config = db.prepare('SELECT * FROM config_bot').all();
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT update config value by key
router.put('/:key', (req, res) => {
    const { value } = req.body;
    try {
        db.prepare('UPDATE config_bot SET value = ? WHERE key = ?').run(value, req.params.key);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
