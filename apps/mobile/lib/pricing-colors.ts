/**
 * Colores semánticos de variación de precio (verde = bajada/ganga, teja =
 * subida). El tema no tiene token de "éxito" (solo dangerFg para lo negativo),
 * así que se mantienen aquí, keyed por `dark`, sin tocar las 6 variantes del
 * tema. Bajada ≠ éxito en general, pero en inmuebles una bajada es la señal
 * que el usuario busca (misma convención que la landing `--price-down-*`).
 */
export function pricingColors(dark: boolean): {
  up: string;
  upSoft: string;
  down: string;
  downSoft: string;
} {
  return dark
    ? {
        up: "#E0826C",
        upSoft: "rgba(224,130,108,0.16)",
        down: "#7CC491",
        downSoft: "rgba(124,196,145,0.16)",
      }
    : {
        up: "#B0503E",
        upSoft: "#F6E7E2",
        down: "#2E7D4F",
        downSoft: "#E3F0E8",
      };
}
