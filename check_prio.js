const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function check() {
  try {
    const res = await pool.query('SELECT id, nombre, prioridad FROM "Presupuesto" ORDER BY prioridad ASC');
    console.log('Presupuestos en DB:');
    console.table(res.rows);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

check();
