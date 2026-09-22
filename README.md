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

El repo trae `render.yaml`, que crea el servicio web. No crea una base
nueva (el plan gratis de Render permite una sola por cuenta): usa una base
PostgreSQL que ya tengas. Las tablas de la app se crean en su propio
schema `urbania` (configurable con `DB_SCHEMA`), así que no lee ni toca
ninguna otra tabla de esa base.

1. En Render, abrí tu base PostgreSQL → **Connect** → copiá la
   **Internal Database URL**.
2. Abrí https://render.com/deploy?repo=https://github.com/eufraciososaestani-cmyk/urbania-360
   (o en Render: **New → Blueprint** y elegí este repositorio).
3. Completá lo que pide:
   - `DATABASE_URL`: la URL que copiaste en el paso 1.
   - `SEED_ADMIN_NOMBRE`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`: tu
     nombre, email y contraseña para entrar.
4. **Apply**. En unos minutos la app queda en la dirección que muestre Render.

`JWT_SECRET` se genera solo.

Nota: el plan gratis de Render duerme el servicio tras 15 min sin uso
(la primera carga tarda ~1 min) y la base gratis vence a los 30 días.

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
