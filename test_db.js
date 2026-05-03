const db = require('./server/db');

async function test() {
  try {
    const { rows } = await db.query('SELECT 1');
    console.log('Database connected:', rows);
    const users = await db.query('SELECT email, password FROM "Usuario"');
    console.log('Users in DB:', users.rows);
  } catch (e) {
    console.error('Database error:', e);
  } finally {
    db.pool.end();
  }
}

test();
