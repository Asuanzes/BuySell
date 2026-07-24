/**
 * Configuración del chat: límites, ventanas y feature flags. Los flags se leen
 * de env (distintos por entorno en Vercel) y el móvil los recibe vía
 * GET /api/chat/bootstrap — nunca hardcodear flags en el cliente.
 */

const num = (env: string | undefined, def: number): number => {
  const n = env != null ? parseInt(env, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
};
const bool = (env: string | undefined, def: boolean): boolean =>
  env == null || env === "" ? def : env === "1" || env.toLowerCase() === "true";

export const CHAT_LIMITS = {
  maxMessageChars: num(process.env.CHAT_MAX_MESSAGE_CHARS, 4000),
  maxAttachmentsPerMessage: 6,
  maxAttachmentMbImage: num(process.env.CHAT_MAX_ATTACHMENT_MB, 10),
  maxAttachmentMbFile: 25,
  maxAttachmentMbAudio: 10,
  maxGroupParticipants: 64,
  editWindowMin: 15,
  deleteForAllWindowMin: 60,
  /** Mensajes por minuto y usuario (rate limit serverless-safe: count en BBDD). */
  rateMsgsPerMin: 30,
  /**
   * Respuestas del bot @Nidokey por usuario y día (tier gratis). Cada mensaje
   * al bot cuesta dinero real (hasta 4 llamadas a Claude Haiku); sin cuota
   * diaria, el límite de ráfaga de 30/min permitiría ~43k mensajes/día.
   */
  botMsgsPerDay: num(process.env.BOT_MSGS_PER_DAY, 40),
  /** Resultados de búsqueda de usuarios. */
  userSearchLimit: 10,
  /** Página de mensajes (keyset). */
  messagesPageSize: 50,
} as const;

// Adjuntos/voz necesitan R2 además de su flag: sin bucket quedan apagados
// aunque la env del flag esté a 1 (deploy seguro antes de crear el bucket).
// El flag por defecto es true: configurar R2 los enciende sin tocar más env
// (el flag queda como kill switch).
const r2Configured = !!(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET
);

export const CHAT_FLAGS = {
  enabled: bool(process.env.CHAT_ENABLED, true),
  groups: bool(process.env.CHAT_ENABLE_GROUPS, true),
  attachments: bool(process.env.CHAT_ENABLE_ATTACHMENTS, true) && r2Configured,
  voice: bool(process.env.CHAT_ENABLE_VOICE, true) && r2Configured,
  typing: bool(process.env.CHAT_ENABLE_TYPING, true),
  contextLinks: bool(process.env.CHAT_ENABLE_CONTEXT_LINKS, true),
  /** Incluir el cuerpo del mensaje en la notificación push. */
  pushPreview: bool(process.env.CHAT_PUSH_PREVIEW, true),
} as const;

/** MIME admitidos por tipo de adjunto (allowlist server-side). */
export const CHAT_MIME_ALLOW: Record<"IMAGE" | "FILE" | "AUDIO", readonly string[]> = {
  IMAGE: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/avif"],
  AUDIO: ["audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/mpeg", "audio/wav", "audio/3gpp", "audio/webm"],
  FILE: [
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/zip",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream", // genérico (limitado por tamaño)
  ],
} as const;

/** MIME admitidos para un kind; FILE acepta también imágenes (foto "como archivo"). */
export function allowedMimesFor(kind: "IMAGE" | "FILE" | "AUDIO"): readonly string[] {
  return kind === "FILE" ? [...CHAT_MIME_ALLOW.FILE, ...CHAT_MIME_ALLOW.IMAGE] : CHAT_MIME_ALLOW[kind];
}

/** Retención en días; null = no borrar nunca (default). */
export const CHAT_RETENTION_DAYS: number | null = (() => {
  const n = parseInt(process.env.CHAT_RETENTION_DAYS ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();
