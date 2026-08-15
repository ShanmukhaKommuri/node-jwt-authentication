const userService = require('../services/userService');

exports.register = async (req, res) => {
    try {
        const { username, password } = req.body;
        await userService.register(username, password);
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};
