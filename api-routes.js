const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { requireAuth } = require('./auth');
const trabajos = require('./trabajos-controller');

// Las fotos se muestran con <img src>, que no puede mandar el header
// Authorization: por eso aceptamos el token también como ?t=...
function authFoto(req, res, next) {
  if (req.query.t && !req.headers.authorization) {
    try {
      req.usuario = jwt.verify(req.query.t, process.env.JWT_SECRET);
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }
  }
  return requireAuth(req, res, next);
}

router.get('/fotos/:id', authFoto, trabajos.verFoto);

router.use(requireAuth);

router.get('/trabajos', trabajos.listar);
router.post('/trabajos', trabajos.crear);
router.put('/trabajos/:id', trabajos.actualizar);
router.delete('/trabajos/:id', trabajos.eliminar);

router.post('/fotos', express.raw({ type: 'image/*', limit: '20mb' }), trabajos.subirFoto);
router.delete('/fotos/:id', trabajos.eliminarFoto);

module.exports = router;
