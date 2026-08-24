local ipKey = KEYS[1]
local accountKey = KEYS[2]

local now = tonumber(ARGV[1])

local ipCapacity = tonumber(ARGV[2])
local ipLeakRate = tonumber(ARGV[3])

local accountCapacity = tonumber(ARGV[4])
local accountLeakRate = tonumber(ARGV[5])

local ttl = tonumber(ARGV[6])


local function calculateBucket(key ,capacity , leakRate)
    local data = redis.call("HMGET" , key , "water" , "timestamp")

    local water = tonumber(data[1])
    local timestamp = tonumber(data[2])

    if water == nil then 
        water = 0
        timestamp = now
    end

    local elapsed = math.max(0, (now - timestamp)/1000)
    local leaked = elapsed * leakRate
    water = math.max(0 , water - leaked)
    return water
end

local function calculateRetryAfter(water, capacity, leakRate)
    if water <= capacity then
        return 0
    end
    local excess = water - capacity
    local retryAfter = excess / leakRate
    return math.ceil(retryAfter)
end

local ipWater = calculateBucket(ipKey , ipCapacity , ipLeakRate)
local accountWater = calculateBucket(accountKey , accountCapacity , accountLeakRate)

local ipAllowed = (ipWater + 1) <= ipCapacity
local accountAllowed = (accountWater + 1) <= accountCapacity


if not ipAllowed or not accountAllowed then
    local limitingPolicy = 0
    local retryAfter = 0
    if not ipAllowed then
        limitingPolicy = 1
        retryAfter = calculateRetryAfter(ipWater + 1, ipCapacity,ipLeakRate)
    elseif not accountAllowed then
        limitingPolicy = 2
        retryAfter = calculateRetryAfter(accountWater + 1, accountCapacity,accountLeakRate)
    end
    return {
        0 ,
        limitingPolicy,
        retryAfter,
        ipWater ,
        ipCapacity - ipWater,
        accountWater,
        accountCapacity - accountWater
    }
end


ipWater = ipWater + 1
accountWater = accountWater + 1

redis.call("HSET" , ipKey , "water" , ipWater , "timestamp" , now)
redis.call("EXPIRE" , ipKey , ttl )

redis.call("HSET" , accountKey , "water" , accountWater , "timestamp" , now)
redis.call("EXPIRE" , accountKey , ttl )

return{
    1 , 0,
    0,
    ipWater ,
    ipCapacity,
    accountWater,
    accountCapacity
}