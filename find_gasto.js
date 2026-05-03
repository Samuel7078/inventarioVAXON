const db = require('./server/db');

async function findBuggyGasto() {
  const client = await db.pool.connect();
  try {
    const { rows } = await client.query(`SELECT * FROM "Gasto_Presupuesto" WHERE descripcion ILIKE '%pago ads joel%'`);
    console.log(rows);
  } catch(e) {
    console.error(e);
  } finally {
    client.release();
    db.pool.end();
  }
}

findBuggyGasto().catch(console.error);
