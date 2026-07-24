/** Puente HTTPS → deep link tras el checkout de suscripción (fake o Stripe).
 *  El estado REAL lo fija el webhook; la app consulta /api/billing/status. */
export default async function BillingReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const status = String(sp.status ?? "success");
  const deepLink = `nidokey://premium?from=checkout&status=${encodeURIComponent(status)}`;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#FAFAF7", color: "#262320", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <script dangerouslySetInnerHTML={{ __html: `window.location.href=${JSON.stringify(deepLink)};` }} />
      <section style={{ textAlign: "center" }}>
        <h1>Volviendo a Nidokey</h1>
        <p>Si la app no se abre automáticamente, vuelve a ella para ver tu suscripción.</p>
        <a href={deepLink}>Abrir Nidokey</a>
      </section>
    </main>
  );
}
