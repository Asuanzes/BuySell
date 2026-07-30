/**
 * Normalización y validación ESTRUCTURAL de referencias catastrales.
 *
 * Estructura oficial (Sede Electrónica del Catastro):
 *  - RC de finca (parcela): 14 caracteres alfanuméricos (PC1 7 + PC2 7).
 *  - RC completa de inmueble: 20 caracteres = finca (14) + cargo (4) + 2 de control.
 *
 * Validamos SOLO estructura (longitud + clases de caracteres). Los caracteres
 * de control tienen un algoritmo propio del Catastro que no reimplementamos:
 * la verificación real la hace el propio servicio OVC al consultar.
 */

/** Mayúsculas y sin separadores (espacios, guiones, puntos). */
export function normalizeCadastralRef(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-.·]/g, "");
}

const RC_RE = /^[A-Z0-9]{14}(?:[A-Z0-9]{4}[A-Z]{2})?$/;

/** ¿Tiene estructura de RC válida (14 = finca, 20 = inmueble)? */
export function isValidCadastralRef(ref: string): boolean {
  return RC_RE.test(ref);
}

/** ¿Es una RC de finca (14) que puede contener varios inmuebles? */
export function isParcelRef(ref: string): boolean {
  return ref.length === 14;
}

/** URL pública de la Sede Electrónica del Catastro para una RC. */
export function sedeCatastroUrl(ref: string): string {
  return `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx?RefC=${encodeURIComponent(ref)}&pest=rc&final=&del=&mun=`;
}
