/**
 * Genera el ICONO DE NOTIFICACIÓN de Android a partir del monocromo del icono
 * de la app: `apps/mobile/assets/images/android-icon-monochrome.png`.
 *
 * Por qué hace falta un asset aparte en vez de reutilizar el monocromo:
 *  - Android pinta el icono de notificación como MÁSCARA: usa solo el canal
 *    alpha y lo tiñe con `notification_icon_color`. Cualquier detalle fino se
 *    convierte en ruido a 24-96 px.
 *  - El monocromo del icono lleva, además de la ligadura NK, un marco punteado
 *    fino alrededor. A tamaño de barra de estado ese marco se ve como un cerco
 *    sucio, así que hay que recortarlo.
 *  - El glifo ocupa solo ~56 % del lienzo; recortado y re-encuadrado se ve
 *    bastante más grande en la barra.
 *
 * El plugin de expo-notifications genera las densidades (24/36/48/72/96 px)
 * desde este fichero, así que 192 px de origen sobran para el mayor (96).
 *
 * Idempotente: se puede ejecutar tantas veces como se quiera.
 * Uso: node scripts/notification-icon.mjs
 */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "apps/mobile/assets/images/android-icon-monochrome.png");
const OUT = resolve(ROOT, "apps/mobile/assets/images/notification-icon.png");

/** Lado del PNG generado. El plugin baja de aquí a 96 px como máximo. */
const SIZE = 192;
/** Margen alrededor del glifo, en tanto por uno del lado. Android recorta un
 *  poco en algunas versiones, así que conviene no pegarlo al borde. */
const MARGIN = 0.12;
/** Radio del desenfoque para localizar los trazos GRUESOS: las líneas finas
 *  del marco se difuminan por debajo del umbral y el NK sobrevive. */
const BLUR_SIGMA = 8;
const THRESHOLD = 128;

/** Caja del glifo grueso (ignora el marco punteado). */
async function thickStrokeBox(src) {
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .extractChannel("alpha")
    .blur(BLUR_SIGMA)
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] > THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("No se encontró ningún trazo grueso en el monocromo");
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

const box = await thickStrokeBox(SRC);
console.log(`glifo detectado: ${box.width}x${box.height} en (${box.left},${box.top})`);

// Cuadrar la caja sobre el centro del glifo para no deformarlo.
const side = Math.max(box.width, box.height);
const cx = box.left + box.width / 2;
const cy = box.top + box.height / 2;
const meta = await sharp(SRC).metadata();
const square = {
  left: Math.max(0, Math.round(cx - side / 2)),
  top: Math.max(0, Math.round(cy - side / 2)),
  width: Math.min(side, meta.width),
  height: Math.min(side, meta.height),
};

const inner = Math.round(SIZE * (1 - MARGIN * 2));
const glyph = await sharp(SRC)
  .extract(square)
  // Alpha binario: Android usa el canal alpha como máscara; los medios tonos
  // del reescalado ensucian el borde al teñirlo.
  .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: glyph, gravity: "center" }])
  .png()
  .toFile(OUT);

console.log(`✔ ${OUT} (${SIZE}x${SIZE}, margen ${Math.round(MARGIN * 100)} %)`);
