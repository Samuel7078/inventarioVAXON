const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function migrate() {
  try {
    console.log('🔄 Agregando restricción de unicidad a Comision_Usuario...');
    
    // Primero, nos aseguramos de que no haya duplicados que impidan crear la restricción
    // (Este sistema es nuevo, así que probablemente no haya, pero por seguridad)
    await pool.query(`
       DELETE FROM "Comision_Usuario" 
       WHERE id NOT IN (
         SELECT MIN(id) FROM "Comision_Usuario" GROUP BY usuario_id
       )
    `);

    // Agregamos la restricción UNIQUE
    await pool.query(`
      ALTER TABLE "Comision_Usuario" 
      ADD CONSTRAINT "comision_usuario_unique" UNIQUE(usuario_id)
    `);
    
    console.log('✅ Restricción agregada correctamente.');
    process.exit(0);
  } catch (err) {
    if (err.message.includes('already exists')) {
        console.log('ℹ️ La restricción ya existe.');
        process.exit(0);
    }
    console.error('❌ Error en migración:', err.message);
    process.exit(1);
  }
}

migrate();
