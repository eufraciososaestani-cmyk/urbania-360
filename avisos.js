// Aviso por WhatsApp cuando entra (o pasa a) una solicitud de urgencia ALTA.
//  - AVISO_URGENTE_TELEFONO: a quién avisar (por ejemplo, Diego).
//  - AVISO_CALLMEBOT_APIKEY (opcional): si está, el aviso se manda solo por
//    CallMeBot a ese teléfono. Si no, la app abre WhatsApp con el mensaje
//    listo para mandarlo a esa persona o al grupo de Urbania.

const fmtDate = iso => (iso ? iso.split('-').reverse().join('/') : '');

function telefonoWhatsApp(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) return d.startsWith('549') ? d : '549' + d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2'); // quita el "15" de celulares
  return '549' + d;
}

// "3518900090" -> "351 890-0090" para mostrarlo en la app
function telefonoLegible(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}` : String(tel || '').trim();
}

function mensajeUrgente(t, base) {
  const trabajo = [t.tipo, t.detalle].filter(Boolean).join(' – ');
  return [
    `🔴 *SOLICITUD URGENTE* · Urbania 360`,
    ``,
    `*Nombre:* ${t.solicitante}`,
    `*Fecha:* ${fmtDate(t.fecha)}`,
    `*Trabajo a realizar:* ${trabajo}`,
    `*Dirección:* ${t.lugar}`,
    t.cliente_telefono ? `*Teléfono:* ${t.cliente_telefono}` : null,
    `*Solicitud N°:* ${t.id}`,
    base ? `\nVer en la app: ${base}` : null,
  ].filter(v => v !== null).join('\n');
}

// Envío automático por CallMeBot al teléfono de avisos (si está configurado)
const whatsappAutomatico = () => !!(process.env.AVISO_URGENTE_TELEFONO && process.env.AVISO_CALLMEBOT_APIKEY);
async function enviarWhatsAppAuto(mensaje) {
  if (!whatsappAutomatico()) return false;
  try {
    const tel = telefonoWhatsApp(process.env.AVISO_URGENTE_TELEFONO);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${tel}&text=${encodeURIComponent(mensaje)}&apikey=${encodeURIComponent(process.env.AVISO_CALLMEBOT_APIKEY)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return true;
  } catch (err) {
    console.error('No se pudo enviar el aviso por WhatsApp:', err.message);
    return false;
  }
}

// Envío automático a un GRUPO de WhatsApp con Green-API (green-api.com):
// un número de WhatsApp vinculado por QR que escribe en el grupo de Urbania.
//  WHATSAPP_GRUPO_INSTANCIA, WHATSAPP_GRUPO_TOKEN: datos de la instancia
//  WHATSAPP_GRUPO_ID: id del grupo (termina en @g.us)
//  WHATSAPP_API_URL (opcional): la URL de la API que muestra Green-API
const grupoConfigurado = () => !!(process.env.WHATSAPP_GRUPO_INSTANCIA && process.env.WHATSAPP_GRUPO_TOKEN && process.env.WHATSAPP_GRUPO_ID);
function greenApi(metodo) {
  const base = (process.env.WHATSAPP_API_URL || 'https://api.green-api.com').replace(/\/+$/, '');
  return `${base}/waInstance${process.env.WHATSAPP_GRUPO_INSTANCIA}/${metodo}/${process.env.WHATSAPP_GRUPO_TOKEN}`;
}
async function enviarAlGrupo(mensaje) {
  if (!grupoConfigurado()) return false;
  try {
    const res = await fetch(greenApi('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: process.env.WHATSAPP_GRUPO_ID, message: mensaje }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
    return true;
  } catch (err) {
    console.error('No se pudo enviar el aviso al grupo de WhatsApp:', err.message);
    return false;
  }
}
// Grupos del número vinculado (para encontrar el id del grupo de Urbania)
async function gruposDisponibles() {
  if (!process.env.WHATSAPP_GRUPO_INSTANCIA || !process.env.WHATSAPP_GRUPO_TOKEN) throw new Error('Falta configurar la instancia de Green-API');
  const res = await fetch(greenApi('getContacts'), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return (await res.json()).filter(c => c.type === 'group' || String(c.id).endsWith('@g.us')).map(c => ({ id: c.id, nombre: c.name || c.contactName || '' }));
}

// Datos para el botón "Enviar a <teléfono>" con el mensaje listo
function botonWhatsApp(mensaje) {
  const tel = telefonoWhatsApp(process.env.AVISO_URGENTE_TELEFONO);
  return {
    destinatario: process.env.AVISO_URGENTE_NOMBRE || (tel ? telefonoLegible(process.env.AVISO_URGENTE_TELEFONO) : ''),
    whatsapp_url: tel ? `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}` : null,
  };
}

async function avisarUrgente(t, base) {
  const mensaje = mensajeUrgente(t, base);
  const tel = telefonoWhatsApp(process.env.AVISO_URGENTE_TELEFONO);
  const r = {
    mensaje,
    destinatario: process.env.AVISO_URGENTE_NOMBRE || (tel ? telefonoLegible(process.env.AVISO_URGENTE_TELEFONO) : ''),
    whatsapp_url: tel ? `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}` : null,
    automatico: false,
  };
  const [persona, grupo] = await Promise.all([
    whatsappAutomatico() ? enviarWhatsAppAuto(mensaje) : null,
    grupoConfigurado() ? enviarAlGrupo(mensaje) : null,
  ]);
  r.automatico = persona === true;
  r.grupo_automatico = grupo === true;
  if (persona === false || grupo === false) r.error = 'No se pudo enviar el aviso automático';
  return r;
}

module.exports = { avisarUrgente, botonWhatsApp, whatsappAutomatico, enviarWhatsAppAuto, enviarAlGrupo, gruposDisponibles, grupoConfigurado, telefonoWhatsApp };
