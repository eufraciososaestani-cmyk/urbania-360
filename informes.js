const express = require('express');
const pool = require('./db');
const { requireAuth } = require('./auth');
const { datosEmpresa, hoyISO } = require('./trabajos-controller');

// ÁREA 3 · INFORMES TÉCNICOS
// Documentos independientes de las solicitudes y los presupuestos: se cargan
// directo (fecha, cliente, ubicación, descripción) y se imprimen con la marca.

const COLUMNAS = `i.id, TO_CHAR(i.fecha, 'YYYY-MM-DD') AS fecha, i.cliente, i.cliente_telefono, i.cliente_email,
  i.ubicacion, i.asunto, i.descripcion, i.realizado_por, i.creado_en, i.actualizado_en`;
const texto = v => (v === null || v === undefined ? '' : String(v)).trim() || null;
const numero = (id, fecha) => `INF-${String(fecha).slice(0, 4)}-${String(id).padStart(4, '0')}`;

function validar(body) {
  const d = {
    fecha: texto(body.fecha) || hoyISO(),
    cliente: texto(body.cliente),
    cliente_telefono: texto(body.cliente_telefono),
    cliente_email: texto(body.cliente_email),
    ubicacion: texto(body.ubicacion),
    asunto: texto(body.asunto),
    descripcion: texto(body.descripcion),
    realizado_por: texto(body.realizado_por),
  };
  const faltan = [];
  if (!d.cliente) faltan.push('cliente');
  if (!d.ubicacion) faltan.push('ubicación');
  if (!d.descripcion) faltan.push('descripción del informe técnico');
  if (faltan.length) return { error: 'Falta completar: ' + faltan.join(', ') };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) return { error: 'Fecha inválida' };
  return { datos: d };
}

async function uno(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM informes i WHERE i.id = $1`, [id]);
  if (rows[0]) rows[0].numero = numero(rows[0].id, rows[0].fecha);
  return rows[0];
}

const router = express.Router();
router.use('/api/informes', requireAuth);

router.get('/api/informes', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM informes i ORDER BY i.fecha DESC, i.id DESC`);
    rows.forEach(r => { r.numero = numero(r.id, r.fecha); });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar los informes técnicos', detalle: err.message });
  }
});

router.post('/api/informes', async (req, res) => {
  const { error, datos } = validar(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    const k = Object.keys(datos);
    const { rows } = await pool.query(
      `INSERT INTO informes (${k.join(', ')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING id`, k.map(c => datos[c]));
    res.status(201).json(await uno(rows[0].id));
  } catch (err) {
    res.status(500).json({ error: 'Error al crear el informe técnico', detalle: err.message });
  }
});

router.put('/api/informes/:id', async (req, res) => {
  const { error, datos } = validar(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    const k = Object.keys(datos);
    const { rowCount } = await pool.query(
      `UPDATE informes SET ${k.map((c, i) => `${c} = $${i + 1}`).join(', ')}, actualizado_en = NOW() WHERE id = $${k.length + 1}`,
      [...k.map(c => datos[c]), req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Informe no encontrado' });
    res.json(await uno(req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar el informe técnico', detalle: err.message });
  }
});

router.delete('/api/informes/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM informes WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Informe no encontrado' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar el informe técnico', detalle: err.message });
  }
});

// Datos para el documento (mismo formato y marca que el presupuesto)
router.get('/api/informes/:id/documento', async (req, res) => {
  try {
    const p = await uno(req.params.id);
    if (!p) return res.status(404).json({ error: 'Informe no encontrado' });
    p.categoria = p.asunto;
    p.empresa = datosEmpresa();
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: 'Error al armar el informe técnico', detalle: err.message });
  }
});

module.exports = { router };
