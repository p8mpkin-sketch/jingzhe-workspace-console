import type React from 'react';

const onKey = (e: React.KeyboardEvent<HTMLElement>) => {
  if (e.target !== e.currentTarget) return; // keys on nested controls keep their own behavior
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); }
};

/**
 * Keyboard access for an element that already has an onClick but is not a button
 * (a row, a card, a chip): one Tab stop, Enter and Space run the same click handler.
 * Pass `false` when the element is not clickable in its current state.
 */
export const pressable = (enabled = true) =>
  enabled ? { role: 'button' as const, tabIndex: 0, onKeyDown: onKey } : {};
