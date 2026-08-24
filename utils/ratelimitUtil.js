const { pgPool } = require('../database/db')
function calculateLeakRate(capacity, interval_seconds) {
  if (capacity <= 0) {
    throw new Error("Capacity must be greater than zero")
  }
  if (interval_seconds <= 0) {
    throw new Error("window must be greater than zero")
  }

  return capacity / (interval_seconds);
}
async function getResourceId(reqPath) {
  const query = `
    SELECT id
    FROM rate_limit_resources
    WHERE path_pattern = $1
      AND enabled = TRUE
    LIMIT 1;
  `;
  const { rows } = await pgPool.query(query, [reqPath]);
  return rows[0]?.id;
}
async function getPolicy(resourceId, tierName, scope) {
  const query = `
    SELECT *
    FROM rate_limit_policies
    WHERE resource_id = $1
      AND scope = $2
      AND (tier_name = $3 OR tier_name IS NULL)
      AND enabled = TRUE
    LIMIT 1;
  `;
  const { rows } = await pgPool.query(query, [resourceId, scope, tierName]);
  return rows[0];
}


module.exports = {
  calculateLeakRate,
  getResourceId,
  getPolicy
}
