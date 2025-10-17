const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const authHeader = req.header('authorization');
    
    if (!authHeader) {
        return res.status(401).json({ message: 'Token tidak ditemukan' });
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: 'Token tidak ditemukan' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Contains: id, name, email, role, is_customer, is_owner
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Token tidak valid atau expired' });
    }
};

module.exports = authMiddleware;