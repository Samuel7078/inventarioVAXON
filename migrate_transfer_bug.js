const db = require('./server/db');

async function migrate() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Migrating Transferencias IN...');
    await client.query(`UPDATE "Gasto_Presupuesto" SET tipo_movimiento = 'TRANSFERENCIA_IN' WHERE descripcion LIKE '%Abono recibido:%'`);
    
    console.log('Migrating Transferencias OUT...');
    await client.query(`UPDATE "Gasto_Presupuesto" SET tipo_movimiento = 'TRANSFERENCIA_OUT' WHERE descripcion LIKE '%Transferencia enviada a otra cuenta:%'`);

    await client.query('COMMIT');
    console.log('Migration successful.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', e);
  } finally {
    client.release();
    db.pool.end();
  }
}

migrate().catch(console.error);
