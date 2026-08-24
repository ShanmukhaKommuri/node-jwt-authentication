const redis = require('../redis/redisClient');

exports.saveToken = async (tokenId, data) => {
    await redis.set(`refresh:${tokenId}`, JSON.stringify(data), 'EX', 7 * 24 * 60 * 60);
};

exports.getToken = async (tokenId) => {
    const record = await redis.get(`refresh:${tokenId}`);
    return record ? JSON.parse(record) : null;
};

exports.invalidateToken = async (tokenId) => {
    await redis.del(`refresh:${tokenId}`);
};

exports.revokeUserTokens = async (userId) => {
    const keys = await redis.keys('refresh:*');
    for (const key of keys) {
        const record = await redis.get(key);
        if (record) {
            const parsed = JSON.parse(record);
            if (parsed.userId === userId) {
                await redis.del(key);
            }
        }
    }
};
