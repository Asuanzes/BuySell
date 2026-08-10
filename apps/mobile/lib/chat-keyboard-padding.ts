import type { KeyboardState } from "react-native-reanimated";

const REANIMATED_KEYBOARD_OPENING = 1;
const REANIMATED_KEYBOARD_OPEN = 2;

export function chatKeyboardPaddingBottom(state: KeyboardState | number, height: number, bottomInset: number) {
  "worklet";

  if (state !== REANIMATED_KEYBOARD_OPENING && state !== REANIMATED_KEYBOARD_OPEN) {
    return 0;
  }
  return Math.max(0, height - bottomInset);
}
