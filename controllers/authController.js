const authService = require('../services/authService');

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const { accessToken, refreshToken } = await authService.login(username, password, req);

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            path: '/refresh',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ accessToken });
    } catch (err) {
        console.error(`Error during login for user ${req.body.username}:`, err);
        res.status(401).json({ message: err.message });
    }
};

exports.refresh = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        const { newAccessToken, newRefreshToken } = await authService.refresh(refreshToken, req);

        res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            path: '/refresh',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ accessToken: newAccessToken });
    } catch (err) {
        res.status(403).json({ message: err.message });
    }
};

exports.logout = async (req, res) => {
    await authService.logout(req.user.userId);
    res.clearCookie('refreshToken', { path: '/refresh' });
    res.json({ message: 'Logged out successfully' });
};
