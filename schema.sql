-- =====================================================
-- Urbania 360 - Schema PostgreSQL
-- Libro de pedidos de mantenimiento / obra, con fotos.
-- =====================================================

-- Usuarios que pueden entrar a la app
CREATE TABLE IF NOT EXISTS usuarios (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    creado_en       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Pedidos de trabajo
CREATE TABLE IF NOT EXISTS trabajos (
    id              SERIAL PRIMARY KEY,
    fecha           DATE NOT NULL,
    solicitante     VARCHAR(200) NOT NULL,           -- quién lo pide
    lugar           VARCHAR(250) NOT NULL,           -- para dónde
    tipo            VARCHAR(120) NOT NULL,           -- tipo de trabajo
    observaciones   TEXT,
    monto           NUMERIC(14,2),
    presupuesto     VARCHAR(20) NOT NULL DEFAULT 'a_confirmar', -- aceptado, no_aceptado, a_confirmar
    estado          VARCHAR(20) NOT NULL DEFAULT 'pendiente',   -- pendiente, en_ejecucion, finalizada
    creado_en       TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMP NOT NULL DEFAULT NOW()
);

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
