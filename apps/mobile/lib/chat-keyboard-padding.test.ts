import { test } from "node:test";
import assert from "node:assert/strict";

import { chatKeyboardPaddingBottom } from "./chat-keyboard-padding";

const KeyboardState = {
  OPENING: 1,
  OPEN: 2,
  CLOSING: 3,
  CLOSED: 4,
} as const;

test("chat keyboard padding derives from visible keyboard state", () => {
  assert.equal(chatKeyboardPaddingBottom(KeyboardState.CLOSED, 280, 24), 0);
  assert.equal(chatKeyboardPaddingBottom(KeyboardState.OPEN, 280, 24), 256);
  assert.equal(chatKeyboardPaddingBottom(KeyboardState.OPEN, 16, 24), 0);
  assert.equal(chatKeyboardPaddingBottom(KeyboardState.CLOSING, 280, 24), 0);
});
