const { pgPool } = require('../database/db');

async function getUserByUsername(username) {
    let result = await pgPool.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0]
}

async function createUser(username, password) {
    return await pgPool.query('INSERT INTO users (username , password) VALUES($1,$2)', [username, password]);
}

module.exports = { createUser, getUserByUsername }

