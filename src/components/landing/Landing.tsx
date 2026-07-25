import type { ComponentType } from "react";
import {
  Building2,
  KeyRound,
  Plane,
  TrendingUp,
  Briefcase,
  Dumbbell,
  ShieldCheck,
  TrendingDown,
  BellRing,
  SlidersHorizontal,
} from "lucide-react";

/**
 * Landing pública (raíz `/`). UNA sola página: presentación de Nidokey + enlaces
 * de descarga para Android e iOS. Pensada para navegador de PC y móvil. Server
 * Component estático (sin auth, sin el chrome de la app — AppShell hace bypass
 * para `/`). Reutiliza los tokens de marca (steel `--primary` + bronce
 * `--brand-accent`) y los iconos lucide que ya usa la web.
 *
 * Los botones de descarga van como "Próximamente" porque la app aún no está
 * publicada en tiendas; al publicar, basta cambiar `StoreBadge` por un `Link`.
 */

const APP_NAME = "Nidokey";

type IconType = ComponentType<{ size?: number; className?: string }>;

const VERTICALS: { icon: IconType; title: string; body: string }[] = [
  {
    icon: Building2,
    title: "Inmuebles",
    body:
      "Guarda anuncios de varios portales como una sola ficha: histórico de precios, deduplicación automática y datos del Catastro.",
  },
  {
    icon: KeyRound,
    title: "Alquiler",
    body: "Sigue pisos y habitaciones en alquiler con su histórico, todo en una ficha.",
  },
  {
    icon: Plane,
    title: "Viajes",
    body: "Guarda vuelos, alojamientos y destinos para tus próximos viajes.",
  },
  {
    icon: TrendingUp,
    title: "Cripto y mercado",
    body:
      "Sigue criptomonedas, acciones, ETF y fondos con su cotización, gráfico de 7 días y el logo de cada activo.",
  },
  {
    icon: Briefcase,
    title: "Empleos",
    body:
      "Busca ofertas en InfoJobs, LinkedIn e Indeed a la vez, filtra por zona y guarda las que te interesen.",
  },
  {
    icon: Dumbbell,
    title: "Workout",
    body: "Registra tus entrenamientos y sigue tu progreso.",
  },
];

const ALERTS: { icon: IconType; title: string; body: string }[] = [
  {
    icon: TrendingDown,
    title: "Bajadas de precio",
    body: "Te avisamos en cuanto baja el precio de un inmueble o de un activo que sigues.",
  },
  {
    icon: BellRing,
    title: "Cambios en las publicaciones",
    body: "Sabrás al momento si un anuncio cambia o si una oferta de empleo se retira.",
  },
  {
    icon: SlidersHorizontal,
    title: "Avisos a tu medida",
    body: "Configura las alertas para lo que de verdad te importa.",
  },
];

const FEATURES = [
  "Gestión de la hipoteca",
  "Inversiones actuales y futuras",
  "Histórico de precios",
  "Compras de entrenamiento",
  "Importar compartiendo una URL",
  "Sin contraseñas",
];

export function Landing() {
  return (
    <div className="min-h-screen bg-bg text-text">
      {/* ===== Top bar (solo logo) ===== */}
      <header className="mx-auto flex max-w-5xl items-center px-6 py-5">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/nidokey-logo.png" alt="Nidokey" width={36} height={36} className="h-9 w-9 rounded-lg" />
          <div className="text-md font-semibold text-accent">{APP_NAME}</div>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden">
        {/* halo sutil steel detrás del hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-72 opacity-60"
          style={{
            background:
              "radial-gradient(60% 100% at 50% 0%, var(--primary-soft) 0%, transparent 70%)",
          }}
        />
        <div className="relative mx-auto grid max-w-5xl items-center gap-12 px-6 pb-8 pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:pt-14">
          <div>
            <h1 className="text-[34px] font-bold leading-[1.1] tracking-tight text-text sm:text-[44px]">
              Todo lo que sigues
              <br />
              <span className="text-primary">en un solo sitio.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-text-muted">
              {APP_NAME} reúne tus inmuebles, alquileres, viajes, inversiones,
              empleos y entrenamientos —con su histórico y con alertas cuando algo
              cambia— en una app sobria para tu móvil.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <StoreBadge store="android" />
              <StoreBadge store="ios" />
            </div>
            <p className="mt-3 text-xs text-text-subtle">
              Próximamente en Google Play y App Store.
            </p>
          </div>

          {/* Mockup del móvil */}
          <div className="flex justify-center lg:justify-end">
            <PhoneMock />
          </div>
        </div>
      </section>

      {/* ===== Verticales ===== */}
      <section className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="text-2xl font-semibold tracking-tight text-text">
          Todo lo que sigues, en un panel
        </h2>
        <p className="mt-2 max-w-2xl text-md text-text-muted">
          Varios mundos en la misma app, con el mismo cuidado por el dato y el
          histórico.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VERTICALS.map((v) => {
            const Icon = v.icon;
            return (
              <div
                key={v.title}
                className="rounded-xl border border-border bg-surface p-5 shadow-xs"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-soft text-primary ring-1 ring-inset ring-primary/15">
                  <Icon size={22} />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-text">{v.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
                  {v.body}
                </p>
              </div>
            );
          })}
        </div>

      </section>

      {/* ===== Alertas ===== */}
      <section className="mx-auto max-w-5xl px-6 pb-14">
        <h2 className="text-2xl font-semibold tracking-tight text-text">
          Alertas que no se te escapan
        </h2>
        <p className="mt-2 max-w-2xl text-md text-text-muted">
          Nidokey vigila por ti y te avisa en cuanto algo cambia.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {ALERTS.map((a) => {
            const Icon = a.icon;
            return (
              <div
                key={a.title}
                className="rounded-xl border border-border bg-surface p-5 shadow-xs"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-soft text-primary ring-1 ring-inset ring-primary/15">
                  <Icon size={22} />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-text">{a.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{a.body}</p>
              </div>
            );
          })}
        </div>

        {/* Chips de capacidades */}
        <div className="mt-8 flex flex-wrap gap-2.5">
          {FEATURES.map((f) => (
            <span
              key={f}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1.5 text-sm text-text-muted"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {f}
            </span>
          ))}
        </div>
      </section>

      {/* ===== Privacidad (chat E2E + sin contraseñas) — banda destacada ===== */}
      <section className="mx-auto max-w-5xl px-6 pb-4">
        <div className="overflow-hidden rounded-2xl bg-primary px-8 py-10 text-primary-fg shadow-sm sm:px-12">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/20">
            <ShieldCheck size={24} />
          </span>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">
            Privado, y solo tuyo
          </h2>
          <p className="mt-2 max-w-xl text-lg leading-relaxed text-primary-fg/85">
            Comparte tus sueños, metas y objetivos en un chat incorporado y cifrado
            de extremo a extremo.
          </p>
          <p className="mt-3 max-w-xl text-md text-primary-fg/80">
            Y entras sin contraseñas: tus datos, siempre protegidos.
          </p>
        </div>
      </section>

      {/* ===== Precios ===== */}
      <section className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="text-2xl font-semibold tracking-tight text-text">
          Precios sin sorpresas
        </h2>
        <p className="mt-2 max-w-2xl text-md text-text-muted">
          Empieza gratis con todo lo esencial. Premium amplía el asistente y las
          búsquedas cuando lo necesites.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
            <h3 className="text-lg font-semibold text-text">Gratis</h3>
            <p className="mt-1 text-3xl font-bold text-text">
              0 € <span className="text-sm font-normal text-text-muted">/ mes</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-text-muted">
              <li>• Registros ilimitados en todas las categorías</li>
              <li>• 3 alertas de precio activas</li>
              <li>• Chat con cifrado de extremo a extremo</li>
              <li>• Asistente Nidokey (40 mensajes al día)</li>
              <li>• 10 búsquedas de empleo al día</li>
            </ul>
          </div>
          <div className="rounded-xl border-2 border-primary bg-surface p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text">Premium</h3>
              <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                Para los que siguen de todo
              </span>
            </div>
            <p className="mt-1 text-3xl font-bold text-text">
              4,99 € <span className="text-sm font-normal text-text-muted">/ mes</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-text-muted">
              <li>• Todo lo del plan Gratis</li>
              <li>• 25 alertas de precio activas</li>
              <li>• Asistente Nidokey ampliado (400 mensajes al día)</li>
              <li>• 40 búsquedas de empleo al día</li>
              <li>• Cancela cuando quieras, desde la app</li>
            </ul>
            <p className="mt-4 text-xs text-text-subtle">
              La suscripción se gestiona dentro de la app.
            </p>
          </div>
        </div>
      </section>

      {/* ===== Descarga ===== */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface p-8 text-center shadow-sm sm:p-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/nidokey-logo.png" alt="Nidokey" width={48} height={48} className="mx-auto h-12 w-12 rounded-xl" />
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-text">
            Llévatela en el móvil
          </h2>
          <p className="mx-auto mt-2 max-w-md text-md text-text-muted">
            {APP_NAME} para Android e iOS. Sin contraseñas: entras con un código
            por email.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <StoreBadge store="android" />
            <StoreBadge store="ios" />
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-8">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/nidokey-logo.png" alt="Nidokey" width={18} height={18} className="h-[18px] w-[18px] rounded" />
            <span className="font-semibold text-accent">{APP_NAME}</span>
          </div>
          <span className="text-sm text-text-subtle">© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}

/* ───────────────────────── Mockup del móvil ───────────────────────── */

/** Marco de móvil estilizado con tarjetas mock (evoca la UI bronce/steel). */
function PhoneMock() {
  return (
    <div
      className="relative w-[248px] rounded-[2rem] border border-border-strong bg-surface p-2.5 shadow-md"
      style={{ aspectRatio: "9 / 19" }}
      aria-hidden
    >
      {/* notch */}
      <div className="mx-auto mb-2 mt-1 h-1.5 w-16 rounded-full bg-border-strong" />
      <div className="flex h-[calc(100%-1.5rem)] flex-col gap-2 overflow-hidden rounded-[1.4rem] bg-bg p-3">
        <div className="px-0.5 pb-1 text-[13px] font-bold text-text">Registros</div>
        <MockMarketRow name="BTC" sub="Bitcoin" price="60.375 €" up />
        <MockMarketRow name="SXR8.DE" sub="iShares S&P 500" price="702 €" up />
        <MockJobRow />
        <MockPropertyRow />
      </div>
    </div>
  );
}

function MockMarketRow({
  name,
  sub,
  price,
  up,
}: {
  name: string;
  sub: string;
  price: string;
  up?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="h-7 w-7 rounded-full bg-surface-sunken ring-1 ring-inset ring-border" />
        <div className="leading-tight">
          <div className="text-[12px] font-semibold text-text">{name}</div>
          <div className="text-[10px] text-text-subtle">{sub}</div>
        </div>
      </div>
      <div className="text-right leading-tight">
        <div className="text-[12px] font-bold text-accent">{price}</div>
        <div className={`text-[10px] ${up ? "text-success" : "text-danger"}`}>
          {up ? "▲ 0,9%" : "▼ 0,4%"}
        </div>
      </div>
    </div>
  );
}

function MockJobRow() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2">
      <span className="h-9 w-9 rounded-md bg-surface-sunken ring-1 ring-inset ring-border" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[12px] font-semibold text-text">
          Desarrollador/a React
        </div>
        <div className="truncate text-[10px] text-text-subtle">Bilbao · LinkedIn</div>
        <div className="text-[10px] font-semibold text-accent">28.000–35.000 €</div>
      </div>
    </div>
  );
}

function MockPropertyRow() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2">
      <span className="h-9 w-9 rounded-md bg-surface-sunken ring-1 ring-inset ring-border" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[12px] font-semibold text-text">
          Piso en Oviedo centro
        </div>
        <div className="truncate text-[10px] text-text-subtle">3 hab · 95 m²</div>
        <div className="text-[10px] font-bold text-accent">189.000 €</div>
      </div>
    </div>
  );
}

/* ───────────────────────── Badges de tienda ───────────────────────── */

/**
 * Badge estilo tienda, marcado "Próximamente" (no clicable). Al publicar:
 * cambiar a `<Link href=...>` y quitar el "Próximamente en". iOS y Android
 * comparten estilo.
 */
function StoreBadge({ store }: { store: "android" | "ios" }) {
  const label = store === "android" ? "Google Play" : "App Store";
  return (
    <div
      role="button"
      aria-disabled
      aria-label={`${label} — Próximamente`}
      className="relative inline-flex cursor-default items-center gap-2.5 rounded-xl bg-text px-4 py-2.5 text-text-inverse opacity-90"
    >
      {store === "android" ? <PlayMark /> : <AppleMark />}
      <span className="text-left leading-tight">
        <span className="block text-[10px] uppercase tracking-wide opacity-70">
          Próximamente en
        </span>
        <span className="block text-[15px] font-semibold">{label}</span>
      </span>
    </div>
  );
}

function PlayMark() {
  return (
    <svg width="20" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M3.6 2.3 13.5 12 3.6 21.7c-.3-.2-.5-.6-.5-1.1V3.4c0-.5.2-.9.5-1.1Z" fill="#34A853" />
      <path d="M16.8 8.7 13.5 12l3.3 3.3 3.6-2c.8-.5.8-1.6 0-2.1l-3.6-2Z" fill="#FBBC04" />
      <path d="M3.6 2.3c.2-.1.5-.1.8.1l12.4 6.3-3.3 3.3L3.6 2.3Z" fill="#EA4335" />
      <path d="M13.5 12l3.3 3.3L4.4 21.6c-.3.2-.6.2-.8.1L13.5 12Z" fill="#4285F4" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width="18" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.6 2.3 2.8 2.3 1.1 0 1.5-.7 2.9-.7 1.3 0 1.7.7 2.9.7 1.2 0 2-1.1 2.7-2.2.9-1.3 1.2-2.5 1.2-2.6-.1 0-2.4-.9-2.4-3.5Zm-2.3-6.4c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.7-.9 2.7 1 .1 2-.5 2.6-1.2Z" />
    </svg>
  );
}
