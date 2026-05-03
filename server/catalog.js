/**
 * catalog.js — Endpoints para consultar datos del catálogo (Supabase)
 * Solo lectura: categorías y contactos para poblar selectores.
 */
const express = require('express');
const router = express.Router();
const { catalogQuery } = require('./catalogDb');

// GET /api/catalog/meta — Retorna categorías y contactos del catálogo
router.get('/meta', async (req, res) => {
  try {
    const [catRes, contRes] = await Promise.all([
      catalogQuery('SELECT id, name FROM categories ORDER BY name ASC'),
      catalogQuery('SELECT id, name, number FROM contacts ORDER BY name ASC')
    ]);
    res.json({
      categories: catRes.rows,
      contacts: contRes.rows
    });
  } catch (error) {
    console.error('[Catalog Meta] Error:', error.message);
    // Return empty arrays if catalog DB is not available
    res.json({ categories: [], contacts: [] });
  }
});

module.exports = router;
