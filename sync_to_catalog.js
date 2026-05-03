/**
 * sync_to_catalog.js — Migración masiva: Inventario → Catálogo
 * 
 * Ejecutar con: node sync_to_catalog.js
 * 
 * Lee TODOS los productos del inventario y los sincroniza
 * al catálogo de Supabase usando UPSERT (sin duplicados).
 */
require('dotenv').config();
const db = require('./server/db');
const { syncProductToCatalog, ensureCatalogSchema } = require('./server/catalogSync');

async function bulkSync() {
  console.log('═══════════════════════════════════════════════');
  console.log('  VAXON — Sync Masivo: Inventario → Catálogo');
  console.log('═══════════════════════════════════════════════\n');

  try {
    // 1. Preparar schema del catálogo
    await ensureCatalogSchema();

    // 2. Leer todos los productos del inventario
    const { rows: productos } = await db.query('SELECT * FROM inventario_vaxon ORDER BY id ASC');
    console.log(`📦 ${productos.length} productos encontrados en el inventario.\n`);

    if (productos.length === 0) {
      console.log('⚠️  No hay productos que sincronizar.');
      process.exit(0);
    }

    let insertados = 0;
    let actualizados = 0;
    let errores = 0;

    // 3. Sincronizar cada producto
    for (const prod of productos) {
      const result = await syncProductToCatalog(prod);
      if (result.success) {
        if (result.action === 'INSERTADO') insertados++;
        else actualizados++;
      } else {
        errores++;
      }
    }

    // 4. Resumen
    console.log('\n═══════════════════════════════════════════════');
    console.log('  RESUMEN');
    console.log('═══════════════════════════════════════════════');
    console.log(`  ✅ Insertados:   ${insertados}`);
    console.log(`  🔄 Actualizados: ${actualizados}`);
    console.log(`  ❌ Errores:      ${errores}`);
    console.log(`  📊 Total:        ${productos.length}`);
    console.log('═══════════════════════════════════════════════\n');

    process.exit(0);
  } catch (err) {
    console.error('💥 Error fatal:', err);
    process.exit(1);
  }
}

bulkSync();
