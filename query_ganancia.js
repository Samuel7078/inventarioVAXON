const db = require('./server/db');

async function check() {
  const client = await db.pool.connect();
  try {
    const { rows } = await client.query(`SELECT * FROM "Transferencia_Ganancia_Real"`);
    console.log("Transferencia_Ganancia_Real:", rows);
  } finally {
    client.release();
    db.pool.end();
  }
}

check().catch(console.error);
