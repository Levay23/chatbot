import express from 'express';
import dotenv from 'dotenv';
import { generateToken } from '../middleware/authMiddleware.js';

dotenv.config();

const router = express.Router();

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        const token = generateToken({ id: 1, role: 'admin' });
        res.json({ token, user: username });
    } else {
        res.status(401).json({ error: 'Credenciales inválidas' });
    }
});

export default router;
