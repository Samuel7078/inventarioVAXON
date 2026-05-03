const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function migrate() {
  try {
    console.log('🔄 Agregando columna prioridad a la tabla Presupuesto...');
    await pool.query('ALTER TABLE "Presupuesto" ADD COLUMN IF NOT EXISTS prioridad INTEGER DEFAULT 1');
    console.log('✅ Columna agregada correctamente.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
    process.exit(1);
  }
}

migrate();
