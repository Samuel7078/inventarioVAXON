const express = require('express');
const router = express.Router();
const db = require('./db');
const cache = require('./cache');
const { bumpVersion } = require('./sync');

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
    const { proveedor_id, producto, modelo, cantidad, precio_compra, precio_venta, imagen_url, usuario_registro, gastos } = req.body;
    
    // Inserción Producto
    const { rows } = await db.query(`
      INSERT INTO inventario_vaxon (proveedor_id, producto, modelo, cantidad, precio_compra, precio_venta, imagen_url, usuario_registro)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [proveedor_id || null, producto, modelo, cantidad, precio_compra, precio_venta, imagen_url, usuario_registro]);
    
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

    res.json(newProd);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { producto, modelo, cantidad, precio_compra, precio_venta, proveedor_id, imagen_url } = req.body;
    
    let query = `
      UPDATE inventario_vaxon 
      SET producto = $1, modelo = $2, cantidad = $3, precio_compra = $4, precio_venta = $5, proveedor_id = $6
    `;
    let params = [producto, modelo, cantidad, precio_compra, precio_venta, proveedor_id || null];
    
    if (imagen_url) {
       query += `, imagen_url = $7 WHERE id = $8 RETURNING *`;
       params.push(imagen_url, id);
    } else {
       query += ` WHERE id = $7 RETURNING *`;
       params.push(id);
    }
    
    const { rows } = await db.query(query, params);
    
    cache.del('/api/dashboard/summary');
    cache.del('/api/inventario');
    await bumpVersion();

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
