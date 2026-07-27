/**
 * Tests de la validación de keys de R2 (lo que el cliente puede mandar).
 * Ejecutar:  node --import tsx --test src/lib/chat/r2-keys.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { groupImageKey } from "./r2";

test("groupImageKey: acepta lo que produce el presign y nada más", () => {
  const cid = "clx1a2b3c4d5e6f7g8h9";
  const re = groupImageKey(cid);
  assert.ok(re.test(`avatars/group/${cid}/m3x9f1a2b3c4d5e6.jpg`));
  assert.ok(re.test(`avatars/group/${cid}/abc123.webp`));
  // Otro grupo, otro namespace, otra extensión, subcarpeta extra.
  assert.equal(re.test(`avatars/group/otrogrupo/x.jpg`), false);
  assert.equal(re.test(`avatars/${cid}/x.jpg`), false);
  assert.equal(re.test(`avatars/group/${cid}/x.svg`), false);
  assert.equal(re.test(`avatars/group/${cid}/sub/x.jpg`), false);
});

test("groupImageKey: no se cuela un ../ (el motivo de existir)", () => {
  const cid = "clx1a2b3c4d5e6f7g8h9";
  const re = groupImageKey(cid);
  // Con un startsWith del prefijo, esto pasaba: la key acababa firmándose en
  // el endpoint público y llegando a deleteObject.
  assert.equal(re.test(`avatars/group/${cid}/../../chat/u/victima/msg/foto.jpg`), false);
  assert.equal(re.test(`avatars/group/${cid}/../otro/x.jpg`), false);
});
