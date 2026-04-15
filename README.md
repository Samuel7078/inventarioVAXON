# VAXON - Panel Administrativo

Este es el panel administrativo para VAXON, construido con Next.js 14, Tailwind CSS, Prisma ORM y PostgreSQL.

## Tecnologías Principales
- **Framework:** Next.js 14 (App Router)
- **Base de Datos:** PostgreSQL (configurado para usar servicios como Aiven)
- **ORM:** Prisma
- **Autenticación:** NextAuth.js
- **Estilos:** Tailwind CSS
- **Notificaciones (Webhook):** n8n / Telegram
- **Imágenes:** Carga a Cloudinary

## Requisitos Previos
- Node.js v18 o superior.
- Base de datos PostgreSQL (Aiven u otro).
- Credenciales de Cloudinary.
- Instancia y URL de Webhook de n8n para el bot de Telegram.

## Pasos para Ejecutar Localmente

### 1. Instalar y Preparar
Abre tu terminal en la carpeta principal del proyecto y ejecuta:
```bash
npm install
```

### 2. Configurar Variables de Entorno
Copia el archivo `.env.example` o crea un nuevo archivo llamado `.env` en la raíz del proyecto y adapta las variables (Aiven, NextAuth, n8n, Cloudinary).

### 3. Generar la Base de Datos con Prisma
Por ser la primera vez, necesitas empujar la estructura hacia tu Postgres y generar el tipado:
```bash
npx prisma db push
npx prisma generate
```
*(Nota: `database_schema.sql` incluye la estructura SQL cruda si necesitas consultarla).*

### 4. Levantar Servidor de Desarrollo
```bash
npm run dev
```
Visita `http://localhost:3000` en tu navegador. Esto te redirigirá a la página de Login.

## Estructura Principal y Enlaces de Funcionalidad
- **App `/dashboard`**: Es el hub principal. Muestra cards de los resúmenes financieros y de stock general.
- **Inventario `/dashboard/inventario`**: Componente de búsqueda y vista de la tabla de stock, e ingreso rápido.
- **Caja Chica `/dashboard/caja`**: Componente visual para Arqueo, Ingresos Rápidos de Egresos Laborales y ventas mostrador manuales.
- **Funcionalidad Webhook N8N**: Puedes utilizar `notifyWebhook` desde `lib/webhook.ts` justo en los Server Actions o API hooks que crees al finalizar procesos.
