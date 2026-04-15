const express = require('express');
const router = express.Router();
const db = require('./db');
const { bumpVersion } = require('./sync');

// ====== GET / — Full financial dashboard data ======
router.get('/', async (req, res) => {
  try {
    // 1) Presupuestos con sus gastos acumulados
    const resPresupuestos = await db.query(`
      SELECT p.*,
        COALESCE((SELECT SUM(g.monto) FROM "Gasto_Presupuesto" g WHERE g.presupuesto_id = p.id AND g.tipo_movimiento = 'GASTO'), 0) AS total_gastado,
        COALESCE((SELECT SUM(g.monto) FROM "Gasto_Presupuesto" g WHERE g.presupuesto_id = p.id AND g.tipo_movimiento = 'FONDO_EXTRA'), 0) AS fondos_extra
      FROM "Presupuesto" p ORDER BY p.id ASC
    `);

    // 2) Métricas de ventas (solo transacciones con producto vinculado)
    const transVentas = await db.query(`
      SELECT tc.monto, tc.cantidad, iv.precio_compra 
      FROM "Transaccion_Caja" tc
      JOIN inventario_vaxon iv ON tc.producto_id = iv.id
      WHERE tc.tipo = 'INGRESO'
    `);

    let ingresosBrutos = 0;
    let capitalInvertido = 0;
    for (const t of transVentas.rows) {
      ingresosBrutos += t.monto;
      capitalInvertido += (t.precio_compra * (t.cantidad || 1));
    }
    const gananciaBruta = ingresosBrutos - capitalInvertido;

    // 3) Calcular total descontado por presupuestos
    const presupuestos = resPresupuestos.rows.map(p => {
      let montoAsignado = 0;
      if (p.tipo === 'FIJO') {
        montoAsignado = p.monto_fijo;
      } else {
        montoAsignado = (p.porcentaje_asignacion / 100) * gananciaBruta;
      }
      const disponible = montoAsignado + p.fondos_extra - p.total_gastado;
      return {
        ...p,
        monto_asignado: montoAsignado,
        disponible: disponible,
        total_gastado: p.total_gastado,
        fondos_extra: p.fondos_extra
      };
    });

    const totalPresupuestos = presupuestos.reduce((a, p) => a + p.monto_asignado + p.fondos_extra, 0);
    const totalGastadoPresupuestos = presupuestos.reduce((a, p) => a + p.total_gastado, 0);
    const gananciaReal = gananciaBruta - totalPresupuestos;

    // 4) Comisiones
    const resComisiones = await db.query(`
      SELECT cu.*, u.nombre as usuario_nombre, u.email as usuario_email
      FROM "Comision_Usuario" cu
      JOIN "Usuario" u ON cu.usuario_id = u.id
      WHERE cu.activa = true
      ORDER BY cu.porcentaje DESC
    `);

    const comisiones = resComisiones.rows.map(c => ({
      ...c,
      monto_comision: (c.porcentaje / 100) * (gananciaReal > 0 ? gananciaReal : 0)
    }));

    const totalComisiones = comisiones.reduce((a, c) => a + c.monto_comision, 0);

    // 5) Lista de usuarios (para el selector de comisiones)
    const resUsuarios = await db.query('SELECT id, nombre, email FROM "Usuario" ORDER BY nombre ASC');

    // 6) Presupuestos fijos que necesitan reset
    const now = new Date();
    const diaHoy = now.getDate();
    const presupuestosResetPendiente = presupuestos.filter(p => {
      if (p.tipo !== 'FIJO') return false;
      if (!p.ultimo_reset) return p.dia_reset <= diaHoy;
      const lastReset = new Date(p.ultimo_reset);
      const monthDiff = (now.getFullYear() - lastReset.getFullYear()) * 12 + (now.getMonth() - lastReset.getMonth());
      return monthDiff >= 1 && diaHoy >= p.dia_reset;
    }).map(p => ({ id: p.id, nombre: p.nombre, dia_reset: p.dia_reset }));

    // 7) Capital de Respaldo
    const resCapital = await db.query('SELECT monto FROM "Capital_Respaldo" WHERE id = 1');
    const capitalRespaldo = resCapital.rows.length > 0 ? resCapital.rows[0].monto : 0;

    res.json({
      presupuestos,
      comisiones,
      usuarios: resUsuarios.rows,
      resetsPendientes: presupuestosResetPendiente,
      capitalRespaldo,
      metricas: {
        ingresosBrutos,
        capitalInvertido,
        gananciaBruta,
        totalPresupuestos,
        totalGastadoPresupuestos,
        gananciaReal,
        totalComisiones,
        gananciaNoAsignada: gananciaReal - totalComisiones
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== GET /:id — Budget detail with all movements ======
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resPres = await db.query('SELECT * FROM "Presupuesto" WHERE id = $1', [id]);
    if (resPres.rows.length === 0) return res.status(404).json({ error: 'Presupuesto no encontrado' });

    const resMovs = await db.query(`
      SELECT * FROM "Gasto_Presupuesto" WHERE presupuesto_id = $1 ORDER BY fecha DESC
    `, [id]);

    res.json({ ...resPres.rows[0], movimientos: resMovs.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== POST — Financial actions ======
router.post('/', async (req, res) => {
  try {
    const { action, payload } = req.body;

    if (action === 'CREAR_FONDO') {
      const tipo = payload.tipo || 'PORCENTAJE';
      const { rows } = await db.query(
        `INSERT INTO "Presupuesto" (nombre, tipo, porcentaje_asignacion, monto_fijo, color_hex, dia_reset) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          payload.nombre,
          tipo,
          tipo === 'PORCENTAJE' ? (payload.porcentaje || 0) : 0,
          tipo === 'FIJO' ? (payload.monto_fijo || 0) : 0,
          payload.color || '#3b82f6',
          payload.dia_reset || 1
        ]
      );
      await bumpVersion();
      return res.json(rows[0]);
    }

    if (action === 'GASTAR_FONDO') {
      const { rows } = await db.query(
        `INSERT INTO "Gasto_Presupuesto" (presupuesto_id, descripcion, monto, tipo_movimiento) 
         VALUES ($1, $2, $3, 'GASTO') RETURNING *`,
        [payload.presupuesto_id, payload.descripcion, payload.monto]
      );
      await bumpVersion();
      return res.json(rows[0]);
    }

    if (action === 'AGREGAR_FONDO_EXTRA') {
      const { rows } = await db.query(
        `INSERT INTO "Gasto_Presupuesto" (presupuesto_id, descripcion, monto, tipo_movimiento) 
         VALUES ($1, $2, $3, 'FONDO_EXTRA') RETURNING *`,
        [payload.presupuesto_id, payload.descripcion, payload.monto]
      );
      await bumpVersion();
      return res.json(rows[0]);
    }

    if (action === 'CREAR_COMISION') {
      const { rows } = await db.query(
        `INSERT INTO "Comision_Usuario" (usuario_id, porcentaje) VALUES ($1, $2) 
         ON CONFLICT (usuario_id) DO UPDATE SET porcentaje = $2, activa = true 
         RETURNING *`,
        [payload.usuario_id, payload.porcentaje]
      );
      await bumpVersion();
      return res.json(rows[0]);
    }

    if (action === 'ELIMINAR_COMISION') {
      await db.query('UPDATE "Comision_Usuario" SET activa = false WHERE id = $1', [payload.comision_id]);
      await bumpVersion();
      return res.json({ success: true });
    }

    if (action === 'ELIMINAR_PRESUPUESTO') {
      await db.query('DELETE FROM "Presupuesto" WHERE id = $1', [payload.presupuesto_id]);
      await bumpVersion();
      return res.json({ success: true });
    }

    if (action === 'RESET_PRESUPUESTO') {
      // Borra todos los gastos del presupuesto y marca como reseteado
      await db.query('DELETE FROM "Gasto_Presupuesto" WHERE presupuesto_id = $1', [payload.presupuesto_id]);
      await db.query('UPDATE "Presupuesto" SET ultimo_reset = CURRENT_TIMESTAMP WHERE id = $1', [payload.presupuesto_id]);
      await bumpVersion();
      return res.json({ success: true });
    }

    if (action === 'MODIFICAR_PRESUPUESTO') {
      const sets = [];
      const vals = [];
      let idx = 1;
      if (payload.nombre !== undefined) { sets.push(`nombre = $${idx++}`); vals.push(payload.nombre); }
      if (payload.porcentaje !== undefined) { sets.push(`porcentaje_asignacion = $${idx++}`); vals.push(payload.porcentaje); }
      if (payload.monto_fijo !== undefined) { sets.push(`monto_fijo = $${idx++}`); vals.push(payload.monto_fijo); }
      if (payload.dia_reset !== undefined) { sets.push(`dia_reset = $${idx++}`); vals.push(payload.dia_reset); }
      if (payload.color !== undefined) { sets.push(`color_hex = $${idx++}`); vals.push(payload.color); }
      vals.push(payload.presupuesto_id);
      await db.query(`UPDATE "Presupuesto" SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
      await bumpVersion();
      return res.json({ success: true });
    }

    if (action === 'AUMENTAR_CAPITAL_RESPALDO') {
      const { rows } = await db.query('UPDATE "Capital_Respaldo" SET monto = monto + $1 WHERE id = 1 RETURNING *', [payload.monto]);
      await bumpVersion();
      return res.json(rows[0]);
    }

    if (action === 'DEDUCIR_CAPITAL_RESPALDO') {
      // payload = { monto, presupuesto_id, descripcion }
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        
        // 1. Deducir del capital de respaldo
        await client.query('UPDATE "Capital_Respaldo" SET monto = monto - $1 WHERE id = 1', [payload.monto]);
        
        // 2. Si se designa un presupuesto, inyectar el dinero allí
        if (payload.presupuesto_id) {
          await client.query(
            `INSERT INTO "Gasto_Presupuesto" (presupuesto_id, descripcion, monto, tipo_movimiento) 
             VALUES ($1, $2, $3, 'FONDO_EXTRA')`,
            [payload.presupuesto_id, payload.descripcion || 'Cobertura desde Capital de Respaldo', payload.monto]
          );
        }

        await client.query('COMMIT');
        await bumpVersion();
        return res.json({ success: true });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    res.status(400).json({ error: 'Comando financiero inválido' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
