/**
 * Texto que se DESINTEGRA en partículas y se rehace formando la frase siguiente.
 *
 * Dos implementaciones y una elección automática:
 *
 *  1. **Skia** (`@shopify/react-native-skia`): la frase se rasteriza fuera de
 *     pantalla, se leen sus píxeles y cada píxel opaco se convierte en un punto.
 *     Miles de puntos dibujados en UNA sola llamada (`Atlas`), animados en el
 *     hilo de UI. Es la única forma de tener miles de partículas en React
 *     Native: 10.000 vistas animadas matarían la app.
 *  2. **Por caracteres**: cada letra sale despedida encogiendo hasta ser una
 *     mota. ~35 partículas en vez de miles, pero funciona en cualquier binario.
 *
 * La elección NO es estética, es de supervivencia: Skia trae código nativo, así
 * que un binario compilado antes de instalarlo no lo tiene. Importarlo a lo
 * bruto dejaría la pantalla de Viajes muerta ("could not be found in native
 * binary") en todas las instalaciones anteriores. Por eso la carga va envuelta
 * en try/catch y hay una frontera de error: si Skia falta o falla al pintar, se
 * usa el efecto por caracteres y no se entera nadie.
 *
 * ¿Por qué el try/catch basta? Porque el fallo es un `throw` de JavaScript
 * corriente, no un crash nativo. En
 * `node_modules/@shopify/react-native-skia/lib/module/skia/NativeSetup.js`, que
 * se importa en la primera línea del paquete:
 *
 *     if (SkiaModule == null || typeof SkiaModule.install !== "function") {
 *       throw new Error("Native RNSkia Module cannot be found! ...");
 *     }
 *
 * Consecuencia operativa IMPORTANTE: como esta dependencia es de verdad
 * opcional, NO hace falta subir `runtimeVersion`. Un mismo runtime (0.1.1)
 * puede cubrir binarios con y sin Skia — los viejos usan el efecto por
 * caracteres y los nuevos las partículas. Eso mantiene el build de iOS ya
 * aprobado en TestFlight recibiendo actualizaciones.
 *
 * ⚠️ Ese permiso vale SOLO mientras Skia se use así, en modo opcional. En
 * cuanto algo la importe de forma estática, los dos binarios dejan de ser
 * compatibles y habrá que separar el runtime.
 */
import { Component, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { fonts } from "@/lib/fonts";

/* -------------------------------------------------------------------------- */
/* Carga guardada de Skia                                                     */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SkiaMod: any = null;
try {
  // require, no import: un `import` estático lo evalúa al cargar el módulo y no
  // habría forma de recuperarse en un binario sin la parte nativa.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SkiaMod = require("@shopify/react-native-skia");
} catch {
  SkiaMod = null;
}

/** ¿Puede este binario dibujar partículas de verdad? */
export const hasSkiaParticles = SkiaMod != null;

/** Tamaño de la frase en pantalla. */
const FONT_SIZE = 13;
/**
 * Se rasteriza a 3× para sacar más puntos de la misma frase: a tamaño real una
 * línea de texto tiene ~1.500 píxeles opacos; a 3× pasan de 10.000.
 */
const RASTER_SCALE = 3;
/** Tope de partículas. Por encima no se nota y sí se paga. */
const MAX_POINTS = 10000;
/** Lado del punto, en píxeles de pantalla. */
const DOT = 1.4;
const LINE_HEIGHT = Math.round(FONT_SIZE * 1.5);

const DISINTEGRATE_MS = 460;
const REBUILD_MS = 560;

export type ParticleTextProps = {
  text: string;
  /** Cambia una vez por PROCESO: es lo que dispara la desintegración. */
  generation: number;
  color: string;
  reduceMotion: boolean;
  /** Ancho disponible, para saber dónde cortar la frase. */
  width: number;
};

/* -------------------------------------------------------------------------- */
/* Implementación Skia: la frase se vuelve una nube de puntos                  */
/* -------------------------------------------------------------------------- */

type Cloud = { xs: number[]; ys: number[]; count: number };

/**
 * Frase → nube de puntos. Se dibuja fuera de pantalla a 3×, se leen los píxeles
 * y cada uno con tinta se convierte en una partícula.
 *
 * Devuelve null ante cualquier problema (sin superficie, sin píxeles, frase
 * vacía); quien llama cae entonces al efecto por caracteres.
 */
function rasterize(text: string, font: unknown, maxWidth: number): Cloud | null {
  try {
    const { Skia } = SkiaMod;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = font as any;
    const measured = f.measureText(text).width as number;
    const w = Math.ceil(Math.min(measured, maxWidth * RASTER_SCALE)) + 4;
    const h = Math.ceil(FONT_SIZE * RASTER_SCALE * 1.6);
    if (w <= 4 || h <= 0) return null;

    const surface = Skia.Surface.MakeOffscreen(w, h);
    if (!surface) return null;
    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    paint.setColor(Skia.Color("white"));
    // La línea base a ~75% de la altura deja hueco para las colas de las "g".
    canvas.drawText(text, 2, Math.round(h * 0.72), paint, f);

    const image = surface.makeImageSnapshot();
    const pixels = image.readPixels() as Uint8Array | null;
    if (!pixels) return null;

    // Primera pasada: dónde hay tinta. El canal alfa es el byte 4 de cada píxel.
    const candX: number[] = [];
    const candY: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (pixels[(y * w + x) * 4 + 3]! > 110) {
          candX.push(x / RASTER_SCALE);
          candY.push(y / RASTER_SCALE);
        }
      }
    }
    if (!candX.length) return null;

    // Segunda pasada: si hay más de los que se van a dibujar, se coge uno de
    // cada N repartidos por toda la frase — no los primeros, que serían solo las
    // primeras letras.
    const step = Math.max(1, Math.ceil(candX.length / MAX_POINTS));
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < candX.length; i += step) {
      xs.push(candX[i]!);
      ys.push(candY[i]!);
    }
    return { xs, ys, count: xs.length };
  } catch {
    return null;
  }
}

function SkiaParticleText({ text, generation, color, reduceMotion, width }: ParticleTextProps) {
  const { Canvas, Atlas, Rect, rect, useTexture, useRSXformBuffer, useFont } = SkiaMod;

  const font = useFont(require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf"), FONT_SIZE * RASTER_SCALE);
  const [shown, setShown] = useState(text);
  const progress = useSharedValue(0);
  const gen = useRef(generation);
  const rebuilding = useRef(false);

  const cloud = useMemo(
    () => (font && width > 0 ? rasterize(shown, font, width) : null),
    [font, shown, width]
  );

  // Las coordenadas viajan al hilo de UI como arrays planos: el worklet las
  // captura una vez por frase, no en cada fotograma.
  const xs = cloud?.xs ?? [];
  const ys = cloud?.ys ?? [];
  const count = cloud?.count ?? 0;

  useEffect(() => {
    // Mismo proceso: solo cambian los números de la frase. Se actualiza en
    // silencio; desintegrar en cada tic del contador sería un parpadeo.
    if (generation === gen.current) {
      if (text !== shown && !rebuilding.current) setShown(text);
      return;
    }
    gen.current = generation;
    if (reduceMotion) {
      setShown(text);
      return;
    }
    rebuilding.current = true;
    progress.value = withTiming(1, { duration: DISINTEGRATE_MS, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) runOnJS(setShown)(text);
    });
  }, [text, generation, shown, reduceMotion, progress]);

  useEffect(() => {
    if (!rebuilding.current) return;
    rebuilding.current = false;
    if (reduceMotion) {
      progress.value = 0;
      return;
    }
    progress.value = 1;
    progress.value = withTiming(0, { duration: REBUILD_MS, easing: Easing.out(Easing.cubic) });
  }, [shown, reduceMotion, progress]);

  const texture = useTexture(<Rect rect={rect(0, 0, DOT, DOT)} color={color} />, { width: DOT, height: DOT });
  const sprites = useMemo(
    () => new Array(Math.max(1, count)).fill(0).map(() => rect(0, 0, DOT, DOT)),
    [count, rect]
  );

  const transforms = useRSXformBuffer(Math.max(1, count), (val: { set: (a: number, b: number, c: number, d: number) => void }, i: number) => {
    "worklet";
    const t = progress.value;
    const hx = xs[i] ?? 0;
    const hy = ys[i] ?? 0;
    // Ángulo áureo: reparte las direcciones sin que se vean anillos ni radios.
    const a = i * 2.399963;
    const reach = 26 + (i % 41);
    const tx = hx + Math.cos(a) * reach * t;
    // Sesgo hacia arriba: el polvo se desvanece subiendo, no cayendo.
    const ty = hy + Math.sin(a) * reach * t - 14 * t;
    val.set(1 - 0.45 * t, 0, tx, ty);
  });

  // Sin nube (fuente aún cargando, o rasterizado fallido) no se pinta nada: el
  // contenedor ya reserva la altura, así que no salta el layout.
  if (!cloud) return <View style={[styles.canvas, { width }]} />;

  return (
    <Canvas style={[styles.canvas, { width }]}>
      <Atlas image={texture} sprites={sprites} transforms={transforms} />
    </Canvas>
  );
}

/* -------------------------------------------------------------------------- */
/* Implementación por caracteres: cada letra es su propia partícula            */
/* -------------------------------------------------------------------------- */

const STAGGER = 0.02;
const MAX_STAGGER = 0.45;

type Particle = { char: string; dx: number; dy: number; rot: number; delay: number };

function particlesOf(text: string): Particle[] {
  return [...text].map((char, i) => {
    const a = (i * 137.508 * Math.PI) / 180;
    const reach = 18 + ((i * 61) % 26);
    return {
      char,
      dx: Math.cos(a) * reach,
      dy: Math.sin(a) * reach - 6,
      rot: ((i % 7) - 3) * 14,
      delay: Math.min(MAX_STAGGER, i * STAGGER),
    };
  });
}

function Char({ p, progress, color }: { p: Particle; progress: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, (progress.value - p.delay) / (1 - MAX_STAGGER)));
    return {
      opacity: 1 - t,
      transform: [
        { translateX: p.dx * t },
        { translateY: p.dy * t },
        { rotate: `${p.rot * t}deg` },
        { scale: 1 - 0.82 * t },
      ],
    };
  });
  return (
    <Animated.Text style={[styles.char, { color }, p.char === " " && styles.space, style]} allowFontScaling={false}>
      {p.char === " " ? " " : p.char}
    </Animated.Text>
  );
}

function CharParticleText({ text, generation, color, reduceMotion }: ParticleTextProps) {
  const [shown, setShown] = useState(text);
  const progress = useSharedValue(0);
  const particles = useMemo(() => particlesOf(shown), [shown]);
  const gen = useRef(generation);
  const rebuilding = useRef(false);

  useEffect(() => {
    if (generation === gen.current) {
      if (text !== shown && !rebuilding.current) setShown(text);
      return;
    }
    gen.current = generation;
    if (reduceMotion) {
      setShown(text);
      return;
    }
    rebuilding.current = true;
    progress.value = withTiming(1, { duration: 420, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) runOnJS(setShown)(text);
    });
  }, [text, generation, shown, reduceMotion, progress]);

  useEffect(() => {
    if (!rebuilding.current) return;
    rebuilding.current = false;
    if (reduceMotion) {
      progress.value = 0;
      return;
    }
    progress.value = 1;
    progress.value = withTiming(0, { duration: 520, easing: Easing.out(Easing.cubic) });
  }, [shown, reduceMotion, progress]);

  return (
    <View style={styles.line}>
      {particles.map((p, i) => (
        <Char key={`${i}-${p.char}`} p={p} progress={progress} color={color} />
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Elección + red de seguridad                                                */
/* -------------------------------------------------------------------------- */

/**
 * Si Skia revienta al pintar, esto degrada al efecto por caracteres en vez de
 * tumbar la pantalla entera. Es una animación decorativa: no hay ningún motivo
 * por el que pueda costarle al usuario el acceso a sus vuelos.
 */
class ParticleBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[particle-text] Skia falló, se usa el efecto por caracteres:", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ParticleTextBase(props: ParticleTextProps) {
  if (!hasSkiaParticles || props.reduceMotion || props.width <= 0) {
    // Con "reducir movimiento" no hace falta nada caro: el texto cambia y ya.
    return <CharParticleText {...props} />;
  }
  return (
    <ParticleBoundary fallback={<CharParticleText {...props} />}>
      <SkiaParticleText {...props} />
    </ParticleBoundary>
  );
}

export const ParticleText = memo(
  ParticleTextBase,
  (a, b) => a.text === b.text && a.generation === b.generation && a.color === b.color && a.width === b.width && a.reduceMotion === b.reduceMotion
);

const styles = StyleSheet.create({
  canvas: { height: LINE_HEIGHT },
  line: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", minHeight: LINE_HEIGHT },
  char: { fontSize: FONT_SIZE, fontFamily: fonts.bodySemibold },
  space: { width: 4 },
});
