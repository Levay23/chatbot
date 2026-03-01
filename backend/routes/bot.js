import express from 'express';
import { getStatus, toggleBot, getClient } from '../services/whatsappService.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get connection and bot status
router.get('/status', (req, res) => {
    res.json(getStatus());
});

// Toggle bot on/off
router.post('/toggle', verifyToken, (req, res) => {
    const { active } = req.body;
    const newState = toggleBot(active);
    res.json({ active: newState, message: `Bot ${newState ? 'activado' : 'desactivado'}` });
});

// Test send message
router.post('/test-send', verifyToken, async (req, res) => {
    try {
        const { to, message } = req.body;
        const client = getClient();
        if (!client) return res.status(500).json({ error: 'Client not ready' });

        await client.sendText(to, message);
        res.json({ success: true, message: 'Test message sent' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
