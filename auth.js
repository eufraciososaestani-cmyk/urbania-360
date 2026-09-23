const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const ROLES = ['admin', 'empleado'];

function tokenDe(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Verifica el token y carga el usuario desde la base en cada pedido, así un
// cambio de permisos (o un usuario eliminado) se aplica al instante.
async function cargarUsuario(req, res, next, token) {
  if (!token) return res.status(401).json({ error: 'Token no provisto' });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, email, rol, ve_referido FROM usuarios WHERE id = $1', [payload.id]);
    if (!rows.length) return res.status(401).json({ error: 'Usuario inexistente' });
    req.usuario = rows[0];
    next();
  } catch (err) {
    res.status(500).json({ error: 'Error de autenticación', detalle: err.message });
  }
}

function requireAuth(req, res, next) {
  return cargarUsuario(req, res, next, tokenDe(req));
}

// Igual que requireAuth pero acepta también ?t=<token> (lo usan las <img> de fotos)
function requireAuthOQuery(req, res, next) {
  return cargarUsuario(req, res, next, tokenDe(req) || req.query.t);
}

function requireAdmin(req, res, next) {
  if (!req.usuario || req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Requiere permisos de administrador' });
  }
  next();
}

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  try {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
    const usuario = rows[0];
    if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }
    const token = jwt.sign({ id: usuario.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Error al iniciar sesión', detalle: err.message });
  }
});

// Datos y permisos del usuario logueado
router.get('/yo', requireAuth, (req, res) => res.json(req.usuario));

// ---- Gestión de usuarios (solo admin) ----

const CAMPOS_USUARIO = 'id, nombre, email, rol, ve_referido, creado_en';

router.get('/usuarios', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT ${CAMPOS_USUARIO} FROM usuarios ORDER BY nombre`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar usuarios', detalle: err.message });
  }
});

router.post('/usuarios', requireAuth, requireAdmin, async (req, res) => {
  const { nombre, email, password } = req.body;
  const rol = ROLES.includes(req.body.rol) ? req.body.rol : 'empleado';
  const veReferido = rol === 'admin' || !!req.body.ve_referido;
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios' });
  if (String(password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, ve_referido) VALUES ($1,$2,$3,$4,$5)
       RETURNING ${CAMPOS_USUARIO}`,
      [nombre.trim(), email.toLowerCase().trim(), hash, rol, veReferido]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Ya existe un usuario con ese email' });
    res.status(500).json({ error: 'Error al crear el usuario', detalle: err.message });
  }
});

router.put('/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const rol = ROLES.includes(req.body.rol) ? req.body.rol : 'empleado';
  const veReferido = rol === 'admin' || !!req.body.ve_referido;
  if (id === req.usuario.id && rol !== 'admin') {
    return res.status(400).json({ error: 'No podés quitarte a vos mismo el rol de administrador' });
  }
  try {
    const params = [rol, veReferido, id];
    let sql = 'UPDATE usuarios SET rol = $1, ve_referido = $2';
    if (req.body.password) {
      if (String(req.body.password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      params.push(await bcrypt.hash(req.body.password, 10));
      sql += `, password_hash = $${params.length}`;
    }
    const { rows } = await pool.query(`${sql} WHERE id = $3 RETURNING ${CAMPOS_USUARIO}`, params);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar el usuario', detalle: err.message });
  }
});

router.delete('/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
  if (Number(req.params.id) === req.usuario.id) return res.status(400).json({ error: 'No podés eliminar tu propio usuario' });
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar el usuario', detalle: err.message });
  }
});

// Crea o actualiza un administrador (lo usan crear-usuario.js y el arranque del servidor)
async function guardarAdmin(nombre, email, password) {
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol, ve_referido) VALUES ($1, $2, $3, 'admin', TRUE)
     ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre, password_hash = EXCLUDED.password_hash,
       rol = 'admin', ve_referido = TRUE`,
    [nombre, email.toLowerCase().trim(), hash]
  );
}

module.exports = { router, requireAuth, requireAuthOQuery, guardarAdmin };
