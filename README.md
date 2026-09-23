# Urbania 360

Gestión de solicitudes y trabajos de mantenimiento y obra. Aplicación independiente:
backend (Node/Express + PostgreSQL) + página web, con su propio login.

## Qué hace

La app tiene dos áreas separadas, cada una con su propia pantalla, lista,
indicadores y ficha. Desde una solicitud se pasa a su presupuesto (y
vuelta) sin mezclar la información:

**1 · Solicitud de pedido**
- Fecha de ingreso, de dónde entra la consulta (WhatsApp, teléfono, web,
  redes sociales, recomendación, otro) y tipo de trabajo
- Detalle de lo que solicita el cliente
- Datos del cliente / contacto (nombre, teléfono, email, dirección)
- **Referido por**: dato interno. Solo lo ven y modifican los usuarios con
  permiso; a los demás el servidor ni siquiera se lo envía. Nunca aparece
  en el presupuesto para el cliente.

**2 · Presupuestos y trabajos** (el presupuesto se carga una vez creada la solicitud)
- Mano de obra, materiales, otros costos y total (se calcula solo)
- Forma de pago y fecha de envío del presupuesto
- Estado del presupuesto: pendiente, en preparación, enviado, aceptado,
  rechazado (aceptado/rechazado se destacan con color e ícono)
- Gestión de la tarea: pendiente, asignada, en proceso, finalizada,
  cancelada. Asignar o ejecutar requiere el presupuesto aceptado.
- Quién realiza el trabajo, fecha prevista de inicio y de finalización
- Observaciones internas
- Fotos: antes, durante y después / finalizado
- **Presupuesto para el cliente**: documento imprimible (o PDF) con solo
  los datos para el cliente

**3 · Análisis**
- Período por fecha de ingreso (desde / hasta, o últimos 30 días, 90 días,
  este año, todo)
- Indicadores: solicitudes, presupuestos enviados, tasa de aceptación,
  monto aceptado, ticket promedio, días promedio hasta presupuestar y
  trabajos finalizados
- Gráficos: solicitudes por mes, embudo del pedido al trabajo terminado,
  por origen, por tipo de trabajo y por responsable
- Referidos (solo usuarios autorizados): solicitudes, aceptados, tasa y
  monto aceptado por cada referido

Además: resumen por estado, búsqueda y filtros, exportar a planilla (CSV)
y administración de usuarios.

## Usuarios y permisos

- **Administrador**: ve “Referido por” y gestiona usuarios (botón *Usuarios*).
- **Empleado**: por defecto no ve “Referido por”. Un administrador puede
  darle ese permiso con la casilla *Ve “Referido por”*.

Los permisos se verifican en el servidor en cada pedido, así que un cambio
se aplica al instante. El usuario creado con `SEED_ADMIN_*` o con
`crear-usuario.js` es administrador.

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
| GET | `/api/auth/yo` | Datos y permisos del usuario logueado |
| GET/POST | `/api/auth/usuarios` | Lista / crea usuarios (admin) |
| PUT/DELETE | `/api/auth/usuarios/:id` | Cambia permisos o contraseña / elimina (admin) |
| GET | `/api/trabajos` | Lista solicitudes con sus fotos (`referido_por` solo con permiso) |
| POST | `/api/trabajos` | Crea una solicitud (área 1) |
| PUT | `/api/trabajos/:id/solicitud` | Guarda el área 1 |
| PUT | `/api/trabajos/:id/gestion` | Guarda el área 2 |
| GET | `/api/trabajos/:id/presupuesto-cliente` | Datos del presupuesto para el cliente (sin datos internos) |
| DELETE | `/api/trabajos/:id` | Elimina la solicitud y sus fotos |
| POST | `/api/fotos?etapa=antes&trabajo_id=1` | Sube una foto (cuerpo binario de la imagen) |
| GET | `/api/fotos/:id` | Devuelve la imagen (acepta también `?t=<token>`) |
| DELETE | `/api/fotos/:id` | Quita una foto |
