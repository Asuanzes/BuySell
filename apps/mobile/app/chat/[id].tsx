import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { RECORD_LINK_RE, linkDest } from "@nidokey/shared";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { VerifiedBadge, isOfficialConversation } from "@/components/chat/VerifiedBadge";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@/lib/hooks/useQuery";
import {
  blockUser,
  chatBootstrap,
  deleteContact,
  deleteMessage,
  editMessage,
  getConversation,
  listBlocks,
  listContacts,
  listMessages,
  markRead,
  muteConversation,
  reportChat,
  saveContact,
  searchInConversation,
  sendMediaMessage,
  sendMessage,
  stableAttachmentUrl,
  toggleReaction,
  unblockUser,
  type AttachmentDto,
  type ConversationDto,
  type MessageDto,
  type MessageSearchResult,
  type ReplyToDto,
  type ReportCategory,
} from "@/lib/chat/api";
import {
  audioModuleAvailable,
  formatBytes,
  pickDocument,
  pickImages,
  pickersAvailable,
  takePhoto,
  uploadAttachment,
  type PickedAttachment,
} from "@/lib/chat/media";
import { Avatar, chatTime } from "@/components/chat/ConversationList";
import { ActionsSheet, type SheetOption } from "@/components/chat/ActionsSheet";
import { MessageActionsSheet, type MessageAction } from "@/components/chat/MessageSheet";
import { getDraft, setDraft } from "@/lib/chat/drafts";
import { setActiveConversation } from "@/lib/chat/push";
import { chatSocket } from "@/lib/chat/socket";
import { useSocketOpen } from "@/lib/chat/use-socket-open";
import { ResultModal, EmptyState } from "@/components/ui";
import { useAppStyle } from "@/lib/app-style-context";

// Componentes que importan expo-audio (nativo) ESTÁTICAMENTE: se cargan en
// perezoso solo si el binario trae el módulo — una OTA sobre un build viejo
// no crashea (mismo blindaje que lib/chat/push.ts).
/* eslint-disable @typescript-eslint/no-require-imports */
const VoiceRecorder = audioModuleAvailable()
  ? (require("@/components/chat/VoiceRecorder") as typeof import("@/components/chat/VoiceRecorder")).VoiceRecorder
  : null;
const AudioBubble = audioModuleAvailable()
  ? (require("@/components/chat/AudioBubble") as typeof import("@/components/chat/AudioBubble")).AudioBubble
  : null;
/* eslint-enable @typescript-eslint/no-require-imports */

/** Fila del listado: mensaje o separador de día (estilo WhatsApp/Telegram). */
type ListRow = { type: "msg"; m: MessageDto } | { type: "sep"; key: string; label: string };

/** Orden TOTAL y estable: createdAt con desempate por id (igual que el servidor). */
function compareMessages(a: MessageDto, b: MessageDto): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Firmas ESTRECHAS para `t` (unión de claves literales): el TFunction tipado
// de i18next sí es asignable a esto, y un typo de clave sigue sin compilar.
type DayT = (k: "chat.day_today" | "chat.day_yesterday") => string;
type MediaT = (k: "chat.photo" | "chat.voice_note" | "chat.file_generic") => string;

function dayLabel(iso: string, lang: string, t: DayT): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = (x: Date, y: Date) => x.toDateString() === y.toDateString();
  if (sameDay(d, now)) return t("chat.day_today");
  const yesterday = new Date(now.getTime() - 24 * 3600_000);
  if (sameDay(d, yesterday)) return t("chat.day_yesterday");
  const locale = lang === "en" ? "en-GB" : "es-ES";
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}

/** Color estable por remitente (nombre en burbujas de grupo). */
const SENDER_COLORS = ["#6C5A9C", "#2E7D6B", "#B05A3C", "#3C6AB0", "#8C4A52", "#7A6A2F"];
function senderColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return SENDER_COLORS[Math.abs(h) % SENDER_COLORS.length];
}

/**
 * Pantalla de conversación. Tiempo real vía gateway WS (aviso opaco → refetch)
 * con polling adaptativo de respaldo; envío optimista con clientId idempotente
 * y estado fallido reintentable (mismo clientId → el servidor nunca duplica).
 */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { th, dark } = useTheme();
  const { t, i18n } = useTranslation();
  const { state } = useAuth();
  const myId = state.kind === "authed" ? state.user.id : null;

  // POLLING ADAPTATIVO: con el socket conectado, los eventos del gateway
  // adelantan el refresco y el polling pasa a fallback lento; con el socket
  // caído, vuelven los intervalos rápidos de F1.
  const socketOpen = useSocketOpen();
  const { data: conversation, refetch: refetchConversation } = useQuery(() => getConversation(id!), [id], {
    enabled: !!id,
    refreshInterval: socketOpen ? 60_000 : 10_000,
  });
  // Flags del servidor (adjuntos/voz dependen de que R2 esté configurado).
  const { data: boot } = useQuery(chatBootstrap, [], { revalidateOnFocus: false });
  const {
    data: latest,
    error: loadError,
    loading,
    refetch,
  } = useQuery(() => listMessages(id!), [id], { enabled: !!id, refreshInterval: socketOpen ? 30_000 : 4_000 });

  // Páginas antiguas (cursor hacia atrás) + envíos optimistas/fallidos.
  const [older, setOlder] = useState<MessageDto[]>([]);
  const [pending, setPending] = useState<MessageDto[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MessageDto | null>(null);
  const [msgActions, setMsgActions] = useState<MessageDto | null>(null);
  const [failedActions, setFailedActions] = useState<MessageDto | null>(null);
  const [text, setText] = useState("");
  const textRef = useRef("");
  const [sendError, setSendError] = useState<string | null>(null);

  // Responder-cita y edición: estados del composer.
  const [replyTo, setReplyTo] = useState<MessageDto | null>(null);
  const [editing, setEditing] = useState<MessageDto | null>(null);

  // Adjuntos (B1/B2/B4): sheet del "+", subida en curso, grabadora y visor.
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // Búsqueda dentro del chat.
  const [searchOpen, setSearchOpen] = useState(false);

  // Denuncias: objetivo (mensaje o usuario) + confirmación de enviada.
  const [reportTarget, setReportTarget] = useState<{ message?: MessageDto; userId?: string } | null>(null);
  const [reportDone, setReportDone] = useState(false);

  // Menú de cabecera (contacto / silenciar / bloquear).
  const [menuOpen, setMenuOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);
  const [isContact, setIsContact] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Scroll: FAB "ir al final" + contador de mensajes nuevos mientras lees atrás.
  const listRef = useRef<FlatList<ListRow>>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const awayRef = useRef(false);
  const [newWhileAway, setNewWhileAway] = useState(0);
  const lastSeenNewestIdRef = useRef<string | null>(null);

  // Borrador persistente: se restaura al entrar y se guarda al teclear/salir.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void getDraft(id).then((draft) => {
      if (alive && draft && !textRef.current) {
        textRef.current = draft;
        setText(draft);
      }
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // Mensajes visibles (ASC) dedupe por id y clientId.
  const messages = useMemo(() => {
    const seen = new Set<string>();
    const out: MessageDto[] = [];
    for (const m of [...older, ...(latest?.messages ?? [])]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      if (m.clientId) seen.add("c:" + m.clientId);
      out.push(m);
    }
    for (const p of pending) {
      // Saltar también por id: `pending` puede contener el mensaje REAL (la
      // respuesta del POST) y duplicaría la key cuando `latest` lo traiga.
      if (seen.has(p.id) || (p.clientId && seen.has("c:" + p.clientId))) continue;
      out.push(p);
    }
    // Orden total con desempate por id: dos mensajes en el mismo milisegundo
    // (ráfaga, bot) quedaban en orden arbitrario con el comparador anterior.
    out.sort(compareMessages);
    return out;
  }, [older, latest, pending]);

  // Poda de `pending`: cuando el mensaje ya viene en `latest` (poll/refetch),
  // su copia en pending sobra. Devuelve la MISMA referencia si no hay cambios
  // para no re-renderizar en cada poll. Los FALLIDOS no se podan (viven hasta
  // reintentar/descartar).
  useEffect(() => {
    if (!latest || pending.length === 0) return;
    const ids = new Set(latest.messages.map((m) => m.id));
    const clientIds = new Set(latest.messages.map((m) => m.clientId).filter(Boolean));
    setPending((p) => {
      const next = p.filter((m) => m.failed || (!ids.has(m.id) && !(m.clientId && clientIds.has(m.clientId))));
      return next.length === p.length ? p : next;
    });
  }, [latest, pending.length]);

  // HUECO de continuidad: si entre dos refetches entraron ≥página de mensajes
  // (app horas en background), `older` ya no enlaza con `latest` y habría
  // mensajes intermedios invisibles. Detectar la discontinuidad y descartar
  // `older` (se repagina al hacer scroll).
  const prevLatestFirstRef = useRef<string | null>(null);
  useEffect(() => {
    const first = latest?.messages[0]?.id ?? null;
    const prev = prevLatestFirstRef.current;
    prevLatestFirstRef.current = first;
    if (!latest || older.length === 0 || !prev || !first || prev === first) return;
    // La página nueva no contiene al primer mensaje de la anterior → saltó una
    // ventana completa: lo acumulado puede tener un hueco en medio.
    if (!latest.messages.some((m) => m.id === prev)) setOlder([]);
  }, [latest, older.length]);

  // Contador "nuevos mientras leías atrás": el último mensaje entrante cambió
  // estando lejos del final.
  useEffect(() => {
    const newest = messages[messages.length - 1];
    if (!newest) return;
    const prevId = lastSeenNewestIdRef.current;
    lastSeenNewestIdRef.current = newest.id;
    if (!prevId || newest.id === prevId) return;
    if (awayRef.current && newest.senderId !== myId) setNewWhileAway((n) => n + 1);
  }, [messages, myId]);

  // Mientras esta conversación está abierta, no mostrar su propia notificación.
  useEffect(() => {
    setActiveConversation(id ?? null);
    return () => setActiveConversation(null);
  }, [id]);

  // ── Tiempo real (gateway WS, F3) ──────────────────────────────────────────
  const typingEnabled = boot?.flags.typing ?? true;
  const iAmTypingRef = useRef(false);
  const myTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Suscripción a la conversación (enruta "escribiendo…" de sus miembros).
  useEffect(() => {
    if (!id) return;
    chatSocket.subscribe(id);
    return () => chatSocket.unsubscribe(id);
  }, [id]);

  // Aviso de cambio → refetch con coalescing leading+trailing: el primero
  // dispara al instante y una ráfaga se colapsa en UN refetch extra a los 400 ms.
  const lastEventRefetchRef = useRef(0);
  const eventRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!id) return;
    const doRefetch = () => {
      lastEventRefetchRef.current = Date.now();
      void refetch();
      void refetchConversation();
    };
    const off = chatSocket.onMessageEvent((e) => {
      if (e.conversationId !== id) return;
      if (Date.now() - lastEventRefetchRef.current > 400) {
        doRefetch();
      } else if (!eventRefetchTimerRef.current) {
        eventRefetchTimerRef.current = setTimeout(() => {
          eventRefetchTimerRef.current = null;
          doRefetch();
        }, 400);
      }
    });
    return () => {
      off();
      if (eventRefetchTimerRef.current) {
        clearTimeout(eventRefetchTimerRef.current);
        eventRefetchTimerRef.current = null;
      }
    };
  }, [id, refetch, refetchConversation]);

  // Al (re)conectar el socket: refetch para cubrir el hueco sin eventos.
  const prevSocketOpenRef = useRef(socketOpen);
  useEffect(() => {
    if (socketOpen && !prevSocketOpenRef.current && id) {
      void refetch();
      void refetchConversation();
    }
    prevSocketOpenRef.current = socketOpen;
  }, [socketOpen, id, refetch, refetchConversation]);

  const stopTyping = useCallback(() => {
    if (myTypingTimerRef.current) {
      clearTimeout(myTypingTimerRef.current);
      myTypingTimerRef.current = null;
    }
    if (iAmTypingRef.current && id) {
      iAmTypingRef.current = false;
      chatSocket.sendTyping(id, false);
    }
  }, [id]);

  // Al teclear: anuncia "escribiendo…" (debounce 3 s para el "off") y persiste
  // el borrador (debounce interno de drafts.ts).
  const onChangeText = useCallback(
    (v: string) => {
      textRef.current = v;
      setText(v);
      if (id) setDraft(id, v);
      if (!typingEnabled || !id) return;
      if (!iAmTypingRef.current) {
        iAmTypingRef.current = true;
        chatSocket.sendTyping(id, true);
      }
      if (myTypingTimerRef.current) clearTimeout(myTypingTimerRef.current);
      myTypingTimerRef.current = setTimeout(stopTyping, 3000);
    },
    [typingEnabled, id, stopTyping]
  );

  // Apagar el typing al salir de la pantalla.
  useEffect(() => () => stopTyping(), [stopTyping]);

  // Marcar como leído cuando llegan mensajes nuevos de otros — con DEBOUNCE.
  const lastReadIdRef = useRef<string | null>(null);
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.senderId === myId) return;
    if (lastReadIdRef.current === last.id) return;
    lastReadIdRef.current = last.id;
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(() => {
      markReadTimerRef.current = null;
      void markRead(id!).catch(() => {});
    }, 1500);
  }, [messages, myId, id]);
  useEffect(
    () => () => {
      if (markReadTimerRef.current) {
        clearTimeout(markReadTimerRef.current);
        markReadTimerRef.current = null;
        if (id) void markRead(id).catch(() => {});
      }
    },
    [id]
  );

  const loadOlder = useCallback(async () => {
    const cursor = latest?.nextCursor;
    // Si ya hay páginas antiguas, el cursor es el primer mensaje cargado.
    const effectiveCursor = older.length > 0 ? older[0].id : cursor;
    if (!effectiveCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await listMessages(id!, effectiveCursor);
      setOlder((prev) => [...page.messages, ...prev]);
    } catch {
      // sin drama: se reintenta al volver a tirar
    } finally {
      setLoadingOlder(false);
    }
  }, [id, latest, older, loadingOlder]);

  /** Aplica una copia actualizada de un mensaje allá donde viva localmente
   *  (páginas antiguas y pendientes). `latest` se cubre con refetch. */
  const applyLocal = useCallback((updated: MessageDto) => {
    setOlder((prev) => {
      const i = prev.findIndex((m) => m.id === updated.id);
      if (i === -1) return prev;
      const next = [...prev];
      next[i] = updated;
      return next;
    });
    setPending((prev) => {
      const i = prev.findIndex((m) => m.id === updated.id);
      if (i === -1) return prev;
      const next = [...prev];
      next[i] = updated;
      return next;
    });
  }, []);

  async function onSend() {
    // Lectura+limpieza SÍNCRONAS vía ref: dos taps casi simultáneos ejecutan
    // onSend dos veces con el mismo estado — el segundo ve el ref vacío y sale
    // (candado anti-duplicado; el estado React va por detrás).
    const body = textRef.current.trim();
    if (!body || !myId) return;
    textRef.current = "";
    setText("");
    if (id) setDraft(id, "");
    stopTyping();

    // MODO EDICIÓN: PATCH en vez de POST.
    if (editing) {
      const target = editing;
      setEditing(null);
      try {
        const updated = await editMessage(target.id, body);
        applyLocal({ ...target, body: updated.body, editedAt: updated.editedAt });
        void refetch();
      } catch (e) {
        setEditing(target);
        textRef.current = body;
        setText(body);
        setSendError(e instanceof Error ? e.message : t("chat.edit_error"));
      }
      return;
    }

    const quoted = replyTo;
    setReplyTo(null);
    const clientId = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const replySnippet: ReplyToDto | null = quoted
      ? { id: quoted.id, senderId: quoted.senderId, kind: quoted.kind, body: quoted.body, deleted: quoted.deleted }
      : null;
    const optimistic: MessageDto = {
      id: "tmp_" + clientId,
      conversationId: id!,
      senderId: myId,
      kind: "TEXT",
      body,
      replyToId: quoted?.id ?? null,
      replyTo: replySnippet,
      clientId,
      editedAt: null,
      deleted: false,
      createdAt: new Date().toISOString(),
      reactions: [],
      attachments: [],
    };
    setPending((p) => [...p, optimistic]);
    await postMessage(optimistic);
  }

  /** POST del mensaje (primer envío y reintentos: MISMO clientId → el servidor
   *  es idempotente y un reintento tras respuesta perdida no duplica). */
  async function postMessage(m: MessageDto) {
    try {
      const real = await sendMessage(m.conversationId, {
        clientId: m.clientId!,
        body: m.body ?? "",
        replyToId: m.replyToId,
      });
      setPending((p) => p.map((x) => (x.clientId === m.clientId ? real : x)));
      void refetch();
    } catch {
      // El mensaje NO desaparece: queda como fallido con reintento (mismo
      // clientId). Antes se devolvía el texto al composer y el reintento
      // generaba OTRO clientId → duplicado clásico tras respuesta perdida.
      setPending((p) => p.map((x) => (x.clientId === m.clientId ? { ...x, failed: true } : x)));
    }
  }

  function onRetryFailed(m: MessageDto) {
    setFailedActions(null);
    setPending((p) => p.map((x) => (x.clientId === m.clientId ? { ...x, failed: false } : x)));
    void postMessage(m);
  }

  function onDiscardFailed(m: MessageDto) {
    setFailedActions(null);
    setPending((p) => p.filter((x) => x.clientId !== m.clientId));
  }

  async function onDelete() {
    const m = confirmDelete;
    setConfirmDelete(null);
    if (!m) return;
    try {
      const deleted = await deleteMessage(m.id);
      applyLocal(deleted);
      await refetch();
    } catch {
      // el mensaje sigue; el usuario puede reintentar
    }
  }

  async function onReact(message: MessageDto, emoji: string) {
    setMsgActions(null);
    try {
      const reactions = await toggleReaction(message.id, emoji);
      // Aplicar la respuesta en local: si el mensaje está en una página
      // antigua, el refetch (solo última página) no lo actualizaría jamás.
      applyLocal({ ...message, reactions });
      void refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("chat.action_error"));
    }
  }

  // Acciones del sheet de mensaje (long-press).
  const editWindowMin = boot?.limits.editWindowMin ?? 15;
  function canEditMessage(m: MessageDto | null): boolean {
    if (!m || m.deleted || m.senderId !== myId || m.kind !== "TEXT") return false;
    return Date.now() - new Date(m.createdAt).getTime() < editWindowMin * 60_000;
  }

  function onMessageAction(action: MessageAction) {
    const m = msgActions;
    setMsgActions(null);
    if (!m) return;
    if (action === "reply") {
      setEditing(null);
      setReplyTo(m);
    } else if (action === "edit") {
      setReplyTo(null);
      setEditing(m);
      textRef.current = m.body ?? "";
      setText(m.body ?? "");
    } else if (action === "report") {
      setReportTarget({ message: m });
    } else if (action === "delete") {
      setConfirmDelete(m);
    }
  }

  const reportOptions: SheetOption[] = [
    { id: "spam", icon: "megaphone-outline", label: t("chat.report_category_spam") },
    { id: "scam", icon: "warning-outline", label: t("chat.report_category_scam") },
    { id: "harassment", icon: "hand-left-outline", label: t("chat.report_category_harassment") },
    { id: "inappropriate", icon: "eye-off-outline", label: t("chat.report_category_inappropriate") },
    { id: "other", icon: "help-circle-outline", label: t("chat.report_category_other") },
  ];

  async function onReportCategory(o: SheetOption) {
    const target = reportTarget;
    setReportTarget(null);
    if (!target) return;
    try {
      await reportChat({
        category: o.id as ReportCategory,
        messageId: target.message?.id ?? null,
        targetUserId: target.userId ?? null,
        conversationId: target.message ? null : id ?? null,
      });
      setReportDone(true);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("chat.report_error"));
    }
  }

  /** Salta a un mensaje cargado (tap en una cita). Si no está en la ventana, no-op. */
  function jumpToMessage(messageId: string) {
    const idx = inverted.findIndex((r) => r.type === "msg" && r.m.id === messageId);
    if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
  }

  /**
   * Abre un resultado de búsqueda: si el mensaje no está en la ventana cargada,
   * pagina hacia atrás (acotado a 6 páginas ≈ 300 mensajes) hasta encontrarlo.
   */
  async function openSearchResult(messageId: string) {
    setSearchOpen(false);
    if (messages.some((m) => m.id === messageId)) {
      setTimeout(() => jumpToMessage(messageId), 250);
      return;
    }
    let cursor: string | null = older.length > 0 ? older[0].id : latest?.nextCursor ?? null;
    const acc: MessageDto[] = [];
    for (let i = 0; i < 6 && cursor; i++) {
      try {
        const page = await listMessages(id!, cursor);
        acc.unshift(...page.messages);
        cursor = page.messages.length > 0 ? page.messages[0].id : null;
        if (page.messages.some((m) => m.id === messageId)) break;
        if (!page.nextCursor) break;
      } catch {
        break;
      }
    }
    if (acc.length > 0) setOlder((prev) => [...acc, ...prev]);
    // El salto va tras el re-render con las páginas nuevas montadas.
    setTimeout(() => jumpToMessage(messageId), 350);
  }

  // ——— Adjuntos: subir a R2 (presigned PUT) y enviar UN mensaje con todos ———
  const canAttach = !!boot?.flags.attachments && pickersAvailable();
  const canVoice = canAttach && !!boot?.flags.voice && !!VoiceRecorder;

  async function sendAttachments(kind: "IMAGE" | "FILE" | "AUDIO", files: PickedAttachment[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const f of files) uploaded.push(await uploadAttachment(kind, f));
      const clientId = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const real = await sendMediaMessage(id!, { clientId, kind, attachments: uploaded });
      setRecording(false);
      setPending((p) => [...p, real]);
      void refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("chat.upload_error"));
    } finally {
      setUploading(false);
    }
  }

  const attachOptions: SheetOption[] = [
    { id: "camera", icon: "camera-outline", label: t("chat.attach_camera") },
    { id: "gallery", icon: "images-outline", label: t("chat.attach_gallery") },
    { id: "file", icon: "document-outline", label: t("chat.attach_file") },
    ...(canVoice ? [{ id: "voice", icon: "mic-outline" as const, label: t("chat.attach_voice") }] : []),
  ];

  // Candado: en iOS un picker que falla al presentarse queda "en curso" y el
  // siguiente intento da "Different document picking in progress".
  const pickingRef = useRef(false);

  async function onAttachSelect(option: SheetOption) {
    setAttachOpen(false);
    if (option.id === "voice") {
      setRecording(true);
      return;
    }
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
      // iOS no puede presentar el picker mientras nuestro sheet (Modal) aún se
      // está descartando: esperar al dismiss o el picker falla en silencio.
      if (Platform.OS === "ios") await new Promise((r) => setTimeout(r, 500));

      if (option.id === "gallery") {
        await sendAttachments("IMAGE", await pickImages(6));
      } else if (option.id === "camera") {
        const f = await takePhoto();
        if (f) await sendAttachments("IMAGE", [f]);
      } else if (option.id === "file") {
        const f = await pickDocument();
        // Una imagen elegida "como archivo" se envía como FOTO (burbuja con
        // visor), no como fila de descarga.
        if (f) await sendAttachments(f.mime.startsWith("image/") ? "IMAGE" : "FILE", [f]);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("chat.upload_error"));
    } finally {
      pickingRef.current = false;
    }
  }

  // Recibo del otro lado (solo DIRECT): hasta cuándo ha leído/recibido.
  const other = conversation?.participants.find((p) => p.userId !== myId);
  const otherReadAt = conversation?.kind === "DIRECT" ? other?.lastReadAt ?? null : null;
  const otherDeliveredAt = conversation?.kind === "DIRECT" ? other?.lastDeliveredAt ?? null : null;

  const isGroup = conversation?.kind === "GROUP";

  /** Nombre a mostrar de un participante (citas y burbujas de grupo). */
  const nameOf = useCallback(
    (userId: string | null): string => {
      if (!userId) return "—";
      if (userId === myId) return t("chat.you");
      const p = conversation?.participants.find((x) => x.userId === userId);
      if (!p) return "—";
      return p.user.name?.trim() || (p.user.username ? "@" + p.user.username : null) || "—";
    },
    [conversation, myId, t]
  );

  // Filas del listado con separadores de día, en orden INVERTIDO para la
  // FlatList inverted (el índice 0 se pinta abajo).
  const inverted = useMemo(() => {
    const rows: ListRow[] = [];
    let lastDay = "";
    for (const m of messages) {
      const day = new Date(m.createdAt).toDateString();
      if (day !== lastDay) {
        rows.push({ type: "sep", key: "sep_" + day, label: dayLabel(m.createdAt, i18n.language, t) });
        lastDay = day;
      }
      rows.push({ type: "msg", m });
    }
    return rows.reverse();
  }, [messages, i18n.language, t]);

  const muted = !!conversation?.muteUntil && new Date(conversation.muteUntil) > new Date();
  const isDirect = conversation?.kind === "DIRECT";
  const otherUserId = isDirect ? other?.userId ?? null : null;

  // Abre el menú y resuelve el estado contacto/bloqueado bajo demanda (listas
  // pequeñas; evita cargarlas en cada entrada al chat).
  async function openMenu() {
    setMenuOpen(true);
    if (!otherUserId) return;
    setMenuBusy(true);
    try {
      const [contacts, blocks] = await Promise.all([listContacts(), listBlocks()]);
      setIsContact(contacts.some((c) => c.userId === otherUserId));
      setIsBlocked(blocks.some((b) => b.userId === otherUserId));
    } catch {
      // Sin red: el menú muestra las acciones con el último estado conocido.
    } finally {
      setMenuBusy(false);
    }
  }

  const menuOptions: SheetOption[] = [];
  if (otherUserId) {
    menuOptions.push(
      isContact
        ? { id: "contact_remove", icon: "person-remove-outline", label: t("chat.menu_contact_remove") }
        : { id: "contact_save", icon: "person-add-outline", label: t("chat.menu_contact_save") }
    );
  }
  menuOptions.push({ id: "search", icon: "search-outline", label: t("chat.search_in_chat") });
  menuOptions.push({
    id: "mute",
    icon: muted ? "notifications-outline" : "notifications-off-outline",
    label: muted ? t("chat.menu_muted") : t("chat.menu_mute"),
    hint: muted ? t("chat.menu_muted_hint") : undefined,
  });
  if (otherUserId) {
    menuOptions.push({ id: "report_user", icon: "flag-outline", label: t("chat.report_user"), danger: true });
    menuOptions.push(
      isBlocked
        ? { id: "unblock", icon: "lock-open-outline", label: t("chat.menu_unblock") }
        : { id: "block", icon: "ban-outline", label: t("chat.menu_block"), danger: true }
    );
  }

  async function onMenuSelect(option: SheetOption) {
    if (option.id === "mute") {
      setMenuOpen(false);
      setMuteOpen(true);
      return;
    }
    if (option.id === "search") {
      setMenuOpen(false);
      setSearchOpen(true);
      return;
    }
    setMenuOpen(false);
    if (!otherUserId) return;
    if (option.id === "report_user") {
      setReportTarget({ userId: otherUserId });
      return;
    }
    try {
      if (option.id === "contact_save") {
        await saveContact(otherUserId);
        setIsContact(true);
      } else if (option.id === "contact_remove") {
        await deleteContact(otherUserId);
        setIsContact(false);
      } else if (option.id === "block") {
        await blockUser(otherUserId);
        setIsBlocked(true);
      } else if (option.id === "unblock") {
        await unblockUser(otherUserId);
        setIsBlocked(false);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("chat.action_error"));
    }
  }

  const muteOptions: SheetOption[] = [
    { id: "8h", icon: "time-outline", label: t("chat.mute_8h") },
    { id: "1w", icon: "calendar-outline", label: t("chat.mute_1w") },
    { id: "forever", icon: "infinite-outline", label: t("chat.mute_forever") },
    ...(muted
      ? [{ id: "none", icon: "notifications-outline" as const, label: t("chat.mute_off") }]
      : []),
  ];

  async function onMuteSelect(option: SheetOption) {
    setMuteOpen(false);
    const until =
      option.id === "8h"
        ? new Date(Date.now() + 8 * 3600_000).toISOString()
        : option.id === "1w"
          ? new Date(Date.now() + 7 * 24 * 3600_000).toISOString()
          : option.id === "forever"
            ? new Date("9999-01-01T00:00:00.000Z").toISOString()
            : null;
    try {
      await muteConversation(id!, until);
      await refetchConversation();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("chat.action_error"));
    }
  }

  function onListScroll(offsetY: number) {
    const away = offsetY > 350; // lista invertida: 0 = abajo del todo
    if (away !== awayRef.current) {
      awayRef.current = away;
      setAwayFromBottom(away);
      if (!away) setNewWhileAway(0);
    }
  }

  function jumpToLatest() {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setNewWhileAway(0);
  }

  const composerDisabled = !text.trim();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.bg }]} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Un único KAV a pantalla completa: con edge-to-edge Android ignora
          adjustResize, así que el "padding" del KAV es lo que sube el composer
          (y encoge la FlatList invertida → el último mensaje sigue visible). */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">

      {/* Header propio: volver + avatar + título */}
      <View style={[styles.header, { backgroundColor: th.surface, borderBottomColor: th.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          style={styles.headerBack}
        >
          <Ionicons name="chevron-back" size={24} color={th.primary} />
        </Pressable>
        <Avatar title={conversation?.title ?? "…"} imageUrl={conversation?.imageUrl ?? null} size={34} />
        <View style={styles.headerText}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerTitle, { color: th.text }]} numberOfLines={1}>
              {conversation?.title ?? t("common.loading")}
            </Text>
            {isOfficialConversation(conversation) && <VerifiedBadge size={15} />}
            {muted && <Ionicons name="notifications-off-outline" size={14} color={th.textSubtle} />}
          </View>
          {id && (
            <HeaderSubtitle
              conversationId={id}
              conversation={conversation ?? null}
              membersLabel={
                conversation?.kind === "GROUP"
                  ? t("chat.members", { count: conversation.participants.length })
                  : null
              }
            />
          )}
        </View>
        {conversation && (
          <Pressable
            onPress={() => void openMenu()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("chat.menu_title")}
            style={styles.headerMenu}
          >
            <Ionicons name="ellipsis-vertical" size={20} color={th.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Banner del registro vinculado */}
      {conversation?.context && (
        <Pressable
          onPress={() => {
            if (conversation.contextType && conversation.contextId) {
              router.push(`/${conversation.contextType}/${conversation.contextId}` as never);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={conversation.context.title}
          style={[styles.ctxBanner, { backgroundColor: th.surface, borderColor: th.border }]}
        >
          {conversation.context.imageUrl ? (
            <Image source={{ uri: conversation.context.imageUrl }} style={styles.ctxImg} contentFit="cover" />
          ) : (
            <View style={[styles.ctxImg, { backgroundColor: th.imagePlaceholder }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.ctxTitle, { color: th.text }]} numberOfLines={1}>
              {conversation.context.title}
            </Text>
            {conversation.context.subtitle && (
              <Text style={[styles.ctxSub, { color: th.textMuted }]} numberOfLines={1}>
                {conversation.context.subtitle}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color={th.textSubtle} />
        </Pressable>
      )}
      {conversation && conversation.contextType && !conversation.context && (
        <View style={[styles.ctxBanner, { backgroundColor: th.surface, borderColor: th.border }]}>
          <Text style={[styles.ctxSub, { color: th.textSubtle }]}>{t("chat.context_deleted")}</Text>
        </View>
      )}

      {/* Zona de mensajes */}
      <View style={styles.flex}>
      {loading && !latest ? (
        <View style={styles.center}>
          <ActivityIndicator color={th.primary} />
        </View>
      ) : loadError && !latest ? (
        // Antes: fallo de carga = pantalla vacía en silencio. Ahora: error accionable.
        <EmptyState
          icon="cloud-offline-outline"
          title={t("chat.load_error")}
          description={loadError.message}
          actionLabel={t("common.retry")}
          onAction={refetch}
        />
      ) : messages.length === 0 ? (
        <EmptyState icon="chatbubble-ellipses-outline" title={t("chat.no_messages")} description={t("chat.empty_hint")} />
      ) : (
        <FlatList
          ref={listRef}
          data={inverted}
          inverted
          keyExtractor={(r) => (r.type === "msg" ? r.m.id : r.key)}
          renderItem={({ item }) =>
            item.type === "sep" ? (
              <View style={styles.sysWrap}>
                <Text style={[styles.sepText, { color: th.textSubtle, backgroundColor: th.surface }]}>{item.label}</Text>
              </View>
            ) : (
              <Bubble
                m={item.m}
                mine={item.m.senderId === myId}
                dark={dark}
                senderName={isGroup && item.m.senderId !== myId ? nameOf(item.m.senderId) : null}
                senderId={item.m.senderId}
                quoteName={item.m.replyTo ? nameOf(item.m.replyTo.senderId) : null}
                otherReadAt={otherReadAt}
                otherDeliveredAt={otherDeliveredAt}
                onLongPress={() => {
                  if (item.m.kind !== "SYSTEM" && !item.m.deleted) {
                    if (item.m.failed) setFailedActions(item.m);
                    else if (!item.m.id.startsWith("tmp_")) setMsgActions(item.m);
                  }
                }}
                onPressFailed={() => setFailedActions(item.m)}
                onPressQuote={() => item.m.replyTo && jumpToMessage(item.m.replyTo.id)}
                onToggleReaction={(emoji) => void onReact(item.m, emoji)}
                onOpenImage={(url) => setViewerUrl(url)}
              />
            )
          }
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          onScroll={(e) => onListScroll(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={100}
          onScrollToIndexFailed={() => {}}
          // Virtualización acotada: menos items vivos al cargar páginas viejas.
          // removeClippedSubviews solo Android (en iOS + inverted da burbujas
          // en blanco con alturas variables).
          windowSize={10}
          maxToRenderPerBatch={8}
          initialNumToRender={15}
          removeClippedSubviews={Platform.OS === "android"}
          ListFooterComponent={loadingOlder ? <ActivityIndicator color={th.primary} style={{ marginVertical: 8 }} /> : null}
        />
      )}

      {/* FAB "ir al final" + contador de nuevos mientras lees mensajes antiguos */}
      {awayFromBottom && (
        <Pressable
          onPress={jumpToLatest}
          accessibilityRole="button"
          accessibilityLabel={t("chat.jump_latest")}
          style={[styles.jumpFab, { backgroundColor: th.surface, borderColor: th.border }]}
        >
          {newWhileAway > 0 && (
            <View style={[styles.jumpBadge, { backgroundColor: th.accent }]}>
              <Text style={styles.jumpBadgeText}>{newWhileAway > 99 ? "99+" : newWhileAway}</Text>
            </View>
          )}
          <Ionicons name="chevron-down" size={20} color={th.primary} />
        </Pressable>
      )}
      </View>

      {/* Chip de cita/edición encima del composer */}
      {(replyTo || editing) && (
        <View style={[styles.composerChip, { backgroundColor: th.surface, borderTopColor: th.border }]}>
          <Ionicons
            name={editing ? "pencil-outline" : "arrow-undo-outline"}
            size={16}
            color={th.primary}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.chipTitle, { color: th.primary }]} numberOfLines={1}>
              {editing ? t("chat.editing_banner") : t("chat.replying_to", { name: nameOf(replyTo!.senderId) })}
            </Text>
            {!editing && (
              <Text style={[styles.chipBody, { color: th.textMuted }]} numberOfLines={1}>
                {replyTo!.body ?? mediaLabel(replyTo!.kind, t)}
              </Text>
            )}
          </View>
          <Pressable
            onPress={() => {
              if (editing) {
                setEditing(null);
                textRef.current = "";
                setText("");
              } else {
                setReplyTo(null);
              }
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
          >
            <Ionicons name="close-circle" size={20} color={th.textSubtle} />
          </Pressable>
        </View>
      )}

      {/* Composer (o grabadora de voz en su lugar) */}
      {recording && VoiceRecorder ? (
        <VoiceRecorder
          busy={uploading}
          onCancel={() => setRecording(false)}
          onSend={(f) => void sendAttachments("AUDIO", [f])}
        />
      ) : (
        <View style={[styles.composer, { backgroundColor: th.surface, borderTopColor: th.border }]}>
          {canAttach && (
            <Pressable
              onPress={() => setAttachOpen(true)}
              disabled={uploading}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t("chat.attach_title")}
              style={styles.attachBtn}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={th.primary} />
              ) : (
                <Ionicons name="add-circle-outline" size={26} color={th.primary} />
              )}
            </Pressable>
          )}
          <TextInput
            value={text}
            onChangeText={onChangeText}
            placeholder={t("chat.composer_placeholder")}
            placeholderTextColor={th.textSubtle}
            multiline
            maxLength={boot?.limits.maxMessageChars ?? 4000}
            accessibilityLabel={t("chat.composer_placeholder")}
            style={[styles.input, { color: th.text, backgroundColor: th.bg, borderColor: th.border }]}
          />
          <Pressable
            onPress={() => void onSend()}
            disabled={composerDisabled}
            accessibilityRole="button"
            accessibilityLabel={editing ? t("chat.msg_edit") : t("chat.send")}
            style={[styles.sendBtn, { backgroundColor: composerDisabled ? th.border : th.primary }]}
          >
            <Ionicons name={editing ? "checkmark" : "send"} size={18} color={th.primaryFg} />
          </Pressable>
        </View>
      )}

      </KeyboardAvoidingView>

      <ResultModal
        visible={!!confirmDelete}
        tone="error"
        icon="trash-outline"
        title={t("chat.delete_title")}
        message={t("chat.delete_message")}
        actions={[
          { label: t("common.delete"), variant: "danger", onPress: () => void onDelete() },
          { label: t("common.cancel"), variant: "ghost", onPress: () => setConfirmDelete(null) },
        ]}
        onRequestClose={() => setConfirmDelete(null)}
      />
      <ResultModal
        visible={!!sendError}
        tone="error"
        title={t("chat.send_error")}
        message={sendError ?? undefined}
        actions={[{ label: t("common.understood"), onPress: () => setSendError(null) }]}
        onRequestClose={() => setSendError(null)}
      />
      <ResultModal
        visible={!!actionError}
        tone="error"
        title={t("chat.action_error")}
        message={actionError ?? undefined}
        actions={[{ label: t("common.understood"), onPress: () => setActionError(null) }]}
        onRequestClose={() => setActionError(null)}
      />

      <ActionsSheet
        visible={menuOpen}
        title={conversation?.title ?? ""}
        options={menuOptions}
        busy={menuBusy}
        onSelect={(o) => void onMenuSelect(o)}
        onClose={() => setMenuOpen(false)}
      />
      <ActionsSheet
        visible={muteOpen}
        title={t("chat.mute_title")}
        options={muteOptions}
        onSelect={(o) => void onMuteSelect(o)}
        onClose={() => setMuteOpen(false)}
      />

      <ActionsSheet
        visible={attachOpen}
        title={t("chat.attach_title")}
        options={attachOptions}
        onSelect={(o) => void onAttachSelect(o)}
        onClose={() => setAttachOpen(false)}
      />

      {/* Denuncia: elegir categoría */}
      <ActionsSheet
        visible={!!reportTarget}
        title={t("chat.report_title")}
        options={reportOptions}
        onSelect={(o) => void onReportCategory(o)}
        onClose={() => setReportTarget(null)}
      />
      <ResultModal
        visible={reportDone}
        tone="success"
        icon="flag-outline"
        title={t("chat.report_title")}
        message={t("chat.report_sent")}
        actions={[{ label: t("common.understood"), onPress: () => setReportDone(false) }]}
        onRequestClose={() => setReportDone(false)}
      />

      {/* Envío fallido: reintentar (mismo clientId) o descartar */}
      <ActionsSheet
        visible={!!failedActions}
        title={t("chat.failed_send")}
        options={[
          { id: "retry", icon: "refresh-outline", label: t("chat.retry") },
          { id: "discard", icon: "trash-outline", label: t("chat.discard"), danger: true },
        ]}
        onSelect={(o) => {
          const m = failedActions;
          if (!m) return;
          if (o.id === "retry") onRetryFailed(m);
          else onDiscardFailed(m);
        }}
        onClose={() => setFailedActions(null)}
      />

      {/* Visor de imagen a pantalla completa */}
      <Modal visible={!!viewerUrl} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewerUrl(null)}>
          {viewerUrl && <Image source={{ uri: viewerUrl }} style={styles.viewerImg} contentFit="contain" />}
        </Pressable>
      </Modal>

      {/* Búsqueda dentro del chat */}
      {id && (
        <SearchInChatModal
          conversationId={id}
          visible={searchOpen}
          onClose={() => setSearchOpen(false)}
          onPick={(mid) => void openSearchResult(mid)}
        />
      )}

      {/* Long-press en un mensaje: reacciones + responder/copiar/compartir/editar/eliminar */}
      <MessageActionsSheet
        message={msgActions}
        canEdit={canEditMessage(msgActions)}
        canDelete={
          !!msgActions &&
          (msgActions.senderId === myId || conversation?.myRole === "OWNER" || conversation?.myRole === "ADMIN")
        }
        canReport={!!msgActions && msgActions.senderId !== myId}
        onReact={(emoji) => msgActions && void onReact(msgActions, emoji)}
        onAction={onMessageAction}
        onClose={() => setMsgActions(null)}
      />
    </SafeAreaView>
  );
}

function mediaLabel(kind: string, t: MediaT): string {
  if (kind === "IMAGE") return "📷 " + t("chat.photo");
  if (kind === "AUDIO") return "🎤 " + t("chat.voice_note");
  if (kind === "FILE") return "📎 " + t("chat.file_generic");
  return "";
}

/**
 * Subtítulo del header: "escribiendo…" (entrante, vía socket) o nº de miembros.
 * AISLADO y memoizado: el parpadeo del typing solo re-renderiza este texto, no
 * la pantalla entera (con la FlatList de burbujas dentro).
 */
const HeaderSubtitle = memo(function HeaderSubtitle({
  conversationId,
  conversation,
  membersLabel,
}: {
  conversationId: string;
  conversation: ConversationDto | null;
  membersLabel: string | null;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const [othersTyping, setOthersTyping] = useState(false);
  const offTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Solo participantes reales pueden pintar "escribiendo…" (el gateway relaya
  // sin verificar membresía: el filtro vive aquí).
  const participantIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    participantIdsRef.current = new Set(conversation?.participants.map((p) => p.userId) ?? []);
  }, [conversation]);

  // "Escribiendo…" entrante: se auto-apaga a los 5 s si no llega el "off".
  useEffect(() => {
    const off = chatSocket.onTypingEvent((e) => {
      if (e.conversationId !== conversationId) return;
      if (participantIdsRef.current.size > 0 && !participantIdsRef.current.has(e.userId)) return;
      if (offTimerRef.current) clearTimeout(offTimerRef.current);
      if (e.on) {
        setOthersTyping(true);
        offTimerRef.current = setTimeout(() => setOthersTyping(false), 5000);
      } else {
        setOthersTyping(false);
      }
    });
    return () => {
      off();
      if (offTimerRef.current) clearTimeout(offTimerRef.current);
      setOthersTyping(false);
    };
  }, [conversationId]);

  if (othersTyping) {
    return (
      <Text style={[styles.headerSub, { color: th.primary }]} numberOfLines={1}>
        {t("chat.typing")}
      </Text>
    );
  }
  if (membersLabel) {
    return (
      <Text style={[styles.headerSub, { color: th.textMuted }]} numberOfLines={1}>
        {membersLabel}
      </Text>
    );
  }
  return null;
});

/**
 * Modal de búsqueda dentro de la conversación: input con debounce de 400 ms,
 * resultados con snippet y hora; tap = saltar al mensaje.
 */
function SearchInChatModal({
  conversationId,
  visible,
  onClose,
  onPick,
}: {
  conversationId: string;
  visible: boolean;
  onClose: () => void;
  onPick: (messageId: string) => void;
}) {
  const { th } = useTheme();
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MessageSearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQ("");
      setResults(null);
      return;
    }
  }, [visible]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults(null);
      return;
    }
    setBusy(true);
    const timer = setTimeout(() => {
      searchInConversation(conversationId, query)
        .then((r) => setResults(r))
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [q, conversationId]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: th.bg }]} edges={["top", "bottom"]}>
        <View style={[styles.header, { backgroundColor: th.surface, borderBottomColor: th.border }]}>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            style={styles.headerBack}
          >
            <Ionicons name="chevron-back" size={24} color={th.primary} />
          </Pressable>
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder={t("chat.search_in_chat")}
            placeholderTextColor={th.textSubtle}
            accessibilityLabel={t("chat.search_in_chat")}
            style={[styles.input, { color: th.text, backgroundColor: th.bg, borderColor: th.border }]}
          />
        </View>
        {busy && !results ? (
          <View style={styles.center}>
            <ActivityIndicator color={th.primary} />
          </View>
        ) : results && results.length === 0 ? (
          <EmptyState icon="search-outline" title={t("chat.search_results_empty")} />
        ) : (
          <FlatList
            data={results ?? []}
            keyExtractor={(r) => r.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onPick(item.id)}
                accessibilityRole="button"
                accessibilityLabel={item.snippet}
                style={({ pressed }) => [
                  styles.searchResultRow,
                  { backgroundColor: th.surface, borderColor: th.border },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.searchResultText, { color: th.text }]} numberOfLines={2}>
                  {item.snippet}
                </Text>
                <Text style={[styles.bubbleTime, { color: th.textSubtle }]}>
                  {chatTime(item.createdAt, i18n.language)}
                </Text>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

/** Un adjunto dentro de la burbuja: imagen (tap = visor), audio o fila de archivo. */
function AttachmentView({ a, onOpenImage }: { a: AttachmentDto; onOpenImage: (url: string) => void }) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const url = stableAttachmentUrl(a);

  // Imagen por kind O por MIME: cubre mensajes antiguos enviados como FILE
  // con una foto dentro (se ven como foto, no como fila de descarga).
  if (a.kind === "IMAGE" || a.mimeType.startsWith("image/")) {
    const ratio = a.width && a.height ? Math.min(Math.max(a.width / a.height, 0.6), 1.8) : 4 / 3;
    return (
      <Pressable onPress={() => onOpenImage(url)} accessibilityRole="imagebutton" accessibilityLabel={t("chat.photo")}>
        <Image
          source={{ uri: url }}
          style={[styles.attachImg, { aspectRatio: ratio, backgroundColor: th.imagePlaceholder }]}
          contentFit="cover"
          transition={120}
        />
      </Pressable>
    );
  }

  if (a.kind === "AUDIO" && AudioBubble) {
    return <AudioBubble url={url} durationMs={a.durationMs} />;
  }

  // FILE — y AUDIO de respaldo si el binario no trae expo-audio.
  return (
    <Pressable
      onPress={() => void Linking.openURL(url).catch(() => {})}
      accessibilityRole="button"
      accessibilityLabel={a.fileName ?? t("chat.file_generic")}
      style={[styles.fileRow, { borderColor: th.border, backgroundColor: th.bg }]}
    >
      <Ionicons
        name={a.kind === "AUDIO" ? "musical-notes-outline" : "document-outline"}
        size={18}
        color={th.primary}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.fileName, { color: th.text }]} numberOfLines={1}>
          {a.fileName ?? (a.kind === "AUDIO" ? t("chat.voice_note") : t("chat.file_generic"))}
        </Text>
        <Text style={[styles.fileMeta, { color: th.textSubtle }]}>{formatBytes(a.sizeBytes)}</Text>
      </View>
      <Ionicons name="download-outline" size={16} color={th.textSubtle} />
    </Pressable>
  );
}

function reactionsEq(a: MessageDto["reactions"], b: MessageDto["reactions"]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].emoji !== b[i].emoji || a[i].count !== b[i].count || a[i].mine !== b[i].mine) return false;
  }
  return true;
}

// Enlaces pulsables del bot: [[tipo:id|Título]] y [[ir:/ruta|Etiqueta]].
// RECORD_LINK_RE/NAV_ALLOW/linkDest viven en @nidokey/shared (links.ts) —
// fuente única compartida con el prompt del agente y los evals.
function MessageBody({ body, color, linkColor }: { body: string; color: string; linkColor: string }) {
  if (!body.includes("[[")) return <Text style={[styles.bubbleText, { color }]}>{body}</Text>;
  const parts: ReactNode[] = [];
  const re = new RegExp(RECORD_LINK_RE);
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    const dest = linkDest(m[1], m[2]);
    const label = m[3];
    if (dest) {
      parts.push(
        <Text
          key={`lnk${i++}`}
          style={{ color: linkColor, textDecorationLine: "underline" }}
          onPress={() => router.push(dest as never)}
        >
          {label}
        </Text>,
      );
    } else {
      parts.push(label);
    }
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return <Text style={[styles.bubbleText, { color }]}>{parts}</Text>;
}

/**
 * Burbuja MEMOIZADA por CONTENIDO: cada poll parsea JSON nuevo (identidades
 * distintas con datos iguales) y cada tecla del composer re-renderiza la
 * pantalla — sin memo, todas las burbujas visibles se repintaban. El
 * comparador IGNORA los callbacks a propósito (capturan un item de contenido
 * idéntico) y compara adjuntos por id (sus URLs firmadas cambian en cada
 * respuesta, pero el render usa stableAttachmentUrl).
 */
const Bubble = memo(BubbleInner, (prev, next) => {
  const a = prev.m;
  const b = next.m;
  if (a.id !== b.id || a.body !== b.body || a.editedAt !== b.editedAt || a.deleted !== b.deleted) return false;
  if ((a.failed ?? false) !== (b.failed ?? false)) return false;
  if (prev.mine !== next.mine || prev.dark !== next.dark) return false;
  if (prev.senderName !== next.senderName || prev.quoteName !== next.quoteName) return false;
  if ((a.replyTo?.id ?? null) !== (b.replyTo?.id ?? null)) return false;
  if (prev.otherReadAt !== next.otherReadAt || prev.otherDeliveredAt !== next.otherDeliveredAt) return false;
  if (!reactionsEq(a.reactions, b.reactions)) return false;
  if (a.attachments.length !== b.attachments.length) return false;
  for (let i = 0; i < a.attachments.length; i++) {
    if (a.attachments[i].id !== b.attachments[i].id) return false;
  }
  return true;
});

function BubbleInner({
  m,
  mine,
  dark,
  senderName,
  senderId,
  quoteName,
  otherReadAt,
  otherDeliveredAt,
  onLongPress,
  onPressFailed,
  onPressQuote,
  onToggleReaction,
  onOpenImage,
}: {
  m: MessageDto;
  mine: boolean;
  dark: boolean;
  /** Nombre del remitente SOLO en grupos y mensajes ajenos (null = no pintar). */
  senderName: string | null;
  senderId: string | null;
  /** Nombre del autor del mensaje citado (null si no hay cita). */
  quoteName: string | null;
  otherReadAt: string | null;
  otherDeliveredAt: string | null;
  onLongPress: () => void;
  onPressFailed: () => void;
  onPressQuote: () => void;
  onToggleReaction: (emoji: string) => void;
  onOpenImage: (url: string) => void;
}) {
  const { th } = useTheme();
  const { appStyle } = useAppStyle();
  const { t, i18n } = useTranslation();

  if (m.kind === "SYSTEM") {
    return (
      <View style={styles.sysWrap}>
        <Text style={[styles.sysText, { color: th.textSubtle, backgroundColor: th.surface }]}>{m.body}</Text>
      </View>
    );
  }

  // Ticks de estado (solo mis mensajes, solo DIRECT): ✓ enviado, ✓✓ entregado,
  // ✓✓ azul leído. Derivado de lastReadAt/lastDeliveredAt del otro (sin filas).
  let tick: { icon: "checkmark" | "checkmark-done"; color: string } | null = null;
  if (mine && !m.id.startsWith("tmp_")) {
    const read = otherReadAt && m.createdAt <= otherReadAt;
    const delivered = otherDeliveredAt && m.createdAt <= otherDeliveredAt;
    tick = read
      ? { icon: "checkmark-done", color: "#3B82F6" }
      : delivered
        ? { icon: "checkmark-done", color: th.textSubtle }
        : { icon: "checkmark", color: th.textSubtle };
  }

  const mineBg = appStyle === "2100" ? th.primarySoft : dark ? "#3D3554" : "#E9E2F5"; // morado suave en Vintage.
  const failed = !!m.failed;
  return (
    <Pressable
      onLongPress={onLongPress}
      onPress={failed ? onPressFailed : undefined}
      delayLongPress={350}
      accessibilityLabel={m.deleted ? t("chat.message_deleted") : m.body ?? mediaLabel(m.kind, t)}
      style={[styles.bubbleRow, mine && styles.bubbleRowMine]}
    >
      <View
        style={[
          styles.bubble,
          { backgroundColor: mine ? mineBg : th.surface, borderColor: failed ? th.dangerFg : th.border },
          m.id.startsWith("tmp_") && !failed && { opacity: 0.6 },
        ]}
      >
        {senderName && (
          <Text style={[styles.senderName, { color: senderId ? senderColor(senderId) : th.primary }]} numberOfLines={1}>
            {senderName}
          </Text>
        )}
        {m.deleted ? (
          <Text style={[styles.deletedText, { color: th.textSubtle }]}>{t("chat.message_deleted")}</Text>
        ) : (
          <>
            {m.replyTo && (
              <Pressable
                onPress={onPressQuote}
                accessibilityRole="button"
                accessibilityLabel={t("chat.msg_reply")}
                style={[styles.quoteBox, { borderLeftColor: th.primary, backgroundColor: th.bg }]}
              >
                <Text style={[styles.quoteName, { color: th.primary }]} numberOfLines={1}>
                  {quoteName ?? "—"}
                </Text>
                <Text style={[styles.quoteBody, { color: th.textMuted }]} numberOfLines={2}>
                  {m.replyTo.deleted
                    ? t("chat.message_deleted")
                    : m.replyTo.body ?? mediaLabel(m.replyTo.kind, t)}
                </Text>
              </Pressable>
            )}
            {m.attachments.length > 0 && (
              <View style={styles.attachmentsWrap}>
                {m.attachments.map((a) => (
                  <AttachmentView key={a.id} a={a} onOpenImage={onOpenImage} />
                ))}
              </View>
            )}
            {!!m.body && <MessageBody body={m.body} color={th.text} linkColor={th.primary} />}
          </>
        )}
        <View style={styles.bubbleMeta}>
          {m.editedAt && !m.deleted && (
            <Text style={[styles.bubbleTime, { color: th.textSubtle }]}>{t("chat.edited")}</Text>
          )}
          <Text style={[styles.bubbleTime, { color: th.textSubtle }]}>{chatTime(m.createdAt, i18n.language)}</Text>
          {tick && <Ionicons name={tick.icon} size={13} color={tick.color} />}
        </View>
        {failed && (
          <View style={styles.failedRow}>
            <Ionicons name="alert-circle" size={13} color={th.dangerFg} />
            <Text style={[styles.failedText, { color: th.dangerFg }]}>
              {t("chat.failed_send")} · {t("chat.tap_retry")}
            </Text>
          </View>
        )}
        {m.reactions.length > 0 && (
          <View style={styles.chipRow}>
            {m.reactions.map((r) => (
              <Pressable
                key={r.emoji}
                onPress={() => onToggleReaction(r.emoji)}
                accessibilityRole="button"
                accessibilityLabel={`${r.emoji} ${r.count}`}
                style={[
                  styles.reactionChip,
                  { backgroundColor: th.bg, borderColor: r.mine ? th.primary : th.border },
                ]}
              >
                <Text style={styles.reactionChipText}>
                  {r.emoji}
                  {r.count > 1 ? ` ${r.count}` : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBack: { padding: 4 },
  headerText: { flex: 1 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerMenu: { padding: 4 },
  headerTitle: { fontSize: 16, fontFamily: fonts.bodySemibold, flexShrink: 1 },
  headerSub: { fontSize: 11 },
  ctxBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 10,
    marginTop: 8,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  ctxImg: { width: 38, height: 38, borderRadius: 6 },
  ctxTitle: { fontSize: 13, fontFamily: fonts.bodyMedium },
  ctxSub: { fontSize: 12 },
  list: { padding: 12, gap: 6 },
  bubbleRow: { flexDirection: "row", justifyContent: "flex-start" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "82%",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  bubbleText: { fontSize: 14.5, lineHeight: 20 },
  deletedText: { fontSize: 13, fontStyle: "italic" },
  bubbleMeta: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end" },
  bubbleTime: { fontSize: 10 },
  senderName: { fontSize: 12, fontFamily: fonts.bodySemibold, marginBottom: 1 },
  quoteBox: {
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 4,
  },
  quoteName: { fontSize: 12, fontFamily: fonts.bodySemibold },
  quoteBody: { fontSize: 12 },
  failedRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  failedText: { fontSize: 11 },
  sysWrap: { alignItems: "center", marginVertical: 4 },
  sysText: { fontSize: 11, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  sepText: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chipTitle: { fontSize: 12, fontFamily: fonts.bodySemibold },
  chipBody: { fontSize: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  // FAB "ir al final"
  jumpFab: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  jumpBadge: {
    position: "absolute",
    top: -8,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  jumpBadgeText: { color: "#fff", fontSize: 10, fontFamily: fonts.bodyBold },
  // Adjuntos
  attachBtn: { paddingHorizontal: 2, paddingVertical: 6 },
  attachmentsWrap: { gap: 6, marginBottom: 2 },
  attachImg: { width: 220, borderRadius: 10 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 200,
  },
  fileName: { fontSize: 13, fontFamily: fonts.bodyMedium },
  fileMeta: { fontSize: 11 },
  // Búsqueda en el chat
  searchResultRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 4,
  },
  searchResultText: { fontSize: 13 },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
  },
  viewerImg: { width: "100%", height: "100%" },
  // Reacciones
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  reactionChipText: { fontSize: 12 },
});
