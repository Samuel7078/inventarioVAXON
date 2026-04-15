const db = require('./server/db');

async function createTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS Config_Sync (
        id SERIAL PRIMARY KEY,
        version BIGINT DEFAULT 1,
        ultima_act TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Insert initial row if not exists
    const res = await db.query('SELECT count(*) FROM Config_Sync');
    if (parseInt(res.rows[0].count) === 0) {
      await db.query('INSERT INTO Config_Sync (version) VALUES (1)');
      console.log('Fila inicial inyectada en Config_Sync.');
    }
    
    console.log('Tabla Config_Sync lista.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

createTable();
