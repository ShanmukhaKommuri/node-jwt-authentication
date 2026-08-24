const { verify } = require("jsonwebtoken")
const jwt = require('jsonwebtoken')

require('dotenv').config();

const ACCESS_SECRET_KEY = process.env.ACCESS_SECRET_KEY;
const REFRESH_SECRET_KEY = process.env.REFRESH_SECRET_KEY;

exports.getRefreshToken = async (user) => {
    const tokenId = await (async () => {
        const { v4: uuidv4 } = await import('uuid');
        return uuidv4()
    })();
    const refreshToken = jwt.sign({ tokenId, username: user.username }, REFRESH_SECRET_KEY, { expiresIn: '7d' });
    return { refreshToken, tokenId };
}
exports.getAccessToken = (user) => {
    let token = jwt.sign({ userId: user.id, username: user.username }, ACCESS_SECRET_KEY, { expiresIn: '15m' })
    return token;
}

exports.verifyAccessToken = (token) => jwt.verify(token, ACCESS_SECRET_KEY);
exports.verifyRefreshToken = (token) => jwt.verify(token, REFRESH_SECRET_KEY)