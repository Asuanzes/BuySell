/**
 * Puntuación de un candidato a duplicado inmobiliario. PURA (sin I/O): se
 * extrae a su propio módulo para poder testearla sin cargar la cadena de
 * dependencias de `findSimilar` (Prisma, dHash/sharp).
 */

export type MatchSignals = {
  cadastreSame: boolean;
  photoMatches: number; // nº de fotos coincidentes
  titleJaccard: number; // 0..1
  geoDistanceM: number | null;
  builtAreaDiffPct: number | null;
  /** Diferencia relativa de renta mensual (solo si ambos la tienen). 0..1. */
  rentDiffPct: number | null;
  /** Misma operación (venta/alquiler): evita comparar peras con manzanas. */
  rentSameOperation: boolean;
};

export function scoreCandidate(s: MatchSignals): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (s.cadastreSame) {
    score = Math.max(score, 100);
    reasons.push("🏛 Misma referencia catastral");
  }

  // Fotos: potentes SOLO cuando otra señal INDEPENDIENTE las corrobora. El
  // falso positivo clásico son fotos de STOCK compartidas entre anuncios
  // distintos (misma cocina genérica en miles de fichas): 3 fotos "coinciden"
  // entre un piso en Vitoria y una casa en Oviedo. Corroboradores válidos:
  // título o geo — NO la renta (rentas ≤10 % son comunes en la misma ciudad)
  // ni el m² (tipos similares comparten tamaño). Sin corroboración, 3 fotos
  // ≈ señal media, no casi-identidad.
  // Corroboración para puntuaciones altas (90 de fotos): basta título ≥0.5.
  const photoCorroborated = s.titleJaccard >= 0.5 || (s.geoDistanceM != null && s.geoDistanceM < 100);
  // Corroboración FUERTE para renta y combos de auto-fusión: el título de los
  // portales comparte plantilla ("Alquiler de piso en …"), así que un 0.5-0.6
  // NO distingue pisos distintos; 0.7+ o geo sí.
  const strongCorroborated = s.titleJaccard >= 0.7 || (s.geoDistanceM != null && s.geoDistanceM < 100);
  if (s.photoMatches >= 3) {
    score = Math.max(score, photoCorroborated ? 90 : 60);
    reasons.push(`📸 ${s.photoMatches} fotos coincidentes`);
  } else if (s.photoMatches === 2) {
    score = Math.max(score, photoCorroborated ? 65 : 45);
    reasons.push("📸 2 fotos coincidentes");
  } else if (s.photoMatches === 1) {
    score = Math.max(score, photoCorroborated ? 45 : 30);
    reasons.push("📸 1 foto coincidente");
  }

  if (s.geoDistanceM != null && s.geoDistanceM < 50) {
    if (s.builtAreaDiffPct != null && s.builtAreaDiffPct <= 0.05) {
      score = Math.max(score, 80);
      reasons.push("📍 < 50m + m² casi iguales");
    } else {
      score = Math.max(score, 55);
      reasons.push(`📍 a ${Math.round(s.geoDistanceM)}m`);
    }
  }

  if (s.titleJaccard >= 0.7) {
    score = Math.max(score, 75);
    reasons.push(`📝 título ${Math.round(s.titleJaccard * 100)}% similar`);
  } else if (s.titleJaccard >= 0.5) {
    score = Math.max(score, 50);
    reasons.push(`📝 título ${Math.round(s.titleJaccard * 100)}% similar`);
  }

  // Renta casi idéntica y misma operación: CORROBORADOR, no señal independiente
  // (rentas dentro del 10 % son comunes en la misma ciudad). Solo suma si hay
  // título o geo — si no, dos pisos distintos con rentas parecidas serían
  // falsos duplicados.
  if (
    s.rentDiffPct != null &&
    s.rentSameOperation &&
    s.rentDiffPct <= 0.1 &&
    strongCorroborated
  ) {
    score = Math.max(score, 70);
    reasons.push("💶 renta casi idéntica");
  }

  // Combo fuerte: 3+ fotos + renta casi idéntica + corroboración fuerte
  // (título ≥0.7 o geo) = mismo piso, confianza alta (el auto-merge lo blinda
  // `autoMergeSafety` contra precios/tipos distintos).
  if (
    s.photoMatches >= 3 &&
    s.rentDiffPct != null &&
    s.rentSameOperation &&
    s.rentDiffPct <= 0.1 &&
    strongCorroborated
  ) {
    score = Math.max(score, 95);
    reasons.push("📸 fotos + renta coincidentes");
  }

  // Combo: ficha casi idéntica — título ~100% + renta idéntica + misma
  // operación = el mismo alquiler (el título lleva la dirección). Muy seguro.
  if (s.titleJaccard >= 0.9 && s.rentDiffPct != null && s.rentDiffPct <= 0.02 && s.rentSameOperation) {
    score = Math.max(score, 95);
    reasons.push("📋 ficha casi idéntica (título + renta)");
  }

  // Bonus: 2 señales débiles independientes suman
  const weakHits = [
    s.photoMatches >= 1 && s.photoMatches < 3,
    s.titleJaccard >= 0.5,
    s.geoDistanceM != null && s.geoDistanceM < 50,
  ].filter(Boolean).length;
  if (weakHits >= 2) score = Math.min(95, score + 15);

  return { score: Math.min(100, score), reasons };
}
