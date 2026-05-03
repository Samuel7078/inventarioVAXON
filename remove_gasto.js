const db = require('./server/db');

async function removeBuggyGasto() {
  const client = await db.pool.connect();
  try {
    const { rowCount } = await client.query(`DELETE FROM "Gasto_Presupuesto" WHERE id = 44`);
    console.log("Deleted row count:", rowCount);
  } catch(e) {
    console.error(e);
  } finally {
    client.release();
    db.pool.end();
  }
}

removeBuggyGasto().catch(console.error);
