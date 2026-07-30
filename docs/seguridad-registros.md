# Plan de seguridad de los registros de usuario — Nidokey

> **Estado: PROPUESTA. NADA implementado.** Este documento es el paso previo
> exigido antes de tocar la seguridad de registros. Requiere tu revisión y OK
> explícito; la implementación irá en una segunda fase, por puntos acordados.
>
> **Zona crítica intacta:** este plan NO modifica la autenticación (magic-link
> web, JWT móvil HS256 issuer `nidokey-mobile`, `AUTH_SECRET`, endpoints
> `/api/auth/*`, middleware). Solo cubre la **autorización** sobre registros.

---

## 0. Estado actual (auditoría)

La identidad del usuario se resuelve con `requireUserId()`
(`src/lib/auth-helpers.ts`), que acepta sesión web o JWT móvil. El patrón de
propiedad es `where: { id, ownerId }` ⇒ 404 si no es del usuario (no se filtra la
existencia de registros ajenos).

**Endpoints correctamente protegidos** (owner-scoped):

| Endpoint | Protección |
|---|---|
| `GET/POST /api/properties` | `requireUserId` + `ownerId` |
| `GET/PATCH/DELETE /api/properties/:id` | `requireUserId` + `ensureOwner` |
| `POST /api/properties/:id/dismiss-match` | `requireUserId` + ownership |
| `GET /api/matches`, `/api/search` | filtrado por `ownerId` |
| `POST /api/listings/import` | token (`bs_` o JWT) → `ownerId` |
| `GET /api/records`, `/api/records/:id` | `requireUserId` + `ownerId` (nuevo, sin desplegar) |

**🔴 Huecos detectados (a corregir en fase 2, NO tocados):**

| Endpoint | Problema | Severidad |
|---|---|---|
| `POST /api/properties/:id/merge` | **Sin `requireUserId` ni check de ownership.** Un usuario autenticado podría fusionar (operación **destructiva**) inmuebles de cualquier `id`, incluidos ajenos. | 🔴 Crítica |
| `GET /api/properties/:id/similar` | Sin auth/ownership; `findSimilar(id)` puede devolver candidatos de otros propietarios. | 🟠 Media (fuga de datos) |
| `POST /api/listings/check` | Sin `requireUserId`; recheck disparable sin sesión. Sin fuga de datos directa, pero invocable por terceros. | 🟡 Baja |

> Nota: el middleware de Edge exige sesión/Bearer en `/api/*` (salvo allowlist),
> lo que limita el acceso anónimo, pero **no** garantiza que el recurso sea del
> usuario. La autorización a nivel de recurso falta en los 3 casos.

---

## 1. Modelado de permisos

**Definición de "registro de usuario":** toda fila con `ownerId` (hoy
`Property`; mañana otros tipos vía `recordType`). El propietario es el `User`
referenciado por `ownerId`.

**Reglas base (fase 2):**

1. Un usuario solo puede **leer / actualizar / borrar / fusionar** registros
   cuyo `ownerId` coincide con su `userId`.
2. Operaciones que referencian **dos** registros (merge `id` + `intoId`) exigen
   que **ambos** sean del usuario.
3. Sin roles por ahora (single-tenant activo). Se reserva un futuro `role`
   (`user` | `admin`) en `User` para permisos elevados; hasta entonces, **no**
   hay bypass de ownership para nadie.
4. **Compartidos/colaborativos:** fuera de alcance ahora. Cuando existan, se
   modelarán con una tabla `RecordShare(recordId, userId, permission)` y la
   comprobación pasará de "es owner" a "es owner **o** tiene share con permiso
   suficiente". El diseño de hoy debe dejar el check en un único sitio para que
   ese cambio sea local.

---

## 2. Autorización en el backend

**Principio:** la comprobación de ownership debe estar en **una sola capa**, no
repartida por cada route handler (hoy se repite `where: { id, ownerId }` y se
olvida en merge/similar). Propuesta:

### 2.1 Capa de servicio/repositorio con ownership obligatorio

Crear `src/lib/records/guard.ts` (o `service.ts`) con helpers que **exigen**
`ownerId`:

```ts
// Pseudocódigo de la propuesta (NO implementado)
export async function getOwnedPropertyOr404(id: string, ownerId: string) {
  const p = await prisma.property.findFirst({ where: { id, ownerId } });
  if (!p) throw new HttpError(404, "Not found");
  return p;
}

export async function assertOwnership(ids: string[], ownerId: string) {
  const count = await prisma.property.count({ where: { id: { in: ids }, ownerId } });
  if (count !== ids.length) throw new HttpError(404, "Not found");
}
```

Todos los route handlers que tocan un registro pasan por aquí. Imposible
"olvidar" el check porque el fetch ya lo incluye.

### 2.2 Remediación de los huecos (fase 2, tras OK)

| Endpoint | Cambio propuesto |
|---|---|
| `merge` | `const ownerId = await requireUserId();` + `assertOwnership([id, intoId], ownerId)` antes de `mergeProperties`. |
| `similar` | `const ownerId = await requireUserId();` + `getOwnedPropertyOr404(id, ownerId)`; y que `findSimilar` filtre candidatos por `ownerId`. |
| `check` | Decidir modelo: (a) `requireUserId` + filtrar listings por `ownerId`; o (b) si es un cron, protegerlo con un secreto de servicio (header `Authorization: Bearer ${CRON_SECRET}`), no con sesión de usuario. |

### 2.3 Patrones obligatorios (a documentar como convención)

- **Fetch por id:** siempre `findFirst({ where: { id, ownerId } })` o el helper
  `getOwnedPropertyOr404`. Nunca `findUnique({ where: { id } })` sin ownership.
- **Listados:** siempre `where: { ownerId, ... }`.
- **Mutaciones:** comprobar ownership **antes** de mutar; 404 (no 403) para no
  revelar existencia de recursos ajenos.

---

## 3. Seguridad en la app móvil

- El JWT móvil ya transporta el `userId` (`sub`); el backend lo resuelve con
  `requireUserId`. La app **no** debe poder pedir registros de otro `userId`:
  se garantiza en el **servidor** (sección 2), nunca confiando en el cliente.
- **No** debe existir ningún endpoint de registros sin `requireUserId`
  (ver huecos). El cliente nunca filtra por ownership: es responsabilidad del
  backend.
- **Manejo de errores de permiso en UI** (propuesta):
  - `401` → token caducado/ausente ⇒ `logout()` + redirección a login (la app
    ya cae a login si no hay sesión).
  - `403`/`404` sobre un registro ⇒ pantalla/empty state "No tienes acceso a
    este registro" con botón Volver (usar `EmptyState` del kit).
  - El cliente `api()` ya expone `ApiError.status`; basta mapearlo en
    `useQuery`/pantallas a estos estados. **No** se implementa hasta aprobar.

---

## 4. Auditoría y logs

Esquema mínimo propuesto (fase 2):

- **Reutilizar `ImportLog`** (ya existe, append-only) o una tabla
  `AccessLog(userId, recordId, action, allowed, ip?, createdAt)` para registrar:
  - Accesos a registros (lectura de detalle, export).
  - **Intentos denegados** de acceso a registros ajenos (`allowed: false` con
    `userId`, `recordId`, `timestamp`) — señal temprana de abuso/bug.
- Los intentos denegados se emiten desde la capa `guard.ts` (un único sitio),
  con `console.warn("[authz] denied", { userId, recordId, action })` como mínimo
  y, opcionalmente, persistidos.
- Sin PII innecesaria en logs; nunca el JWT ni el `AUTH_SECRET`.

---

## 5. Plan de implementación por fases (tras tu OK)

1. **Fase 2a — tapar huecos críticos** (merge, similar, check) con la capa
   `guard.ts`. Sin cambios de comportamiento para el caso legítimo (el usuario
   sigue pudiendo operar sus propios registros).
2. **Fase 2b — convención + refactor** de los handlers ya correctos para que
   también pasen por `guard.ts` (consistencia, un solo punto de verdad).
3. **Fase 2c — manejo de errores de permiso en la UI móvil** (401/403/404).
4. **Fase 2d — logging de accesos denegados.**
5. **(Futuro) Compartidos** vía `RecordShare` cuando el producto lo requiera.

---

## 6. Restricciones (recordatorio)

- ❌ No tocar generación/verificación de tokens ni endpoints `/api/auth/*`.
- ❌ No implementar nada de este plan sin tu aprobación explícita, punto por punto.
- ✅ Cambios de ownership = aditivos y conservadores: 404 para ajenos, sin
  romper el flujo del propietario legítimo.

---

> **Siguiente paso:** revisa este plan y dime qué fases apruebas. Recomiendo
> priorizar **Fase 2a** (el hueco de `merge` es destructivo y cross-owner).
