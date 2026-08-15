const bcrypt = require('bcrypt')
const jwtUtils = require('../utils/jwtUtils')
const tokenRepo = require('../repostiories/tokenRepository')
const { createUser, getUserByUsername } = require('../repostiories/userRepository');
const { getAccessToken, getRefreshToken } = require('../utils/jwtUtils')

exports.login = async (username, password, req) => {
    const user = await getUserByUsername(username);
    if (!user || !bcrypt.compare(user.password, password))
        throw new Error('Invalid credentials');
    const accessToken = jwtUtils.getAccessToken(user);
    const { refreshToken, tokenId } = await jwtUtils.getRefreshToken(user);

    tokenRepo.saveToken(tokenId, { userId: user.id, valid: true, ip: req.ip, ua: req.headers['user-agent'] });
    return { accessToken, refreshToken };
}
exports.refresh = async (refreshToken, req) => {
    const payload = jwtUtils.verifyRefreshToken(refreshToken);
    const record = tokenRepo.getToken(payload.tokenId);

    if (!record || !record.valid) {
        tokenRepo.revokeUserTokens(payload.userId);
        throw new Error('Refresh token reuse detected');
    }

    if (record.ip !== req.ip || record.ua !== req.headers['user-agent']) {
        tokenRepo.invalidateToken(payload.tokenId);
        throw new Error('Suspicious device detected');
    }

    tokenRepo.invalidateToken(payload.tokenId);
    const user = await userRepo.findByUsername(payload.username);
    const newAccessToken = jwtUtils.generateAccessToken(user);
    const { refreshToken: newRefreshToken, tokenId: newTokenId } = jwtUtils.generateRefreshToken(user);
    tokenRepo.saveToken(newTokenId, { userId: user.id, valid: true, ip: req.ip, ua: req.headers['user-agent'] });

    return { newAccessToken, newRefreshToken };
};

exports.logout = async (userId) => {
    tokenRepo.revokeUserTokens(userId);
};