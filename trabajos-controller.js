const pool = require('./db');

// Gestión de solicitudes y trabajos. Cada registro tiene dos áreas que se
// guardan por separado:
//   ÁREA 1 · Solicitud de pedido  (PUT /trabajos/:id/solicitud)
//   ÁREA 2 · Presupuesto y trabajo (PUT /trabajos/:id/gestion)
// "referido_por" es un dato interno: solo lo reciben y modifican los usuarios
// con permiso ve_referido, y nunca sale en el presupuesto para el cliente.

const ORIGENES = ['whatsapp', 'telefono', 'web', 'redes', 'recomendacion', 'otro'];
const PRESUPUESTO_ESTADOS = ['pendiente', 'en_preparacion', 'enviado', 'aceptado', 'rechazado'];
const TAREA_ESTADOS = ['pendiente', 'asignada', 'en_proceso', 'finalizada', 'cancelada'];
// Estados de la tarea que se pueden usar sin presupuesto aceptado
const TAREA_SIN_ACEPTAR = ['pendiente', 'cancelada'];
const ETAPAS = ['antes', 'durante', 'despues'];
const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const fechaCol = c => `TO_CHAR(t.${c}, 'YYYY-MM-DD') AS ${c}`;
const numCol = c => `t.${c}::float8 AS ${c}`;

const COLUMNAS_SOLICITUD = [
  't.id', fechaCol('fecha'), 't.solicitante', 't.cliente_telefono', 't.cliente_email',
  't.lugar', 't.tipo', 't.detalle', 't.origen',
];
const COLUMNAS_GESTION = [
  numCol('presupuesto_total'), numCol('mano_obra'), numCol('materiales'), numCol('otros_costos'),
  't.forma_pago', fechaCol('presupuesto_ingreso'), fechaCol('presupuesto_enviado'), fechaCol('presupuesto_aceptado_en'),
  't.presupuesto_estado', 't.estado', 't.responsable',
  fechaCol('inicio_previsto'), fechaCol('fin_previsto'), fechaCol('finalizado_en'),
  't.observaciones_internas', 't.creado_en', 't.actualizado_en',
];
const COLUMNA_FOTOS = `COALESCE(
    (SELECT json_agg(json_build_object('id', f.id, 'etapa', f.etapa, 'subida', f.subida_en) ORDER BY f.subida_en)
       FROM fotos f WHERE f.trabajo_id = t.id),
    '[]'::json) AS fotos`;

// Arma el SELECT según los permisos del usuario: sin permiso, la columna
// referido_por ni siquiera se lee de la base.
function selectTrabajos(usuario) {
  const cols = [...COLUMNAS_SOLICITUD, ...COLUMNAS_GESTION, COLUMNA_FOTOS];
  if (usuario.ve_referido) cols.push('t.referido_por');
  return `SELECT ${cols.join(', ')} FROM trabajos t`;
}

const texto = v => (v === null || v === undefined ? '' : String(v)).trim() || null;
const fecha = v => texto(v);
function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function validarSolicitud(body) {
  const d = {
    fecha: fecha(body.fecha),
    solicitante: texto(body.solicitante),
    cliente_telefono: texto(body.cliente_telefono),
    cliente_email: texto(body.cliente_email),
    lugar: texto(body.lugar),
    tipo: texto(body.tipo),
    detalle: texto(body.detalle),
    origen: texto(body.origen),
  };
  const faltan = [];
  if (!d.fecha) faltan.push('fecha de ingreso');
  if (!d.solicitante) faltan.push('cliente / contacto');
  if (!d.lugar) faltan.push('dirección del trabajo');
  if (!d.tipo) faltan.push('tipo de trabajo');
  if (faltan.length) return { error: 'Falta completar: ' + faltan.join(', ') };
  if (d.origen && !ORIGENES.includes(d.origen)) return { error: 'Origen de la consulta inválido' };
  return { datos: d };
}

// Fecha de hoy en Argentina (el servidor puede estar en UTC)
function hoyISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TZ_APP || 'America/Argentina/Cordoba' }).format(new Date());
}

function validarGestion(body) {
  const d = {
    mano_obra: numero(body.mano_obra),
    materiales: numero(body.materiales),
    otros_costos: numero(body.otros_costos),
    presupuesto_total: numero(body.presupuesto_total),
    forma_pago: texto(body.forma_pago),
    presupuesto_ingreso: fecha(body.presupuesto_ingreso),
    presupuesto_enviado: fecha(body.presupuesto_enviado),
    presupuesto_aceptado_en: fecha(body.presupuesto_aceptado_en),
    presupuesto_estado: body.presupuesto_estado || 'pendiente',
    estado: body.estado || 'pendiente',
    responsable: texto(body.responsable),
    inicio_previsto: fecha(body.inicio_previsto),
    fin_previsto: fecha(body.fin_previsto),
    finalizado_en: fecha(body.finalizado_en),
    observaciones_internas: texto(body.observaciones_internas),
  };
  for (const k of ['mano_obra', 'materiales', 'otros_costos', 'presupuesto_total']) {
    if (Number.isNaN(d[k])) return { error: 'Los importes tienen que ser números' };
  }
  // Si no se cargó el total pero sí el detalle, el total es la suma
  const partes = [d.mano_obra, d.materiales, d.otros_costos].filter(v => v !== null);
  if (d.presupuesto_total === null && partes.length) d.presupuesto_total = partes.reduce((a, b) => a + b, 0);
  if (!PRESUPUESTO_ESTADOS.includes(d.presupuesto_estado)) return { error: 'Estado del presupuesto inválido' };
  if (!TAREA_ESTADOS.includes(d.estado)) return { error: 'Estado de la tarea inválido' };
  if (d.presupuesto_estado !== 'aceptado' && !TAREA_SIN_ACEPTAR.includes(d.estado)) {
    return { error: 'La tarea solo se puede asignar o ejecutar con el presupuesto aceptado' };
  }
  if (d.inicio_previsto && d.fin_previsto && d.fin_previsto < d.inicio_previsto) {
    return { error: 'La fecha prevista de finalización no puede ser anterior a la de ejecución' };
  }
  if (d.inicio_previsto && d.finalizado_en && d.finalizado_en < d.inicio_previsto) {
    return { error: 'La fecha real de final de obra no puede ser anterior a la de ejecución' };
  }
  // Fechas de la cronología que se registran solas si no se cargaron a mano
  const hoy = hoyISO();
  if (!d.presupuesto_ingreso && (partes.length || d.presupuesto_total !== null)) d.presupuesto_ingreso = hoy;
  if (d.presupuesto_estado === 'aceptado' && !d.presupuesto_aceptado_en) d.presupuesto_aceptado_en = hoy;
  if (d.estado === 'finalizada' && !d.finalizado_en) d.finalizado_en = hoy;
  return { datos: d };
}

async function obtenerTrabajo(usuario, id) {
  const { rows } = await pool.query(selectTrabajos(usuario) + ' WHERE t.id = $1', [id]);
  return rows[0];
}

// UPDATE parcial: solo las columnas de "datos"
async function actualizarColumnas(id, datos) {
  const claves = Object.keys(datos);
  const sets = claves.map((k, i) => `${k} = $${i + 1}`);
  const { rowCount } = await pool.query(
    `UPDATE trabajos SET ${sets.join(', ')} WHERE id = $${claves.length + 1}`,
    [...claves.map(k => datos[k]), id]
  );
  return rowCount;
}

async function listar(req, res) {
  try {
    const { rows } = await pool.query(selectTrabajos(req.usuario) + ' ORDER BY t.fecha DESC, t.creado_en DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar solicitudes', detalle: err.message });
  }
}

// Alta: se crea solo con los datos del área 1. El presupuesto y el trabajo se
// cargan después, desde el área 2.
async function crear(req, res) {
  const { error, datos } = validarSolicitud(req.body);
  if (error) return res.status(400).json({ error });
  if (req.usuario.ve_referido) datos.referido_por = texto(req.body.referido_por);

  try {
    const claves = Object.keys(datos);
    const { rows } = await pool.query(
      `INSERT INTO trabajos (${claves.join(', ')}) VALUES (${claves.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING id`,
      claves.map(k => datos[k])
    );
    res.status(201).json(await obtenerTrabajo(req.usuario, rows[0].id));
  } catch (err) {
    res.status(500).json({ error: 'Error al crear la solicitud', detalle: err.message });
  }
}

async function actualizarSolicitud(req, res) {
  const { error, datos } = validarSolicitud(req.body);
  if (error) return res.status(400).json({ error });
  // Sin permiso, referido_por no se toca aunque venga en el pedido
  if (req.usuario.ve_referido) datos.referido_por = texto(req.body.referido_por);

  try {
    if (!(await actualizarColumnas(req.params.id, datos))) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json(await obtenerTrabajo(req.usuario, req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar la solicitud', detalle: err.message });
  }
}

async function actualizarGestion(req, res) {
  const { error, datos } = validarGestion(req.body);
  if (error) return res.status(400).json({ error });

  try {
    if (!(await actualizarColumnas(req.params.id, datos))) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json(await obtenerTrabajo(req.usuario, req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar el presupuesto', detalle: err.message });
  }
}

// Datos para el presupuesto que se entrega al cliente. Lista cerrada de
// campos: nunca incluye referido_por, observaciones internas ni responsable.
async function presupuestoCliente(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT t.id AS numero, TO_CHAR(t.fecha, 'YYYY-MM-DD') AS fecha, t.solicitante AS cliente,
              t.lugar, t.tipo, t.detalle,
              t.mano_obra::float8 AS mano_obra, t.materiales::float8 AS materiales,
              t.otros_costos::float8 AS otros_costos, t.presupuesto_total::float8 AS presupuesto_total,
              t.forma_pago, TO_CHAR(t.presupuesto_enviado, 'YYYY-MM-DD') AS presupuesto_enviado
         FROM trabajos t WHERE t.id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al armar el presupuesto', detalle: err.message });
  }
}

async function eliminar(req, res) {
  try {
    const { rowCount } = await pool.query('DELETE FROM trabajos WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar la solicitud', detalle: err.message });
  }
}

// Sube una foto (cuerpo binario) a un trabajo ya creado: ?trabajo_id=1&etapa=antes
async function subirFoto(req, res) {
  const etapa = req.query.etapa;
  const trabajoId = Number(req.query.trabajo_id);
  const mime = (req.headers['content-type'] || '').split(';')[0].trim();
  if (!ETAPAS.includes(etapa)) return res.status(400).json({ error: 'Etapa inválida' });
  if (!Number.isInteger(trabajoId)) return res.status(400).json({ error: 'Falta la solicitud a la que pertenece la foto' });
  if (!MIMES.includes(mime)) return res.status(400).json({ error: 'Formato no compatible. Usá fotos JPG o PNG.', code: 'unsupported_type' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'La foto llegó vacía' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO fotos (trabajo_id, etapa, mime, datos) VALUES ($1,$2,$3,$4)
       RETURNING id, etapa, subida_en AS subida`,
      [trabajoId, etapa, mime, req.body]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'Solicitud no encontrada' });
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

module.exports = {
  listar, crear, actualizarSolicitud, actualizarGestion, presupuestoCliente, eliminar,
  subirFoto, verFoto, eliminarFoto,
};
