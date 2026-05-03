/**
 * catalogSync.js — Sincronización Inventario VAXON → Catálogo VAXON
 * 
 * Cada producto creado/actualizado en el inventario se replica
 * automáticamente en la tabla `products` del catálogo (Supabase).
 * 
 * Usa `source_inventory_id` para evitar duplicados (UPSERT).
 * Fire-and-forget: los errores se loguean pero no bloquean el inventario.
 */
const { catalogQuery } = require('./catalogDb');

/**
 * Asegura que las columnas de tracking existan en el catálogo.
 * Se ejecuta una sola vez al iniciar el servidor.
 */
let _initialized = false;
async function ensureCatalogSchema() {
  if (_initialized) return;
  try {
    await catalogQuery(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS source_inventory_id INTEGER UNIQUE
    `);
    await catalogQuery(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS source_combo_id INTEGER UNIQUE
    `);
    _initialized = true;
    console.log('[CatalogSync] Schema verificado ✓');
  } catch (err) {
    console.error('[CatalogSync] Error al preparar schema del catálogo:', err.message);
  }
}

/**
 * Sincroniza un producto del inventario al catálogo.
 * Si ya existe (por source_inventory_id), lo actualiza.
 * Si no existe, lo inserta.
 * 
 * @param {Object} product - Producto del inventario (row de inventario_vaxon)
 */
async function syncProductToCatalog(product) {
  try {
    await ensureCatalogSchema();

    const name = product.producto || 'Sin nombre';
    const price = product.precio_venta || 0;
    const inventoryId = product.id;

    // Description: use catalog_description if available, otherwise modelo
    const description = product.catalog_description || product.modelo || '';

    // Images: merge main image + catalog_images
    let allImages = [];
    if (product.imagen_url) allImages.push(product.imagen_url);
    if (product.catalog_images && Array.isArray(product.catalog_images)) {
      allImages = allImages.concat(product.catalog_images);
    }
    const images = JSON.stringify(allImages);

    // Catalog-specific fields
    const categoryId = product.catalog_category_id || null;
    const contactId = product.catalog_contact_id || null;
    const whatsappMsg = product.catalog_whatsapp_msg || '';

    // UPSERT: INSERT ... ON CONFLICT(source_inventory_id) DO UPDATE
    const result = await catalogQuery(`
      INSERT INTO products (name, price, description, images, "categoryId", "contactId", "whatsappCustomMsg", source_inventory_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (source_inventory_id) DO UPDATE SET
        name = EXCLUDED.name,
        price = EXCLUDED.price,
        description = EXCLUDED.description,
        images = EXCLUDED.images,
        "categoryId" = EXCLUDED."categoryId",
        "contactId" = EXCLUDED."contactId",
        "whatsappCustomMsg" = EXCLUDED."whatsappCustomMsg",
        updated_at = NOW()
      RETURNING id, (xmax = 0) AS was_inserted
    `, [name, price, description, images, categoryId, contactId, whatsappMsg, inventoryId]);

    const row = result.rows[0];
    const action = row.was_inserted ? 'INSERTADO' : 'ACTUALIZADO';
    console.log(`[CatalogSync] Producto "${name}" (inv#${inventoryId}) → catálogo#${row.id} [${action}]`);

    return { success: true, catalogId: row.id, action };
  } catch (err) {
    console.error(`[CatalogSync] Error sincronizando producto #${product.id}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Sincroniza un combo al catálogo como un producto.
 * @param {Object} combo - Combo header (id, nombre, precio_venta, imagen_url)
 * @param {Array} items - Array de items del combo (para construir la descripción)
 */
async function syncComboToCatalog(combo, items) {
  try {
    await ensureCatalogSchema();

    const name = `🎁 COMBO: ${combo.nombre}`;
    const price = combo.precio_venta || 0;
    const comboId = combo.id;

    // Build description from items
    let description = 'Combo incluye: ';
    if (items && items.length > 0) {
      description += items.map(i => `${i.producto_nombre || 'Producto'} x${i.cantidad || 1}`).join(', ');
    }

    const images = combo.imagen_url ? JSON.stringify([combo.imagen_url]) : '[]';

    const result = await catalogQuery(`
      INSERT INTO products (name, price, description, images, source_combo_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, $5, NOW(), NOW())
      ON CONFLICT (source_combo_id) DO UPDATE SET
        name = EXCLUDED.name,
        price = EXCLUDED.price,
        description = EXCLUDED.description,
        images = EXCLUDED.images,
        updated_at = NOW()
      RETURNING id, (xmax = 0) AS was_inserted
    `, [name, price, description, images, comboId]);

    const row = result.rows[0];
    const action = row.was_inserted ? 'INSERTADO' : 'ACTUALIZADO';
    console.log(`[CatalogSync] Combo "${combo.nombre}" (combo#${comboId}) → catálogo#${row.id} [${action}]`);

    return { success: true, catalogId: row.id, action };
  } catch (err) {
    console.error(`[CatalogSync] Error sincronizando combo #${combo.id}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { syncProductToCatalog, syncComboToCatalog, ensureCatalogSchema };
