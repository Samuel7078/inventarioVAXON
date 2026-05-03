/**
 * catalogDb.js — Pool de conexión a la DB del Catálogo VAXON (Supabase)
 * Se usa exclusivamente para sincronizar productos del inventario → catálogo.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
require('dotenv').config();
const { Pool } = require('pg');

const catalogPool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = {
  catalogPool,
  catalogQuery: (text, params) => catalogPool.query(text, params)
};
