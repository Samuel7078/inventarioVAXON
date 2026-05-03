const db = require('./server/db');

async function fix() {
  const client = await db.pool.connect();
  try {
    const { rows } = await client.query(`SELECT * FROM "Gasto_Presupuesto" WHERE tipo_movimiento IN ('TRANSFERENCIA_IN', 'TRANSFERENCIA_OUT')`);
    console.log(rows);
  } finally {
    client.release();
    db.pool.end();
  }
}

fix().catch(console.error);
