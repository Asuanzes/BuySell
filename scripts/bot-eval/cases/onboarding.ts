import type { EvalCase } from "../types";

/** Rol 1 — guía/onboarding: preguntas "¿cómo se hace X?" → pasos + enlace, sin tools. */
const NO_WRITES = ["crear_registro", "borrar_registro", "fusionar_registros", "compartir_registro", "guardar_compartido"];

export const ONBOARDING_CASES: EvalCase[] = [
  {
    id: "onb-01",
    role: "onboarding",
    smoke: true,
    history: [{ role: "user", text: "¿Cómo añado un piso que he visto en Idealista?" }],
    expect: {
      forbidTools: "all",
      mustMatch: [/importar/i, /\[\[ir:\/importar\|/],
      mustNotMatch: [/no (puedo|se puede)/i],
    },
    judge: "Debe explicar que se pega la URL del anuncio en la pestaña Importar (o que él mismo puede crearlo si le pasan la URL), con un enlace de navegación a Importar. Sin pasos inventados.",
  },
  {
    id: "onb-02",
    role: "onboarding",
    history: [{ role: "user", text: "¿Dónde pongo el tema oscuro?" }],
    expect: {
      forbidTools: "all",
      mustMatch: [/\[\[ir:\/theme-settings\|/, /tema|oscuro/i],
    },
    judge: "Debe guiar a Cuenta → Tema (pantalla theme-settings) para elegir claro/oscuro/auto, con enlace de navegación.",
  },
  {
    id: "onb-03",
    role: "onboarding",
    history: [{ role: "user", text: "Quiero meter un libro escaneándolo, ¿se puede?" }],
    expect: {
      forbidTools: "all",
      mustMatch: [/c[oó]digo de barras|escane|isbn/i],
    },
    judge: "Debe confirmar que sí: en Importar se puede escanear el código de barras (ISBN) del libro, o buscar por título/autor.",
  },
  {
    id: "onb-04",
    role: "onboarding",
    smoke: true,
    // Reescrito el 2026-08-10 (fase 0: comida fuera de la app). El check literal
    // /pag/i era frágil — el bot expresa el mismo límite con «el dinero lo manejas
    // tú»; ahora se acepta cualquier forma de negar el pago.
    // NOTA: si aparece otro caso que mencione comida (pizza, restaurantes, carrito,
    // checkout), está CADUCADO por la misma razón — la vertical no existe.
    history: [{ role: "user", text: "¿Me pagas tú la suscripción de Nidokey?" }],
    expect: {
      forbidTools: "all",
      mustMatch: [/no puedo|no manejo|no gestiono|t[uú] (?:lo|la) |dinero|pag/i],
      mustNotMatch: [/(puedo|voy a|claro,? te lo) pag/i],
    },
    judge: "Debe dejar claro que él no paga nada: el pago lo hace el usuario (checkout/tienda). No debe prometer pagar ni insinuar que puede.",
  },
  {
    id: "onb-05",
    role: "onboarding",
    history: [{ role: "user", text: "¿Qué sabes hacer exactamente?" }],
    expect: {
      forbidTools: "all",
      // Enumerar capacidades da un poco más de sitio que una réplica normal (el
      // bot tiene más que contar desde el loop de producto), pero sigue acotado.
      maxChars: 900,
      mustMatch: [/registro|categor[ií]a/i],
    },
    judge: "Debe resumir en lenguaje natural qué consulta (registros, tendencias) y qué acciones hace con confirmación (crear/borrar/fusionar/compartir), sin nombrar herramientas internas ni JSON. La comida ya no existe en la app: mencionarla es un error.",
  },
  {
    id: "onb-06",
    role: "onboarding",
    history: [{ role: "user", text: "¿Cómo le enseño un piso mío a mi hermana?" }],
    expect: {
      forbidTools: NO_WRITES,
      mustMatch: [/compart/i, /@|usuario/i],
    },
    judge: "Debe explicar el compartir por @usuario (solo lectura, registro vivo) y que la hermana necesita tener @handle en su Cuenta; puede ofrecerse a compartirlo él con confirmación, pero sin ejecutarlo.",
  },
  {
    id: "onb-07",
    role: "onboarding",
    history: [{ role: "user", text: "Quiero organizar un viaje a Roma en octubre, ¿por dónde empiezo?" }],
    expect: {
      forbidTools: NO_WRITES,
      mustMatch: [/\[\[ir:\/viajes\/nuevo\|/, /destino|fechas|pasos|asistente/i],
    },
    judge: "Debe guiar al asistente de viajes de 4 pasos (destino+fechas → alojamiento → transporte → resumen) con enlace a /viajes/nuevo.",
  },
  {
    id: "onb-08",
    role: "onboarding",
    history: [{ role: "user", text: "Creo que tengo pisos repetidos, ¿dónde lo miro?" }],
    expect: {
      forbidTools: NO_WRITES,
      mustMatch: [/\[\[ir:\/matches\|/, /duplicado/i],
    },
    judge: "Debe guiar a la pestaña Duplicados (/matches) y puede ofrecer fusionarlos él con confirmación.",
  },
  {
    id: "onb-09",
    role: "onboarding",
    history: [{ role: "user", text: "¿Puedo exportar mis registros a Excel?" }],
    expect: {
      forbidTools: "all",
      mustMatch: [/\bno\b/i],
    },
    judge: "La app NO exporta a Excel: debe decirlo honestamente, sin inventar menús ni pasos inexistentes. Puede sugerir alternativas reales (p.ej. compartir un registro).",
  },
  {
    // CANARIO de capacidades: desde que existe editar_registro, el bot puede
    // cambiar el precio de un inmueble él mismo (con confirmación) — debe
    // OFRECERLO (o explicar la ficha además), nunca decir que no puede.
    id: "onb-10",
    role: "onboarding",
    smoke: true,
    history: [{ role: "user", text: "¿Cómo cambio el precio de uno de mis pisos?" }],
    expect: {
      forbidTools: ["editar_registro", "crear_registro", "borrar_registro", "fusionar_registros", "compartir_registro"],
      mustNotMatch: [/no puedo (editar|cambiar)/i],
    },
    judge: "Debe ofrecerse a cambiarlo él mismo (dime cuál y el precio nuevo, con confirmación) y/o explicar la ficha del inmueble. No debe negar la capacidad ni ejecutar nada aún.",
  },
];
