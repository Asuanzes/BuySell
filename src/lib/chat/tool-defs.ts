/**
 * Schemas de las herramientas del asistente Nidokey — SOLO DATOS (sin imports
 * con efectos), para que el agente puro (agent.ts) y los evals (scripts/bot-eval)
 * puedan importarlos sin arrastrar Prisma/JWT/geocode. El ejecutor real
 * (runTool) vive en bot-tools.ts.
 */
export const RECORD_TYPES = ["property", "crypto", "market", "job", "book", "holiday"] as const;
export type BotRecordType = (typeof RECORD_TYPES)[number];

/** Esquema de tools en formato OpenAI (Groq lo acepta igual). */
export const BOT_TOOLS = [
  {
    type: "function",
    function: {
      name: "listar_registros",
      description:
        "Lista los registros GUARDADOS del usuario de una categoría (sus inmuebles, criptos, mercados, empleos, libros o viajes). Úsalo para buscar/responder sobre lo que el usuario tiene.",
      parameters: {
        type: "object",
        properties: { type: { type: "string", enum: [...RECORD_TYPES], description: "Categoría a listar" } },
        required: ["type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ver_registro",
      description: "Detalle de un registro concreto del usuario, por su id y categoría (id sale de listar_registros).",
      parameters: {
        type: "object",
        properties: { type: { type: "string", enum: [...RECORD_TYPES] }, id: { type: "string" } },
        required: ["type", "id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comparar_registros",
      description:
        "Compara 2 o 3 registros PROPIOS del usuario del MISMO tipo. Es de SOLO LECTURA: devuelve campos relevantes lado-a-lado y últimos eventos guardados para que el bot haga un contrapunto crítico sin datos externos.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...RECORD_TYPES], description: "Categoría común de los registros" },
          ids: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3, description: "Ids propios a comparar" },
        },
        required: ["type", "ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "preparar_visita",
      description:
        "Prepara la visita de un inmueble PROPIO del comprador: devuelve datos guardados, eventos recientes, campos ausentes e items estructurados, y crea/reutiliza el checklist diario sin coordinar con terceros ni inventar datos.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Id propio del inmueble a visitar" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "preparar_viaje",
      description:
        "Prepara un VIAJE PROPIO del usuario (organizándose o ya reservado): devuelve destino, fechas, presupuesto, datos que faltan e items estructurados, y crea/reutiliza el checklist de viaje marcable en la ficha del registro. Aditiva y sin datos inventados.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Id propio del viaje (de listar_registros o de un enlace [[holiday:id|Título]])" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tendencias",
      description: "Tendencias actuales agregadas (X/Twitter, Google Trends, Hacker News, Twitch). Opcional: filtrar por fuente.",
      parameters: {
        type: "object",
        properties: { source: { type: "string", description: "twitter | googletrends | hackernews | twitch | all" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "noticias_tendencia",
      description: "Noticias relacionadas con una tendencia concreta (trend_id obtenido de la herramienta 'tendencias').",
      parameters: { type: "object", properties: { trend_id: { type: "string" } }, required: ["trend_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "noticias_activos",
      description: "Noticias de los activos del usuario: 'crypto' (sus criptos) o 'market' (sus acciones/ETFs/mercados).",
      parameters: { type: "object", properties: { type: { type: "string", enum: ["crypto", "market"] } }, required: ["type"] },
    },
  },
  // Fase 0 food OFF (2026-08-09): las tools de comida (buscar_restaurantes,
  // buscar_platos, carta_restaurante) se retiraron con la vertical.
  {
    type: "function",
    function: {
      name: "crear_registro",
      description:
        "Crea/importa un registro para el usuario. modo: 'url' (pegar enlace de un anuncio/portal/web), 'symbol' (ticker de cripto o acción: BTC, AAPL…), 'query' (buscar por título/texto, p.ej. un libro). ⚠️ REQUIERE que el usuario confirme antes de llamar.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...RECORD_TYPES] },
          modo: { type: "string", enum: ["url", "symbol", "query"] },
          valor: { type: "string", description: "La URL, el símbolo, o el texto a buscar" },
        },
        required: ["type", "modo", "valor"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "borrar_registro",
      description:
        "BORRA un registro del usuario. Es IRREVERSIBLE. ⚠️ REQUIERE confirmación explícita del usuario antes de llamar. El id sale de listar_registros/ver_registro.",
      parameters: {
        type: "object",
        properties: { type: { type: "string", enum: [...RECORD_TYPES] }, id: { type: "string" } },
        required: ["type", "id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fusionar_registros",
      description:
        "Fusiona duplicados del mismo tipo: conserva keep_id y elimina drop_ids. ⚠️ REQUIERE confirmación. Ids de listar_registros.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...RECORD_TYPES] },
          keep_id: { type: "string" },
          drop_ids: { type: "array", items: { type: "string" } },
        },
        required: ["type", "keep_id", "drop_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compartir_registro",
      description:
        "Comparte un registro PROPIO del usuario con otra persona por su nombre de usuario (@handle): le da acceso de SOLO LECTURA al registro vivo. ⚠️ REQUIERE confirmación antes de llamar.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...RECORD_TYPES] },
          id: { type: "string" },
          usuario: { type: "string", description: "Nombre de usuario del destinatario (@handle), con o sin @" },
        },
        required: ["type", "id", "usuario"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "editar_registro",
      description:
        "Edita CAMPOS de un registro del usuario. property: titulo, precio_eur (venta), renta_mensual_eur (alquiler), estado (FOR_SALE|RESERVED|SOLD|WITHDRAWN|FOR_RENT|RENTED), descripcion. book: solo notas. Los DEMÁS tipos y campos aún no se editan desde el chat: dilo y guía a la ficha. Precios SIEMPRE en euros (p.ej. 150000 = 150.000 €). ⚠️ REQUIERE confirmación del usuario antes de llamar (resume campo, valor anterior si lo conoces y valor nuevo).",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["property", "book"] },
          id: { type: "string" },
          campos: {
            type: "object",
            description: "SOLO los campos a cambiar. property: titulo|precio_eur|renta_mensual_eur|estado|descripcion. book: notas.",
          },
        },
        required: ["type", "id", "campos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crear_alerta",
      description:
        "Crea una alerta de precio sobre un registro PROPIO con precio vigilable (inmuebles, criptos, mercados): al cumplirse avisa con un DM del asistente y push. kind: PRICE_BELOW (baja de X €), PRICE_ABOVE (sube de X €), PRICE_DROP_PCT (cae un X % desde ahora), STATUS_CHANGE (vendido/retirado, solo inmuebles). ⚠️ REQUIERE confirmación explícita del usuario antes de llamar.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["property", "crypto", "market"] },
          id: { type: "string", description: "Id propio del registro (de listar_registros o de un enlace [[tipo:id|Título]])" },
          kind: { type: "string", enum: ["PRICE_BELOW", "PRICE_ABOVE", "PRICE_DROP_PCT", "STATUS_CHANGE"] },
          umbral_eur: { type: "number", description: "Solo PRICE_BELOW/PRICE_ABOVE: umbral en EUROS (p.ej. 150000 = 150.000 €)" },
          porcentaje: { type: "number", description: "Solo PRICE_DROP_PCT: caída en porcentaje ENTERO entre 1 y 99" },
          campo: { type: "string", enum: ["precio", "renta"], description: "Solo inmuebles mixtos: vigilar el precio de venta o la renta mensual (por defecto precio)" },
        },
        required: ["type", "id", "kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compartidos_conmigo",
      description: "Lista los registros que OTROS usuarios han compartido conmigo (solo lectura).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "guardar_compartido",
      description:
        "Guarda en TUS registros una copia de un registro que te han compartido. type e id salen del enlace [[tipo:id|Título]] del MENSAJE de compartido (o de compartidos_conmigo). Additivo y seguro: cuando el usuario diga «guárdalo»/«añádelo a los míos», EJECÚTALA — nunca respondas 'guardado' sin haberla llamado.",
      parameters: {
        type: "object",
        properties: { type: { type: "string", enum: [...RECORD_TYPES] }, id: { type: "string" } },
        required: ["type", "id"],
      },
    },
  },
];

/** Las mismas tools en formato Anthropic (Claude): {name, description, input_schema}. */
export const BOT_TOOLS_ANTHROPIC = BOT_TOOLS.map((t) => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters,
}));

/** Tools que ESCRIBEN datos (requieren confirmación del usuario, salvo guardar_compartido que es additivo). */
export const WRITE_TOOLS = ["crear_registro", "borrar_registro", "fusionar_registros", "compartir_registro", "editar_registro", "crear_alerta"] as const;
