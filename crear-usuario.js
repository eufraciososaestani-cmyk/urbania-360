// Uso: node crear-usuario.js "Nombre" email@ejemplo.com contraseña
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');
const { guardarUsuario } = require('./auth');

(async () => {
  const [nombre, email, password] = process.argv.slice(2);
  if (!nombre || !email || !password) {
    console.log('Uso: node crear-usuario.js "Nombre" email@ejemplo.com contraseña');
    process.exit(1);
  }
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${pool.SCHEMA}`);
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  await guardarUsuario(nombre, email, password);
  console.log(`Usuario listo: ${email}`);
  await pool.end();
})().catch(err => { console.error(err.message); process.exit(1); });
