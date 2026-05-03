const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function test() {
  try {
    console.log('🧪 Probando inserción de comisión...');
    // Probamos con un ID de usuario que exista (el 1 suele existir si hay login)
    const res = await pool.query(
        `INSERT INTO "Comision_Usuario" (usuario_id, porcentaje) VALUES ($1, $2) 
         ON CONFLICT (usuario_id) DO UPDATE SET porcentaje = $2, activa = true 
         RETURNING *`,
        [1, 15]
    );
    console.log('✅ Éxito:', res.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error detectado:', err.message);
    if (err.detail) console.error('Detalle:', err.detail);
    if (err.hint) console.error('Pista:', err.hint);
    process.exit(1);
  }
}

test();
