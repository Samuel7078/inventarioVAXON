// Migration: Add 'alcance' and 'producto_id' columns to Presupuesto table
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('🔄 Migrando tabla Presupuesto — agregando alcance y producto_id...');
    
    await pool.query(`
      ALTER TABLE "Presupuesto" ADD COLUMN IF NOT EXISTS "alcance" TEXT DEFAULT 'GENERAL';
    `);
    console.log('  ✓ Columna "alcance" agregada (GENERAL | PRODUCTO)');

    await pool.query(`
      ALTER TABLE "Presupuesto" ADD COLUMN IF NOT EXISTS "producto_id" INTEGER REFERENCES inventario_vaxon(id) ON DELETE SET NULL;
    `);
    console.log('  ✓ Columna "producto_id" agregada (FK → inventario_vaxon)');

    console.log('✅ Migración completada con éxito.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
    process.exit(1);
  }
})();
