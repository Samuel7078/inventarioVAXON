const express = require('express');
const router = express.Router();
const db = require('./db');

router.get('/summary', async (req, res) => {
  try {
    const resProductos = await db.query('SELECT * FROM inventario_vaxon');
    const productos = resProductos.rows;

    const resGastos = await db.query('SELECT * FROM "Gasto_Producto"');
    const gastos = resGastos.rows;

    const totalValorizado = productos.reduce((sum, p) => {
      let calcCompra = p.precio_compra;
      const egresosProd = gastos.filter(g => g.producto_id === p.id);
      
      egresosProd.forEach(eg => {
         if (eg.tipo === 'PORCENTAJE') calcCompra -= calcCompra * (eg.valor / 100);
         else if (eg.tipo === 'MONTO_FIJO') calcCompra -= eg.valor;
      });
      return sum + (calcCompra * p.cantidad);
    }, 0);

    const productosBajoStock = productos.filter(p => p.cantidad < 5);

    const resCaja = await db.query('SELECT * FROM "Caja_Chica" WHERE estado = $1 ORDER BY "fecha_apertura" DESC LIMIT 1', ['ABIERTA']);
    const cajaActual = resCaja.rows[0] || null;

    let saldoActual = 0;
    if (cajaActual) {
      const resTrans = await db.query('SELECT tipo, monto FROM "Transaccion_Caja" WHERE caja_id = $1', [cajaActual.id]);
      const ingresos = resTrans.rows.filter(t => t.tipo === 'INGRESO').reduce((sum, t) => sum + t.monto, 0);
      const egresos = resTrans.rows.filter(t => t.tipo === 'EGRESO').reduce((sum, t) => sum + t.monto, 0);
      saldoActual = (cajaActual.monto_inicial || 0) + ingresos - egresos;
    }

    res.json({ totalValorizado, productosBajoStock, cajaActual: cajaActual ? { ...cajaActual, saldoActual } : null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
