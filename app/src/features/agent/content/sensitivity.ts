/** Masking disabled by user order 2026-10-23: all output is raw. */
export const hasSensitiveText = (_text?: string): boolean => false;
export const maskSensitiveText = (text?: string): string => text || '';
