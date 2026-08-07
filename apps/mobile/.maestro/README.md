# E2E con Maestro — Nidokey

Flujos smoke iniciales. Selectores por `testID` (la app es bilingüe ES/EN: los
textos no son selectores estables).

## Ejecutar

```bash
# Instalar Maestro (una vez): https://docs.maestro.dev/getting-started/installing-maestro
# Requiere Java 17+. En Windows: WSL o PowerShell con el instalador oficial.

# Con emulador/dispositivo conectado y la app instalada:
maestro test apps/mobile/.maestro/home-smoke.yaml
maestro test apps/mobile/.maestro/           # todos los flujos
maestro studio                               # constructor interactivo
```

## Prerrequisitos (v1, deliberadamente simples)

1. **Sesión iniciada a mano** en el dispositivo (login OTP). No automatizamos
   el OTP todavía: exigiría capturar el email (Mailpit/…) y no aporta al smoke.
   ⚠️ En iOS `clearState` NO borra el Keychain: la sesión persiste — los flujos
   lo aprovechan (patrón adaptativo del skill maestro-mobile-testing).
2. **Cuenta con datos**: `node scripts/seed-perf-records.mjs --email <email>`
   crea ~100 registros (cripto/mercado/libros) vía la API real.
3. Para `chat-send.yaml`: al menos una conversación (el DM de @Nidokey vale).

## Flujos

| Flujo | Cubre |
| --- | --- |
| `home-smoke.yaml` | Arranque → sesión resuelta → lista de registros renderiza |
| `record-detail.yaml` | Home → detalle del primer registro → volver (HeaderBack JS) |
| `chat-send.yaml` | Categoría chat → conversación → enviar (update optimista <5s) |

## Inventario de testIDs

| testID | Dónde | Notas |
| --- | --- | --- |
| `auth-loaded` | `app/(tabs)/index.tsx` | Marcador tamaño cero; solo con sesión resuelta |
| `category-{type}` | raíl de la home | `category-crypto`, `category-chat`, … |
| `records-list` | `ReorderableRecordList` | La FlatList virtualizada |
| `record-row-{id}` | fila de registro (no-edición) | Seleccionar con regex `record-row-.*` |
| `conversation-row-{id}` | `chat/ConversationList` | Regex `conversation-row-.*` |
| `chat-input` / `chat-send` | compositor de `chat/[id]` | |
| `header-back` | `components/HeaderBack` | Back JS global (el nativo no funciona, gotcha iOS) |

## Fuera de alcance (a propósito)

- **Drag-reorder fino**: Maestro no lo cubre bien (hallazgo de la revisión
  Codex 2af6d5a6) → probar a mano tras cambios en `ReorderableRecordList`:
  pull-to-refresh, long-press → edición, arrastre con >20 registros.
- Login OTP automatizado (necesita infraestructura de captura de email).
