const express = require('express');
const webpush = require('web-push');
const pool = require('./db');
const { requireAuth, requireAdmin } = require('./auth');
const { enviarWhatsAppAuto, enviarAlGrupo, gruposDisponibles } = require('./avisos');
const { emailConfigurado, transporte } = require('./correo');

// Notificaciones para el equipo (por ahora: el cliente aceptó o rechazó el
// presupuesto desde el link). Cada aviso:
//  - queda en la campanita de la app (con no leídas por usuario)
//  - llega como notificación al celular o la computadora donde se activaron
//    (Web Push; las claves se generan solas y se guardan en la base)
//  - va al grupo de WhatsApp de Urbania (Green-API), a un teléfono (CallMeBot)
//    y por email, si están configurados

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
let clavePublica = null;

// Claves VAPID: de las variables de entorno o, si no están, de la base (se crean la primera vez)
async function iniciar() {
  try {
    let pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
      const { rows } = await pool.query("SELECT clave, valor FROM config WHERE clave IN ('vapid_public', 'vapid_private')");
      const c = Object.fromEntries(rows.map(r => [r.clave, r.valor]));
      if (c.vapid_public && c.vapid_private) ({ vapid_public: pub, vapid_private: priv } = c);
      else {
        ({ publicKey: pub, privateKey: priv } = webpush.generateVAPIDKeys());
        await pool.query("INSERT INTO config (clave, valor) VALUES ('vapid_public', $1), ('vapid_private', $2) ON CONFLICT (clave) DO NOTHING", [pub, priv]);
        // Si otra instancia las creó al mismo tiempo, se usan las guardadas
        const { rows: r2 } = await pool.query("SELECT clave, valor FROM config WHERE clave IN ('vapid_public', 'vapid_private')");
        const c2 = Object.fromEntries(r2.map(r => [r.clave, r.valor]));
        pub = c2.vapid_public; priv = c2.vapid_private;
      }
    }
    webpush.setVapidDetails('mailto:' + (process.env.EMPRESA_EMAIL || process.env.SMTP_USER || 'avisos@urbania360.app'), pub, priv);
    clavePublica = pub;
  } catch (err) {
    console.error('No se pudieron preparar las notificaciones push:', err.message);
  }
}

async function enviarPush(payload) {
  if (!clavePublica) return;
  const { rows } = await pool.query('SELECT id, endpoint, p256dh, auth FROM push_suscripciones');
  await Promise.all(rows.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86400 });
    } catch (err) {
      // El dispositivo dio de baja la suscripción: se borra
      if (err.statusCode === 404 || err.statusCode === 410) await pool.query('DELETE FROM push_suscripciones WHERE id = $1', [s.id]);
      else console.error('Push:', err.statusCode || err.message);
    }
  }));
}

async function enviarEmail(titulo, texto) {
  const destino = process.env.AVISO_EMAIL || process.env.EMPRESA_EMAIL || process.env.SMTP_USER;
  if (!emailConfigurado() || !destino) return;
  try {
    await transporte().sendMail({ from: `"Urbania 360" <${process.env.SMTP_USER}>`, to: destino, subject: titulo, text: texto });
  } catch (err) {
    console.error('Email de aviso:', err.message);
  }
}

async function notificar({ trabajoId, tipo, titulo, mensaje, whatsapp, base }) {
  await pool.query('INSERT INTO notificaciones (trabajo_id, tipo, titulo, mensaje) VALUES ($1,$2,$3,$4)', [trabajoId, tipo, titulo, mensaje]);
  await Promise.all([
    enviarPush({ titulo, mensaje, url: `/?trabajo=${trabajoId}`, tag: `trabajo-${trabajoId}` }).catch(err => console.error('Push:', err.message)),
    enviarWhatsAppAuto(whatsapp),
    enviarAlGrupo(whatsapp),
    enviarEmail(titulo, whatsapp.replace(/\*/g, '')),
  ]);
}

// El cliente respondió desde el link público
function respuestaCliente(p, accion, nombre, motivo, base) {
  const acepto = accion === 'aceptar';
  const total = p.presupuesto_total != null ? money.format(p.presupuesto_total) : '';
  const titulo = acepto ? `✅ ${p.cliente} aceptó el presupuesto` : `❌ ${p.cliente} rechazó el presupuesto`;
  const mensaje = [`N° ${p.numero} · ${p.categoria}${total ? ' · ' + total : ''}`,
    acepto ? `Aceptado por ${nombre}` : `Rechazado por ${nombre}${motivo ? ': ' + motivo : ''}`].join('\n');
  const whatsapp = [
    acepto ? '✅ *PRESUPUESTO ACEPTADO* · Urbania 360' : '❌ *PRESUPUESTO RECHAZADO* · Urbania 360',
    '',
    `*Cliente:* ${p.cliente}`,
    `*Presupuesto N°:* ${p.numero}`,
    `*Trabajo:* ${p.categoria}`,
    `*Dirección:* ${p.lugar}`,
    total ? `*Total:* ${total}` : null,
    `*${acepto ? 'Aceptado' : 'Rechazado'} por:* ${nombre}`,
    !acepto && motivo ? `*Motivo:* ${motivo}` : null,
    base ? `\nVer en la app: ${base}/?trabajo=${p.id}` : null,
  ].filter(v => v !== null).join('\n');
  return notificar({ trabajoId: p.id, tipo: acepto ? 'aceptado' : 'rechazado', titulo, mensaje, whatsapp, base });
}

const router = express.Router();

// Últimas notificaciones y cuántas no vio este usuario
router.get('/api/notificaciones', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.trabajo_id, n.tipo, n.titulo, n.mensaje, n.creada_en,
              n.creada_en > u.notif_vistas_en AS nueva
         FROM notificaciones n, usuarios u WHERE u.id = $1
        ORDER BY n.creada_en DESC LIMIT 40`, [req.usuario.id]);
    res.json({ items: rows, no_leidas: rows.filter(r => r.nueva).length, push_clave: clavePublica });
  } catch (err) {
    res.status(500).json({ error: 'Error al leer las notificaciones' });
  }
});

router.post('/api/notificaciones/vistas', requireAuth, async (req, res) => {
  await pool.query('UPDATE usuarios SET notif_vistas_en = NOW() WHERE id = $1', [req.usuario.id]).catch(() => {});
  res.json({ ok: true });
});

// Alta y baja de un dispositivo para las notificaciones push
router.post('/api/push/suscribir', requireAuth, async (req, res) => {
  const s = req.body || {};
  if (!s.endpoint || !s.keys || !s.keys.p256dh || !s.keys.auth) return res.status(400).json({ error: 'Suscripción inválida' });
  try {
    await pool.query(
      `INSERT INTO push_suscripciones (usuario_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
       ON CONFLICT (endpoint) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.usuario.id, s.endpoint, s.keys.p256dh, s.keys.auth]);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo activar el aviso en este dispositivo' });
  }
});

router.post('/api/push/desuscribir', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM push_suscripciones WHERE endpoint = $1', [String((req.body || {}).endpoint || '')]).catch(() => {});
  res.json({ ok: true });
});

// Solo admin: lista los grupos del número vinculado para elegir el de Urbania
router.get('/api/whatsapp/grupos', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await gruposDisponibles()); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = { router, iniciar, respuestaCliente };
