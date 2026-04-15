process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
require('dotenv').config();
const { Pool, types } = require('pg');

// Forzar a pg a parsear NUMERIC (OIDs 1700) y FLOAT8 (OIDs 701) como floats reales de JS en vez de Strings
types.setTypeParser(1700, val => parseFloat(val));
types.setTypeParser(701, val => parseFloat(val));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params)
};
