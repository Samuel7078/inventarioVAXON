const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('./db');

// En un entorno de Producción usar process.env.JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET || 'vaxon_super_secret_key_2026';

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await db.query('SELECT * FROM "Usuario" WHERE email = $1', [email]);
    const user = rows[0];

    // Por simplicidad y legacy se preserva texto plano para el hash (migrado del sistema primitivo)
    if (user && user.password === password) {
      const token = jwt.sign(
        { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      res.json({ token, user: { nombre: user.nombre, rol: user.rol } });
    } else {
      res.status(401).json({ error: 'Credenciales inválidas' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Security Middleware para interceptar rutas protegidas
router.verifyToken = (req, res, next) => {
  const bearer = req.headers['authorization'];
  if (!bearer) return res.status(403).json({ error: 'Acceso denegado (No token originado)' });
  
  const token = bearer.split(' ')[1];

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if(err) return res.status(401).json({ error: 'El token ha expirado o es inválido' });
    req.user = decoded;
    next();
  });
};

module.exports = router;
