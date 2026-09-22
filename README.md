# Urbania 360

Libro de pedidos de mantenimiento y obra. Aplicación independiente:
backend (Node/Express + PostgreSQL) + página web, con su propio login.

## Qué hace

- Carga de pedidos: fecha, quién lo pide, para dónde, tipo de trabajo,
  observaciones y presupuesto
- Presupuesto: aceptado / no aceptado / a confirmar
- Estado de la tarea: pendiente / en ejecución / finalizada
- Fotos de cada trabajo en tres etapas: antes, durante y después
  (se achican a 2000 px antes de subirse y se guardan en la base)
- Resumen con totales, búsqueda, filtros y orden
- Exportar la planilla filtrada a CSV (abre en Excel)

## Puesta en marcha

1. Base PostgreSQL vacía. Las tablas se crean solas al arrancar
   (`schema.sql`).
2. Copiá `.env.example` a `.env` y completá `DATABASE_URL` y `JWT_SECRET`.
3. `npm install`
4. Crear un usuario, de una de estas dos formas:
   - `node crear-usuario.js "Tu Nombre" tu@email.com tuContraseña`
   - o definir `SEED_ADMIN_NOMBRE`, `SEED_ADMIN_EMAIL` y
     `SEED_ADMIN_PASSWORD` en el entorno (sirve en Render, sin Shell).
5. `npm start` y abrir `http://localhost:3000`.

## Deploy en Render (un clic)

El repo trae `render.yaml`, que crea la base PostgreSQL propia de la app
(plan pago `basic-256mb`) y el servicio web, con todo conectado.

1. Abrí https://render.com/deploy?repo=https://github.com/eufraciososaestani-cmyk/urbania-360
   (o en Render: **New → Blueprint** y elegí este repositorio).
2. Render pide tres datos: `SEED_ADMIN_NOMBRE`, `SEED_ADMIN_EMAIL` y
   `SEED_ADMIN_PASSWORD`. Son tu nombre, email y contraseña para entrar.
3. **Apply**. En unos minutos la app queda en la dirección que muestre Render.

`DATABASE_URL` y `JWT_SECRET` se completan solos. Las tablas se crean en
el schema `urbania` de esa base (configurable con `DB_SCHEMA`).

Nota: el servicio web está en plan gratis, que se duerme tras 15 min sin
uso (la primera carga tarda ~1 min). Se puede pasar a pago desde Render.

## API

Todas requieren `Authorization: Bearer <token>` (salvo el login).

| Método | Ruta | Qué hace |
| --- | --- | --- |
| POST | `/api/auth/login` | Devuelve el token |
| GET | `/api/trabajos` | Lista pedidos con sus fotos |
| POST | `/api/trabajos` | Crea un pedido (`foto_ids` asocia fotos ya subidas) |
| PUT | `/api/trabajos/:id` | Actualiza un pedido |
| DELETE | `/api/trabajos/:id` | Elimina el pedido y sus fotos |
| POST | `/api/fotos?etapa=antes&trabajo_id=1` | Sube una foto (cuerpo binario de la imagen) |
| GET | `/api/fotos/:id` | Devuelve la imagen (acepta también `?t=<token>`) |
| DELETE | `/api/fotos/:id` | Quita una foto |
