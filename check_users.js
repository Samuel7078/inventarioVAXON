require('dotenv').config();
const db = require('./server/db');

db.query('SELECT id, email, nombre, rol, password FROM "Usuario"')
  .then(r => {
    console.log(JSON.stringify(r.rows, null, 2));
    process.exit(0);
  })
  .catch(e => {
    console.log('Error:', e.message);
    process.exit(1);
  });
