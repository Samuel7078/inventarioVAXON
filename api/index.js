process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Referenciando modulos seguros fuera de Vercel API routing
app.use('/api/auth', require('../server/auth'));
app.use('/api/dashboard', require('../server/dashboard'));
app.use('/api/proveedores', require('../server/proveedores'));
app.use('/api/inventario', require('../server/inventario'));
app.use('/api/caja', require('../server/caja'));
app.use('/api/finanzas', require('../server/finanzas'));
app.use('/api/upload', require('../server/upload'));
app.use('/api/sync', require('../server/sync'));
app.use('/api/combos', require('../server/combos'));
app.use('/api/catalog', require('../server/catalog'));

app.get('/api', (req, res) => res.json({ message: 'VAXON Express API Running' }));

if (require.main === module) {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '../public')));
  
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Servidor local encendido en puerto ${PORT}`));
}

module.exports = app;
