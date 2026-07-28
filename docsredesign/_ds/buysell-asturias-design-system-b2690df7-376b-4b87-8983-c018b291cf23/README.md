# BuySell Asturias — Design System

A design system extracted from the **BuySell Asturias** codebase. BuySell is a personal-use webapp (built with Next.js 15) for **registering properties for sale in Asturias, Spain**, with historical price tracking, deduplication of listings across Spanish real-estate portals (Idealista, Fotocasa, Pisos.com, Milanuncios, Habitaclia, Yaencontre, ThinkSPAIN, Indomio), and stretch goals around Catastro (Spanish cadastre) integration and AI-generated floorplans from photos.

The product is **densely-information-driven**: tables of properties, price-history charts, status badges, activity timelines, and side-by-side duplicate-comparison views. The visual language reflects that: warm off-white surfaces, 13px body text, tabular numerics, hairline borders, very subtle shadows. The brand identity rests on a single distinctive symbol — a **medieval forged key** drawn in steel-blue line with an aged-brass (latón envejecido) accent on the bow rivet and the bit.

## Source

- **GitHub repo:** <https://github.com/Asuanzes/BuySell> (branch `main`)
- Stack: Next.js 15 App Router · TypeScript · Tailwind CSS 3 · Prisma 6 · Postgres 17 · Recharts · Lucide icons
- Language: copy is **Spanish (Castellano)** throughout — this is product-and-region-specific

> Readers with access to the source repo should explore `src/app/globals.css`, `tailwind.config.ts`, `src/components/ui/*`, `src/components/brand/icons.tsx`, and `src/app/brand/page.tsx` to go deeper. The brand identity is intentionally explored in-product on `/brand`.

## Surfaces

- **Web app** — the main and only product surface. Sidebar + topbar shell, Spanish copy, dense data UI.
- (A skeleton `apps/mobile/` exists but is the default Expo starter — not part of this design system.)

---

## Content Fundamentals

**Language.** All copy is in **Spanish (Castellano de España)**. No English fallback. Use `lang="es"`.

**Voice.** Sober, factual, second-person plural where it appears (impersonal/infinitive is more common). Never marketing-y, never exclamatory. The product is for the user's own bookkeeping of properties they're tracking — copy treats them as a knowledgeable owner-operator, not a customer.

**Casing.** Sentence case for everything — buttons, headings, table columns. **No Title Case.** Examples from the source:

- `Nuevo inmueble` (button) — not `Nuevo Inmueble`
- `Posibles duplicados` (page title)
- `Histórico de precio`, `Anuncios vinculados`, `Notas privadas` (card titles)
- `Aplicar filtros` (CTA)

**Eyebrows / section labels** use UPPERCASE with tracking, e.g. `VARIANTES DE ACENTO`, `21 ENERO 2026`. Done via `text-xs uppercase tracking-wide text-text-subtle`.

**Tone examples** (lifted verbatim):

- Login subtitle: `Te enviaremos un enlace por email para entrar sin contraseña.`
- Empty state on `/properties`: `No hay inmuebles que coincidan` / `Prueba a ajustar o limpiar los filtros, o crea una nueva ficha.`
- Empty state on `/matches`: `No hay duplicados pendientes` / `Cuando importes nuevos inmuebles que parezcan iguales a otros existentes, aparecerán aquí para fusionar o descartar.`
- Login confirmation: `Email enviado` / `Revisa tu bandeja. Pulsa el enlace que te hemos mandado para entrar.`

**Domain vocabulary** (always use these, not generic equivalents):

| Use | Don't use |
|---|---|
| `Inmueble` / `ficha` | "property card", "listing" |
| `Anuncio` (a listing on a portal) | "ad" |
| `Portal` (Idealista, Fotocasa…) | "site", "source" |
| `Histórico de precio` | "price chart" |
| `Bajada de precio` / `Subida de precio` | "price down" / "price up" |
| `En venta`, `Reservado`, `Vendido`, `Retirado` | "for sale", "sold"… |
| `Hab.` (habitaciones), `m²`, `€/m²` | "rooms", "sqm" |
| `Catastro` | "cadastre" / "registry" |
| `Hórreo`, `Picos de Europa`, `Asturias` | — |

**Pronouns.** Mostly impersonal (`Ordenar por`, `Aplicar filtros`, `Limpiar`). When the user is addressed it's **tú** informal (`Te enviaremos`, `Revisa tu bandeja`). Never **usted**.

**Numbers and prices.**
- Spanish locale: `1.234.567 €` (period thousands separator, space before €).
- Use `Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })`.
- Per-square-metre: `1.850 €/m²`.
- Tabular numerals everywhere — never proportional figures.
- Relative time: `Hoy`, `Ayer`, `Hace 3 días`, `Hace 2 sem.`, then fall back to `15 ene 2026`.

**Emoji.** Never. Not in nav, not in empty states, not in success/error toasts. The brand uses Lucide line icons + the custom BuySell icon set.

**Unicode oddities.** Use the **em dash** `—` for hint separators in stats, and the **middle dot** `·` as a separator between metadata (`Piso · Centro · Oviedo · Asturias`). Use the **right arrow** `→` for "see more" links: `Ver actividad detallada →`. Em dash `—` (or `–`) for missing numeric values in tables (not `N/A`, not `-`).

---

## Visual Foundations

### Colour vibe
**Warm off-white background, never pure white.** The page bg is `#FAFAF7`, surfaces are `#FFFFFF` — that 5-unit warmth is what stops the UI feeling clinical. Borders are warm grey `#E8E6E1`, not bluish. Text is `#1A1A18`, not pure black.

**Single accent colour: steel-blue `#3A5F8A`.** Used for the primary button, the active nav item background (as `--primary-soft`), all links, all chart strokes, the price-history area fill (at 0.18→0 opacity gradient), the focus ring (2px outset).

**Brand accent: aged-brass `#C49A4D`.** Used ONLY in the BuySell key icon: the rivet on the bow and the fill of the key's bit. Never used for buttons or as a UI accent — it's a *brand-mark* colour. The `/brand` page in the source proposes three alternates (`#A85F2E` cobre bruñido, `#A8893A` oro viejo, `#7A9080` verdigris) that aren't currently shipped.

**Semantic colour comes in pairs: a `*-soft` background + a deep foreground.** E.g. `--warning-soft: #F7EFDE` on `--warning: #A86A17`. Always used together for badges and inline pills. Pure semantic colours (no `-soft`) are rare — primarily for outline strokes.

**Price-delta colours are intentionally less saturated** than the danger/success pair (`#FDF2F2` / `#A23E3E` vs `#F6E5E5` / `#A23E3E`). Reason: price changes are everywhere in the UI — they shouldn't shout.

### Type
- **Family:** Inter (via `next/font/google` in the real app, Google Fonts CDN here). One family only. No serif, no display font.
- **Scale is unusually small and dense:** body is `13px / 18px`, card titles are `13px / 18px font-semibold`, page H1 is `24px / 32px`. The biggest piece of type in the product is the hero price on a property detail page at `32px`.
- **OpenType features always on:** `cv11`, `ss01`, `ss03` (alt 1, alt 4, ss03 — Inter's "straight" alternates). This gives the look the slightly more geometric/legible feel.
- **Tabular numerics on everything numeric** via `.tabular` (`font-variant-numeric: tabular-nums`). Prices, deltas, table cells, stat values.
- **Letter-spacing** tightens at scale: `-0.01em` at `xl` (20px), `-0.015em` at `2xl`, `-0.02em` at `3xl`. Nothing letter-spaced *open* except uppercase eyebrows.

### Spacing
8-px-ish grid via Tailwind defaults. Notable usage:
- Card body padding: `20px` (`p-5`).
- Card header: `20px × 14px` (`px-5 py-3.5`).
- Sidebar nav items: `10px × 6px` (`px-2.5 py-1.5`).
- Page gutter: `24px` horizontal, `32px` top (`px-6 py-8`).
- Table cell: `12px × 12px`, first/last `20px` (`px-3 py-3 first:pl-5 last:pr-5`).
- Sidebar width: `224px` (`w-56`); right rail on detail pages: `320px`.

### Backgrounds
- **No gradients except one:** the chart area fill (`#3A5F8A` 0.18 → 0). Never used for buttons or cards.
- **No patterns, no textures.**
- **No imagery in the chrome.** Photos appear only as property thumbnails (16:9 in galleries, 4:3 in cards, 40×56 in table rows). Photos are user-uploaded; the UI provides no decorative imagery.

### Borders & radii
- **Hairline 1px borders are the primary separator.** Cards, table rows, sidebar dividers, badges — all `1px solid var(--border)`. Borders carry the layout, shadows do not.
- **Radii are small.** `4px` for tiny things (focus ring, checkbox), `6px` for buttons and inputs, `8px` for cards and tables. `12px` is rare. **Never rounded-full on cards or buttons.** Chips and the gallery nav buttons are the only rounded-full elements.

### Shadows
Three steps, all *very* warm-black and *very* subtle:
- `--shadow-xs` — almost imperceptible, on every Card and Stat.
- `--shadow-sm` — slight lift on hover for property cards.
- `--shadow-md` — only on overlays (search dropdown, gallery navigation buttons).

**Never inner shadows. Never colored shadows. Never glow.** Cards never look "lifted" — they look "set into the page".

### Hover & press states
- **Buttons:**
  - Primary → swap to `--primary-hover` (darker blue).
  - Secondary → swap to `--surface-muted` background.
  - Ghost → `--surface-muted` background appears.
  - Danger → `opacity: 0.9`.
- **Links:** underline on hover.
- **Nav items / table rows / list items:** background shifts to `--surface-muted` (`60%`-ish opacity for table rows).
- **Cards (property card on grid):** shadow steps from `xs` → `sm`.
- **Inputs:** border colour deepens (`--border` → `--border-strong`) on hover; jumps to `--primary` on focus, **with the border itself becoming primary — not an outer ring**. (Focus *rings* are reserved for keyboard nav.)
- **No press states.** No `:active` shrinks, no opacity flickers. The system is calm.
- **Transition timing:** `duration-100` on colour transitions (very fast). No bouncy easing.

### Transparency & blur
- The gallery prev/next buttons and image-counter pill use `bg-surface/90 backdrop-blur` over photos. **This is the only place blur is used.**
- Iconography in the sidebar uses `ring-1 ring-inset ring-primary/15` — a 1px tinted inset ring — instead of a coloured border, when the icon sits on `--primary-soft`.

### Animation
- The product is **near-static**. Transitions are 100ms color-only.
- No entrance animations on page load.
- The only "moving" element is the loading skeleton on the auth form (`animate-pulse` on a placeholder rect).

### Layout rules
- **Two-column shell:** `224px` left sidebar (fixed, sticky), then the main flow.
- **Topbar is `56px` tall**, contains a global search (max-width 28rem) on the left and the primary CTA on the right.
- **Detail pages** use a `1fr 320px` grid — content left, sticky aside right.
- **Properties list** uses a `1fr 280px` grid — list left, filters right.
- **Container width** is *not capped* — the app fills the viewport. There's no `max-w-7xl mx-auto`.
- **Mobile sidebar hides** (`hidden md:flex`); above-md it's always-visible.

### Iconography
See the [Iconography](#iconography) section below.

### Charts
- **Recharts** with a custom palette.
- Grid: `#E8E6E1` dashed (3 3), horizontal only.
- Axis labels: `11px` `#9A9690`, no axis line, no tick line.
- Series: `#3A5F8A` stroke 2px, gradient area fill `0.18 → 0`.
- Tooltip: white surface, `1px solid #E8E6E1`, `8px` radius, `12px` font, `shadow-md`.

---

## Iconography

The product uses **two icon systems side-by-side**:

### 1. Lucide React (general UI)
The codebase imports from `lucide-react` (`^0.469.0`) for **every general-purpose UI icon**: navigation (`LayoutDashboard`, `Building2`, `Sparkles`, `Activity`, `Settings`, `Plus`, `Search`, `ChevronLeft`/`ChevronRight`, `ArrowUp`/`ArrowDown`/`Minus`, `MapPin`, `Bed`, `Bath`, `Maximize2`, `ExternalLink`, `Pencil`, `Mail`, `CheckCircle2`, `AlertTriangle`, `Flame`, `Trees`, `Warehouse`, `Waves`, `Layers`, `Ruler`, `Calendar`, `Home`, `Image`, `RefreshCw`, `X`).

**Typical sizes:** `11–16px` in inline UI, `28px` in empty-state hero, never larger.
**Stroke weight:** Lucide default (`stroke-width: 2`). Never adjusted.
**Colour:** the icon takes `currentColor` — placed inside an element with `text-text-subtle` (most common), `text-text-muted`, `text-primary`, or a semantic colour. No fills.

When working in static HTML for this design system, use the Lucide CDN:
```html
<script src="https://unpkg.com/lucide@latest"></script>
<script>lucide.createIcons();</script>
<i data-lucide="building-2"></i>
```

### 2. Custom brand icon family (BuySell-specific)
`src/components/brand/icons.tsx` ships **14 custom icons** as candidate brand marks for the product identity. The one **actually wired into `AppShell`** today is the **`IconKey`** (medieval forged key) — it appears in the sidebar header, the login card, and the favicon.

The full set is preserved in `assets/brand-icons.tsx` (verbatim from the source) and the most useful 9 are also exported as standalone SVG files in `assets/`:

| File | Symbol | Meaning |
|---|---|---|
| `brand-key.svg` | Llave medieval | **Current logo.** Steel-blue bow + shank, brass (`--brand-accent`) rivet and bit. |
| `brand-horreo.svg` | Hórreo | Asturian granary on pegollos. Strong regional identity. |
| `brand-house.svg` | Casa | Universal house silhouette. The most neutral. |
| `brand-picos.svg` | Picos | Three peaks (Picos de Europa) with a small roof in front. Landscape + home. |
| `brand-tag.svg` | Etiqueta | Price tag — classic real-estate symbol. |
| `brand-pin.svg` | Ubicación | Map pin with a roof tucked inside. |
| `brand-portfolio.svg` | Cartera | Two overlapping houses — multi-property portfolio. |
| `brand-exchange.svg` | Compraventa | Two opposing chevrons — buy/sell flow. |
| `brand-chevron.svg` | Chevron | Abstract minimal "B" formed by a roof. |

### 3. SVG vs PNG
- **All product icons are SVG.** No PNG icons anywhere in the source.
- The favicon is a single SVG (`src/app/icon.svg`, preserved as `assets/icon.svg`).
- No raster brand imagery exists in the repo.

### 4. Emoji
**Never used.** Not in copy, not as icons, not in error states.

### 5. Unicode characters
A small number used semantically:
- `—` em dash for missing values
- `·` middle dot as a separator between metadata fields
- `→` right arrow for "see more" links
- `+` (literal) inside the "Nuevo inmueble" CTA when paired with the `Plus` Lucide icon

---

## Index

| File / folder | What it is |
|---|---|
| `README.md` | This file — voice, visual foundations, iconography, index |
| `SKILL.md` | Agent-Skills entry point (cross-compatible with Claude Code) |
| `colors_and_type.css` | Drop-in CSS variables + base type styles |
| `assets/` | Brand SVGs, favicon, original `brand-icons.tsx` source |
| `assets/icon.svg` | The shipped favicon (steel key + brass paletón) |
| `assets/brand-icons.tsx` | All 14 candidate brand icons (verbatim from source) |
| `assets/brand-*.svg` | 9 standalone brand-mark SVGs |
| `preview/` | Per-card preview HTML files (shown in the Design System tab) |
| `ui_kits/web/` | The web UI kit — components + interactive demo |
| `ui_kits/web/index.html` | Clickable BuySell prototype: dashboard → properties → detail |
| `ui_kits/web/components.jsx` | All component definitions (Sidebar, Topbar, Card, Stat, etc.) |
| `ui_kits/web/screens.jsx` | The three screens wired together |

There are no slide templates in this design system because no decks were provided.

---

## Caveats

- **Font fidelity:** the real app loads Inter via `next/font/google` with subsets and font-display: swap. Our `colors_and_type.css` loads Inter via the Google Fonts CDN — visually identical for everything we render, but rendering metrics may drift by a fraction.
- **No photos:** the app's hero imagery is *user-uploaded property photos*. Where a card or screen wants a photo, the UI kit uses a placeholder tile. Do **not** fabricate property photos.
- **Mobile app:** an `apps/mobile/` workspace exists but is the unmodified Expo starter — it does not represent this brand. Excluded from the UI kit.
- **Brand-accent alternates:** the source `/brand` page proposes 3 alternate accent colours (`#A85F2E`, `#A8893A`, `#7A9080`). Only `#C49A4D` is shipped — we documented it as the canonical accent.
