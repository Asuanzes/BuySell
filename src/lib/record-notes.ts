import type { RecordType } from "@nidokey/shared";

import { prisma as defaultPrisma } from "@/lib/db";
import { ownsRecord } from "@/lib/records/access";

export type RecordNoteView = {
  id: string;
  userId: string;
  recordType: string;
  recordId: string;
  body: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

/**
 * Solo el delegado que se usa, TIPADO contra el cliente real. Con `args: unknown`
 * los nombres de campo de cada `where`/`data` no se comprobaban: un `recordid`
 * mal escrito compilaba y fallaba en producción, y aquí se escribe con
 * owner-scoping. Los dobles de los tests hacen el cast ellos.
 */
type NoteDb = Pick<typeof defaultPrisma, "recordNote">;

type Deps = {
  prisma?: NoteDb;
  ownsRecord?: (type: RecordType, id: string, userId: string) => Promise<boolean>;
};

export class RecordNoteApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown
  ) {
    super(message);
  }
}

const ACTIVE_NOTE_RECORD_TYPES = new Set<RecordType>(["property", "holiday", "crypto", "market", "job", "book"]);
const MAX_NOTE_BODY = 4000;

function db(deps?: Deps): NoteDb {
  return deps?.prisma ?? defaultPrisma;
}

export function normalizeRecordNoteType(value: unknown): RecordType {
  if (typeof value !== "string" || !ACTIVE_NOTE_RECORD_TYPES.has(value as RecordType)) {
    throw new RecordNoteApiError(400, "type no soportado");
  }
  return value as RecordType;
}

export function cleanRecordNoteBody(value: unknown): string {
  if (typeof value !== "string") throw new RecordNoteApiError(400, "body es obligatorio");
  const body = value.trim();
  if (!body) throw new RecordNoteApiError(400, "body es obligatorio");
  // RECHAZAR, no recortar en silencio: recortar le quita al usuario el final de
  // lo que escribió sin decírselo, en la única pieza cuyo valor entero es no
  // perder su razonamiento. El cliente lo evita con maxLength y un contador.
  if (body.length > MAX_NOTE_BODY) {
    throw new RecordNoteApiError(400, `La nota supera el máximo de ${MAX_NOTE_BODY} caracteres`, {
      length: body.length,
      max: MAX_NOTE_BODY,
    });
  }
  return body;
}

async function assertOwnsRecord(userId: string, recordType: RecordType, recordId: string, deps?: Deps): Promise<void> {
  if (!(await (deps?.ownsRecord ?? ownsRecord)(recordType, recordId, userId))) {
    throw new RecordNoteApiError(404, "Not found");
  }
}

export async function listRecordNotes(userId: string, recordType: RecordType, recordId: string, deps?: Deps): Promise<RecordNoteView[]> {
  await assertOwnsRecord(userId, recordType, recordId, deps);
  return db(deps).recordNote.findMany({
    where: { userId, recordType, recordId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function createRecordNote(
  userId: string,
  input: { recordType: RecordType; recordId: string; body: unknown },
  deps?: Deps
): Promise<RecordNoteView> {
  await assertOwnsRecord(userId, input.recordType, input.recordId, deps);
  return db(deps).recordNote.create({
    data: {
      userId,
      recordType: input.recordType,
      recordId: input.recordId,
      body: cleanRecordNoteBody(input.body),
    },
  });
}

/**
 * Editar y borrar se autorizan por PROPIEDAD DE LA NOTA (`userId`), NO por
 * propiedad del registro. La diferencia importa: el registro puede haber
 * desaparecido (borrado, o fusionado y perdido su id) y entonces `ownsRecord`
 * diría que no, dejando al usuario con una nota huérfana que no puede tocar ni
 * borrar y que sigue apareciendo en su export de datos. La soft-ref existe justo
 * para tolerar eso. Crear y listar SÍ exigen el registro, porque ahí tiene que
 * existir y ser suyo.
 */
export async function updateRecordNote(userId: string, noteId: string, body: unknown, deps?: Deps): Promise<RecordNoteView> {
  const client = db(deps);
  const note = await client.recordNote.findFirst({ where: { id: noteId, userId } });
  if (!note) throw new RecordNoteApiError(404, "Not found");
  return client.recordNote.update({ where: { id: note.id }, data: { body: cleanRecordNoteBody(body) } });
}

export async function deleteRecordNote(userId: string, noteId: string, deps?: Deps): Promise<{ ok: true; deleted: number }> {
  const client = db(deps);
  const deleted = await client.recordNote.deleteMany({ where: { id: noteId, userId } });
  if (deleted.count === 0) throw new RecordNoteApiError(404, "Not found");
  return { ok: true, deleted: deleted.count };
}

export async function latestRecordNoteBody(
  userId: string,
  recordType: RecordType,
  recordId: string,
  deps?: Deps
): Promise<string | null> {
  await assertOwnsRecord(userId, recordType, recordId, deps);
  const [note] = await db(deps).recordNote.findMany({
    where: { userId, recordType, recordId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
  });
  return note?.body ?? null;
}

export async function reassignRecordNotes(
  client: NoteDb,
  input: { userId: string | null | undefined; recordType: RecordType; fromIds: string[]; toId: string }
): Promise<{ count: number }> {
  const fromIds = [...new Set(input.fromIds.filter((id) => typeof id === "string" && id && id !== input.toId))];
  if (!input.userId || fromIds.length === 0) return { count: 0 };
  return client.recordNote.updateMany({
    where: { userId: input.userId, recordType: input.recordType, recordId: { in: fromIds } },
    data: { recordId: input.toId },
  });
}
