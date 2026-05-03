const express = require('express');
const router = express.Router();
const db = require('./db');
const { bumpVersion } = require('./sync');

// Auto-crear tabla de transferencias si no existe
db.query(`CREATE TABLE IF NOT EXISTS "Transferencia_Ganancia_Real" (
  "id" SERIAL PRIMARY KEY,
  "monto" DOUBLE PRECISION NOT NULL,
  "destino_presupuesto_id" INTEGER REFERENCES "Presupuesto"("id") ON DELETE SET NULL,
  "descripcion" TEXT,
  "fecha" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`).catch(console.error);

// Auto-crear tabla de pagos a usuarios
db.query(`CREATE TABLE IF NOT EXISTS "Pago_Usuario" (
  "id" SERIAL PRIMARY KEY,
  "usuario_id" INTEGER REFERENCES "Usuario"("id") ON DELETE CASCADE,
  "monto" DOUBLE PRECISION NOT NULL,
  "descripcion" TEXT,
  "fecha" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`).catch(console.error);

// ====== GET / — Full financial dashboard data ======
router.get('/', async (req, res) => {
  try {
    // 1) Presupuestos con sus gastos acumulados + nombre del producto si aplica
    const resPresupuestos = await db.query(`
      SELECT p.*,
        COALESCE((SELECT SUM(g.monto) FROM "Gasto_Presupuesto" g WHERE g.presupuesto_id = p.id AND g.tipo_movimiento = 'GASTO'), 0) AS total_gastado,
        COALESCE((SELECT SUM(g.monto) FROM "Gasto_Presupuesto" g WHERE g.presupuesto_id = p.id AND g.tipo_movimiento = 'FONDO_EXTRA'), 0) AS fondos_extra,
        COALESCE((SELECT SUM(g.monto) FROM "Gasto_Presupuesto" g WHERE g.presupuesto_id = p.id AND g.tipo_movimiento = 'TRANSFERENCIA_IN'), 0) AS transferencias_in,
        COALESCE((SELECT SUM(g.monto) FROM "Gasto_Presupuesto" g WHERE g.presupuesto_id = p.id AND g.tipo_movimiento = 'TRANSFERENCIA_OUT'), 0) AS transferencias_out,
        iv.producto AS producto_nombre
      FROM "Presupuesto" p
      LEFT JOIN inventario_vaxon iv ON p.producto_id = iv.id
      ORDER BY p.prioridad ASC, p.id ASC
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

    // 3) Calcular total descontado por presupuestos (Lógica Secuencial por Prioridad)
    let pozoRestante = gananciaBruta;
    const presupuestos = resPresupuestos.rows.map(p => {
      const isProducto = p.alcance === 'PRODUCTO_ESPECIFICO' || p.alcance === 'PRODUCTO_GLOBAL';
      let montoAsignado = 0;
      
      if (isProducto) {
        // Los presupuestos de producto se financian al momento de la venta (fondos_extra).
        // BUG FIX: Las transferencias internas NO deben afectar el pozo de ganancia real
        // para evitar que los números "salten" al mover dinero entre cuentas.
        montoAsignado = 0;
        pozoRestante -= (p.fondos_extra || 0);
      } else {
        // Presupuesto general: toma del pozo RESTANTE según prioridad.
        // BUG FIX: Ignoramos transferencias_in/out en la demanda de fondos para mantener estable la Ganancia Real.
        const balanceActualParaFinanciar = (p.fondos_extra || 0) - (p.total_gastado || 0);
        let requested = 0;
        
        if (p.tipo === 'MANUAL') {
          requested = 0;
        } else if (p.tipo === 'FIJO') {
          requested = Math.max(0, p.monto_fijo - balanceActualParaFinanciar);
        } else {
          requested = (p.porcentaje_asignacion / 100) * gananciaBruta;
        }
        
        montoAsignado = Math.max(0, Math.min(pozoRestante, requested));
        pozoRestante -= montoAsignado;
      }

      const disponible = p.fondos_extra + (p.transferencias_in || 0) - p.total_gastado - (p.transferencias_out || 0) + montoAsignado;
      
      return {
        ...p,
        monto_asignado: montoAsignado,
        disponible: disponible,
        total_gastado: p.total_gastado,
        fondos_extra: p.fondos_extra,
        transferencias_in: p.transferencias_in || 0,
        transferencias_out: p.transferencias_out || 0,
        producto_nombre: p.producto_nombre || null
      };
    });

    // Leer deducciones manuales (Transferencias desde Ganancia Real)
    const resTransfGanancia = await db.query('SELECT COALESCE(SUM(monto), 0) as total FROM "Transferencia_Ganancia_Real"');
    const transferenciasDesdeGanancia = resTransfGanancia.rows[0].total;

    const gananciaReal = Math.max(0, pozoRestante - transferenciasDesdeGanancia);
    const totalPresupuestos = gananciaBruta - pozoRestante;
    const totalGastadoPresupuestos = presupuestos.reduce((a, p) => a + p.total_gastado, 0);

    // 4) Comisiones
    const resComisiones = await db.query(`
      SELECT cu.*, u.nombre as usuario_nombre, u.email as usuario_email
      FROM "Comision_Usuario" cu
      JOIN "Usuario" u ON cu.usuario_id = u.id
      WHERE cu.activa = true
      ORDER BY cu.porcentaje DESC
    `);

    // Obtener historial y total pagado por usuario
    const resPagos = await db.query('SELECT usuario_id, SUM(monto) as total_pagado FROM "Pago_Usuario" GROUP BY usuario_id');
    const pagosDict = {};
    resPagos.rows.forEach(r => pagosDict[r.usuario_id] = r.total_pagado);

    let totalPagadoGlobal = 0;
    
    // El cálculo de la ganancia generada se basa en la Ganancia Real Histórica
    const gananciaReal_Historica = gananciaReal;

    const comisiones = resComisiones.rows.map(c => {
      const montoGenerado = (c.porcentaje / 100) * (gananciaReal_Historica > 0 ? gananciaReal_Historica : 0);
      const totalPagado = pagosDict[c.usuario_id] || 0;
      totalPagadoGlobal += totalPagado;
      return {
        ...c,
        monto_generado: montoGenerado,
        total_pagado: totalPagado,
        monto_comision: Math.max(0, montoGenerado - totalPagado) // Saldo pendiente a pagar
      };
    });

    const gananciaReal_Retenida = gananciaReal_Historica - totalPagadoGlobal;
    const totalComisionesRestantes = comisiones.reduce((a, c) => a + c.monto_comision, 0);

    // Obtener historial detallado de pagos para el sub-módulo
    const resHistorialPagos = await db.query(`
      SELECT pu.*, u.nombre as usuario_nombre
      FROM "Pago_Usuario" pu
      JOIN "Usuario" u ON pu.usuario_id = u.id
      ORDER BY pu.fecha DESC
    `);

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
      historialPagos: resHistorialPagos.rows,
      usuarios: resUsuarios.rows,
      resetsPendientes: presupuestosResetPendiente,
      capitalRespaldo,
      metricas: {
        ingresosBrutos,
        capitalInvertido,
        gananciaBruta,
        totalPresupuestos,
        totalGastadoPresupuestos,
        gananciaReal: gananciaReal_Retenida, // Mostrar el dinero físico que queda
        gananciaRealHistorica: gananciaReal_Historica,
        totalComisionesPendientes: totalComisionesRestantes,
        gananciaNoAsignada: gananciaReal_Retenida - totalComisionesRestantes
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
      const alcance = payload.alcance || 'GENERAL';
      const productoId = alcance === 'PRODUCTO_ESPECIFICO' ? (payload.producto_id || null) : null;
      const { rows } = await db.query(
        `INSERT INTO "Presupuesto" (nombre, tipo, porcentaje_asignacion, monto_fijo, color_hex, dia_reset, alcance, producto_id, prioridad) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          payload.nombre,
          tipo,
          tipo === 'PORCENTAJE' ? (payload.porcentaje || 0) : 0,
          tipo === 'FIJO' ? (payload.monto_fijo || 0) : 0,
          payload.color || '#3b82f6',
          payload.dia_reset || 1,
          alcance,
          productoId,
          payload.prioridad || 1
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

    if (action === 'PAGAR_COMISION') {
      const { rows } = await db.query(
        `INSERT INTO "Pago_Usuario" (usuario_id, monto, descripcion) 
         VALUES ($1, $2, $3) RETURNING *`,
        [payload.usuario_id, payload.monto, payload.descripcion || 'Pago de sueldo / comisión']
      );
      await bumpVersion();
      return res.json(rows[0]);
    }

    if (action === 'ELIMINAR_PRESUPUESTO') {
      await db.query('DELETE FROM "Presupuesto" WHERE id = $1', [payload.presupuesto_id]);
      await bumpVersion();
      return res.json({ success: true });
    }

    if (action === 'TRANSFERIR_FONDOS') {
      const { origen_tipo, origen_id, destino_id, monto, descripcion } = payload;
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        
        if (origen_tipo === 'GANANCIA_REAL') {
          await client.query('INSERT INTO "Transferencia_Ganancia_Real" (monto, destino_presupuesto_id, descripcion) VALUES ($1, $2, $3)', [monto, destino_id, descripcion]);
        } else if (origen_tipo === 'PRESUPUESTO') {
          await client.query('INSERT INTO "Gasto_Presupuesto" (presupuesto_id, descripcion, monto, tipo_movimiento) VALUES ($1, $2, $3, $4)', [origen_id, 'Transferencia enviada a otra cuenta: ' + descripcion, monto, 'TRANSFERENCIA_OUT']);
        }

        await client.query('INSERT INTO "Gasto_Presupuesto" (presupuesto_id, descripcion, monto, tipo_movimiento) VALUES ($1, $2, $3, $4)', [destino_id, 'Abono recibido: ' + descripcion, monto, 'TRANSFERENCIA_IN']);

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

    if (action === 'LIQUIDAR_PRESUPUESTO') {
      const { presupuesto_id, disponible } = payload;
      if (disponible > 0) {
        await db.query('INSERT INTO "Gasto_Presupuesto" (presupuesto_id, descripcion, monto, tipo_movimiento) VALUES ($1, $2, $3, $4)', [presupuesto_id, 'Liquidación / Pago de periodo', disponible, 'GASTO']);
      }
      await db.query('UPDATE "Presupuesto" SET ultimo_reset = CURRENT_TIMESTAMP WHERE id = $1', [presupuesto_id]);
      await bumpVersion();
      return res.json({ success: true });
    }

    if (action === 'RESET_PRESUPUESTO') {
      // Borra todos los gastos del presupuesto y marca como reseteado (Soft Deprecated, now we use LIQUIDAR_PRESUPUESTO mostly)
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
      if (payload.tipo !== undefined) { sets.push(`tipo = $${idx++}`); vals.push(payload.tipo); }
      if (payload.porcentaje !== undefined) { sets.push(`porcentaje_asignacion = $${idx++}`); vals.push(payload.porcentaje); }
      if (payload.monto_fijo !== undefined) { sets.push(`monto_fijo = $${idx++}`); vals.push(payload.monto_fijo); }
      if (payload.dia_reset !== undefined) { sets.push(`dia_reset = $${idx++}`); vals.push(payload.dia_reset); }
      if (payload.color !== undefined) { sets.push(`color_hex = $${idx++}`); vals.push(payload.color); }
      if (payload.prioridad !== undefined) { sets.push(`prioridad = $${idx++}`); vals.push(payload.prioridad); }
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
             VALUES ($1, $2, $3, 'TRANSFERENCIA_IN')`,
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
