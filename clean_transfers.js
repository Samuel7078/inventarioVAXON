const db = require('./server/db');

async function clean() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Delete the transfers from budgets
    const res1 = await client.query(`DELETE FROM "Gasto_Presupuesto" WHERE tipo_movimiento IN ('TRANSFERENCIA_IN', 'TRANSFERENCIA_OUT')`);
    console.log(`Deleted ${res1.rowCount} rows from Gasto_Presupuesto`);
    
    // Delete the transfers from real profit pool
    const res2 = await client.query(`DELETE FROM "Transferencia_Ganancia_Real"`);
    console.log(`Deleted ${res2.rowCount} rows from Transferencia_Ganancia_Real`);

    await client.query('COMMIT');
    console.log('Clean successful.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Clean failed:', e);
  } finally {
    client.release();
    db.pool.end();
  }
}

clean().catch(console.error);
