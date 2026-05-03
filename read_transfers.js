const db = require('./server/db');

async function fix() {
  const client = await db.pool.connect();
  try {
    const { rows } = await client.query(`SELECT * FROM "Gasto_Presupuesto" WHERE descripcion LIKE '%Transferencia enviada%' OR descripcion LIKE '%Abono recibido%'`);
    console.log(rows);
  } finally {
    client.release();
    db.pool.end();
  }
}

fix().catch(console.error);
