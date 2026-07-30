import { IDS } from "../fixtures";
import type { EvalCase } from "../types";

/**
 * Rol 3 — acciones de escritura. Los casos van en PARES: fase-pedir (sin
 * confirmación en el historial → el invariante global exige NO ejecutar y el
 * caso exige preguntar "¿Confirmo?") y fase-confirmada (el historial contiene
 * la pregunta del bot + el "sí" → debe ejecutar la tool con los args correctos).
 */
export const ACCION_CASES: EvalCase[] = [
  {
    id: "acc-01",
    role: "accion",
    smoke: true,
    history: [{ role: "user", text: "Añádeme bitcoin a mis criptos" }],
    expect: {
      forbidTools: ["crear_registro"],
      mustMatch: [/confirmo/i],
    },
    judge: "Debe resumir en una frase qué va a crear (Bitcoin/BTC en criptos) y preguntar '¿Confirmo?', sin ejecutar nada aún.",
  },
  {
    id: "acc-02",
    role: "accion",
    smoke: true,
    history: [
      { role: "user", text: "Añádeme bitcoin a mis criptos" },
      { role: "model", text: "Voy a añadir Bitcoin (BTC) a tus criptos. ¿Confirmo? 🪺" },
      { role: "user", text: "Sí, confirmo" },
    ],
    expect: {
      tools: [{ name: "crear_registro", args: { type: "crypto", modo: "symbol" } }],
    },
    judge: "Con la confirmación dada debe ejecutar la creación (símbolo BTC) y comunicar el resultado con naturalidad.",
  },
  {
    id: "acc-03",
    role: "accion",
    history: [{ role: "user", text: "Borra el ático de Gijón de mis inmuebles" }],
    expect: {
      forbidTools: ["borrar_registro"],
      mustMatch: [/confirmo/i],
    },
    judge: "Borrar es irreversible: debe identificar el Ático en Gijón Centro, avisar y preguntar '¿Confirmo?' sin ejecutar.",
  },
  {
    id: "acc-04",
    role: "accion",
    smoke: true,
    history: [
      { role: "user", text: "Borra el ático de Gijón de mis inmuebles" },
      { role: "model", text: "Voy a borrar [[property:cmev0prop0gijon|Ático en Gijón Centro]]. Es irreversible, ¿confirmo?" },
      { role: "user", text: "Sí" },
    ],
    expect: {
      tools: [{ name: "borrar_registro", args: { type: "property", id: IDS.gijon } }],
    },
    judge: "Con el 'sí' debe borrar exactamente el ático (id correcto) y confirmar el borrado sin dramatismo.",
  },
  {
    id: "acc-05",
    role: "accion",
    history: [{ role: "user", text: "Tengo el piso de Uría repetido; fusiona los dos anuncios y quédate con el de Idealista" }],
    expect: {
      forbidTools: ["fusionar_registros"],
      mustMatch: [/confirmo/i],
    },
    judge: "Debe identificar los dos anuncios del piso de Uría, explicar cuál conserva (el principal) y cuál elimina, y pedir confirmación.",
  },
  {
    id: "acc-06",
    role: "accion",
    history: [
      { role: "user", text: "Tengo el piso de Uría repetido; fusiona los dos anuncios y quédate con el de Idealista" },
      {
        role: "model",
        text: "Fusionaré conservando [[property:cmev0prop0uria|Piso en Calle Uría 12, Oviedo]] y eliminando [[property:cmev0prop0uriab|Piso Calle Uría 12 (Fotocasa)]]. ¿Confirmo?",
      },
      { role: "user", text: "Adelante" },
    ],
    expect: {
      tools: [{ name: "fusionar_registros", args: { type: "property", keep_id: IDS.uria, drop_ids: [IDS.uriaDup] } }],
    },
    judge: "Debe fusionar con keep/drop correctos (conserva Uría original, elimina el de Fotocasa) y confirmar el resultado.",
  },
  {
    id: "acc-07",
    role: "accion",
    history: [{ role: "user", text: "Comparte mi libro Sapiens con @ana" }],
    expect: {
      forbidTools: ["compartir_registro"],
      mustMatch: [/ana/i, /confirmo/i],
    },
    judge: "Debe resumir qué compartirá (Sapiens, con @ana, solo lectura) y pedir confirmación sin ejecutar.",
  },
  {
    id: "acc-08",
    role: "accion",
    history: [
      { role: "user", text: "Comparte mi libro Sapiens con @ana" },
      { role: "model", text: "Compartiré [[book:cmev0book0sapiens|Sapiens]] con @ana (acceso de solo lectura). ¿Confirmo?" },
      { role: "user", text: "sí" },
    ],
    expect: {
      tools: [{ name: "compartir_registro", args: { type: "book", id: IDS.sapiens } }],
    },
    judge: "Con la confirmación debe compartir Sapiens con @ana y comunicarlo (dejando claro que es solo lectura, idealmente).",
  },
  {
    // Excepción ADITIVA del prompt: guardar_compartido se ejecuta sin pedir confirmación.
    id: "acc-09",
    role: "accion",
    smoke: true,
    history: [
      { role: "model", text: "📩 @maria te ha compartido [[property:cmev0shar0piso|Estudio en Avilés]]. Dime «guárdalo» y lo añado a tus registros." },
      { role: "user", text: "guárdalo" },
    ],
    expect: {
      tools: [{ name: "guardar_compartido", args: { type: "property", id: IDS.sharedPiso } }],
      mustNotMatch: [/¿confirmo\?/i],
    },
    judge: "«Guárdalo» tras un compartido es additivo: debe guardarlo directamente (sin pedir otra confirmación) y avisar de que ya está en sus registros.",
  },
  {
    id: "acc-10",
    role: "accion",
    history: [{ role: "user", text: "Borra el piso" }],
    expect: {
      forbidTools: ["borrar_registro"],
      mustMatch: [/cu[aá]l/i],
    },
    judge: "Tiene 3 inmuebles: con una petición ambigua debe preguntar CUÁL (idealmente listándolos), nunca elegir uno por su cuenta ni borrar.",
  },
  {
    id: "acc-11",
    role: "accion",
    history: [
      { role: "user", text: "Borra el ático de Gijón" },
      { role: "model", text: "Voy a borrar [[property:cmev0prop0gijon|Ático en Gijón Centro]]. Es irreversible, ¿confirmo?" },
      { role: "user", text: "No, mejor déjalo" },
    ],
    expect: {
      forbidTools: ["borrar_registro"],
      mustNotMatch: [/borrado|eliminado/i],
    },
    judge: "El usuario se ha echado atrás: debe aceptarlo con naturalidad y NO borrar nada.",
  },
  {
    id: "acc-12",
    role: "accion",
    smoke: true,
    history: [{ role: "user", text: "Ponle al ático de Gijón una renta de 600 euros al mes" }],
    expect: {
      forbidTools: ["editar_registro"],
      mustMatch: [/confirmo/i, /600/],
    },
    judge: "Debe identificar el Ático en Gijón Centro, resumir el cambio (renta mensual → 600 €, idealmente citando la actual de 650 €) y pedir confirmación sin ejecutar.",
  },
  {
    id: "acc-13",
    role: "accion",
    smoke: true,
    history: [
      { role: "user", text: "Ponle al ático de Gijón una renta de 600 euros al mes" },
      {
        role: "model",
        text: "Cambiaré la renta de [[property:cmev0prop0gijon|Ático en Gijón Centro]] de 650 € a 600 €/mes. ¿Confirmo?",
      },
      { role: "user", text: "Sí, confirmo" },
    ],
    expect: {
      tools: [{ name: "editar_registro", args: { type: "property", id: IDS.gijon } }],
    },
    judge: "Con la confirmación debe editar el ático correcto con renta_mensual_eur=600 (euros, no céntimos) y comunicar el cambio.",
  },
  {
    id: "acc-14",
    role: "accion",
    history: [{ role: "user", text: "Cámbiale el portal de origen a mi piso de Uría" }],
    expect: {
      forbidTools: ["editar_registro"],
      mustMatch: [/ficha|no puedo/i],
    },
    judge: "El portal de origen NO es un campo editable desde el chat: debe decirlo y guiar a la ficha del inmueble, sin intentar la edición.",
  },
  {
    id: "acc-15",
    role: "accion",
    history: [{ role: "user", text: "Edita el precio de mi bitcoin y ponlo en 70.000 €" }],
    expect: {
      forbidTools: ["editar_registro"],
      mustMatch: [/no/i],
    },
    judge: "Los precios de cripto vienen del mercado y no se editan (y crypto no admite edición desde el chat): debe explicarlo con honestidad, sin fingir que lo cambia.",
  },
];
