require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');

const pool = require('./db');
const auth = require('./auth');
const apiRoutes = require('./api-routes');
const envios = require('./envios');

const app = express();
// Render está detrás de un proxy: así req.protocol da https para armar los links
app.set('trust proxy', true);
app.use(express.json());

app.use('/api/auth', auth.router);
app.use(envios.router); // envío al cliente y link público (antes que las rutas con login)
app.use('/api', apiRoutes);
app.use(express.static(path.join(__dirname, 'public')));
// Link público del presupuesto para el cliente
app.get('/p/:token', (req, res) => res.sendFile(path.join(__dirname, 'public', 'presupuesto.html')));
// Generador de Excel para la sección "Exportar" (se sirve desde el propio servidor)
app.get('/vendor/xlsx.full.min.js', (req, res) => res.sendFile(require.resolve('xlsx/dist/xlsx.full.min.js')));

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    // Crea las tablas si todavía no existen
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${pool.SCHEMA}`);
    await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    const { SEED_ADMIN_NOMBRE, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
    if (SEED_ADMIN_NOMBRE && SEED_ADMIN_EMAIL && SEED_ADMIN_PASSWORD) {
      await auth.guardarAdmin(SEED_ADMIN_NOMBRE, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);
      console.log(`Usuario listo: ${SEED_ADMIN_EMAIL}`);
    }
  } catch (err) {
    // Diagnóstico sin mostrar la contraseña: a qué host intenta conectarse y por qué falla
    let destino = 'DATABASE_URL vacía';
    try { if (process.env.DATABASE_URL) { const u = new URL(process.env.DATABASE_URL); destino = `${u.hostname}:${u.port || 5432}/${u.pathname.slice(1)}`; } }
    catch (e) { destino = 'DATABASE_URL con formato inválido'; }
    const causa = err.message || err.code || (err.errors && err.errors.map(e => e.code || e.message).join(', ')) || String(err);
    console.error(`Error preparando la base de datos (${destino}): ${causa}`);
  }
  app.listen(PORT, () => console.log(`Urbania 360 corriendo en el puerto ${PORT}`));
})();
