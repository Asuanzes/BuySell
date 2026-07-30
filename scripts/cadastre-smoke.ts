/**
 * Smoke test de SOLO LECTURA del embudo catastral contra los servicios
 * oficiales (OVC + CartoCiudad). Separado de la suite normal (no es *.test.ts):
 *   npx tsx scripts/cadastre-smoke.ts
 * Usa exclusivamente datos públicos (el fixture dorado de Santa Cruz de
 * Mudela); nunca direcciones privadas ni datos de usuario.
 */
import { resolveCadastre } from "../src/features/cadastre/resolver";

async function main() {
  // 1. RC en la descripción (capa 1)
  const r1 = await resolveCadastre({
    description: "Casa de pueblo. Referencia catastral 9872023VH5797S0001WX.",
  });
  console.log("[1 descripción]", r1.status, r1.method, r1.candidates[0]?.ref, r1.candidates[0]?.confidence);

  // 2. Coordenadas difuminadas (capa 2: RCCOOR → Distancia)
  const r2 = await resolveCadastre({ latitude: 38.64025, longitude: -3.46328 });
  console.log("[2 coords]", r2.status, r2.method, `${r2.candidates.length} candidatos`, r2.candidates[0]?.ref);

  // 3. Numerero (capa 3a: número inexistente con vecinos)
  const r3 = await resolveCadastre({
    address: "Calle Gloria 71",
    city: "Santa Cruz de Mudela",
    province: "Ciudad Real",
  });
  console.log("[3 numerero]", r3.status, r3.method, r3.numberSuggestions?.map((s) => s.number).join(","));

  // 4. CartoCiudad (capa 3b: dirección que DNPLOC no resuelve tal cual)
  const r4 = await resolveCadastre({
    address: "C/ Gloria nº 51",
    city: "Santa Cruz de Mudela",
    province: "Ciudad Real",
  });
  console.log("[4 dirección/cartociudad]", r4.status, r4.method, r4.candidates[0]?.ref);
  console.log("   attempts:", r4.attempts.map((a) => `${a.stage}:${a.outcome}`).join(" · "));

  // 5. Pin del usuario (capa 4)
  const r5 = await resolveCadastre({ pin: { latitude: 38.64025, longitude: -3.46328 } });
  console.log("[5 pin]", r5.status, r5.method, `${r5.candidates.length} candidatos`);
}

main().catch((e) => {
  console.error("SMOKE FALLÓ:", e);
  process.exit(1);
});
