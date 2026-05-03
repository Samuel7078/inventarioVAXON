const express = require('express');
const router = express.Router();
const db = require('./db');
const { bumpVersion } = require('./sync');

// GET active caja + history of closed ones
router.get('/', async (req, res) => {
  try {
    // Active caja
    const resCaja = await db.query('SELECT * FROM "Caja_Chica" WHERE estado = $1 ORDER BY "fecha_apertura" DESC LIMIT 1', ['ABIERTA']);
    const cajaActiva = resCaja.rows[0] || null;

    let activeData = null;
    if (cajaActiva) {
      const transacciones = await db.query(`
        SELECT tc.*, iv.producto as nombre_producto 
        FROM "Transaccion_Caja" tc
        LEFT JOIN inventario_vaxon iv ON tc.producto_id = iv.id 
        WHERE tc.caja_id = $1 ORDER BY tc.fecha DESC
      `, [cajaActiva.id]);
      activeData = { ...cajaActiva, Transacciones: transacciones.rows };
    }

    // History: last 20 closed cajas with summary
    const resHistory = await db.query(`
      SELECT cc.*, 
        (SELECT COALESCE(SUM(tc.monto),0) FROM "Transaccion_Caja" tc WHERE tc.caja_id = cc.id AND tc.tipo = 'INGRESO') as total_ingresos,
        (SELECT COALESCE(SUM(tc.monto),0) FROM "Transaccion_Caja" tc WHERE tc.caja_id = cc.id AND tc.tipo = 'EGRESO') as total_egresos,
        (SELECT COUNT(*) FROM "Transaccion_Caja" tc WHERE tc.caja_id = cc.id) as total_transacciones
      FROM "Caja_Chica" cc 
      WHERE cc.estado = 'CERRADA' 
      ORDER BY cc.fecha_cierre DESC 
      LIMIT 20
    `);

    res.json({ active: activeData, history: resHistory.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET detail of a specific closed caja
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resCaja = await db.query('SELECT * FROM "Caja_Chica" WHERE id = $1', [id]);
    if (resCaja.rows.length === 0) return res.status(404).json({ error: 'Caja no encontrada' });

    const transacciones = await db.query(`
      SELECT tc.*, iv.producto as nombre_producto 
      FROM "Transaccion_Caja" tc
      LEFT JOIN inventario_vaxon iv ON tc.producto_id = iv.id 
      WHERE tc.caja_id = $1 ORDER BY tc.fecha DESC
    `, [id]);

    res.json({ ...resCaja.rows[0], Transacciones: transacciones.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { action, payload } = req.body;

    if (action === 'APERTURA') {
      const { rows } = await db.query(
        'INSERT INTO "Caja_Chica" (monto_inicial, responsable) VALUES ($1, $2) RETURNING *',
        [payload.monto, payload.responsable || 'ADMIN']
      );
      await bumpVersion();
      return res.json(rows[0]);
    }
    
    if (action === 'TRANSACCION') {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        
        let metaDesc = payload.descripcion;
        if(payload.producto_id) {
            metaDesc = `Venta #${payload.producto_id}: ` + payload.descripcion;
        }

        // If egreso is linked to a budget, annotate it
        const presupuestoId = payload.presupuesto_id || null;
        if (presupuestoId && payload.tipo === 'EGRESO') {
          const budgetRes = await client.query('SELECT nombre FROM "Presupuesto" WHERE id = $1', [presupuestoId]);
          if (budgetRes.rows.length > 0) {
            metaDesc = `[${budgetRes.rows[0].nombre}] ${payload.descripcion}`;
          }
        }

        const { rows } = await client.query(
          'INSERT INTO "Transaccion_Caja" (caja_id, tipo, monto, descripcion, metodo_pago, producto_id, cantidad, presupuesto_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
          [payload.caja_id, payload.tipo, payload.monto, metaDesc, payload.metodo_pago || 'EFECTIVO', payload.producto_id || null, payload.cantidad || null, presupuestoId]
        );
        
        // If it was a sale with linked product, deduct from inventory and auto-inject budgets
        if (payload.tipo === 'INGRESO' && payload.producto_id && payload.cantidad) {
           // Get purchase price for profit calculation
           const prodRes = await client.query('SELECT precio_compra FROM inventario_vaxon WHERE id = $1', [payload.producto_id]);
           const precioCompra = prodRes.rows.length > 0 ? (prodRes.rows[0].precio_compra || 0) : 0;
           const gananciaTransaccion = payload.monto - (precioCompra * payload.cantidad);

           await client.query('UPDATE inventario_vaxon SET cantidad = cantidad - $1 WHERE id = $2', [payload.cantidad, payload.producto_id]);

           // Auto-inject funds into product budgets (Specific + Global)
           const linkedBudgets = await client.query(
             `SELECT id, nombre, tipo, porcentaje_asignacion, monto_fijo FROM "Presupuesto" 
              WHERE alcance = 'PRODUCTO_GLOBAL' OR (alcance = 'PRODUCTO_ESPECIFICO' AND producto_id = $1)`,
             [payload.producto_id]
           );

           let totalAInyectar = 0;
           const inyecciones = [];

           for (const budget of linkedBudgets.rows) {
             let monto = 0;
             if (budget.tipo === 'PORCENTAJE') {
               monto = (budget.porcentaje_asignacion / 100) * payload.monto;
             } else {
               monto = budget.monto_fijo * payload.cantidad;
             }
             if (monto > 0) {
               totalAInyectar += monto;
               inyecciones.push({ id: budget.id, monto, nombre: budget.nombre });
             }
           }

           // Only inject if there's profit, and cap the total to that profit
           if (inyecciones.length > 0 && gananciaTransaccion > 0) {
             const factorEscala = totalAInyectar > gananciaTransaccion ? (gananciaTransaccion / totalAInyectar) : 1;
             
             for (const inj of inyecciones) {
               const montoFinal = inj.monto * factorEscala;
               if (montoFinal > 0.01) {
                 await client.query(
                   `INSERT INTO "Gasto_Presupuesto" (presupuesto_id, descripcion, monto, tipo_movimiento) VALUES ($1, $2, $3, 'FONDO_EXTRA')`,
                   [inj.id, `Venta auto: ${metaDesc} (x${payload.cantidad})`, montoFinal]
                 );
               }
             }
           }
        }

        // ===== COMBO SALE: deduct stock from each item, budget as single product =====
        if (payload.tipo === 'INGRESO' && payload.combo_id && payload.cantidad) {
           // Get combo items with their costs
           const comboItemsRes = await client.query(`
             SELECT ci.producto_id, ci.cantidad as qty_per_combo, iv.precio_compra, iv.producto
             FROM "Combo_Item" ci
             JOIN inventario_vaxon iv ON ci.producto_id = iv.id
             WHERE ci.combo_id = $1
           `, [payload.combo_id]);

           // Deduct stock from each individual item
           let costoTotalCapital = 0;
           for (const item of comboItemsRes.rows) {
             const totalQty = item.qty_per_combo * payload.cantidad;
             await client.query('UPDATE inventario_vaxon SET cantidad = cantidad - $1 WHERE id = $2', [totalQty, item.producto_id]);
             costoTotalCapital += item.precio_compra * totalQty;
           }

           // Budget injection: treat as single product sale (combo price, combo cost)
           const gananciaCombo = payload.monto - costoTotalCapital;

           const linkedBudgets = await client.query(
             `SELECT id, nombre, tipo, porcentaje_asignacion, monto_fijo FROM "Presupuesto" 
              WHERE alcance = 'PRODUCTO_GLOBAL'`
           );

           let totalAInyectar = 0;
           const inyecciones = [];

           for (const budget of linkedBudgets.rows) {
             let monto = 0;
             if (budget.tipo === 'PORCENTAJE') {
               monto = (budget.porcentaje_asignacion / 100) * payload.monto;
             } else {
               monto = budget.monto_fijo * payload.cantidad;
             }
             if (monto > 0) {
               totalAInyectar += monto;
               inyecciones.push({ id: budget.id, monto, nombre: budget.nombre });
             }
           }

           if (inyecciones.length > 0 && gananciaCombo > 0) {
             const factorEscala = totalAInyectar > gananciaCombo ? (gananciaCombo / totalAInyectar) : 1;
             for (const inj of inyecciones) {
               const montoFinal = inj.monto * factorEscala;
               if (montoFinal > 0.01) {
                 await client.query(
                   `INSERT INTO "Gasto_Presupuesto" (presupuesto_id, descripcion, monto, tipo_movimiento) VALUES ($1, $2, $3, 'FONDO_EXTRA')`,
                   [inj.id, `Venta combo auto: ${metaDesc} (x${payload.cantidad})`, montoFinal]
                 );
               }
             }
           }
        }

        // If egreso linked to a budget, register as budget expense too
        if (presupuestoId && payload.tipo === 'EGRESO') {
          await client.query(
            `INSERT INTO "Gasto_Presupuesto" (presupuesto_id, descripcion, monto, tipo_movimiento) VALUES ($1, $2, $3, 'GASTO')`,
            [presupuestoId, payload.descripcion, payload.monto]
          );
        }
        
        await client.query('COMMIT');
        await bumpVersion();
        return res.json(rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    if (action === 'ELIMINAR_TRANSACCION') {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        const oldRes = await client.query('SELECT * FROM "Transaccion_Caja" WHERE id = $1', [payload.id]);
        if (oldRes.rows.length === 0) throw new Error('Transacción no encontrada');
        const oldTx = oldRes.rows[0];

        const cajaRes = await client.query('SELECT estado FROM "Caja_Chica" WHERE id = $1', [oldTx.caja_id]);
        if (cajaRes.rows[0]?.estado !== 'ABIERTA') throw new Error('No se puede modificar una transacción de una caja cerrada');

        // 1. Revert Inventory & Budgets if INGRESO (Sale)
        if (oldTx.tipo === 'INGRESO' && oldTx.producto_id && oldTx.cantidad) {
          await client.query('UPDATE inventario_vaxon SET cantidad = cantidad + $1 WHERE id = $2', [oldTx.cantidad, oldTx.producto_id]);
          await client.query(`DELETE FROM "Gasto_Presupuesto" WHERE descripcion = $1 AND tipo_movimiento = 'FONDO_EXTRA'`, 
            [`Venta auto: ${oldTx.descripcion} (x${oldTx.cantidad})`]);
        }

        // 2. Revert Budget Expense if EGRESO with presupuesto_id
        if (oldTx.tipo === 'EGRESO' && oldTx.presupuesto_id) {
          await client.query(`DELETE FROM "Gasto_Presupuesto" WHERE presupuesto_id = $1 AND descripcion = $2 AND monto = $3 AND tipo_movimiento = 'GASTO'`,
            [oldTx.presupuesto_id, oldTx.descripcion, oldTx.monto]);
        }

        // 3. Delete the transaction
        await client.query('DELETE FROM "Transaccion_Caja" WHERE id = $1', [payload.id]);

        await client.query('COMMIT');
        await bumpVersion();
        return res.json({ success: true, deleted: oldTx });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    if (action === 'EDITAR_TRANSACCION') {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        const oldRes = await client.query('SELECT * FROM "Transaccion_Caja" WHERE id = $1', [payload.id]);
        if (oldRes.rows.length === 0) throw new Error('Transacción no encontrada');
        const oldTx = oldRes.rows[0];

        const cajaRes = await client.query('SELECT estado FROM "Caja_Chica" WHERE id = $1', [oldTx.caja_id]);
        if (cajaRes.rows[0]?.estado !== 'ABIERTA') throw new Error('No se puede modificar una caja cerrada');

        const newMonto = payload.monto !== undefined ? parseFloat(payload.monto) : oldTx.monto;
        const newDesc = payload.descripcion !== undefined ? payload.descripcion : oldTx.descripcion;

        // Si es EGRESO con presupuesto, actualizamos su Gasto_Presupuesto
        if (oldTx.tipo === 'EGRESO' && oldTx.presupuesto_id) {
           await client.query(
             `UPDATE "Gasto_Presupuesto" SET monto = $1, descripcion = $2 
              WHERE presupuesto_id = $3 AND descripcion = $4 AND monto = $5 AND tipo_movimiento = 'GASTO'`,
             [newMonto, newDesc, oldTx.presupuesto_id, oldTx.descripcion, oldTx.monto]
           );
        }

        // Si es INGRESO de producto, las reglas de inyección se complican, así que hacemos rollback de las inyecciones
        // y las recalculamos.
        if (oldTx.tipo === 'INGRESO' && oldTx.producto_id && oldTx.cantidad && newMonto !== oldTx.monto) {
           // Rollback old injections
           await client.query(`DELETE FROM "Gasto_Presupuesto" WHERE descripcion = $1 AND tipo_movimiento = 'FONDO_EXTRA'`, 
             [`Venta auto: ${oldTx.descripcion} (x${oldTx.cantidad})`]);
           
           // Recalculate
           const prodRes = await client.query('SELECT precio_compra FROM inventario_vaxon WHERE id = $1', [oldTx.producto_id]);
           const precioCompra = prodRes.rows.length > 0 ? (prodRes.rows[0].precio_compra || 0) : 0;
           const gananciaTransaccion = newMonto - (precioCompra * oldTx.cantidad);

           const linkedBudgets = await client.query(
             `SELECT id, nombre, tipo, porcentaje_asignacion, monto_fijo FROM "Presupuesto" 
              WHERE alcance = 'PRODUCTO_GLOBAL' OR (alcance = 'PRODUCTO_ESPECIFICO' AND producto_id = $1)`,
             [oldTx.producto_id]
           );

           let totalAInyectar = 0;
           const inyecciones = [];
           for (const budget of linkedBudgets.rows) {
             let m = budget.tipo === 'PORCENTAJE' ? (budget.porcentaje_asignacion / 100) * newMonto : budget.monto_fijo * oldTx.cantidad;
             if (m > 0) { totalAInyectar += m; inyecciones.push({ id: budget.id, monto: m }); }
           }

           if (inyecciones.length > 0 && gananciaTransaccion > 0) {
             const factorEscala = totalAInyectar > gananciaTransaccion ? (gananciaTransaccion / totalAInyectar) : 1;
             for (const inj of inyecciones) {
               const mFinal = inj.monto * factorEscala;
               if (mFinal > 0.01) {
                 await client.query(
                   `INSERT INTO "Gasto_Presupuesto" (presupuesto_id, descripcion, monto, tipo_movimiento) VALUES ($1, $2, $3, 'FONDO_EXTRA')`,
                   [inj.id, `Venta auto: ${newDesc} (x${oldTx.cantidad})`, mFinal]
                 );
               }
             }
           }
        } else if (oldTx.tipo === 'INGRESO' && oldTx.producto_id && oldTx.cantidad && newDesc !== oldTx.descripcion) {
           // Just update description of existing injection
           await client.query(`UPDATE "Gasto_Presupuesto" SET descripcion = $1 WHERE descripcion = $2 AND tipo_movimiento = 'FONDO_EXTRA'`, 
             [`Venta auto: ${newDesc} (x${oldTx.cantidad})`, `Venta auto: ${oldTx.descripcion} (x${oldTx.cantidad})`]);
        }

        await client.query('UPDATE "Transaccion_Caja" SET monto = $1, descripcion = $2 WHERE id = $3', [newMonto, newDesc, payload.id]);

        await client.query('COMMIT');
        await bumpVersion();
        return res.json({ success: true });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    if (action === 'CIERRE') {
      // Calculate final amount before closing
      const transRes = await db.query(`
        SELECT tipo, COALESCE(SUM(monto),0) as total 
        FROM "Transaccion_Caja" 
        WHERE caja_id = $1 
        GROUP BY tipo
      `, [payload.caja_id]);

      const cajaRes = await db.query('SELECT monto_inicial FROM "Caja_Chica" WHERE id = $1', [payload.caja_id]);
      const montoInicial = cajaRes.rows[0]?.monto_inicial || 0;

      let totalIngresos = 0, totalEgresos = 0;
      for (const r of transRes.rows) {
        if (r.tipo === 'INGRESO') totalIngresos = r.total;
        if (r.tipo === 'EGRESO') totalEgresos = r.total;
      }
      const montoFinal = montoInicial + totalIngresos - totalEgresos;

      await db.query(
        'UPDATE "Caja_Chica" SET estado = $1, fecha_cierre = CURRENT_TIMESTAMP, monto_final = $2 WHERE id = $3',
        ['CERRADA', montoFinal, payload.caja_id]
      );
      await bumpVersion();
      return res.json({ success: true, monto_final: montoFinal });
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
