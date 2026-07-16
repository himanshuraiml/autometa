export const IS_MAC_PLATFORM = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

export const DELETE_SHORTCUT_HINT = IS_MAC_PLATFORM ? '⌘⌫' : 'Ctrl+Del';
export const UNDO_SHORTCUT_HINT = IS_MAC_PLATFORM ? '⌘Z' : 'Ctrl+Z';
export const REDO_SHORTCUT_HINT = IS_MAC_PLATFORM ? '⌘⇧Z' : 'Ctrl+Shift+Z';

export interface ShortcutEntry {
  action: string;
  keys: string;
}

export interface ShortcutGroup {
  title: string;
  entries: ShortcutEntry[];
}

export const EDITOR_SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Mouse & Canvas',
    entries: [
      { action: 'Add a state', keys: 'Double-click empty canvas' },
      { action: 'Add a transition', keys: 'Drag from one state to another (or itself)' },
      { action: 'Select a state or transition', keys: 'Click it' },
      { action: 'Deselect', keys: 'Click empty canvas' },
    ],
  },
  {
    title: 'Keyboard',
    entries: [
      { action: 'Add a state (no mouse needed)', keys: 'N' },
      { action: 'Move focus between states/transitions', keys: 'Tab / Shift+Tab' },
      { action: 'Move the focused state', keys: '↑ ↓ ← →' },
      { action: 'Undo', keys: UNDO_SHORTCUT_HINT },
      { action: 'Redo', keys: REDO_SHORTCUT_HINT },
      { action: 'Delete selected state/transition', keys: DELETE_SHORTCUT_HINT },
      { action: 'Delete selected (native)', keys: 'Backspace / Delete' },
      { action: 'Play / pause simulation', keys: 'Space' },
      { action: 'Step forward', keys: '→' },
      { action: 'Step backward', keys: '←' },
    ],
  },
];
