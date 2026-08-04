/**
 * Operación de un inmueble, y la única pregunta que de verdad importa sobre
 * ella: ¿su precio es una renta mensual o un importe de compra?
 *
 * Existe porque el predicado estaba escrito a mano en una quincena de sitios
 * entre el backend y el móvil, y en ninguno se decía lo único que no es obvio:
 * qué pasa con `RENT_TO_OWN`. Escribir `op === "RENT"` y escribir
 * `op !== "SALE"` da exactamente el mismo resultado mientras sólo haya dos
 * operaciones; difieren justo en la tercera, que es la rara y la que nadie tiene
 * en la cabeza al teclear el `if`. De ahí salieron cuatro defectos en un solo
 * día: tres de precio en el buscador y una discrepancia entre la lista de inicio
 * y la búsqueda.
 *
 * Vive en el paquete compartido porque el fallo era precisamente que web y móvil
 * respondían distinto a la misma pregunta.
 */

export type PropertyOperation = "SALE" | "RENT" | "RENT_TO_OWN";

/**
 * ¿El precio de esta operación es una renta mensual?
 *
 * El alquiler con opción a compra **sí** cuenta como alquiler: lo que el portal
 * anuncia es la cuota mensual, y es la que se guarda como precio principal. El
 * importe de la compra, cuando se conoce, va aparte en `currentPrice` — la ficha
 * puede llevar los dos y el detalle sabe pintarlos juntos.
 *
 * Lista blanca y no `!== "SALE"` a propósito: una operación ausente o
 * desconocida debe salir VENTA, que es el valor por defecto del esquema y el de
 * todas las fichas antiguas. Con la negación, un payload de importación sin
 * operación —perfectamente válido, y así lo documenta el Zod— se habría
 * validado contra la banda de renta (tope 50.000 €) y habría nuleado el precio
 * de cualquier venta.
 */
export function isRentOperation(operation: string | null | undefined): boolean {
  return operation === "RENT" || operation === "RENT_TO_OWN";
}

/**
 * Columna donde vive el precio de esta operación. Venta y alquiler NO comparten
 * columna: en una ficha de alquiler `currentPrice` es null y al revés, así que
 * consultar la equivocada no devuelve un valor raro — no devuelve nada.
 */
export function priceFieldFor(
  operation: string | null | undefined
): "monthlyRent" | "currentPrice" {
  return isRentOperation(operation) ? "monthlyRent" : "currentPrice";
}

/**
 * El precio de una ficha según SU operación. Es el error que más veces se ha
 * repetido: elegir la columna por la operación que se estaba BUSCANDO en vez de
 * por la que tiene la ficha delante, con lo que en una búsqueda mixta todas las
 * ventas salían sin precio.
 */
export function operationPrice(p: {
  operationType: string | null | undefined;
  currentPrice: number | null;
  monthlyRent: number | null;
}): number | null {
  return isRentOperation(p.operationType) ? p.monthlyRent : p.currentPrice;
}
