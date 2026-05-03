const express = require('express');
const router = express.Router();
const db = require('./db');
const cache = require('./cache');
const { bumpVersion } = require('./sync');
const { syncProductToCatalog } = require('./catalogSync');

router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.*, pr.nombre as proveedor_nombre 
      FROM inventario_vaxon p
      LEFT JOIN "Proveedor" pr ON p.proveedor_id = pr.id
      ORDER BY p.id DESC
    `);
    
    const resGastos = await db.query('SELECT * FROM "Gasto_Producto"');
    
    const productosMap = rows.map(prod => {
       const egresos = resGastos.rows.filter(g => g.producto_id === prod.id);
       let calcCompra = prod.precio_compra;
       egresos.forEach(eg => {
         if (eg.tipo === 'PORCENTAJE') calcCompra -= calcCompra * (eg.valor / 100);
         else if (eg.tipo === 'MONTO_FIJO') calcCompra -= eg.valor;
       });
       return {
         ...prod,
         costoNeto: calcCompra,
         egresosBase: egresos
       }
    });

    res.json(productosMap);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { proveedor_id, producto, modelo, cantidad, precio_compra, precio_venta, imagen_url, usuario_registro, gastos,
            catalog_images, catalog_category_id, catalog_contact_id, catalog_description, catalog_whatsapp_msg } = req.body;
    
    // Inserción Producto (con campos de catálogo opcionales)
    const { rows } = await db.query(`
      INSERT INTO inventario_vaxon (proveedor_id, producto, modelo, cantidad, precio_compra, precio_venta, imagen_url, usuario_registro,
        catalog_images, catalog_category_id, catalog_contact_id, catalog_description, catalog_whatsapp_msg)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13) RETURNING *
    `, [proveedor_id || null, producto, modelo, cantidad, precio_compra, precio_venta, imagen_url, usuario_registro,
        JSON.stringify(catalog_images || []), catalog_category_id || null, catalog_contact_id || null,
        catalog_description || '', catalog_whatsapp_msg || '']);
    
    const newProd = rows[0];

    // Insercion de gastos
    if (gastos && Array.isArray(gastos)) {
       for (const gasto of gastos) {
         await db.query(
           'INSERT INTO "Gasto_Producto" (producto_id, tipo, valor, descripcion) VALUES ($1, $2, $3, $4)',
           [newProd.id, gasto.tipo, gasto.valor, gasto.descripcion]
         );
       }
    }

    cache.del('/api/dashboard/summary');
    cache.del('/api/inventario');
    await bumpVersion();

    // Sync automático al catálogo (fire-and-forget)
    syncProductToCatalog(newProd).catch(e => console.error('[CatalogSync] Error en POST:', e.message));

    res.json(newProd);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { producto, modelo, cantidad, precio_compra, precio_venta, proveedor_id, imagen_url,
            catalog_images, catalog_category_id, catalog_contact_id, catalog_description, catalog_whatsapp_msg } = req.body;
    
    let paramIdx = 1;
    let setClauses = [
      `producto = $${paramIdx++}`, `modelo = $${paramIdx++}`, `cantidad = $${paramIdx++}`,
      `precio_compra = $${paramIdx++}`, `precio_venta = $${paramIdx++}`, `proveedor_id = $${paramIdx++}`
    ];
    let params = [producto, modelo, cantidad, precio_compra, precio_venta, proveedor_id || null];
    
    if (imagen_url) {
       setClauses.push(`imagen_url = $${paramIdx++}`);
       params.push(imagen_url);
    }

    // Catalog fields (only update if explicitly provided)
    if (catalog_images !== undefined) {
      setClauses.push(`catalog_images = $${paramIdx++}::jsonb`);
      params.push(JSON.stringify(catalog_images || []));
    }
    if (catalog_category_id !== undefined) {
      setClauses.push(`catalog_category_id = $${paramIdx++}`);
      params.push(catalog_category_id || null);
    }
    if (catalog_contact_id !== undefined) {
      setClauses.push(`catalog_contact_id = $${paramIdx++}`);
      params.push(catalog_contact_id || null);
    }
    if (catalog_description !== undefined) {
      setClauses.push(`catalog_description = $${paramIdx++}`);
      params.push(catalog_description || '');
    }
    if (catalog_whatsapp_msg !== undefined) {
      setClauses.push(`catalog_whatsapp_msg = $${paramIdx++}`);
      params.push(catalog_whatsapp_msg || '');
    }

    params.push(id);
    const query = `UPDATE inventario_vaxon SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`;
    
    const { rows } = await db.query(query, params);
    
    cache.del('/api/dashboard/summary');
    cache.del('/api/inventario');
    await bumpVersion();

    // Sync automático al catálogo (fire-and-forget)
    if (rows[0]) {
      syncProductToCatalog(rows[0]).catch(e => console.error('[CatalogSync] Error en PUT:', e.message));
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
