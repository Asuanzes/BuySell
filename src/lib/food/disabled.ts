import { NextResponse } from "next/server";

/**
 * Fase 0 food OFF (2026-08-09, PRODUCT_LOOP.md CICLO 2): kill-switch server-side
 * de los endpoints de comida que GASTAN dinero (Google Places, scrape de cartas
 * con Apify/Firecrawl+LLM). Necesario porque los bundles móviles anteriores al
 * OTA siguen mostrando la UI de comida y podrían disparar coste bajo demanda.
 * Reactivar = FOOD_ENABLED=1 en Vercel (no requiere deploy de código).
 * Las rutas de solo-BBDD (pedidos, direcciones) quedan intactas.
 */
export const foodEnabled = () => process.env.FOOD_ENABLED === "1";

export function foodDisabledResponse() {
  return NextResponse.json({ error: "food_disabled" }, { status: 503 });
}
