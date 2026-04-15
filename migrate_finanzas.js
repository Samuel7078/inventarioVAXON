require('dotenv').config();
const db = require('./server/db');

(async () => {
  try {
    await db.query(`ALTER TABLE "Presupuesto" ADD COLUMN IF NOT EXISTS "tipo" TEXT DEFAULT 'PORCENTAJE'`);
    await db.query(`ALTER TABLE "Presupuesto" ADD COLUMN IF NOT EXISTS "monto_fijo" DOUBLE PRECISION DEFAULT 0`);
    await db.query(`ALTER TABLE "Presupuesto" ADD COLUMN IF NOT EXISTS "dia_reset" INTEGER DEFAULT 1`);
    await db.query(`ALTER TABLE "Presupuesto" ADD COLUMN IF NOT EXISTS "ultimo_reset" TIMESTAMP`);
    await db.query(`ALTER TABLE "Gasto_Presupuesto" ADD COLUMN IF NOT EXISTS "tipo_movimiento" TEXT DEFAULT 'GASTO'`);
    await db.query(`ALTER TABLE "Transaccion_Caja" ADD COLUMN IF NOT EXISTS "presupuesto_id" INTEGER REFERENCES "Presupuesto"("id") ON DELETE SET NULL`);
    await db.query(`CREATE TABLE IF NOT EXISTS "Comision_Usuario" ("id" SERIAL PRIMARY KEY, "usuario_id" INTEGER NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE, "porcentaje" DOUBLE PRECISION NOT NULL DEFAULT 0, "activa" BOOLEAN DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    console.log('ALL MIGRATIONS OK');
  } catch(e) {
    console.error('MIGRATION ERROR:', e.message);
  }
  process.exit(0);
})();
