const { Pool } = require('pg');

// Todas las tablas de Urbania 360 viven en su propio schema de PostgreSQL
// ("urbania" por defecto). Así la app puede compartir una base con otros
// sistemas sin leer ni tocar ninguna de sus tablas.
const SCHEMA = process.env.DB_SCHEMA || 'urbania';
if (!/^[a-z_][a-z0-9_]*$/.test(SCHEMA)) throw new Error('DB_SCHEMA inválido: ' + SCHEMA);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
  options: `-c search_path=${SCHEMA}`,
});

pool.SCHEMA = SCHEMA;
module.exports = pool;
