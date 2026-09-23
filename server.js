require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');

const pool = require('./db');
const auth = require('./auth');
const apiRoutes = require('./api-routes');

const app = express();
app.use(express.json());

app.use('/api/auth', auth.router);
app.use('/api', apiRoutes);
app.use(express.static(path.join(__dirname, 'public')));

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
    console.error('Error preparando la base de datos:', err.message);
  }
  app.listen(PORT, () => console.log(`Urbania 360 corriendo en el puerto ${PORT}`));
})();
