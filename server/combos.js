/**
 * combos.js — CRUD de Combos para VAXON
 * Un combo agrupa productos del inventario con un precio especial.
 */
const express = require('express');
const router = express.Router();
const db = require('./db');
const { bumpVersion } = require('./sync');
const { syncComboToCatalog } = require('./catalogSync');

// GET /api/combos — Lista todos los combos con sus items
router.get('/', async (req, res) => {
  try {
    const { rows: combos } = await db.query(`
      SELECT c.*, 
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', ci.id,
            'producto_id', ci.producto_id,
            'cantidad', ci.cantidad,
            'producto_nombre', iv.producto,
            'producto_modelo', iv.modelo,
            'precio_compra', iv.precio_compra,
            'precio_venta', iv.precio_venta,
            'stock', iv.cantidad,
            'imagen_url', iv.imagen_url
          )) FROM "Combo_Item" ci 
          JOIN inventario_vaxon iv ON ci.producto_id = iv.id 
          WHERE ci.combo_id = c.id), '[]'::json
        ) as items
      FROM "Combo" c
      WHERE c.activo = true
      ORDER BY c.id DESC
    `);

    // Calculate total cost (sum of purchase prices of all items)
    const enriched = combos.map(combo => {
      const items = combo.items || [];
      const costoTotal = items.reduce((sum, item) => sum + (item.precio_compra * item.cantidad), 0);
      return { ...combo, costoTotal };
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/combos — Crear combo
router.post('/', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { nombre, precio_venta, imagen_url, items } = req.body;

    // Create combo header
    const { rows } = await client.query(
      'INSERT INTO "Combo" (nombre, precio_venta, imagen_url) VALUES ($1, $2, $3) RETURNING *',
      [nombre, precio_venta, imagen_url || null]
    );
    const combo = rows[0];

    // Insert items
    if (items && Array.isArray(items)) {
      for (const item of items) {
        await client.query(
          'INSERT INTO "Combo_Item" (combo_id, producto_id, cantidad) VALUES ($1, $2, $3)',
          [combo.id, item.producto_id, item.cantidad || 1]
        );
      }
    }

    await client.query('COMMIT');
    await bumpVersion();

    // Sync combo to catalog (fire-and-forget)
    syncComboToCatalog(combo, items).catch(e => console.error('[CatalogSync] Error combo POST:', e.message));

    res.json(combo);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// PUT /api/combos/:id — Editar combo
router.put('/:id', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { nombre, precio_venta, imagen_url, items } = req.body;

    const { rows } = await client.query(
      'UPDATE "Combo" SET nombre = $1, precio_venta = $2, imagen_url = COALESCE($3, imagen_url) WHERE id = $4 RETURNING *',
      [nombre, precio_venta, imagen_url || null, id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Combo no encontrado' });
    }

    // Replace items
    if (items && Array.isArray(items)) {
      await client.query('DELETE FROM "Combo_Item" WHERE combo_id = $1', [id]);
      for (const item of items) {
        await client.query(
          'INSERT INTO "Combo_Item" (combo_id, producto_id, cantidad) VALUES ($1, $2, $3)',
          [id, item.producto_id, item.cantidad || 1]
        );
      }
    }

    await client.query('COMMIT');
    await bumpVersion();

    // Sync combo to catalog (fire-and-forget)
    syncComboToCatalog(rows[0], items).catch(e => console.error('[CatalogSync] Error combo PUT:', e.message));

    res.json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// DELETE /api/combos/:id — Soft-delete combo (set activo = false)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE "Combo" SET activo = false WHERE id = $1', [id]);
    await bumpVersion();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
