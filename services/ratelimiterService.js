const fs = require("fs")
const path = require("path")

const redis = require("../redis/redisClient")
const { calculateLeakRate } = require('../utils/ratelimitUtil')
const { getResourceId, getPolicy } = require('../utils/ratelimitUtil')
const luaScript = fs.readFileSync(path.join(__dirname, "../redis/scripts/dualLeakyBucket.lua"), "utf-8")


async function checkLoginRateLimit({ ip, account }) {
    (`rate limiter service with ip  :${ip} and account  : ${account}`)
    const ipKey = `rate_limit:login:ip:${ip}`
    const accountKey = `rate_limit:login:account:${account}`
    const resourceId = await getResourceId("/login");
    if (!resourceId) {
        throw new Error("Resource not found for /login");
    }
    const ipPolicy = await getPolicy(resourceId, 'free', "ip");
    const accountPolicy = await getPolicy(resourceId, 'free', "account");

    if (!ipPolicy || !accountPolicy) {
        throw new Error("Policy not found for /login");
    }

    const ipCapacity = ipPolicy.capacity;
    const ipLeakRate = calculateLeakRate(ipPolicy.rate_per_interval, ipPolicy.interval_seconds);
    const accountCapacity = accountPolicy.capacity;
    const accountLeakRate = calculateLeakRate(accountPolicy.rate_per_interval, accountPolicy.interval_seconds);
    const ttl = 600;

    const now = Date.now();

    const result = await redis.eval(
        luaScript,
        2,
        ipKey,
        accountKey,
        now,
        ipCapacity,
        ipLeakRate,
        accountCapacity,
        accountLeakRate,
        ttl
    )
    const [allowed,
        limitingPolicy,
        retryAfter,
        ipWater,
        ipRemaining,
        accountWater,
        accountRemaining
    ] = result;

    return {
        allowed: allowed === 1,
        limitingPolicy: Number(limitingPolicy),
        retryAfter: Number(retryAfter),
        ip: {
            water: Number(ipWater),
            remaining: Number(ipRemaining),
            capacity: ipCapacity
        },
        account: {
            water: Number(accountWater),
            remaining: Number(accountRemaining),
            capacity: accountCapacity
        }
    }
}

module.exports = {
    checkLoginRateLimit
}