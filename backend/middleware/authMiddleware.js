import jwt from 'jsonwebtoken';

const SECRET = 'mi_super_secreto_restaurant_123';

export const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) return res.status(403).json({ error: 'No token provided' });

    jwt.verify(token.split(' ')[1], SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Unauthorized' });
        req.userId = decoded.id;
        next();
    });
};

export const generateToken = (payload) => {
    return jwt.sign(payload, SECRET, { expiresIn: '24h' });
};
