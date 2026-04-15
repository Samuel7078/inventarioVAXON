const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
const auth = require('./auth');

// Setup global de nube
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// JSON base64 string body parser intercept (Bypass Multer stream hanging en Vercel)
router.post('/', auth.verifyToken, express.json({limit: '20mb'}), async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'La imagen Base64 viene vacía.' });
    if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(500).json({ error: 'Falta configurar variables de entorno CLOUDINARY' });

    // Cloudinary soporta de forma nativa Base64/DataURIs directos
    const result = await cloudinary.uploader.upload(fileBase64, {
      folder: "vaxon_inventario"
    });
    
    res.json({ url: result.secure_url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
