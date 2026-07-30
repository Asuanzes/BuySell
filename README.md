# BuySell Asturias

Webapp para registrar inmuebles en venta con seguimiento histórico de precios y, en fase 2, scrapers a portales (Idealista, Fotocasa, Pisos.com, Milanuncios).

## Stack

- **Next.js 15** (App Router, TypeScript)
- **Postgres 17** (Docker local)
- **Prisma 6** ORM
- **Tailwind CSS 3**
- **Recharts** para el histórico de precios
- **Zod** para validación

## Estructura

```
src/
├── app/                  rutas Next.js (UI + API)
│   ├── properties/       listado, alta, detalle, edición
│   └── api/properties/   CRUD JSON
├── lib/                  db, validadores, filtros, formato
├── features/
│   ├── properties/       componentes de dominio (formulario, gráfica)
│   ├── scraping/         adapters por portal + runner (stubs)
│   └── floorplan-ai/     boceto 2D desde fotos (stub)
prisma/
├── schema.prisma         modelo de datos
└── seed.ts               datos de ejemplo
```

## Arranque

Necesitas Node 20+ y Docker Desktop.

```powershell
# 1. Variables de entorno
copy .env.example .env

# 2. Postgres en Docker
npm run db:up

# 3. Dependencias
npm install

# 4. Migraciones + cliente Prisma
npm run db:migrate -- --name init

# 5. (Opcional) Datos de ejemplo
npm run db:seed

# 6. Dev server
npm run dev
```

Abre [http://localhost:4200](http://localhost:4200).

## Comandos útiles

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run db:up` / `db:down` | Arrancar / parar Postgres |
| `npm run db:migrate` | Crear y aplicar migración |
| `npm run db:studio` | Abrir Prisma Studio (GUI de la BD) |
| `npm run db:seed` | Insertar datos de ejemplo |

## Modelo de datos (resumen)

- **Property**: el inmueble físico (datos básicos, ubicación, características).
- **Media**: fotos, planos, vídeos. Campo `source` distingue origen (`USER_UPLOAD`, `AI_SKETCH`, etc.).
- **Listing**: publicación de un Property en un portal (URL + estado + último precio).
- **PriceSnapshot**: histórico de precios. Cada chequeo del scraper inserta una fila.
- **SavedSearch**: búsquedas guardadas en portales (preparado, sin lógica aún).
- **User**: multi-tenant preparado, sin auth todavía.

## Roadmap

1. ✅ Esqueleto y CRUD manual de inmuebles.
2. ⏳ Subida de fotos a almacenamiento (S3/R2 o local en dev).
3. ⏳ Implementar adapters de scraping con Playwright. Empezar por Fotocasa o Pisos.com (más fáciles); Idealista al final por anti-bot.
4. ⏳ Generación de boceto 2D con LLM multimodal a partir de fotos.
5. ⏳ Cron periódico para `checkAllActiveListings`.
6. ⏳ Auth (multi-usuario) y `SavedSearch` con descubrimiento de anuncios.

## Notas sobre planos

- **Boceto IA desde fotos**: aproximación de cajas etiquetadas; útil como ayuda visual, **no como plano fiable**. Siempre marcar `source = AI_SKETCH` para que el usuario sepa que es estimación.
- **Registro de la Propiedad**: descartado (no público gratis, no aporta plano).
