import { randomInt } from 'node:crypto';

// No O/0 or I/1: codes get read aloud and typed from WhatsApp messages.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VALID = /^[A-HJ-NP-Z2-9]{8}$/;

export const newJoinCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

/** What the student typed → stored form (8 chars, uppercase), or null if it can't be a code. */
export function normalizeCode(s: string): string | null {
  const c = s.toUpperCase().replace(/[\s-]/g, '');
  return VALID.test(c) ? c : null;
}

export const formatCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;
