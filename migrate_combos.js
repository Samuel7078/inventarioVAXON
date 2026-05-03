/**
 * migrate_combos.js — Crea tablas de Combos + columnas de catálogo
 * Ejecutar: node migrate_combos.js
 */
require('dotenv').config();
const db = require('./server/db');

async function migrate() {
  console.log('═══════════════════════════════════════════════');
  console.log('  VAXON — Migración: Combos + Catálogo');
  console.log('═══════════════════════════════════════════════\n');

  try {
    // 1. Tabla de Combos
    await db.query(`
      CREATE TABLE IF NOT EXISTS "Combo" (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        precio_venta DOUBLE PRECISION NOT NULL DEFAULT 0,
        imagen_url TEXT,
        activo BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla "Combo" lista');

    // 2. Tabla de Items del Combo
    await db.query(`
      CREATE TABLE IF NOT EXISTS "Combo_Item" (
        id SERIAL PRIMARY KEY,
        combo_id INTEGER NOT NULL REFERENCES "Combo"(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES inventario_vaxon(id) ON DELETE RESTRICT,
        cantidad INTEGER NOT NULL DEFAULT 1
      )
    `);
    console.log('✅ Tabla "Combo_Item" lista');

    // 3. Columnas de catálogo en inventario_vaxon
    await db.query(`ALTER TABLE inventario_vaxon ADD COLUMN IF NOT EXISTS catalog_images JSONB DEFAULT '[]'`);
    await db.query(`ALTER TABLE inventario_vaxon ADD COLUMN IF NOT EXISTS catalog_category_id INTEGER`);
    await db.query(`ALTER TABLE inventario_vaxon ADD COLUMN IF NOT EXISTS catalog_contact_id INTEGER`);
    await db.query(`ALTER TABLE inventario_vaxon ADD COLUMN IF NOT EXISTS catalog_description TEXT DEFAULT ''`);
    await db.query(`ALTER TABLE inventario_vaxon ADD COLUMN IF NOT EXISTS catalog_whatsapp_msg TEXT DEFAULT ''`);
    console.log('✅ Columnas de catálogo agregadas a inventario_vaxon');

    console.log('\n🎉 Migración completada exitosamente.');
    process.exit(0);
  } catch (err) {
    console.error('💥 Error en migración:', err);
    process.exit(1);
  }
}

migrate();
