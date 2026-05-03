-- Active: 1776184807024@@pg-491e269-vaxon-bot1.k.aivencloud.com@18405@defaultdb
-- TABLA ORIGINAL VAXON (CONECTADA AL BOT)
CREATE TABLE IF NOT EXISTS inventario_vaxon (
  id SERIAL PRIMARY KEY,
  producto TEXT NOT NULL,
  modelo TEXT NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 0,
  precio_compra DOUBLE PRECISION NOT NULL DEFAULT 0,
  precio_venta DOUBLE PRECISION NOT NULL DEFAULT 0,
  usuario_registro TEXT NOT NULL,
  ultima_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AGREGAR COLUMNAS PARA EL PANEL WEB SI AÚN NO EXISTÍAN (Ejecutar sin miedo)
ALTER TABLE inventario_vaxon ADD COLUMN IF NOT EXISTS imagen_url TEXT;
ALTER TABLE inventario_vaxon ADD COLUMN IF NOT EXISTS proveedor_id INTEGER;

-- NUEVAS TABLAS REQUERIDAS (Proveedores, Gastos y Caja)
CREATE TABLE IF NOT EXISTS "Usuario" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "password" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "rol" TEXT DEFAULT 'ADMIN',
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Proveedor" (
  "id" SERIAL PRIMARY KEY,
  "nombre" TEXT NOT NULL,
  "contacto" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RELACIÓN INVENTARIO -> PROVEEDOR
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_proveedor') THEN
        ALTER TABLE inventario_vaxon 
        ADD CONSTRAINT "fk_proveedor" FOREIGN KEY ("proveedor_id") REFERENCES "Proveedor"("id") ON DELETE SET NULL;
    END IF;
END $$;


CREATE TABLE IF NOT EXISTS "Gasto_Producto" (
  "id" SERIAL PRIMARY KEY,
  "producto_id" INTEGER NOT NULL REFERENCES inventario_vaxon(id) ON DELETE CASCADE,
  "tipo" TEXT NOT NULL CHECK (tipo IN ('PORCENTAJE', 'MONTO_FIJO')), 
  "valor" DOUBLE PRECISION NOT NULL, 
  "descripcion" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Movimiento_Inventario" (
  "id" SERIAL PRIMARY KEY,
  "tipo" TEXT NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "fecha" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "responsable" TEXT NOT NULL,
  "producto_id" INTEGER NOT NULL REFERENCES inventario_vaxon(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "Caja_Chica" (
  "id" SERIAL PRIMARY KEY,
  "monto_inicial" DOUBLE PRECISION NOT NULL,
  "monto_final" DOUBLE PRECISION,
  "fecha_apertura" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fecha_cierre" TIMESTAMP,
  "estado" TEXT NOT NULL DEFAULT 'ABIERTA',
  "responsable" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "Transaccion_Caja" (
  "id" SERIAL PRIMARY KEY,
  "caja_id" INTEGER NOT NULL REFERENCES "Caja_Chica"("id") ON DELETE CASCADE,
  "tipo" TEXT NOT NULL,
  "monto" DOUBLE PRECISION NOT NULL,
  "descripcion" TEXT NOT NULL,
  "fecha" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metodo_pago" TEXT DEFAULT 'EFECTIVO',
  "producto_id" INTEGER REFERENCES inventario_vaxon(id) ON DELETE SET NULL,
  "cantidad" INTEGER
);

-- Si la tabla Transaccion_Caja ya existía, añadir columnas nuevas (PG 10+)
ALTER TABLE "Transaccion_Caja" ADD COLUMN IF NOT EXISTS "metodo_pago" TEXT DEFAULT 'EFECTIVO';
ALTER TABLE "Transaccion_Caja" ADD COLUMN IF NOT EXISTS "producto_id" INTEGER REFERENCES inventario_vaxon(id) ON DELETE SET NULL;
ALTER TABLE "Transaccion_Caja" ADD COLUMN IF NOT EXISTS "cantidad" INTEGER;

-- FINANZAS Y PRESUPUESTOS (REDISEÑO V2)
CREATE TABLE IF NOT EXISTS "Presupuesto" (
  "id" SERIAL PRIMARY KEY,
  "nombre" TEXT NOT NULL,
  "tipo" TEXT NOT NULL DEFAULT 'PORCENTAJE',  -- 'PORCENTAJE' | 'FIJO'
  "porcentaje_asignacion" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "monto_fijo" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "monto_acumulado" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "color_hex" TEXT,
  "dia_reset" INTEGER DEFAULT 1,     -- día del mes para auto-reset (1-28)
  "ultimo_reset" TIMESTAMP           -- última vez que se reseteó
);

-- Migración: agregar columnas nuevas si tabla ya existe
ALTER TABLE "Presupuesto" ADD COLUMN IF NOT EXISTS "tipo" TEXT DEFAULT 'PORCENTAJE';
ALTER TABLE "Presupuesto" ADD COLUMN IF NOT EXISTS "monto_fijo" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "Presupuesto" ADD COLUMN IF NOT EXISTS "dia_reset" INTEGER DEFAULT 1;
ALTER TABLE "Presupuesto" ADD COLUMN IF NOT EXISTS "ultimo_reset" TIMESTAMP;
ALTER TABLE "Presupuesto" ADD COLUMN IF NOT EXISTS "alcance" TEXT DEFAULT 'GENERAL'; -- 'GENERAL' | 'PRODUCTO_ESPECIFICO' | 'PRODUCTO_GLOBAL'
ALTER TABLE "Presupuesto" ADD COLUMN IF NOT EXISTS "producto_id" INTEGER REFERENCES inventario_vaxon(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "Gasto_Presupuesto" (
  "id" SERIAL PRIMARY KEY,
  "presupuesto_id" INTEGER NOT NULL REFERENCES "Presupuesto"("id") ON DELETE CASCADE,
  "descripcion" TEXT NOT NULL,
  "monto" DOUBLE PRECISION NOT NULL,
  "tipo_movimiento" TEXT NOT NULL DEFAULT 'GASTO',  -- 'GASTO' | 'FONDO_EXTRA'
  "fecha" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Migración: agregar tipo_movimiento si ya existe
ALTER TABLE "Gasto_Presupuesto" ADD COLUMN IF NOT EXISTS "tipo_movimiento" TEXT DEFAULT 'GASTO';

-- Vincular egresos de caja a presupuestos
ALTER TABLE "Transaccion_Caja" ADD COLUMN IF NOT EXISTS "presupuesto_id" 
  INTEGER REFERENCES "Presupuesto"("id") ON DELETE SET NULL;

-- Comisiones de usuarios
CREATE TABLE IF NOT EXISTS "Comision_Usuario" (
  "id" SERIAL PRIMARY KEY,
  "usuario_id" INTEGER NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
  "porcentaje" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "activa" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Garantizar unicidad: un usuario = una comisión
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comision_usuario_unique') THEN
    ALTER TABLE "Comision_Usuario" ADD CONSTRAINT "comision_usuario_unique" UNIQUE("usuario_id");
  END IF;
END $$;

-- Capital de Respaldo (Fondo de emergencia manual)
CREATE TABLE IF NOT EXISTS "Capital_Respaldo" (
  "id" SERIAL PRIMARY KEY,
  "monto" DOUBLE PRECISION NOT NULL DEFAULT 0
);

-- ==================================================
-- INSERCIÓN DE USUARIO DE PRUEBA INICIAL (TEST)
-- ==================================================
INSERT INTO "Usuario" ("email", "password", "nombre", "rol")
VALUES ('test@vaxon.com', 'test1234', 'Usuario Test', 'ADMIN')
ON CONFLICT ("email") DO NOTHING;

