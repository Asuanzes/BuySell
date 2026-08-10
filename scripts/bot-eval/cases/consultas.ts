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
  {
    // El flujo real exige buscar el restaurante ANTES de pedir su carta — el
    // historial ya trae esa búsqueda hecha (con el id visible para el modelo).
    id: "con-08",
    role: "consulta",
    history: [
      { role: "user", text: "¿Qué restaurantes tengo cerca?" },
      { role: "model", text: "Cerca tienes Sushi Nido (C/ Rosal 4) y Pizzería Alma (C/ Gascona 11). ¿Te enseño alguna carta? 🪺" },
      { role: "user", text: "Sí, la del Sushi Nido" },
    ],
    fixtures: {
      carta_restaurante: '{"restaurante":"Sushi Nido","menuStatus":"PENDING","platos":[]}',
    },
    expect: {
      tools: [{ name: "carta_restaurante" }],
      mustMatch: [/prepar|todav[ií]a|a[uú]n|pendiente|no está lista|sin carta/i],
      mustNotMatch: [/Nigiri|Ramen/i],
    },
    judge: "La carta está en preparación (menuStatus PENDING): debe decirlo y no inventar platos.",
  },
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
];
