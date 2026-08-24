const { checkLoginRateLimit } = require("../services/ratelimiterService");
const { hashAccountIdentifier } = require("../utils/hashUtil");

async function loginRateLimiter(req, res, next) {
    try {
        const ip = req.ip;
        const username = String(req.body.username || "").trim().toLowerCase();
        if (!username) {
            return next();
        }
        const husername = hashAccountIdentifier(username) //we can hash username to don't expose username
        const result = await checkLoginRateLimit({ ip, account: husername })

        if (!result.allowed) {
            const isIpLimit = result.limitingPolicy === 1;
            const limit = isIpLimit ? result.ip.capacity : result.account.capacity;

            const reset = result.retryAfter;
            res.setHeader('RateLimit-Limit', `${limit}`);
            res.setHeader('RateLimit-Remaining', 0);
            res.setHeader('RateLimit-Reset', reset);
            return res.status(429).json({ success: false, message: "too many login requests" })
        }
        next();
    }
    catch (error) {
        console.log("rate limiter error : ", error);
        return res.status(503).json({
            success: false,
            message: "Login temporarily unavailable"
        });
    }
}
module.exports = {
    loginRateLimiter
}