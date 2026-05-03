const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function migrate() {
  try {
    console.log('🔄 Migrando alcances de presupuestos...');
    const res = await pool.query("UPDATE \"Presupuesto\" SET alcance = 'PRODUCTO_ESPECIFICO' WHERE alcance = 'PRODUCTO'");
    console.log(`✅ Migración completada. Filas afectadas: ${res.rowCount}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en migración:', err);
    process.exit(1);
  }
}

migrate();
