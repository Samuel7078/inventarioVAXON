const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function check() {
  try {
    const res = await pool.query(`
      SELECT 
        conname as constraint_name, 
        contype as constraint_type
      FROM pg_constraint 
      WHERE conrelid = '"Comision_Usuario"'::regclass;
    `);
    console.log('Constraints de Comision_Usuario:');
    console.table(res.rows);
    
    const res2 = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'Comision_Usuario';
    `);
    console.log('Indexes de Comision_Usuario:');
    console.table(res2.rows);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

check();
