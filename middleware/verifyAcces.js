const jwtUtils = require('../utils/jwtUtils');

module.exports = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access token required' });

    try {
        const payload = jwtUtils.verifyAccessToken(token);
        req.user = payload;
        next();
    } catch {
        res.status(403).json({ message: 'Invalid or expired access token' });
    }
};
