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

async function avisarUrgente(t, base) {
  const mensaje = mensajeUrgente(t, base);
  const tel = telefonoWhatsApp(process.env.AVISO_URGENTE_TELEFONO);
  const r = {
    mensaje,
    destinatario: process.env.AVISO_URGENTE_NOMBRE || (tel ? 'el responsable' : ''),
    whatsapp_url: tel ? `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}` : null,
    automatico: false,
  };
  const apikey = process.env.AVISO_CALLMEBOT_APIKEY;
  if (tel && apikey) {
    try {
      const url = `https://api.callmebot.com/whatsapp.php?phone=${tel}&text=${encodeURIComponent(mensaje)}&apikey=${encodeURIComponent(apikey)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      r.automatico = true;
    } catch (err) {
      console.error('No se pudo enviar el aviso urgente por WhatsApp:', err.message);
      r.error = 'No se pudo enviar el aviso automático';
    }
  }
  return r;
}

module.exports = { avisarUrgente, telefonoWhatsApp };
