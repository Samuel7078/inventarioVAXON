const db = require('./server/db');

async function testInsert() {
  try {
    const { rows } = await db.query(
      'INSERT INTO inventario_vaxon (producto, modelo, cantidad, precio_compra, precio_venta, proveedor_id, imagen_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      ['Test', 'Mod', 1, 10, 20, null, 'http://test.url/img.png']
    );
    console.log('EXITO INSERT:', rows[0]);
    await db.query('DELETE FROM inventario_vaxon WHERE id = $1', [rows[0].id]);
  } catch(e) {
    console.error('ERROR DB INSERT:', e.message);
  } finally {
    process.exit();
  }
}
testInsert();
