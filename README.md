# Urbania 360

Gestión de solicitudes y trabajos de mantenimiento y obra. Aplicación independiente:
backend (Node/Express + PostgreSQL) + página web, con su propio login.

## Qué hace

Dos áreas de trabajo separadas (cada una con su pantalla, lista, indicadores
y ficha, vinculadas entre sí) y cuatro vistas de seguimiento y reportes.

**1 · Solicitud de pedido**
- N° de solicitud, fecha de ingreso, datos del cliente / contacto, tipo y
  detalle del trabajo solicitado
- Origen de la consulta: WhatsApp, teléfono, página web, redes sociales,
  recomendación, otro
- **Referido por**: dato interno. Solo lo ven y modifican los usuarios con
  permiso; a los demás el servidor ni siquiera se lo envía. Nunca aparece
  en el presupuesto para el cliente ni en exportaciones de usuarios sin
  permiso.

**2 · Presupuesto y trabajo** (vinculada a la solicitud original)
- Fecha de ingreso del presupuesto, fecha de envío y fecha de aceptación
- Mano de obra, materiales, otros costos y total (se calcula solo), forma
  de pago
- Estado del presupuesto: pendiente, en preparación, enviado, aceptado,
  rechazado (aceptado/rechazado se destacan con color e ícono)
- Ejecución (solo con presupuesto aceptado): fecha de ejecución, quién la
  realiza, estado (pendiente, asignada, en proceso, finalizada, cancelada),
  fecha prevista de finalización, fecha real de final de obra y
  observaciones internas. Muestra el desvío entre la fecha prevista y la real.
- Fechas automáticas (editables): ingreso del presupuesto al cargar
  importes, aceptación al marcarlo aceptado y final de obra al finalizar
- Fotos: antes, durante y después / trabajo finalizado
- **Presupuesto para el cliente**: documento imprimible (o PDF) con solo
  los datos para el cliente

**3 · Cronología**: para cada solicitud, ingreso → presupuesto →
aceptación → ejecución → final de obra, con los días entre etapas y el
desvío previsto/real. Filtros: en curso, finalizados, atrasados, sin
presupuesto aceptado.

**4 · Diagrama de Gantt**: cada trabajo como una barra desde la fecha de
ejecución; planificado (hasta el fin previsto) vs. real, atraso marcado,
línea de hoy, responsable, estado y duración. Filtros por cliente,
responsable, estado (incluye "atrasados"), tipo y fechas. Tocando una fila
se abre el trabajo.

**5 · Exportar a Excel (.xlsx)**: filtros (fecha de ingreso, cliente,
responsable, estado del presupuesto, estado de la tarea, trabajo
finalizado), selección de columnas y vista previa. Las fechas salen como
fechas de Excel y los importes como números. "Referido por" solo aparece
para usuarios autorizados. El generador (SheetJS) lo sirve el propio
servidor en `/vendor/xlsx.full.min.js`.

**6 · Análisis**: indicadores y gráficos por período (solicitudes por mes,
embudo, origen, tipo de trabajo, responsable y, solo con permiso, referidos).

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
