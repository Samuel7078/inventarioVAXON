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
        
        // If it was a sale with linked product, deduct from inventory
        if (payload.tipo === 'INGRESO' && payload.producto_id && payload.cantidad) {
           await client.query('UPDATE inventario_vaxon SET cantidad = cantidad - $1 WHERE id = $2', [payload.cantidad, payload.producto_id]);
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
