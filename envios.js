const crypto = require('crypto');
const express = require('express');
const nodemailer = require('nodemailer');
const pool = require('./db');
const { requireAuth } = require('./auth');
const { datosPresupuesto, obtenerTrabajo, hoyISO } = require('./trabajos-controller');

// Envío del presupuesto al cliente:
//  - cada presupuesto tiene un link público con un token imposible de adivinar
//  - se envía por email (si hay SMTP configurado) o por WhatsApp (link wa.me)
//  - al enviarlo queda marcado como "Enviado" con la fecha del día
//  - desde el link, el cliente puede aceptarlo o rechazarlo y el estado se actualiza solo

const emailConfigurado = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

function transporte() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// URL base de la app para armar el link (APP_URL o la del pedido)
function baseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

// Teléfono a formato internacional para WhatsApp (Argentina por defecto)
function telefonoWhatsApp(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) return d.startsWith('549') ? d : '549' + d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2'); // quita el "15" de celulares
  return '549' + d;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const fmtDate = iso => (iso ? iso.split('-').reverse().join('/') : '');

function mensajeTexto(p, link) {
  return `Hola ${p.cliente}, te enviamos el presupuesto N° ${p.numero} de ${p.empresa.nombre}` +
    ` por ${p.categoria}${p.presupuesto_total != null ? ` (total ${money.format(p.presupuesto_total)})` : ''}.` +
    `\n\nPodés verlo y aceptarlo desde este link:\n${link}\n\nVálido hasta el ${fmtDate(p.fecha_vencimiento)}. ¡Gracias!`;
}

function emailHTML(p, link, logoUrl, mensaje) {
  return `<!doctype html><html><body style="margin:0;background:#F3F1F7;font-family:Arial,Helvetica,sans-serif;color:#1B2529">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:10px;overflow:hidden">
<tr><td align="center" style="padding:24px 24px 8px"><img src="${logoUrl}" alt="${esc(p.empresa.nombre)}" width="200" style="display:block;width:200px;height:auto"></td></tr>
<tr><td style="height:6px;background:#E48100"></td></tr>
<tr><td style="padding:24px 28px">
<p style="font-size:16px;margin:0 0 12px">Hola ${esc(p.cliente)},</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 18px">${esc(mensaje || `Te enviamos el presupuesto para el trabajo de ${p.categoria} en ${p.lugar}.`).replace(/\n/g, '<br>')}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F3FB;border-left:4px solid #2D0069;margin:0 0 20px">
<tr><td style="padding:14px 16px;font-size:14px;line-height:1.6">
<b>Presupuesto N° ${esc(p.numero)}</b><br>${esc(p.categoria)} · ${esc(p.lugar)}<br>
${p.presupuesto_total != null ? `Total: <b style="font-size:18px;color:#2D0069">${money.format(p.presupuesto_total)}</b><br>` : ''}
Válido hasta el ${fmtDate(p.fecha_vencimiento)}</td></tr></table>
<p style="text-align:center;margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#E48100;color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:13px 26px;border-radius:6px">Ver y responder el presupuesto</a></p>
<p style="font-size:12.5px;color:#6A777B;margin:0">Si el botón no funciona, copiá este link en el navegador:<br><a href="${link}" style="color:#2D0069">${link}</a></p>
</td></tr>
<tr><td style="background:#2D0069;color:#fff;font-size:12.5px;padding:14px 28px">${esc(p.empresa.nombre)} · ${esc(p.empresa.lema)}${p.empresa.telefono ? ' · Tel. ' + esc(p.empresa.telefono) : ''}${p.empresa.email ? ' · ' + esc(p.empresa.email) : ''}</td></tr>
</table></td></tr></table></body></html>`;
}

const router = express.Router();

// ---- Configuración (para saber si el email está habilitado) ----
router.get('/api/config', requireAuth, (req, res) => res.json({ email_habilitado: emailConfigurado() }));

// ---- Enviar al cliente (usuario logueado) ----
router.post('/api/trabajos/:id/enviar', requireAuth, async (req, res) => {
  const canal = req.body.canal;
  if (!['email', 'whatsapp', 'link'].includes(canal)) return res.status(400).json({ error: 'Canal de envío inválido' });
  try {
    const { rows } = await pool.query('SELECT presupuesto_token, presupuesto_total, presupuesto_estado FROM trabajos WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (rows[0].presupuesto_total == null) return res.status(400).json({ error: 'Cargá y guardá el importe del presupuesto antes de enviarlo' });

    // Token del link público (se crea una sola vez)
    let token = rows[0].presupuesto_token;
    if (!token) {
      token = crypto.randomBytes(24).toString('base64url');
      await pool.query('UPDATE trabajos SET presupuesto_token = $1 WHERE id = $2', [token, req.params.id]);
    }
    const p = await datosPresupuesto('id', req.params.id);
    const link = `${baseUrl(req)}/p/${token}`;
    const mensaje = (req.body.mensaje || '').trim();
    const resultado = { link };

    if (canal === 'email') {
      if (!emailConfigurado()) return res.status(400).json({ error: 'El envío por email no está configurado (faltan los datos SMTP en Render)' });
      const destino = String(req.body.email || p.cliente_email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) return res.status(400).json({ error: 'Ingresá un email válido del cliente' });
      await transporte().sendMail({
        from: process.env.SMTP_FROM || `"${p.empresa.nombre}" <${process.env.SMTP_USER}>`,
        to: destino,
        replyTo: process.env.EMPRESA_EMAIL || undefined,
        subject: `Presupuesto N° ${p.numero} · ${p.empresa.nombre}`,
        text: mensajeTexto(p, link),
        html: emailHTML(p, link, `${baseUrl(req)}/img/logo-urbania-360.png`, mensaje),
      });
      resultado.enviado_a = destino;
    }
    if (canal === 'whatsapp') {
      const tel = telefonoWhatsApp(req.body.telefono || p.cliente_telefono);
      const texto = (mensaje ? mensaje + '\n\n' : '') + mensajeTexto(p, link);
      resultado.whatsapp_url = `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
      resultado.sin_telefono = !tel;
    }

    // Queda registrado como enviado (salvo que ya esté aceptado o rechazado)
    if (canal !== 'link') {
      await pool.query(
        `UPDATE trabajos SET presupuesto_enviado = COALESCE(presupuesto_enviado, $2),
           presupuesto_estado = CASE WHEN presupuesto_estado IN ('pendiente','en_preparacion') THEN 'enviado' ELSE presupuesto_estado END
         WHERE id = $1`, [req.params.id, hoyISO()]);
    }
    resultado.trabajo = await obtenerTrabajo(req.usuario, req.params.id);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo enviar el presupuesto: ' + err.message });
  }
});

// ---- Link público: el cliente ve y responde el presupuesto (sin login) ----
async function porToken(token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return datosPresupuesto('token', token);
}

router.get('/api/publico/presupuesto/:token', async (req, res) => {
  try {
    const p = await porToken(req.params.token);
    if (!p) return res.status(404).json({ error: 'Este presupuesto no existe o ya no está disponible' });
    p.vencido = p.fecha_vencimiento < hoyISO();
    p.puede_responder = ['enviado', 'en_preparacion', 'pendiente'].includes(p.presupuesto_estado) && !p.vencido;
    // El cliente solo ve su propia información (sin datos internos)
    delete p.id;
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo cargar el presupuesto' });
  }
});

router.post('/api/publico/presupuesto/:token/respuesta', async (req, res) => {
  try {
    const p = await porToken(req.params.token);
    if (!p) return res.status(404).json({ error: 'Este presupuesto no existe o ya no está disponible' });
    if (!['enviado', 'en_preparacion', 'pendiente'].includes(p.presupuesto_estado)) {
      return res.status(409).json({ error: 'Este presupuesto ya fue respondido' });
    }
    if (p.fecha_vencimiento < hoyISO()) return res.status(409).json({ error: 'Este presupuesto está vencido. Contactanos para actualizarlo.' });
    const accion = req.body.accion;
    const nombre = String(req.body.nombre || '').trim().slice(0, 120);
    const motivo = String(req.body.motivo || '').trim().slice(0, 500);
    if (!['aceptar', 'rechazar'].includes(accion)) return res.status(400).json({ error: 'Respuesta inválida' });
    if (!nombre) return res.status(400).json({ error: 'Ingresá tu nombre' });
    const hoy = hoyISO();
    const registro = `${accion === 'aceptar' ? 'Aceptado' : 'Rechazado'} online por ${nombre} el ${fmtDate(hoy)}`;
    if (accion === 'aceptar') {
      await pool.query(
        `UPDATE trabajos SET presupuesto_estado = 'aceptado', presupuesto_aceptado_en = $2, respuesta_cliente = $3
         WHERE presupuesto_token = $1`, [req.params.token, hoy, registro]);
    } else {
      await pool.query(
        `UPDATE trabajos SET presupuesto_estado = 'rechazado', respuesta_cliente = $2,
           motivo_rechazo = COALESCE(NULLIF($3, ''), motivo_rechazo)
         WHERE presupuesto_token = $1`, [req.params.token, registro, motivo ? `${motivo} (indicado por el cliente)` : '']);
    }
    res.json({ ok: true, estado: accion === 'aceptar' ? 'aceptado' : 'rechazado' });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo registrar la respuesta' });
  }
});

module.exports = { router, telefonoWhatsApp };
