const crypto = require('crypto');
function hashAccountIdentifier(identifier) {
    const normalized = identifier.trim().toLowerCase();

    return crypto.createHmac('sha256', process.env.RATE_LIMIT_HASH_SECRET).update(normalized).digest("hex")
}
module.exports = {
    hashAccountIdentifier
}