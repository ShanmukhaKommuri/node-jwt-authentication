const bcrypt = require('bcrypt')
const jwtUtils = require('../utils/jwtUtils')
const tokenRepo = require('../repostiories/tokenRepository')
const { getUserByUsername } = require('../repostiories/userRepository');

exports.login = async (username, password, req) => {
    const user = await getUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password)))
        throw new Error('Invalid credentials');
    const accessToken = jwtUtils.getAccessToken(user);
    const { refreshToken, tokenId } = await jwtUtils.getRefreshToken(user);

    await tokenRepo.saveToken(tokenId, { userId: user.id, valid: true, ip: req.ip, ua: req.headers['user-agent'] });
    return { accessToken, refreshToken };
}
exports.refresh = async (refreshToken, req) => {
    const payload = jwtUtils.verifyRefreshToken(refreshToken);
    const record = await tokenRepo.getToken(payload.tokenId);

    if (!record || !record.valid) {
        await tokenRepo.revokeUserTokens(payload.userId);
        throw new Error('Refresh token reuse detected');
    }

    if (record.ip !== req.ip || record.ua !== req.headers['user-agent']) {
        await tokenRepo.invalidateToken(payload.tokenId);
        throw new Error('Suspicious device detected');
    }

    await tokenRepo.invalidateToken(payload.tokenId);
    const user = await getUserByUsername(payload.username);
    if (!user) {
        throw new Error('User not found');
    }
    const newAccessToken = jwtUtils.getAccessToken(user);
    const { refreshToken: newRefreshToken, tokenId: newTokenId } = await jwtUtils.getRefreshToken(user);
    await tokenRepo.saveToken(newTokenId, { userId: user.id, valid: true, ip: req.ip, ua: req.headers['user-agent'] });

    return { newAccessToken, newRefreshToken };
};

exports.logout = async (userId) => {
    await tokenRepo.revokeUserTokens(userId);
};