-- =====================================================
-- Urbania 360 - Schema PostgreSQL
-- Gestión de solicitudes y trabajos, con fotos.
-- Se crea dentro del schema propio de la app (ver db.js).
-- Es idempotente: se corre en cada arranque y también actualiza
-- bases creadas con versiones anteriores.
-- =====================================================

-- Usuarios que pueden entrar a la app
--   rol:         admin (gestiona usuarios) | empleado
--   ve_referido: puede ver y modificar el dato interno "Referido por"
CREATE TABLE IF NOT EXISTS usuarios (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    creado_en       TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Los usuarios que ya existían antes de los permisos quedan como admin
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'admin';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ve_referido BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE usuarios ALTER COLUMN rol SET DEFAULT 'empleado';
ALTER TABLE usuarios ALTER COLUMN ve_referido SET DEFAULT FALSE;

-- Solicitudes / trabajos. Las columnas se agrupan en las dos áreas de la app.
CREATE TABLE IF NOT EXISTS trabajos (
    id              SERIAL PRIMARY KEY,
    fecha           DATE NOT NULL,                   -- fecha de ingreso
    solicitante     VARCHAR(200) NOT NULL,           -- cliente / contacto
    lugar           VARCHAR(250) NOT NULL,           -- dirección del trabajo
    tipo            VARCHAR(120) NOT NULL,           -- tipo de trabajo
    creado_en       TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Migración desde la primera versión (observaciones / presupuesto / monto)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'trabajos' AND column_name = 'observaciones') THEN
    ALTER TABLE trabajos RENAME COLUMN observaciones TO detalle;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'trabajos' AND column_name = 'presupuesto') THEN
    ALTER TABLE trabajos RENAME COLUMN presupuesto TO presupuesto_estado;
    UPDATE trabajos SET presupuesto_estado = CASE presupuesto_estado
      WHEN 'no_aceptado' THEN 'rechazado' WHEN 'a_confirmar' THEN 'pendiente' ELSE presupuesto_estado END;
    UPDATE trabajos SET estado = 'en_proceso' WHERE estado = 'en_ejecucion';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'trabajos' AND column_name = 'monto') THEN
    ALTER TABLE trabajos RENAME COLUMN monto TO presupuesto_total;
  END IF;
END $$;

-- ÁREA 1 · SOLICITUD DE PEDIDO
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS detalle            TEXT;          -- qué solicita el cliente
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS origen             VARCHAR(30);   -- whatsapp, telefono, web, redes, recomendacion, otro
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS cliente_telefono   VARCHAR(60);
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS cliente_email      VARCHAR(150);
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS referido_por       VARCHAR(200);  -- INTERNO: solo usuarios con ve_referido

-- ÁREA 2 · PRESUPUESTO Y TRABAJO
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS presupuesto_total   NUMERIC(14,2);
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS mano_obra           NUMERIC(14,2);
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS materiales          NUMERIC(14,2);
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS otros_costos        NUMERIC(14,2);
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS forma_pago          VARCHAR(250);
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS presupuesto_enviado DATE;
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS presupuesto_estado  VARCHAR(20) NOT NULL DEFAULT 'pendiente'; -- pendiente, en_preparacion, enviado, aceptado, rechazado
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS estado              VARCHAR(20) NOT NULL DEFAULT 'pendiente'; -- pendiente, asignada, en_proceso, finalizada, cancelada
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS responsable         VARCHAR(200);  -- quién realiza el trabajo
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS inicio_previsto     DATE;
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS finalizado_en       DATE;
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS observaciones_internas TEXT;
-- Cronología: fechas de seguimiento
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS presupuesto_ingreso    DATE;   -- ingreso del presupuesto
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS presupuesto_aceptado_en DATE;  -- aceptación del presupuesto
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS fin_previsto           DATE;   -- fecha prevista de finalización
-- inicio_previsto = fecha de ejecución de la tarea · finalizado_en = fecha real de final de obra

-- Fotos de cada trabajo (antes / durante / después), guardadas en la base
CREATE TABLE IF NOT EXISTS fotos (
    id              SERIAL PRIMARY KEY,
    trabajo_id      INTEGER REFERENCES trabajos(id) ON DELETE CASCADE,
    etapa           VARCHAR(20) NOT NULL,            -- antes, durante, despues
    mime            VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
    datos           BYTEA NOT NULL,
    subida_en       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trabajos_fecha ON trabajos(fecha);
CREATE INDEX IF NOT EXISTS idx_fotos_trabajo ON fotos(trabajo_id);

CREATE OR REPLACE FUNCTION set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trabajos_upd ON trabajos;
CREATE TRIGGER trg_trabajos_upd BEFORE UPDATE ON trabajos
    FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
