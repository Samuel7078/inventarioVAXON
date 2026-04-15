require('dotenv').config();
const db = require('./server/db');

(async () => {
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS "Capital_Respaldo" ("id" SERIAL PRIMARY KEY, "monto" DOUBLE PRECISION NOT NULL DEFAULT 0)`);
        await db.query(`INSERT INTO "Capital_Respaldo" ("id", "monto") VALUES (1, 0) ON CONFLICT DO NOTHING`);
        console.log('MIGRATION OK');
    } catch(e) {
        console.error('ERR', e.message);
    }
    process.exit(0);
})();
