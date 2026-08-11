// Aplica el logo maestro de NIDOKEY (monograma NK sobre crema) a todas las
// variantes de icono/marca de la app móvil y la web. Reproducible e idempotente:
// lee SIEMPRE de docs/brand/nidokey-logo-master.png y deriva el resto con sharp.
//   `node scripts/apply-brand-logo.mjs`
//
// Decisión de diseño (confirmada): el logo nuevo trae su PROPIO fondo crema, así
// que NO usa el brillo acero de scripts/icon-glow.mjs (legacy). Para iOS el icono
// debe ser un cuadrado OPACO (la transparencia sale negra en iOS), por eso se
// aplana sobre el crema del propio logo. Para Android adaptive, el foreground es
// el monograma con margen (safe zone) y el fondo es el color crema.
import sharp from "sharp";
import path from "node:path";
import { promises as fs } from "node:fs";

const SRC = path.resolve("docs/brand/nidokey-logo-exploration-2026-06-16/21-new-rounded-icon-transparent-final.png");
const MASTER = path.resolve("docs/brand/nidokey-logo-master.png");
const mobileImg = path.resolve("apps/mobile/assets/images");
const webApp = path.resolve("src/app");
const webPublic = path.resolve("public/brand");
const S = 1024;
const FG_SCALE = 0.72; // safe zone del adaptive icon (~72% del lienzo)

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

// 0. Fijar la fuente canónica (copia del export final del diseñador).
await fs.copyFile(SRC, MASTER);

// 1. Muestrear el color CREMA de fondo del maestro (puntos por encima/lados del
//    monograma, dentro del redondeo, donde el píxel es opaco = fondo).
const { data, info } = await sharp(MASTER).resize(S, S).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const at = (x, y) => {
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};
const candidates = [[512, 70], [512, 90], [120, 512], [904, 512]].map(([x, y]) => at(x, y)).filter((p) => p[3] > 250);
const creamRGB = candidates[0] ?? [250, 247, 241];
const cream = { r: creamRGB[0], g: creamRGB[1], b: creamRGB[2] };
const creamHex = "#" + [cream.r, cream.g, cream.b].map((v) => v.toString(16).padStart(2, "0")).join("");

// 2. iOS / icono global: a sangre, OPACO sobre crema (sin esquinas negras).
await sharp(MASTER).resize(S, S).flatten({ background: cream }).png().toFile(path.join(mobileImg, "icon.png"));

// 3. Android adaptive foreground: monograma con margen sobre transparente.
const fgInner = Math.round(S * FG_SCALE);
const fgBuf = await sharp(MASTER)
  .resize(fgInner, fgInner, { fit: "contain", background: transparent })
  .png()
  .toBuffer();
await sharp({ create: { width: S, height: S, channels: 4, background: transparent } })
  .composite([{ input: fgBuf, gravity: "center" }])
  .png()
  .toFile(path.join(mobileImg, "android-icon-foreground.png"));

// 4. Android monochrome (themed icons): silueta BLANCA del monograma (no el crema),
//    con el mismo margen. Umbral de luminancia sobre el foreground recién creado.
const fgComposited = await sharp(path.join(mobileImg, "android-icon-foreground.png")).raw().toBuffer({ resolveWithObject: true });
const md = fgComposited.data;
const mono = Buffer.alloc(S * S * 4);
for (let p = 0; p < S * S; p++) {
  const i = p * 4;
  const a = md[i + 3];
  const lum = 0.299 * md[i] + 0.587 * md[i + 1] + 0.114 * md[i + 2];
  const isGlyph = a > 128 && lum < 200; // crema (claro) fuera; NK acero/coral dentro
  mono[i] = 255;
  mono[i + 1] = 255;
  mono[i + 2] = 255;
  mono[i + 3] = isGlyph ? 255 : 0;
}
await sharp(mono, { raw: { width: S, height: S, channels: 4 } }).png().toFile(path.join(mobileImg, "android-icon-monochrome.png"));

// 5. Favicon de Expo web (app.json web.favicon) — transparencia OK.
await sharp(MASTER).resize(196, 196).png().toFile(path.join(mobileImg, "favicon.png"));

// 6. Logo in-app (login) — rounded transparente, tamaño pequeño.
await sharp(MASTER).resize(256, 256).png().toFile(path.join(mobileImg, "brand-logo.png"));

// 6b. Marca de navegación (HomeButton): el monograma SOLO, recortado a su caja y
//     en silueta blanca sobre transparente para poder teñirlo con `tintColor` y
//     que adopte el acento del tema. Se deriva del monochrome del paso 4, que ya
//     es la silueta, pero sin la zona segura del adaptive icon: ese margen del
//     22 % por lado obligaría a pintar una caja de 42 px para ver 24 px de marca.
const MARK_PX = 96; // basta para 24 px a densidad 3x
const MARK_MARGIN = 5; // aire óptico dentro de la caja
const markInner = MARK_PX - MARK_MARGIN * 2;
const markGlyph = await sharp(path.join(mobileImg, "android-icon-monochrome.png"))
  .trim() // fuera la zona segura: deja la caja real del monograma
  .resize(markInner, markInner, { fit: "contain", background: transparent })
  .png()
  .toBuffer();
const markRaw = await sharp({ create: { width: MARK_PX, height: MARK_PX, channels: 4, background: transparent } })
  .composite([{ input: markGlyph, gravity: "center" }])
  .raw()
  .toBuffer();
// Suelo de alfa: el promediado del resize deja neblina (alfa 1..31) pegada a los
// bordes y alguna mota SUELTA — que teñida con tintColor se ve como un puntito
// del color del acento flotando junto a la marca (lo cazó el propietario a 24 px).
// Umbral 32: mata neblina y motas, conserva el antialiasing real (alfa medio/alto).
for (let p = 0; p < MARK_PX * MARK_PX; p++) {
  if (markRaw[p * 4 + 3] < 32) markRaw[p * 4 + 3] = 0;
}
await sharp(markRaw, { raw: { width: MARK_PX, height: MARK_PX, channels: 4 } })
  .png()
  .toFile(path.join(mobileImg, "brand-mark.png"));

// 7. Refrescar las FUENTES base (source of truth) con el logo nuevo. El pipeline
//    icon-glow.mjs queda legacy; estas bases reflejan el logo actual por si acaso.
await fs.copyFile(MASTER, path.join(mobileImg, "icon.base.png"));
await sharp(MASTER).resize(S, S).png().toFile(path.join(mobileImg, "android-icon-foreground.base.png"));

// 8. Web (Next App Router): favicon + apple-icon + logo de cabecera en public.
await sharp(MASTER).resize(256, 256).png().toFile(path.join(webApp, "icon.png")); // favicon (transp.)
await sharp(MASTER).resize(180, 180).flatten({ background: cream }).png().toFile(path.join(webApp, "apple-icon.png")); // opaco (iOS)
await fs.mkdir(webPublic, { recursive: true });
await sharp(MASTER).resize(256, 256).png().toFile(path.join(webPublic, "nidokey-logo.png"));

console.log(`✔ logo aplicado · crema=${creamHex}`);
console.log("  movil: icon.png, android-icon-foreground.png, android-icon-monochrome.png, favicon.png, brand-logo.png, *.base.png");
console.log("  web:   src/app/icon.png, src/app/apple-icon.png, public/brand/nidokey-logo.png");
console.log(`  -> pon android.adaptiveIcon.backgroundColor = "${creamHex}" en apps/mobile/app.json`);
