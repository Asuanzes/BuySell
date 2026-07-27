# Mensajería de Nidokey — arquitectura y estado real

> Documento normativo del chat tras el sprint de mensajería del 2026-07-26
> (auditoría de 7 dimensiones + implementación). Refleja lo que HAY, no lo que
> se aspira a tener; la matriz de paridad indica fecha y fuentes.

## 1. Arquitectura

```
móvil (Expo) ── HTTPS ──► API Next.js (Vercel) ──► Neon Postgres  (fuente de verdad)
   │                          │ after()
   │                          ├─► Expo Push (chat + alertas, recibos)
   │                          └─► POST /notify firmado HMAC ─► gateway WS (VPS)
   └── WSS /ws?ticket=JWT60s ◄────────────────────────────────────┘
```

- **Aviso opaco**: el gateway solo relaya `{type:"message", conversationId}` —
  el contenido nunca pasa por el VPS (E2E-ready). El móvil refetchea a Neon.
- **Polling adaptativo** de respaldo: socket abierto → 30/60 s; caído → 4-20 s.
  El socket solo ADELANTA; nada depende de él (at-most-once asumido).
- Desde este sprint el gateway se notifica también en **ediciones, borrados,
  reacciones y marcar-leído** (`notifyConversation`, actor excluido), no solo
  en mensajes nuevos.

## 2. Flujo de un mensaje y estados

1. Composer → validación local → `clientId` único generado en el dispositivo.
2. Burbuja **optimista** (opacidad 60 %). Doble-tap protegido con lectura
   síncrona por ref.
3. `POST /messages` (timeout 20 s en `api()`): valida JWT, membresía, bloqueo,
   rate (30/min), cita en la misma conversación, adjuntos contra R2.
4. Persistencia en transacción (mensaje + lastMessageAt/preview + mi
   lastReadAt). **Idempotente por `(conversationId, senderId, clientId)`**; la
   carrera P2002 devuelve el ya creado (nunca 500 → nunca duplicado).
5. `after()`: push Expo + notify gateway (+ bot si es su DM).
6. Fallo → burbuja **fallida** (borde rojo, "no enviado · toca para
   reintentar"). El reintento reutiliza EL MISMO `clientId` → sin duplicados
   tras respuesta perdida. Descartar la elimina.
7. Estados visibles (solo DIRECT): ✓ enviado · ✓✓ **entregado** (el otro
   dispositivo descargó mensajes o la lista — watermark `lastDeliveredAt`,
   throttle 60 s) · ✓✓ azul **leído** (`lastReadAt`; markRead notifica al
   gateway → azul casi inmediato).
8. Orden: `createdAt` del SERVIDOR con desempate por `id` — mismo comparador
   en servidor y cliente (orden total y estable).
9. Sincronización: reconexión → refetch; hueco > 1 página entre refetches →
   se descarta `older` (no quedan mensajes invisibles en medio).

Semántica honesta: no se muestra ningún estado que el sistema no pueda
demostrar. En grupos no hay ticks (no hay recibos por-miembro).

## 3. Funciones (matriz de paridad, comparación 2026-07-26)

| Función | WhatsApp | Telegram | Nidokey |
| --- | --- | --- | --- |
| Ticks enviado/entregado/leído | ✓/✓✓/✓✓ azul | ✓=servidor ✓✓=leído | ✅ DIRECT (watermarks) |
| Editar mensaje | 15 min | 48 h | ✅ 15 min, etiqueta "editado", sync tiempo real |
| Eliminar para todos | ~60 h | sin límite (1:1) | ✅ sin límite; borra cuerpo+adjuntos de verdad; autor o admin |
| Responder-cita | ✅ | ✅ + cita parcial | ✅ snippet server-side, salto al original |
| Reacciones | cualquier emoji | set amplio / Premium | ✅ 6 rápidas + picker ~120; toggle; 1 por usuario |
| Reenviar | ✅ etiqueta | ✅ sin límite | ❌ (compartir fuera vía share nativo sí) |
| Fijar chats | 3 | ilimitado | ✅ ilimitado (long-press en lista) |
| Fijar mensajes | 3/chat | ilimitado | ❌ |
| Archivar | ✅ | ✅ | ❌ (salir de conversación sí) |
| Silenciar | 8h/1sem/siempre | +personalizado | ✅ 8h/1sem/siempre, glifo en lista |
| Borradores | ✅ (sin sync) | ✅ nube | ✅ persistentes por conversación (dispositivo) |
| Búsqueda en chat | ✅ +fecha | ✅ global | ✅ por conversación con salto; lista filtrable |
| Multimedia | 2 GB | 2-4 GB | ✅ imagen 10 MB / archivo 25 MB / audio 10 MB, verificado server-side |
| Notas de voz | ✅ transcripción | ✅ Premium | ✅ grabar/enviar/reproducir (sin pausa ni velocidad) |
| Mensajes temporales | ✅ | ✅ secretos | ❌ |
| Encuestas / ubicación en chat | ✅ | ✅ | ❌ |
| Typing / presencia | ✅ config. | ✅ granular | ✅ typing (filtrado por membresía); presencia ❌ |
| Recibos configurables | toggle global | 1:1 config. | ❌ (siempre activos) |
| Programar mensajes | ❌ | ✅ | ❌ |
| Grupos | 1.024 | 200.000 | ✅ 64: crear, ficha con miembros y roles, renombrar, añadir/expulsar (OWNER/ADMIN), salir; sin foto de grupo ni nombrar admins |
| Llamadas | ✅ | ✅ | ❌ (sin botones falsos) |
| Multidispositivo | 4 | ilimitado | ✅ mismo JWT en N dispositivos (sin sync de borradores) |
| Cifrado | E2E por defecto | E2E opcional | ❌ E2E (ver §6); TLS + R2 firmado |
| Traducción | ✅ on-device | ✅ | ❌ |
| Denunciar/moderación | ✅ | ✅ | ✅ mensaje/usuario, 5 categorías, snapshot de evidencia |
| Bot/IA integrada | Meta AI | resúmenes | ✅ @Nidokey (agente con tools sobre TUS datos) |

Fuentes: telegram.org/faq y blog, blog.whatsapp.com, faq.whatsapp.com,
TechCrunch, CNBC, Forbes (jun-2026), 9to5mac — lista completa en el resultado
de la auditoría (workflow `audit-mensajeria-nidokey`, dimensión
`investigacion`).

## 4. Diferenciales frente a un chat genérico

0. **Compartir un registro a un GRUPO** (jul-2026): la tarjeta se publica en la
   conversación elegida y `RecordShare` se reparte a sus miembros activos.
   Cuota 20/h por usuario, porque esta ruta escribe en el chat sin pasar por el
   límite de mensajes. Tope de grupo **25** (era 64) justamente para acotar el
   alcance de un toque.
   - **Compartir da acceso a la ficha VIVA**, no a una copia: fotos, estado e
     histórico de precios siguen actualizándose para quien lo recibe.
   - **Control del dueño**: `GET/DELETE /api/records/shares` + pantalla "Mis
     compartidos" (Cuenta). Las concesiones se agrupan por ORIGEN gracias a
     `RecordShare.conversationId`; retirar corta la ficha Y apaga la tarjeta
     del chat (regla 3 de `contextCard`). ⚠️ Lo que NO deshace: una copia que
     el destinatario ya se guardara con "Guardar" es suya (el copy lo dice).
   - **Control del destinatario**: bloquear corta el acceso en los cuatro
     caminos (lista, ficha, adopt y tarjeta) vía `sharedAccess()`, que es el
     único sitio donde vive la regla. No borra la fila: desbloquear devuelve el
     acceso que el dueño concedió.
   - Quien entre al grupo DESPUÉS no recibe acceso (el reparto es en el momento
     de compartir). Las filas anteriores a jul-2026 tienen `conversationId`
     null y se muestran como concesiones individuales: su origen no es
     recuperable.
1. **Conversación vinculada a un registro** (patrón Wallapop/Vinted):
   `contextType/contextId` + banner con título/foto/precio vivo + chip en la
   lista. Se crea desde la ficha del inmueble ("Comentar en el chat").
   Seguridad: solo puedes vincular registros TUYOS y la tarjeta solo se sirve
   si el dueño sigue en la conversación (`src/lib/chat/context.ts`).
2. **Eventos del registro DENTRO del hilo**: cambio de precio/renta, VENDIDO o
   retirado → mensaje SYSTEM en todas las conversaciones vinculadas
   (`src/lib/chat/context-events.ts`, enganchado al recheck de anuncios).
   Ambas partes ven la negociación moverse sin configurar alertas.
3. **Bot @Nidokey** dentro del chat con herramientas de lectura/escritura
   sobre los registros del usuario (gate determinista + cuota).
4. Alertas de precio personales → DM del bot + push (ya existían).

**Ofertas estructuradas: decisión de producto pendiente.** Nidokey hoy no es
un marketplace entre usuarios (los inmuebles se importan de portales; no hay
"mi anuncio en venta" ni pasarela C2C). Un flujo oferta/aceptar/rechazar sin
transacción real detrás sería UI simulada, que este proyecto prohíbe. Si algún
día hay venta entre usuarios: las ofertas deben ser entidades del servidor con
idempotencia y estados, ligadas al rail de pagos webhook-first ya existente.

## 5. Seguridad y moderación (estado tras el sprint)

- Toda ruta pasa por `requireUserId()` + `getParticipantOrNull()` (404
  uniforme, sin filtrar existencia). `senderId` siempre del JWT.
- **Arreglado en este sprint**: IDOR del banner de contexto; bloqueos ahora
  también en creación de grupos y en push; título de grupo pasa el filtro
  anti-suplantación del bot; `replyToId` validado contra la conversación;
  carreras P2002 (mensaje y DIRECT) devuelven el existente; bloqueo de usuario
  inexistente = 404, no 500.
- **Adjuntos**: bucket R2 privado, keys namespaced `chat/u/<userId>/`,
  URLs GET firmadas (7 días). Verificación server-side al enviar: HEAD (tamaño
  REAL, no el declarado) + magic bytes para imágenes (`sniffImageMime`, un
  binario disfrazado de jpeg se rechaza). Extensiones saneadas.
- **Cuotas** (tabla RateLimit): mensajes 30/min · reacciones 60/min · subidas
  120/h · conversaciones nuevas 30/h · búsqueda de usuarios 100/día · búsqueda
  en chat 60/min · denuncias 20/día · test push 30/h.
- **Denuncias**: `ChatReport` (categoría, comentario, snapshot del mensaje
  como evidencia congelada, soft-refs que sobreviven a borrados). Entradas:
  long-press en mensaje ajeno y menú de cabecera. Retención 180 días (cron).
  Revisión: hoy solo por SQL directo; falta panel de admin.
- **Privacidad de datos**: el email ya NO viaja en DTOs de participantes ni
  bloqueados (solo el propio, contactos guardados y búsqueda exacta).
  "Eliminar mensaje" borra cuerpo en BBDD y adjuntos en R2. El borrado de
  cuenta purga además todos los objetos `chat/u/<uid>/` y el DM con el bot.
  El JWT interno del bot dura 15 min (antes 90 días).
- **Gateway**: HMAC timing-safe + ticket JWT 60 s (HS256 pinneado),
  `maxPayload` 64 KB, rate por socket 40 frames/10 s, límite 8 sockets/usuario,
  backpressure. El typing entrante se filtra por membresía EN EL CLIENTE (el
  gateway no tiene BBDD para validarlo).

## 6. Modelo de privacidad (honesto)

**No hay cifrado de extremo a extremo y no se afirma lo contrario.** Pueden
acceder técnicamente al contenido: la BBDD (Neon) y quien opere el proyecto de
Vercel; los adjuntos, quien tenga credenciales R2. El gateway NO ve contenido
(aviso opaco). Los push llevan preview del texto por los servidores de
Expo/FCM/APNs (kill-switch global `CHAT_PUSH_PREVIEW=0`; falta preferencia por
usuario). El esquema está preparado para E2E futuro (`body` opaco, gateway sin
contenido), pendiente del plan «nidokey-seguridad».

## 7. Operación

- **Deploy**: web+API con el push a `main` (Vercel). Móvil: JS puro → OTA
  (`eas update`, ver tabla de ramas en OPERACIONES.md). ⚠️ `expo-clipboard` se
  añadió a package.json: la fila "Copiar" aparecerá sola cuando se haga el
  PRÓXIMO build nativo; hasta entonces la OTA la oculta (guard de módulo).
- ⚠️ **Gateway**: `gateway/server.mjs` cambió (hardening) → redeploy manual en
  el VPS (scp + `systemctl restart nidokey-gateway`). Compatible con clientes
  viejos; sin prisa, pero hasta entonces el VPS corre la versión anterior.
- **BBDD**: `ChatReport` ya sincronizado con `prisma db push` (aditivo).
- **Rollback**: OTA = republicar la actualización anterior; API = revert en
  Vercel. El esquema solo tuvo cambios aditivos.
- **Observabilidad**: `/healthz` del gateway (métricas), logs `[chat-gw]`,
  `[alerts]`, `[chat-context]`, `[chat-cleanup]` en Vercel; evento
  `push_register_failed` y recibos de push en el botón de prueba.

## 8. Tests

`npm test` (node:test + tsx, corre en CI): 125 pasan. Del chat: directKey,
messagePreview, sanitizeMessageBody (incl. surrogates), truncateSafe,
sniffImageMime, aggregateReactions, replySnippet, messageDto (borrado suave y
cita), contextEventText, inQuietHours/localHourIn, shouldFire (alertas), más
los evals del bot (harness aparte). **Hueco conocido**: sin tests de
integración de rutas (exigirían mock de Prisma o BBDD de test) — los caminos
de autorización están cubiertos solo por revisión; ver §9.

## 9. Limitaciones y trabajo pendiente

**Grupos (entregado en 2 pasos, jul-2026)**
- Crear, ficha con miembros y roles, renombrar, añadir/expulsar y salir. Todo
  cambio deja un mensaje SYSTEM (`src/lib/chat/system.ts`) que además sube la
  conversación en la lista; solo el alta hace sonar el push.
- **Historial acotado a `joinedAt`**: quien entra hoy NO lee lo anterior, y
  readmitir tras expulsar reinicia la marca (si no, expulsar no protegía nada).
  En 1:1 no cambia nada: ambos participantes nacen con la conversación.
- Si el OWNER se va, hereda el miembro más antiguo (sin esto el grupo quedaba
  sin nadie que pudiera administrarlo: no hay forma de nombrar ADMIN).
- `actorName` (no `displayName`) para lo que se persiste y se difunde: sin
  fallback al email, saneado y a 32 caracteres.
- **Foto de grupo** (OWNER/ADMIN): presign → PUT a R2 bajo
  `avatars/group/<id>/` → PATCH con la key. Se sirve por `GET
  /api/avatar/group/[id]` (302 a firmada), **público** por el mismo motivo que
  el avatar de persona (expo-image no manda Bearer). Consecuencia asumida: un
  ex-miembro que conserve el id sigue viendo la foto actual y las futuras.
  ⚠️ Las keys cuelgan de `avatars/`, que barre el cron de huérfanos: si se
  añade otra tabla que guarde ahí, hay que sumarla al conjunto "en uso" del
  cron o sus fotos se borran a los 7 días.
- Pendiente: nombrar ADMIN, "escribiendo…" con nombre,
  compartir registros a un grupo, y los textos SYSTEM guardados en castellano
  (un usuario en EN los ve en español; migrarlos exige guardarlos codificados).

**P1 restante**
- Tests de integración de las rutas (IDOR, bloqueo, idempotencia) con BBDD.
- Los bloqueos solo se comprueban contra QUIEN añade: un admin puede meter en
  el grupo a alguien a quien otro miembro tiene bloqueado (decisión abierta).

**P2**
- Reenviar (necesita `forwardedFromId` + re-namespacing de adjuntos), fijar
  mensajes, archivar, marcar-como-no-leído, recibos configurables, preferencia
  "ocultar contenido del push", presencia/última conexión (gateway),
  transcripción de voz, JWT móvil con revocación (jti + tabla), paginación de
  la lista (>100), panel de revisión de denuncias.
- Subida de adjuntos: falta progreso/cancelación por archivo (hoy spinner
  global) y burbuja optimista para media.
- Notas de voz: pausa, preescucha, velocidad, barra de progreso.

**Decisiones de producto abiertas**
- Ofertas estructuradas (ver §4). Mensajes temporales. Llamadas (WebRTC; el
  gateway podría hacer señalización, pero es un proyecto en sí — sin botones
  hasta entonces).

**Bloqueos externos**: ninguno para lo entregado. Redeploy del gateway = SSH
del VPS (manual del usuario).
