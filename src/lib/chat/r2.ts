import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 (S3-compatible) para los adjuntos del chat. Bucket PRIVADO:
 * el cliente nunca ve las claves — sube con una URL PUT firmada (10 min) y
 * descarga con URLs GET firmadas (7 días, el máximo de SigV4).
 *
 * Sin las env `R2_*` todo queda inerte: `r2Enabled()` = false, el endpoint de
 * uploads devuelve 503 y los flags attachments/voice se apagan solos (ver
 * config.ts). Así el deploy es seguro antes de crear el bucket.
 */

const PUT_EXPIRY_S = 10 * 60;
const GET_EXPIRY_S = 7 * 24 * 3600; // máximo permitido por SigV4

function envs() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function r2Enabled(): boolean {
  return envs() !== null;
}

let client: S3Client | null = null;
let clientBucket = "";

function getClient(): { client: S3Client; bucket: string } {
  const e = envs();
  if (!e) throw new Error("R2 no configurado (faltan env R2_*)");
  if (!client) {
    // R2_ENDPOINT (opcional) = la URL S3 exacta que muestra Cloudflare junto a
    // las claves. Imprescindible con jurisdicción EU
    // (https://<account_id>.eu.r2.cloudflarestorage.com); sin ella se asume Default.
    const endpoint =
      process.env.R2_ENDPOINT?.trim().replace(/\/+$/, "") ||
      `https://${e.accountId}.r2.cloudflarestorage.com`;
    client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId: e.accessKeyId, secretAccessKey: e.secretAccessKey },
    });
    clientBucket = e.bucket;
  }
  return { client, bucket: clientBucket };
}

/** URL firmada para SUBIR un objeto (el móvil hace PUT con Content-Type). */
export async function presignPut(key: string, mime: string): Promise<string> {
  const { client, bucket } = getClient();
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mime }), {
    expiresIn: PUT_EXPIRY_S,
  });
}

/** URL firmada para DESCARGAR un objeto. */
export async function presignGet(key: string): Promise<string> {
  const { client, bucket } = getClient();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: GET_EXPIRY_S,
  });
}

// Caché de URLs firmadas por KEY a nivel de módulo: la firma dura 7 días, así
// que reutilizarla 6 días es seguro y evita recomputar SigV4 en cada poll de
// mensajes (el cliente además fija la primera URL que ve por attachment.id).
// Sobrevive entre invocaciones warm de la lambda; en cold start se rehace.
const SIGN_CACHE_TTL_MS = 6 * 24 * 3600 * 1000;
const SIGN_CACHE_MAX = 2000;
const signCache = new Map<string, { url: string; expiresAt: number }>();

async function presignGetCached(key: string): Promise<string> {
  const hit = signCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.url;
  const url = await presignGet(key);
  if (signCache.size >= SIGN_CACHE_MAX) signCache.clear();
  signCache.set(key, { url, expiresAt: Date.now() + SIGN_CACHE_TTL_MS });
  return url;
}

/**
 * Metadatos REALES del objeto subido (el presigned PUT no impone tamaño, así
 * que el sizeBytes declarado por el cliente no es de fiar). null si no existe.
 */
export async function headObject(key: string): Promise<{ sizeBytes: number; contentType: string | null } | null> {
  if (!r2Enabled()) return null;
  try {
    const { client, bucket } = getClient();
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
  } catch {
    return null;
  }
}

/** Primeros `n` bytes del objeto (magic bytes). null si no existe o R2 falla. */
export async function readObjectRange(key: string, n: number): Promise<Uint8Array | null> {
  if (!r2Enabled()) return null;
  try {
    const { client, bucket } = getClient();
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${n - 1}` })
    );
    const bytes = await res.Body?.transformToByteArray();
    return bytes ?? null;
  } catch {
    return null;
  }
}

/** Borra un objeto (best-effort): cron de limpieza y cambio de avatar. */
export async function deleteObject(key: string): Promise<boolean> {
  if (!r2Enabled()) return false;
  try {
    const { client, bucket } = getClient();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Lista todas las keys bajo un prefijo con su fecha (paginación completa). */
export async function listObjects(prefix: string): Promise<{ key: string; lastModified: Date | null }[]> {
  if (!r2Enabled()) return [];
  const { client, bucket } = getClient();
  const out: { key: string; lastModified: Date | null }[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
    );
    for (const o of res.Contents ?? []) {
      if (o.Key) out.push({ key: o.Key, lastModified: o.LastModified ?? null });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/** Extensiones que produce el presign de avatares (EXT_BY_MIME). */
const AVATAR_EXT = "jpg|png|webp|heic|heif|avif|gif";

/**
 * Forma EXACTA de la key de la foto de un grupo, para validar lo que manda el
 * cliente en el PATCH. Un `startsWith` del prefijo no basta: deja pasar
 * `avatars/group/<id>/../../chat/u/<otro>/x.jpg`, que luego se firma en el
 * endpoint público y se le pasa a deleteObject.
 */
export function groupImageKey(conversationId: string): RegExp {
  const safeId = conversationId.replace(/[^a-zA-Z0-9_-]/g, "");
  return new RegExp(`^avatars/group/${safeId}/[a-z0-9]{1,48}\\.(${AVATAR_EXT})$`);
}

/**
 * Convierte lo guardado en ChatAttachment.url a URL servible: las keys de R2
 * se firman; URLs http(s) completas (legacy/externas) pasan tal cual. Si R2 no
 * está configurado, la key se devuelve sin firmar (no romper el listado).
 */
export async function signAttachmentUrl(stored: string): Promise<string> {
  if (/^https?:\/\//i.test(stored)) return stored;
  if (!r2Enabled()) return stored;
  try {
    return await presignGetCached(stored);
  } catch {
    return stored;
  }
}

/** Firma las URLs de los attachments de un MessageDto (mutación barata local). */
export async function signMessageAttachments<T extends { attachments: { url: string }[] }>(dto: T): Promise<T> {
  if (dto.attachments.length === 0) return dto;
  await Promise.all(
    dto.attachments.map(async (a) => {
      a.url = await signAttachmentUrl(a.url);
    })
  );
  return dto;
}
