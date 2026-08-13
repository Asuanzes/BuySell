import { IDS } from "../fixtures";
import type { EvalCase } from "../types";

/** Rol 2 — consultas sobre los datos del usuario (tools de lectura + fixtures). */
export const CONSULTA_CASES: EvalCase[] = [
  {
    id: "con-01",
    role: "consulta",
    smoke: true,
    history: [{ role: "user", text: "¿Qué criptos tengo guardadas?" }],
    expect: {
      tools: [{ name: "listar_registros", args: { type: "crypto" } }],
      mustMatch: [/Bitcoin/i, /Ethereum/i, /\[\[crypto:/],
    },
    judge: "Debe listar exactamente Bitcoin y Ethereum (las dos de sus datos), con sus valores, como enlaces pulsables.",
  },
  {
    id: "con-02",
    role: "consulta",
    history: [{ role: "user", text: "¿Cuánto vale mi piso de la calle Uría?" }],
    expect: {
      tools: [{ name: "listar_registros", args: { type: "property" } }],
      mustMatch: [/185|186/],
    },
    judge: "Debe dar el precio real de las fixtures (185.000-186.000 €); hay dos anuncios del mismo piso (Idealista y Fotocasa) — mencionarlo o elegir uno es aceptable, inventar precios no.",
  },
  {
    id: "con-03",
    role: "consulta",
    smoke: true,
    history: [{ role: "user", text: "¿Qué se cuece ahora mismo en X?" }],
    expect: {
      tools: [{ name: "tendencias" }],
      mustMatch: [/FuriaAsturiana/i],
    },
    judge: "Debe usar las tendencias reales de la fuente twitter/X (#FuriaAsturiana) sin inventar otras.",
  },
  {
    id: "con-04",
    role: "consulta",
    history: [{ role: "user", text: "Dame las noticias de mis acciones" }],
    expect: {
      tools: [{ name: "noticias_activos", args: { type: "market" } }],
      forbidTools: ["noticias_tendencia"],
      mustMatch: [/S&P|m[aá]ximos|Reuters/i],
    },
    judge: "Debe traer noticias de sus activos de mercado (no de tendencias) y citar titulares reales de las fixtures.",
  },
  {
    id: "con-05",
    role: "consulta",
    history: [{ role: "user", text: "¿Tengo alguna oferta de empleo guardada?" }],
    expect: {
      tools: [{ name: "listar_registros", args: { type: "job" } }],
      mustMatch: [/\bno\b/i],
      mustNotMatch: [/\[\[job:/],
    },
    judge: "No tiene empleos guardados (lista vacía): debe decirlo con naturalidad, sin inventar ofertas; sugerir Importar es un plus.",
  },
  {
    // Caso reescrito el 2026-08-10: la vertical comida se apagó (fase 0 del loop
    // de producto, autorizada) y sus tools salieron del bot. Antes se esperaba
    // que pidiera ciudad/dirección; ahora lo correcto es reconocer el límite sin
    // inventar restaurantes ni prometer una búsqueda que ya no existe.
    id: "con-06",
    role: "consulta",
    smoke: true,
    history: [{ role: "user", text: "Búscame sushi para cenar" }],
    expect: {
      mustMatch: [/no puedo|no est[áa]|fuera de|ya no/i],
      mustNotMatch: [/Sushi Nido|Pizzer|buscar_restaurantes/i],
    },
    judge: "Comida no existe en la app: debe decir con naturalidad que no puede buscar restaurantes, sin inventar sitios ni prometer una búsqueda; redirigir a lo que sí hace es un plus.",
  },
  {
    id: "con-07",
    role: "consulta",
    history: [{ role: "user", text: "¿Me ha compartido algo alguien?" }],
    fixtures: {
      compartidos_conmigo: JSON.stringify([
        { id: IDS.sharedPiso, type: "property", title: "Estudio en Avilés", subtitle: "de @maria", value: "98.000 €", status: "FOR_SALE" },
      ]),
    },
    expect: {
      tools: [{ name: "compartidos_conmigo" }],
      mustMatch: [/Avil[eé]s/i],
    },
    judge: "Debe decir que @maria le ha compartido el Estudio en Avilés (98.000 €) y puede ofrecer guardarlo en sus registros.",
  },
  // con-08 (carta de restaurante) RETIRADO el 2026-08-10: la vertical comida se
  // apagó en la fase 0 del loop de producto y sus tools salieron del bot, así
  // que el caso probaba una herramienta inexistente.
  {
    id: "con-09",
    role: "consulta",
    history: [{ role: "user", text: "Compárame mis dos criptos, ¿cuál va mejor hoy?" }],
    expect: {
      tools: [{ name: "listar_registros", args: { type: "crypto" } }],
      mustMatch: [/Bitcoin/i, /Ethereum/i],
    },
    judge: "Comparación honesta con los datos de las fixtures: BTC -1,2% y ETH +0,8% en 24h → ETH va mejor hoy. No debe inventar cifras.",
  },
  {
    id: "con-10",
    role: "consulta",
    history: [{ role: "user", text: "¿Qué libros tengo de Sanderson?" }],
    expect: {
      tools: [{ name: "listar_registros", args: { type: "book" } }],
      mustMatch: [/camino de los reyes/i, /Palabras radiantes/i],
      mustNotMatch: [/Sapiens|Dune|1984/i],
    },
    judge: "De sus 5 libros solo 2 son de Brandon Sanderson: debe filtrar él y enlazar solo esos dos.",
  },
  {
    id: "con-11",
    role: "consulta",
    history: [
      { role: "user", text: "¿Cómo va mi bitcoin?" },
      { role: "model", text: "Bitcoin está en 61.234 €, con un -1,2% en las últimas 24h. 🪺" },
      { role: "user", text: "¿Y mis acciones?" },
    ],
    expect: {
      tools: [{ name: "listar_registros", args: { type: "market" } }],
      mustMatch: [/Apple|Vanguard|S&P/i],
    },
    judge: "«Mis acciones» = categoría market (Apple y el ETF Vanguard), no crypto. Debe responder con esos dos activos.",
  },
  {
    // Iconos de la cabecera del bot (2026-08-10): la app envía el mensaje con
    // los ids YA dentro de enlaces [[tipo:id|Título]]. Pedirle el id al usuario
    // cuando lo tiene delante es el bug que este caso impide reintroducir.
    id: "con-12",
    role: "consulta",
    smoke: true,
    history: [
      {
        role: "user",
        text: `Compara estos 2 registros: [[property:${IDS.uria}|Piso en Calle Uría 12, Oviedo]], [[property:${IDS.gijon}|Ático en Gijón Centro]]`,
      },
    ],
    fixtures: {
      comparar_registros: JSON.stringify({
        type: "property",
        provenance: "registros_guardados_del_usuario",
        records: [
          { id: IDS.uria, title: "Piso en Calle Uría 12, Oviedo", precio_eur: 185000, m2: 90, eur_m2: 2056, habitaciones: 3, estado: "FOR_SALE" },
          { id: IDS.gijon, title: "Ático en Gijón Centro", renta_mensual_eur: 650, m2: 70, habitaciones: 2, estado: "FOR_RENT" },
        ],
      }),
    },
    expect: {
      tools: [{ name: "comparar_registros", args: { type: "property", ids: [IDS.uria, IDS.gijon] } }],
      // El contrapunto es DOCUMENTAL como el checklist de visita (ver con-13).
      maxChars: 1900,
      mustNotMatch: [/qu[eé] id|dame el id|necesito el id|cu[aá]l es el id/i],
    },
    judge: "Los ids venían en los enlaces del propio mensaje: debe llamar a comparar_registros con ellos y dar el contrapunto (uno es venta y otro alquiler: señalarlo es lo correcto). Pedir el id es un fallo grave.",
  },
  {
    // En smoke desde 2026-08-13: la regresión real de prod fue EXACTAMENTE esta
    // frase — el bot preguntaba «¿cuándo visitas?» SIN llamar a la tool. El
    // smoke de 16 casos pasó porque este caso no estaba incluido.
    id: "con-13",
    role: "consulta",
    smoke: true,
    history: [
      { role: "user", text: `Prepara una visita para: [[property:${IDS.uria}|Piso en Calle Uría 12, Oviedo]]` },
    ],
    fixtures: {
      preparar_visita: JSON.stringify({
        type: "property",
        id: IDS.uria,
        property: { title: "Piso en Calle Uría 12, Oviedo", precio_eur: 185000, m2: 90, habitaciones: 3, estado: "FOR_SALE" },
        recentEvents: [{ eventType: "price_drop", observedAt: "2026-08-01T10:00:00.000Z", previousCents: 19500000, newCents: 18500000 }],
        missingFields: [
          { field: "communityFees", label: "gastos de comunidad", reason: "coste mensual no incluido en el precio" },
          { field: "yearBuilt", label: "año de construcción", reason: "edad real del edificio y posibles reformas" },
        ],
        provenance: "ficha_guardada_del_usuario",
      }),
    },
    expect: {
      tools: [{ name: "preparar_visita", args: { id: IDS.uria } }],
      // Respuesta DOCUMENTAL (preguntas + condiciones de la visita + checklist):
      // el tope conversacional de 800 la truncaría. Producción permite 2000 y el
      // prompt pide ~1800 como techo para este tipo de respuesta.
      maxChars: 1900,
      mustMatch: [/comunidad|construcci[oó]n|baj/i],
      mustNotMatch: [/qu[eé] id|dame el id|necesito el id/i],
    },
    judge: "Debe usar el id del enlace y dar preguntas concretas de los huecos reales (gastos de comunidad, año) y de la bajada de precio; no debe pedir el id ni inventar datos del inmueble.",
  },
];
