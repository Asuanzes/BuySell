# Plan de Escalado y Evolución — BuySell Asturias

## Archivos clave inspeccionados

| Archivo | Relevancia |
|---|---|
| `prisma/schema.prisma` | Modelo de datos completo (11 modelos, 6 migraciones) |
| `package.json` (root + apps/mobile) | Stack confirmado: Next.js 15, Expo 54, Prisma 6, NextAuth 5 |
| `src/lib/auth.ts` + `mobile-jwt.ts` | Auth web (magic link) + mobile (OTP → JWT 90d) |
| `src/features/scraping/` | 8 adaptadores de portal + runner con fallback Playwright |
| `src/features/matching/` | Motor de deduplicación multi-señal ya implementado |
| `src/lib/import-listing.ts` | Pipeline de importación (500 líneas) completo |
| `public/bookmarklet/*.user.js` | Userscripts Tampermonkey para 7 portales |
| `.env` / `docker-compose.yml` | Solo PostgreSQL dockerizado; sin CI/CD ni cloud deploy |
| `apps/mobile/` | Expo Router, contexto de auth, expo-secure-store |
| `packages/shared/` | Tipos Zod, utilidades de formato y similitud compartidas |

---

## Contexto

El proyecto está más avanzado de lo que sugiere el CLAUDE.md inicial. La base técnica es sólida:
monorepo npm workspaces, Next.js 15 App Router, PostgreSQL + Prisma, auth dual (web/mobile),
8 adaptadores de scraping, motor de matching con 5 señales, userscripts
para 7 portales. Lo que falta es llevar esto a producción, añadir sincronización en tiempo real
y capas de valor diferencial.

---

## 1. ARQUITECTURA ESCALABLE

### Estado actual (sólido)

- **Monorepo npm workspaces**: web (`src/`), mobile (`apps/mobile/`), shared (`packages/shared/`)
- **API unificada**: Next.js Route Handlers (REST); autenticación dual cookie/Bearer ya implementada
- **Shared package** (`@buysell/shared`): tipos Zod, schemas, utilidades — ya consumido por mobile
- **DB**: PostgreSQL 17 + Prisma v6, schema extenso y bien indexado

### Mejoras recomendadas por capa

#### Backend

| Mejora | Descripción | Complejidad | Prioridad |
|---|---|---|---|
| **Despliegue en la nube** | Añadir `Dockerfile` de producción + config Railway/Fly.io. Sin esto no hay producto. | Baja | 🔴 Crítica |
| **CI/CD básico** | GitHub Actions: lint → test → build → deploy en PR merge | Baja | 🔴 Crítica |
| **Scraper desacoplado** | Mover `checkAllActiveListings()` a un cron job independiente (Railway Cron, GitHub Actions scheduled, o Trigger.dev). El Route Handler `/api/listings/check` tiene `maxDuration: 300s` — frágil en producción. | Media | 🟠 Alta |
| **Cola de tareas ligera** | Para importaciones pesadas (lote de bookmarklets, rechecks masivos): `pg-boss` (job queue sobre la misma Postgres) o Trigger.dev. Evita bloquear el runtime de Next.js. | Media | 🟠 Alta |
| **Búsqueda full-text** | La búsqueda actual usa `contains` Postgres. Para escalar: añadir índice `tsvector` en Postgres (GIN) como primer paso — sin infraestructura adicional. Meilisearch solo si hay >10k propiedades. | Baja→Media | 🟡 Media |
| **Caché de respuestas API** | Redis para caché de resultados de listados frecuentes y sesiones. Upstash Redis (serverless) es ideal para Railway/Vercel. | Media | 🟡 Media |
| **Almacenamiento de imágenes** | Actualmente `public/uploads/` (local). Migrar a R2 de Cloudflare (gratis 10GB/mes) o S3. El código ya tiene `sharp` para procesado. | Media | 🟡 Media |

#### Frontend web

| Mejora | Descripción | Complejidad | Prioridad |
|---|---|---|---|
| **Dominio + NEXTAUTH_URL en producción** | El único bloqueante real de auth. Configurar dominio → actualizar `NEXTAUTH_URL` en env de producción → magic links funcionales. | Baja | 🔴 Crítica |
| **Real-time con SSE o WebSockets** | Para notificaciones de cambio de precio en tiempo real. Next.js soporta Server-Sent Events nativamente (sin Redis en primera versión). | Media | 🟡 Media |
| **PWA** | Añadir `next-pwa` para instalación en móvil sin pasar por stores. Complementa la app nativa, más rápido de lanzar. | Baja | 🟡 Media |

#### Extensión de navegador

| Mejora | Descripción | Complejidad | Prioridad |
|---|---|---|---|
| **Publicar en Chrome Web Store** | Convertir los userscripts existentes a extensión Manifest V3. El código de scraping ya existe; solo requiere `manifest.json` + ajuste de permisos. | Media | 🟠 Alta |
| **Importación con un clic sin Tampermonkey** | La extensión MV3 puede inyectar el botón directamente sin que el usuario instale Tampermonkey. Reduce fricción de onboarding drásticamente. | Media | 🟠 Alta |

#### Estrategia multi-plataforma

```
┌─────────────────────────────────────────────────────┐
│                  packages/shared                     │
│  tipos Zod · schemas · format · similarity · sanity │
└──────────────────┬──────────────┬────────────────────┘
                   │              │
        ┌──────────▼──┐    ┌──────▼────────┐
        │  web (Next) │    │ mobile (Expo) │
        │  src/       │    │ apps/mobile/  │
        └──────────┬──┘    └──────┬────────┘
                   │              │
        ┌──────────▼──────────────▼────────────────────┐
        │         API unificada (Next.js Routes)        │
        │   /api/properties · /api/listings · /api/auth │
        └──────────────────────────────────────────────┘
```

La extensión MV3 se convierte en un cliente más de la misma API (igual que el userscript actual).
No necesita SDK separado — usa `fetch` con Bearer token igual que mobile.

---

## 2. FUNCIONALIDADES TRANSVERSALES

### Sincronización de favoritos en tiempo real

**Descripción**: Cuando el precio de un inmueble cambia en el scraper, todos los dispositivos del usuario lo ven al instante sin refrescar.

**Implementación**: Server-Sent Events desde `/api/events/stream` (Next.js Route Handler con `ReadableStream`). El cliente web y la app mobile abren una conexión SSE tras login. Cuando el runner actualiza un `PriceSnapshot`, emite un evento al stream del usuario afectado.

| Atributo | Valor |
|---|---|
| Valor usuario | Alto — "me enteré tarde de la bajada de precio" es el pain principal |
| Complejidad técnica | Media |
| Prioridad | 🟠 Alta (Fase 2) |

### Notificaciones push y email

**Descripción**: Alerta cuando baja el precio, cambia el estado (reservado/vendido/retirado), o un inmueble seguido reaparece.

**Implementación**:
- **Email**: Ya existe Resend integrado. Solo hace falta un template de "bajada de precio" + trigger en el runner cuando `kind === "PRICE_DROP"`.
- **Push web**: Web Push API (sin servicio externo). `next-pwa` incluye service worker.
- **Push móvil**: `expo-notifications` (ya en el stack Expo). Requiere backend con `Expo Push API`.

| Atributo | Valor |
|---|---|
| Valor usuario | Muy alto — notificaciones de bajada son el caso de uso estrella |
| Complejidad técnica | Media (email: baja; push: media) |
| Prioridad | 🔴 Alta (Fase 1 para email, Fase 2 para push) |

### Importación desde portales vía extensión

**Descripción**: Botón "Guardar en BuySell" al navegar por Idealista, Fotocasa, etc. Un clic importa el inmueble con todos sus datos.

**Estado actual**: Ya funciona vía userscripts Tampermonkey (7 portales). El bloqueante es que Tampermonkey tiene fricción de instalación.

**Implementación Fase 2**: Extensión Chrome MV3. El código de extracción de datos (`_buysell-common.js`) se reutiliza tal cual como content script.

| Atributo | Valor |
|---|---|
| Valor usuario | Crítico — es el mecanismo de captura de favoritos |
| Complejidad técnica | Media |
| Prioridad | 🔴 Crítica (Fase 1: mejorar UX del userscript; Fase 2: extensión) |

### Listas compartidas (pareja, familia, agente)

**Descripción**: Compartir una lista curada de favoritos con enlace único o invitando a otro usuario.

**Implementación**: Nuevo modelo `SharedList` en Prisma (ownerId, token único, propiedades M:N, permisos read/comment/edit). La vista pública es una página Next.js con token en la URL.

| Atributo | Valor |
|---|---|
| Valor usuario | Alto — búsqueda inmobiliaria es decisión compartida |
| Complejidad técnica | Media |
| Prioridad | 🟡 Media (Fase 2) |

---

## 3. VALOR AÑADIDO ESPECÍFICO DEL SECTOR

### 3.1 Histórico de precios y alertas de bajada

**Estado actual**: `PriceSnapshot` ya implementado. Gráfico Recharts ya integrado.
**Lo que falta**: Trigger de email/push en el runner (trivial).

| Complejidad | Prioridad |
|---|---|
| Baja | 🔴 Crítica |

### 3.2 Comparador lado a lado

**Descripción**: Tabla comparativa de 2-4 inmuebles favoritos: m², €/m², habitaciones, gastos estimados, eficiencia energética, distancia a POIs (trabajo, colegio).

**Implementación**: Página `/compare?ids=a,b,c,d` con tabla generada client-side. Distancia a POIs via Google Maps Distance Matrix API (ya tienen clave).

| Complejidad | Prioridad |
|---|---|
| Baja | 🟠 Alta |

### 3.3 Calculadora financiera

**Descripción**: Hipoteca mensual, gastos de compraventa (ITP/AJD por CCAA, notaría, registro), coste total de adquisición.

**Implementación**: Función pura en `packages/shared` (sin API externa). Tabla de tipos ITP por comunidad autónoma (hardcoded, actualización manual anual). Panel en la ficha del inmueble.

| Complejidad | Prioridad |
|---|---|
| Baja | 🟠 Alta |

### 3.4 Análisis de zona

**Descripción**: Para cada inmueble: transporte cercano, colegios, ruido, evolución de precios del barrio.

**Implementación por capas**:
- **Transporte y colegios**: Overpass API (OpenStreetMap) — gratuito.
- **Ruido**: EEA Noise data (dataset estático por municipio).
- **Evolución de precios de zona**: INE / idealista API (si acceso) o scraping de estadísticas públicas.

| Complejidad | Prioridad |
|---|---|
| Media-Alta | 🟡 Media (Fase 2-3) |

### 3.5 Scoring automático (IA)

**Descripción**: Puntuación 0-100 del inmueble según las preferencias del usuario (habitaciones mínimas, precio máximo, zona, amenidades). "Este inmueble cumple 8/10 de tus criterios."

**Implementación**: Nuevo modelo `UserPreferences` en Prisma. Función de scoring en `packages/shared` (ponderación configurable). Opcionalmente, usar `ANTHROPIC_API_KEY` ya en `.env` para scoring semántico de la descripción.

| Complejidad | Prioridad |
|---|---|
| Media | 🟠 Alta |

### 3.6 Detección de duplicados entre portales

**Estado actual**: Motor de matching ya implementado (`find-similar.ts`, 5 señales). Página `/matches` ya existe.
**Lo que falta**: UI de resolución más clara, sugerencias automáticas en el feed.

| Complejidad | Prioridad |
|---|---|
| Baja | 🔴 Crítica (ya casi listo) |

### 3.7 Estimación de valor de mercado (AVM) y detección de chollos

**Descripción**: Comparar precio/m² del inmueble vs. media de la zona. "Este piso está un 12% por debajo del precio medio de Gijón centro."

**Implementación Fase 1**: Calcular media €/m² de inmuebles guardados en la misma ciudad (datos propios del usuario). Fase 2: Integrar fuentes externas (INE, Tinsa API si disponible).

| Complejidad | Prioridad |
|---|---|
| Baja (datos propios) / Alta (AVM real) | 🟡 Media |

### 3.8 Gestión de visitas

**Descripción**: Agenda de visitas integrada en la ficha: fecha/hora, checklist configurable, notas y fotos propias post-visita.

**Implementación**: Modelos `Visit` y `VisitNote` en Prisma. Fotos suben a R2/S3 (igual que el resto de media).

| Complejidad | Prioridad |
|---|---|
| Media | 🟡 Media (Fase 2) |

### 3.9 Modo inversor

**Descripción**: Para cada inmueble, calcular rentabilidad bruta/neta estimada como alquiler (precio alquiler zona vs. precio compra), ROI a N años, comparativa con rentabilidad media de la zona.

**Implementación**: Función pura en `packages/shared`. Precio de alquiler de zona: scraping de Idealista Rentabilidades o Fotocasa alquiler (mismo motor de scraping ya existe).

| Complejidad | Prioridad |
|---|---|
| Media | 🟡 Media (Fase 3) |

### 3.10 Consulta al Registro de la Propiedad (★ diferencial premium)

**Descripción**: Desde la ficha de cualquier inmueble favorito, solicitar nota simple con un clic: titularidad, cargas, hipotecas, embargos. Posibilidad de alertas automáticas si cambian cargas de un inmueble seguido.

#### Integración técnica

**Vía API del Colegio de Registradores** (`registradores.org`):
- El API REST requiere acreditación como profesional o empresa (alta como usuario corporativo).
- Autenticación: certificado digital o usuario/contraseña corporativo.
- Endpoint principal: solicitud de nota simple informativa (tipo 4.01).
- Coste: ~9-11 € por nota simple (tarifa registral oficial).
- Tiempo respuesta: inmediato (nota simple informativa) o 24h (certificación literal).
- Alternativa: integrar con servicios intermediarios como **Izenpe**, **Ancert** o **Registros.es** que tienen APIs más modernas con mismos precios.

**Schema Prisma nuevo**:
```prisma
model RegistryNote {
  id          String   @id @default(cuid())
  propertyId  String
  property    Property @relation(fields: [propertyId], references: [id])
  userId      String
  requestedAt DateTime @default(now())
  deliveredAt DateTime?
  status      RegistryNoteStatus // PENDING, DELIVERED, FAILED
  pdfUrl      String?  // R2/S3, acceso privado con URL firmada
  parsedData  Json?    // titulares, cargas, hipotecas (extraído del PDF)
  expiresAt   DateTime // RGPD: 2 años por defecto, configurable
}
```

**Flujo UX (un clic desde la ficha)**:
1. Usuario en ficha de inmueble → botón "Consultar Registro (9,50 €)"
2. Modal de confirmación con precio y descripción.
3. Se crea `RegistryNote` con status `PENDING` y se cobra al usuario (Stripe).
4. Job asíncrono (pg-boss) llama a la API de Registradores con la dirección del inmueble.
5. PDF llega → se parsea (PyPDF2 o pdfjs) y se almacena en R2 con URL firmada 24h.
6. Notificación email/push: "Tu nota simple está lista".
7. Usuario descarga PDF desde la app (URL firmada, expira en 24h por seguridad).

**Almacenamiento y RGPD**:
- PDFs en R2 en bucket privado (no público).
- URL de descarga generada con firma de 24h (`getSignedUrl`).
- Retención configurable (default 2 años → borrado automático via cron).
- Tabla `RegistryNote` registra qué usuario solicitó qué inmueble, cuándo y si fue entregado.
- En panel de usuario: lista de notas solicitadas + opción de borrar manualmente.

**Alertas de cambio de cargas**:
- Nuevo job semanal: re-consultar automáticamente inmuebles marcados como "seguir cargado".
- Requiere suscripción premium (incluye N rechecks/mes).
- Comparar `parsedData` anterior vs. nuevo para detectar cambios en hipotecas o embargos.

**Modelos de negocio**:

| Modelo | Descripción | Pro | Contra |
|---|---|---|---|
| **Pay-per-use** | 9,50 € por consulta (coste API + margen 0,50 €) | Sin compromiso para el usuario | Menor retención |
| **Bono de consultas** | 5 consultas por 40 € (8 €/u) | Mejor conversión de compradores activos | Requiere gestión de saldo |
| **Suscripción premium** | X consultas incluidas/mes + alertas de cargas | Ingresos recurrentes predecibles | Barrera de entrada más alta |
| **Recomendado: híbrido** | Suscripción incluye 2/mes + pay-per-use para adicionales | Equilibrio entre retención y conversión | Algo más complejo de comunicar |

**Complejidad técnica**: Alta
**Prioridad**: 🟡 Media (Fase 3 — requiere alta como empresa en Registradores + integración Stripe)

---

## 4. ROADMAP POR FASES

### Fase 1 — MVP+ (0–8 semanas): Cerrar y lanzar

**Objetivo**: Producto usable en producción, usuario real puede importar y rastrear favoritos.

| Tarea | Descripción | Tipo |
|---|---|---|
| ✅ Completar auth web | Configurar dominio de producción → `NEXTAUTH_URL` → magic links funcionando | Infra |
| ✅ Despliegue en la nube | Dockerfile + Railway/Fly.io + PostgreSQL managed | Infra |
| ✅ CI/CD básico | GitHub Actions: lint + build + deploy | Infra |
| ✅ Almacenamiento R2 | Migrar `public/uploads/` a Cloudflare R2 | Infra |
| ✅ Notificación email bajada de precio | Template Resend + trigger en runner PRICE_DROP | Feature |
| ✅ Cron scraper | Mover checkAllActiveListings a cron independiente | Feature |
| ✅ UI de duplicados pulida | Mejorar `/matches` con merge en un clic | Feature |
| ✅ Calculadora hipoteca + gastos | Componente en ficha del inmueble, sin API | Feature |
| ✅ Comparador básico | `/compare?ids=...` con tabla lado a lado | Feature |

### Fase 2 — Crecimiento (2–6 meses): Retención y multi-plataforma

**Objetivo**: Usuarios vuelven solos; sincronización entre dispositivos; extensión Chrome.

| Tarea | Descripción | Tipo |
|---|---|---|
| Extensión Chrome MV3 | Convertir userscripts a extensión instalable (1 clic, sin Tampermonkey) | Platform |
| App móvil Fase 2 | Completar pantallas pendientes, notificaciones push via expo-notifications | Platform |
| Sincronización real-time | SSE desde API → web + mobile actualizan en vivo | Feature |
| Notificaciones push | Web Push (PWA) + Expo Push (mobile) para bajadas y cambios de estado | Feature |
| Listas compartidas | Modelo `SharedList` + página pública con token | Feature |
| Scoring IA de inmueble | Preferencias de usuario + puntuación Zod/TS | Feature |
| Gestión de visitas | Modelo `Visit` + checklist + notas + fotos | Feature |
| Análisis de zona (básico) | Transporte y colegios via Overpass API | Feature |
| AVM básico (datos propios) | €/m² medio de favoritos en misma ciudad | Feature |
| PWA | `next-pwa` + manifest + push notifications | Platform |
| Búsqueda full-text mejorada | Índice `tsvector` GIN en Postgres | Backend |

### Fase 3 — Monetización y escala (6–18 meses)

**Objetivo**: Ingresos sostenibles; escalar base de usuarios.

| Tarea | Descripción | Modelo |
|---|---|---|
| **Suscripción premium** | Freemium: ≤20 favoritos gratis; premium ilimitado + alertas avanzadas + X consultas Registro | SaaS mensual |
| **Registro de la Propiedad** | API Colegio de Registradores + Stripe + alertas de cargas | Pay-per-use + addon premium |
| **Leads cualificados a inmobiliarias** | Usuario interesado → agente local. CPL (coste por lead) 15-50 € | Marketplace |
| **Comisión por hipoteca** | Afiliación con comparador hipotecario (Helpmycash, iAhorro, Trioteca) | CPA ~200-500 € |
| **Suscripción inversor** | Modo inversor + rentabilidad + ROI + datos Registro incluidos | SaaS nicho |
| **Multi-tenant** | Inmobiliarias con acceso para sus agentes (gestión de carteras) | B2B SaaS |
| **Meilisearch** | Solo si >10k propiedades por usuario o multi-tenant | Backend |
| **AVM real** | Integración Tinsa / CBRE / datos INE para precio estimado de mercado | Feature premium |

---

## 5. RIESGOS Y CONSIDERACIONES

### Legales

| Riesgo | Descripción | Mitigación |
|---|---|---|
| **Scraping de portales** | Idealista ya bloquea con DataDome (manual-only). Fotocasa/Pisos.com toleran scraping moderado pero sus ToS lo prohíben. | Modelo bookmarklet (usuario importa activamente) es mucho más seguro legalmente que scraping automático de portales ajenos. Documentar que el usuario consiente la importación de sus propios datos. |
| **RGPD — datos de terceros** | Las imágenes de portales y datos de inmuebles son de los portales/propietarios. | Solo almacenar datos que el usuario haya importado explícitamente. No copiar imágenes de portales; referenciar por URL o pedir consentimiento explícito. Para notas del Registro: cifrado en reposo, retención limitada, borrado bajo demanda. |
| **Registro de la Propiedad** | Los datos registrales son públicos pero sensibles (titularidad, cargas). Almacenarlos requiere base legal. | Base legal: "interés legítimo" del propio usuario solicitante. No compartir ni cruzar datos registrales entre usuarios. Retención máxima 2 años. |
| **Propiedad intelectual** | Las descripciones de anuncios pueden tener copyright de la inmobiliaria. | Almacenar solo para uso personal del usuario (misma lógica que un favorito del navegador). |

### Técnicos

| Riesgo | Descripción | Mitigación |
|---|---|---|
| **Rate limits y bloqueos anti-bot** | Los portales pueden actualizar sus protecciones (DataDome, Cloudflare, PerimeterX) rompiendo los scrapers. | El runner ya tiene fallback HTTP → Playwright. El bookmarklet (importación manual) es el canal principal — los scrapers son complemento para rechecks de precio. Monitorizar tasa de "blocked" en ImportLog. |
| **Mantenimiento de parsers** | Los portales cambian su HTML/JS frecuentemente. | Los adaptadores genéricos (`_genericAdapter.ts`) usan JSON-LD como señal primaria (más estable que CSS). Los selectores CSS son fallback. Añadir tests de regresión con fixtures HTML. |
| **Fiabilidad API Registro** | La API de Registradores tiene SLA desconocido; el proceso puede tardar horas. | Arquitectura asíncrona (pg-boss job) — el usuario recibe notificación cuando está listo, no espera en la UI. Implementar reintentos automáticos con backoff. |
| **Coste de Playwright en producción** | Chromium headless consume ~300-500MB RAM por instancia. | Desacoplar el scraper en un servicio separado (Railway worker o Lambda). No ejecutar Playwright en el mismo proceso de Next.js en producción. |

### Producto

| Riesgo | Descripción | Mitigación |
|---|---|---|
| **Dependencia de fuentes externas** | Si Idealista lanza su propia app de favoritos mejorada, reduce el valor diferencial. | El diferencial es la **agregación cross-portal** + herramientas de decisión (comparador, calculadora, Registro). Un portal nunca comparará sus propiedades con las de su competencia. |
| **Idealista es manual-only** | El portal dominante en España no se puede scrapearse automáticamente. | El userscript/extensión para Idealista ya funciona. En Fase 2, la extensión Chrome MV3 facilita la importación desde Idealista sin configuración adicional. |
| **Adopción inicial baja** | Sin masa crítica de datos, el AVM y el scoring tienen poco valor. | Lanzar primero para uso personal (el CLAUDE.md lo indica). La propuesta de valor funciona con 20 favoritos. |

---

## Tabla resumen del roadmap

| Fase | Duración | Hito clave | Funcionalidades principales | Modelo de ingreso |
|---|---|---|---|---|
| **Fase 1 — MVP+** | 0–8 sem | Lanzar en producción | Auth + deploy + R2 + email alertas + comparador + calculadora | Ninguno (uso personal) |
| **Fase 2 — Crecimiento** | 2–6 m | 100 usuarios activos | Extensión Chrome + app móvil + real-time + listas compartidas + scoring | Ninguno / freemium early |
| **Fase 3 — Monetización** | 6–18 m | Ingresos recurrentes | Registro Propiedad + leads + afiliación hipotecas + multi-tenant | Suscripción + transaccional |

---

## Próximos pasos de implementación (orden sugerido)

1. **Dominio + NEXTAUTH_URL** — desbloquea auth en producción (30 min)
2. **Dockerfile + Railway deploy** — primer despliegue real (2-4h)
3. **Email de bajada de precio** — template Resend + trigger en runner (1h)
4. **Calculadora hipoteca** — función pura en `packages/shared` + UI (3-4h)
5. **Comparador lado a lado** — página `/compare` client-side (4-6h)
6. **Cron scraper desacoplado** — pg-boss o Railway Cron (3-4h)
7. **Extensión Chrome MV3** — desde userscripts existentes (1-2 días)
