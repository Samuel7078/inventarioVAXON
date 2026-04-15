const express = require('express');
const router = express.Router();
const db = require('./db');

// Bump the global version — called after any mutation
async function bumpVersion() {
  try {
    await db.query('UPDATE config_sync SET version = version + 1, ultima_act = CURRENT_TIMESTAMP WHERE id = 1');
  } catch (e) {
    console.error('Sync bump error:', e.message);
  }
}

// Ultra-light heartbeat endpoint (~1ms)
router.get('/version', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT version FROM config_sync WHERE id = 1');
    res.json({ version: rows[0]?.version || 0 });
  } catch (error) {
    res.json({ version: 0 });
  }
});

module.exports = router;
module.exports.bumpVersion = bumpVersion;
