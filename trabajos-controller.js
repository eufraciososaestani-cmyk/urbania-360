const pool = require('./db');

// Libro de pedidos de mantenimiento / obra, con fotos
// antes / durante / después de cada trabajo.

const ESTADOS = ['pendiente', 'en_ejecucion', 'finalizada'];
const PRESUPUESTOS = ['aceptado', 'no_aceptado', 'a_confirmar'];
const ETAPAS = ['antes', 'durante', 'despues'];
const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Devuelve los trabajos con la lista de fotos (sin los bytes) de cada uno.
const SELECT_TRABAJOS = `
  SELECT t.*, TO_CHAR(t.fecha, 'YYYY-MM-DD') AS fecha,
    COALESCE(
      (SELECT json_agg(json_build_object('id', f.id, 'etapa', f.etapa, 'subida', f.subida_en) ORDER BY f.subida_en)
         FROM fotos f WHERE f.trabajo_id = t.id),
      '[]'::json) AS fotos
  FROM trabajos t`;

function normalizarMonto(monto) {
  return monto === null || monto === undefined || monto === '' ? null : Number(monto);
}

// Valida y normaliza el cuerpo de un pedido. Devuelve { error } o { datos }.
function validar(body) {
  const datos = {
    fecha: body.fecha,
    solicitante: (body.solicitante || '').trim(),
    lugar: (body.lugar || '').trim(),
    tipo: (body.tipo || '').trim(),
    observaciones: (body.observaciones || '').trim() || null,
    monto: normalizarMonto(body.monto),
    presupuesto: body.presupuesto || 'a_confirmar',
    estado: body.estado || 'pendiente',
  };
  const faltan = [];
  if (!datos.fecha) faltan.push('fecha');
  if (!datos.solicitante) faltan.push('quién lo pide');
  if (!datos.lugar) faltan.push('para dónde');
  if (!datos.tipo) faltan.push('tipo de trabajo');
  if (faltan.length) return { error: 'Falta completar: ' + faltan.join(', ') };
  if (datos.monto !== null && !Number.isFinite(datos.monto)) return { error: 'El presupuesto tiene que ser un número' };
  if (!PRESUPUESTOS.includes(datos.presupuesto)) return { error: 'Presupuesto inválido' };
  if (!ESTADOS.includes(datos.estado)) return { error: 'Estado inválido' };
  return { datos };
}

// Asocia al trabajo las fotos que se subieron antes de guardarlo (pedido nuevo).
async function vincularFotos(client, trabajoId, fotoIds) {
  const ids = (Array.isArray(fotoIds) ? fotoIds : []).map(Number).filter(Number.isInteger);
  if (!ids.length) return;
  await client.query(
    'UPDATE fotos SET trabajo_id = $1 WHERE trabajo_id IS NULL AND id = ANY($2::int[])',
    [trabajoId, ids]
  );
}

async function obtenerTrabajo(client, id) {
  const { rows } = await client.query(SELECT_TRABAJOS + ' WHERE t.id = $1', [id]);
  return rows[0];
}

async function listar(req, res) {
  try {
    const { rows } = await pool.query(SELECT_TRABAJOS + ' ORDER BY t.fecha DESC, t.creado_en DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar pedidos', detalle: err.message });
  }
}

async function crear(req, res) {
  const { error, datos } = validar(req.body);
  if (error) return res.status(400).json({ error });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO trabajos (fecha, solicitante, lugar, tipo, observaciones, monto, presupuesto, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [datos.fecha, datos.solicitante, datos.lugar, datos.tipo, datos.observaciones,
       datos.monto, datos.presupuesto, datos.estado]
    );
    await vincularFotos(client, rows[0].id, req.body.foto_ids);
    await client.query('COMMIT');
    res.status(201).json(await obtenerTrabajo(pool, rows[0].id));
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Error al crear el pedido', detalle: err.message });
  } finally {
    client.release();
  }
}

async function actualizar(req, res) {
  const { error, datos } = validar(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const { rowCount } = await pool.query(
      `UPDATE trabajos SET fecha=$1, solicitante=$2, lugar=$3, tipo=$4, observaciones=$5,
         monto=$6, presupuesto=$7, estado=$8 WHERE id=$9`,
      [datos.fecha, datos.solicitante, datos.lugar, datos.tipo, datos.observaciones,
       datos.monto, datos.presupuesto, datos.estado, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(await obtenerTrabajo(pool, req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar el pedido', detalle: err.message });
  }
}

async function eliminar(req, res) {
  try {
    const { rowCount } = await pool.query('DELETE FROM trabajos WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar el pedido', detalle: err.message });
  }
}

// Sube una foto (cuerpo binario). Si viene ?trabajo_id se asocia directo; si no,
// queda "suelta" hasta que se guarde el pedido nuevo (ver vincularFotos).
async function subirFoto(req, res) {
  const etapa = req.query.etapa;
  const mime = (req.headers['content-type'] || '').split(';')[0].trim();
  if (!ETAPAS.includes(etapa)) return res.status(400).json({ error: 'Etapa inválida' });
  if (!MIMES.includes(mime)) return res.status(400).json({ error: 'Formato no compatible. Usá fotos JPG o PNG.', code: 'unsupported_type' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'La foto llegó vacía' });

  try {
    // Limpieza: fotos de pedidos nuevos que nunca se guardaron
    await pool.query(`DELETE FROM fotos WHERE trabajo_id IS NULL AND subida_en < NOW() - INTERVAL '1 day'`);

    const trabajoId = req.query.trabajo_id ? Number(req.query.trabajo_id) : null;
    const { rows } = await pool.query(
      `INSERT INTO fotos (trabajo_id, etapa, mime, datos) VALUES ($1,$2,$3,$4)
       RETURNING id, etapa, subida_en AS subida`,
      [trabajoId, etapa, mime, req.body]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al subir la foto', detalle: err.message });
  }
}

async function verFoto(req, res) {
  try {
    const { rows } = await pool.query('SELECT mime, datos FROM fotos WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).end();
    res.set('Content-Type', rows[0].mime);
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(rows[0].datos);
  } catch (err) {
    res.status(500).json({ error: 'Error al leer la foto', detalle: err.message });
  }
}

async function eliminarFoto(req, res) {
  try {
    await pool.query('DELETE FROM fotos WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Error al quitar la foto', detalle: err.message });
  }
}

module.exports = { listar, crear, actualizar, eliminar, subirFoto, verFoto, eliminarFoto };
