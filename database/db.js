const { Pool } = require('pg');

require('dotenv').config();

const pgPool = new Pool({
    host: process.env.Dbhost,
    user: process.env.Dbuser,
    port: process.env.Dbport,
    password: process.env.Dbpass,
    database: process.env.Dbdatabase
});

pgPool.on('connect', () => {
    console.log('connected to the client db');
})

pgPool.on('error', () => {
    console.log('error while connecting db');
})

module.exports = { pgPool };