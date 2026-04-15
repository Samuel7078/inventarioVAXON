const express = require('express');
const router = express.Router();
const db = require('./db');
const { bumpVersion } = require('./sync');

router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM "Proveedor" ORDER BY "createdAt" DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, contacto } = req.body;
    const { rows } = await db.query(
      'INSERT INTO "Proveedor" (nombre, contacto) VALUES ($1, $2) RETURNING *',
      [nombre, contacto]
    );
    await bumpVersion();
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { nombre, contacto } = req.body;
    const { rows } = await db.query(
      'UPDATE "Proveedor" SET nombre = $1, contacto = $2 WHERE id = $3 RETURNING *',
      [nombre, contacto, req.params.id]
    );
    await bumpVersion();
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM "Proveedor" WHERE id = $1', [req.params.id]);
    await bumpVersion();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
