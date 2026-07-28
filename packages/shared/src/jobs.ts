/**
 * Etiquetas de los portales de empleo — FUENTE ÚNICA para servidor y móvil.
 *
 * Antes el móvil repetía la misma cadena de ternarios en TRES pantallas
 * (RecordCard, ficha de empleo e Importar) y el servidor tenía la suya: añadir
 * un portal significaba tocar cuatro sitios y olvidarse de alguno. Ahora es una
 * entrada en este mapa.
 *
 * `linkedin`/`indeed` ya no se consultan (fuentes de pago retiradas), pero los
 * registros guardados en su día conservan su plataforma y deben etiquetarse.
 */
export const JOB_PLATFORM_LABELS: Record<string, string> = {
  infojobs: "InfoJobs",
  tecnoempleo: "Tecnoempleo",
  linkedin: "LinkedIn",
  indeed: "Indeed",
  remotive: "Remotive",
  remoteok: "RemoteOK",
  arbeitnow: "Arbeitnow",
  jobicy: "Jobicy",
  himalayas: "Himalayas",
  themuse: "The Muse",
};

/** Etiqueta visible del portal, o null si no se reconoce. */
export function jobPlatformLabel(platform?: string | null): string | null {
  return platform ? JOB_PLATFORM_LABELS[platform] ?? null : null;
}
