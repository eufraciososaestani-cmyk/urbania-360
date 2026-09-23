const express = require('express');
const router = express.Router();

const { requireAuth, requireAuthOQuery } = require('./auth');
const trabajos = require('./trabajos-controller');

// Las fotos se muestran con <img src>, que no puede mandar el header
// Authorization: por eso aceptan el token también como ?t=...
router.get('/fotos/:id', requireAuthOQuery, trabajos.verFoto);

router.use(requireAuth);

router.get('/trabajos', trabajos.listar);
router.post('/trabajos', trabajos.crear);                       // alta de la solicitud (área 1)
router.put('/trabajos/:id/solicitud', trabajos.actualizarSolicitud); // área 1
router.put('/trabajos/:id/gestion', trabajos.actualizarGestion);     // área 2
router.get('/trabajos/:id/presupuesto-cliente', trabajos.presupuestoCliente);
router.delete('/trabajos/:id', trabajos.eliminar);

router.post('/fotos', express.raw({ type: 'image/*', limit: '20mb' }), trabajos.subirFoto);
router.delete('/fotos/:id', trabajos.eliminarFoto);

module.exports = router;
