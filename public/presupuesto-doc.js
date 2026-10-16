// Documento del presupuesto para el cliente, con la identidad de Urbania 360.
// Lo usan la app ("Ver presupuesto") y el link público que recibe el cliente,
// así los dos muestran exactamente lo mismo. Solo usa datos para el cliente.
(function(){
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0});
  const fmtDate = iso => { if(!iso) return "—"; const [y,m,d]=iso.split("-"); return `${d}/${m}/${y}`; };
  const lineas = t => String(t||"").split(/\n+/).map(x=>x.replace(/^[-•*·]\s*/,"").trim()).filter(Boolean);

  // Paleta de la marca: violeta y naranja del logo
  const ESTILOS = `
@page{size:A4;margin:14mm}
.u360-doc *{box-sizing:border-box}
.u360-doc{--violeta:#2D0069;--violeta-suave:#F3EFFA;--naranja:#E48100;--naranja-suave:#FDF1E2;--tinta:#1F1830;--gris:#6B6478;--linea:#E3DEEA;
  color:var(--tinta);font:14px/1.5 "Montserrat","Barlow",system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.u360-doc .hoja{max-width:820px;margin:0 auto;background:#fff;box-shadow:0 10px 40px rgba(45,0,105,.12);border-radius:4px;overflow:hidden}
.u360-doc .cab{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:24px 34px 18px;border-bottom:4px solid var(--naranja)}
.u360-doc .cab img{height:120px;width:auto;display:block}
.u360-doc .num{text-align:right;background:var(--violeta);color:#fff;padding:12px 18px;border-radius:6px}
.u360-doc .num small{display:block;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#FFC97A}
.u360-doc .num b{font-size:22px;letter-spacing:.02em}
.u360-doc .cuerpo{padding:30px 34px}
.u360-doc .fechas{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--linea);border-radius:6px;margin-bottom:22px;overflow:hidden}
.u360-doc .fechas div{padding:10px 14px;border-left:1px solid var(--linea)}.u360-doc .fechas div:first-child{border-left:0}
.u360-doc .k{display:block;font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gris);margin-bottom:3px}
.u360-doc .fechas b{font-size:15.5px}
.u360-doc .partes{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:8px}
.u360-doc .caja{background:var(--violeta-suave);border-left:4px solid var(--violeta);padding:12px 16px;border-radius:0 6px 6px 0}
.u360-doc .caja b{font-size:15.5px}
.u360-doc h2{font-size:15px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--violeta);margin:24px 0 8px;padding-bottom:6px;border-bottom:2px solid var(--violeta)}
.u360-doc .cat{display:inline-block;background:var(--naranja-suave);color:#9A5400;font-weight:700;padding:3px 12px;border-radius:999px;font-size:13px;margin-bottom:8px}
.u360-doc p{margin:0 0 8px}
.u360-doc ul{margin:6px 0 0;padding-left:20px}.u360-doc li{margin:2px 0}.u360-doc li::marker{color:var(--naranja)}
.u360-doc table{width:100%;border-collapse:collapse;margin-top:4px}
.u360-doc td{padding:10px 0;border-bottom:1px solid var(--linea)}
.u360-doc .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.u360-doc tr.tot td{border:0;padding-top:14px}
.u360-doc tr.sub td{font-weight:700;border-bottom:2px solid var(--linea)}
.u360-doc table.resumen{background:var(--naranja-suave);border-radius:6px}
.u360-doc table.resumen td{padding:10px 16px}
.u360-doc tr.tot td:first-child{font-size:17px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--violeta)}
.u360-doc tr.tot td.n{font-size:26px;font-weight:800;color:var(--naranja)}
.u360-doc .pago{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}
.u360-doc .firmas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:44px}
.u360-doc .firmas div{border-top:1px solid var(--tinta);padding-top:6px;text-align:center;font-size:12.5px;color:var(--gris)}
.u360-doc .pie{background:var(--violeta);color:#fff;padding:14px 34px;font-size:12.5px;display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px}
.u360-doc .pie b{color:#FFC97A}
@media (max-width:640px){.u360-doc .cuerpo{padding:20px}.u360-doc .cab{padding:18px 20px;flex-direction:column;align-items:flex-start}.u360-doc .cab img{height:76px}.u360-doc .num{text-align:left}
  .u360-doc .fechas,.u360-doc .partes,.u360-doc .pago,.u360-doc .firmas{grid-template-columns:1fr}.u360-doc .fechas div{border-left:0;border-top:1px solid var(--linea)}.u360-doc .fechas div:first-child{border-top:0}}
@media print{.u360-doc .hoja{box-shadow:none;max-width:none;border-radius:0}}`;

  function cuerpo(p, logoUrl){
    const e=p.empresa||{}, nl=t=>esc(t).replace(/\n/g,"<br>");
    const fila=(k,v)=>v!=null?`<tr><td>${k}</td><td class="n">${money.format(v)}</td></tr>`:"";
    const contacto=[e.telefono&&`Tel. ${esc(e.telefono)}`, e.email&&esc(e.email), e.web&&esc(e.web)].filter(Boolean).join(" · ");
    const mats=lineas(p.materiales_detalle), conds=lineas(p.condiciones);
    const extras=(Array.isArray(p.extras)?p.extras:[]).map(x=>({descripcion:x.descripcion, importe:Number(x.importe)||0}));
    const extrasTotal=extras.reduce((t,x)=>t+x.importe,0);
    const subtotal = p.subtotal_trabajo!=null ? p.subtotal_trabajo : (extras.length ? null : p.presupuesto_total);
    return `<div class="u360-doc"><div class="hoja">
  <header class="cab">
    <img src="${esc(logoUrl)}" alt="${esc(e.nombre||"Urbania 360")} · ${esc(e.lema||"")}">
    <div class="num"><small>Presupuesto</small><b>N° ${esc(p.numero)}</b></div>
  </header>
  <div class="cuerpo">
    <div class="fechas">
      <div><span class="k">Fecha de emisión</span><b>${fmtDate(p.fecha_emision)}</b></div>
      <div><span class="k">Válido hasta</span><b>${fmtDate(p.fecha_vencimiento)}</b></div>
      <div><span class="k">Validez</span><b>${esc(p.validez_dias)} días</b></div>
    </div>
    <div class="partes">
      <div class="caja"><span class="k">Cliente · consorcio · administrador</span><b>${esc(p.cliente)}</b>${p.cliente_telefono||p.cliente_email?`<div>${[p.cliente_telefono,p.cliente_email].filter(Boolean).map(esc).join(" · ")}</div>`:""}</div>
      <div class="caja"><span class="k">Dirección de la propiedad</span><b>${esc(p.lugar)}</b></div>
    </div>
    <h2>Trabajo a realizar</h2>
    <span class="cat">${esc(p.categoria)}</span>
    ${p.descripcion?`<p>${nl(p.descripcion)}</p>`:`<p style="color:#6B6478">Sin descripción cargada.</p>`}
    ${mats.length?`<h2>Materiales incluidos</h2><ul>${mats.map(m=>`<li>${esc(m)}</li>`).join("")}</ul>`:""}
    <h2>Detalle de costos</h2>
    <table>${fila("Mano de obra",p.mano_obra)}${fila("Materiales",p.materiales)}${fila("Otros costos",p.otros_costos)}
      <tr class="sub"><td>Subtotal del trabajo</td><td class="n">${subtotal!=null?money.format(subtotal):"A definir"}</td></tr></table>
    ${extras.length?`<h2>Agregados extras</h2>
    <table>${extras.map(x=>`<tr><td>${esc(x.descripcion)}</td><td class="n">${money.format(x.importe)}</td></tr>`).join("")}
      <tr class="sub"><td>Subtotal agregados extras</td><td class="n">${money.format(extrasTotal)}</td></tr></table>`:""}
    <h2>Resumen del presupuesto</h2>
    <table class="resumen">
      <tr><td>Subtotal del trabajo</td><td class="n">${subtotal!=null?money.format(subtotal):"—"}</td></tr>
      ${extras.length?`<tr><td>Agregados extras</td><td class="n">${money.format(extrasTotal)}</td></tr>`:""}
      <tr class="tot"><td>Total general</td><td class="n">${p.presupuesto_total!=null?money.format(p.presupuesto_total):"A definir"}</td></tr></table>
    <div class="pago">
      <div class="caja"><span class="k">Forma de pago</span><b>${p.forma_pago?esc(p.forma_pago):"A convenir"}</b></div>
      <div class="caja"><span class="k">Vencimiento del presupuesto</span><b>${fmtDate(p.fecha_vencimiento)}</b></div>
    </div>
    ${conds.length?`<h2>Condiciones</h2><ul>${conds.map(c=>`<li>${esc(c)}</li>`).join("")}</ul>`:""}
    <div class="firmas"><div>Por ${esc(e.nombre||"Urbania 360")}</div><div>Conformidad del cliente — firma y aclaración</div></div>
  </div>
  <footer class="pie"><span><b>${esc(e.nombre||"Urbania 360")}</b> · ${esc(e.lema||"")}${e.direccion?` · ${esc(e.direccion)}`:""}${e.cuit?` · CUIT ${esc(e.cuit)}`:""}</span><span>${contacto}</span></footer>
</div></div>`;
  }

  // Página completa para imprimir / guardar en PDF (se abre en otra pestaña)
  function documento(p, logoUrl){
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Presupuesto ${esc(p.numero)} · ${esc((p.empresa||{}).nombre||"Urbania 360")}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap">
<style>body{margin:0;background:#EEEAF4;padding:24px 12px}${ESTILOS}
.acciones{max-width:820px;margin:16px auto 10px;display:flex;justify-content:flex-end;gap:8px}
.acciones button{font:600 14px system-ui,sans-serif;border:0;border-radius:6px;padding:10px 16px;cursor:pointer;background:#E48100;color:#fff}
.acciones button.sec{background:#fff;color:#2D0069;border:1px solid #CFC6DD}
@media print{body{background:#fff;padding:0}.acciones{display:none}}</style></head><body>
${cuerpo(p, logoUrl)}
<div class="acciones"><button class="sec" onclick="window.close()">Cerrar</button><button class="print" onclick="print()">Imprimir / guardar PDF</button></div>
</body></html>`;
  }

  window.U360Presupuesto = { ESTILOS, cuerpo, documento, esc, money, fmtDate };
})();
