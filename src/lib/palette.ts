/**
 * The thread palette. Names follow the traditional Paithani colour
 * vocabulary documented on Wikipedia's "Paithani" article (aboli, firozi,
 * kalichandrakala, morpankhi, motia, neeligunji, pophali, sankirodak, uddani,
 * vangi). The hex values are this project's own interpretation of those
 * descriptions — not measured from any real sari.
 * Devanagari is given only where the spelling is a common Marathi word;
 * the rest are left blank rather than guessed. "Rani" and "Lal" are
 * everyday Marathi/Hindi colour words added for magenta and red.
 */
import { deltaE } from './color';

export interface Thread {
  id: number;
  key: string;
  name: string;
  marathi: string;
  hex: string;
  note: string;
  metal: boolean;
}

export const THREADS: Thread[] = [
  { id: 0, key: 'sankirodak', name: 'Sankirodak', marathi: '', hex: '#F1EADB', note: 'white', metal: false },
  { id: 1, key: 'kalichandrakala', name: 'Kalichandrakala', marathi: 'काळी चंद्रकळा', hex: '#16121B', note: 'black', metal: false },
  { id: 2, key: 'vangi', name: 'Vangi', marathi: 'वांगी', hex: '#5C1E6E', note: 'aubergine purple', metal: false },
  { id: 3, key: 'morpankhi', name: 'Morpankhi', marathi: 'मोरपंखी', hex: '#0D6B5F', note: 'peacock green', metal: false },
  { id: 4, key: 'firozi', name: 'Firozi', marathi: 'फिरोजी', hex: '#2AA6B4', note: 'cyan', metal: false },
  { id: 5, key: 'neeligunji', name: 'Neeligunji', marathi: '', hex: '#24358C', note: 'blue', metal: false },
  { id: 6, key: 'pophali', name: 'Pophali', marathi: 'पोफळी', hex: '#E7B51A', note: 'chrome yellow', metal: false },
  { id: 7, key: 'aboli', name: 'Aboli', marathi: 'अबोली', hex: '#F0A79D', note: 'light pink', metal: false },
  { id: 8, key: 'motia', name: 'Motia', marathi: 'मोतिया', hex: '#F5D6D1', note: 'pale pink', metal: false },
  { id: 9, key: 'rani', name: 'Rani', marathi: 'राणी', hex: '#C2185B', note: 'magenta (common term)', metal: false },
  { id: 10, key: 'lal', name: 'Lal', marathi: 'लाल', hex: '#B1142E', note: 'red (common term)', metal: false },
  { id: 11, key: 'uddani', name: 'Uddani', marathi: '', hex: '#3B3440', note: 'a fainter black', metal: false },
  { id: 12, key: 'zari', name: 'Zari (gold)', marathi: 'जरी', hex: '#D4AE57', note: 'metallic gold yarn', metal: true },
  { id: 13, key: 'chandi', name: 'Zari (silver)', marathi: 'चांदी', hex: '#C9CDD3', note: 'metallic silver yarn', metal: true },
];

export const EMPTY = 255;
export const ZARI = 12;

export const threadById = (id: number): Thread => THREADS[id] ?? THREADS[0];

/** Pre-computed ΔE matrix between every pair of threads (symmetric, zero diagonal). */
export const DELTA: number[][] = THREADS.map((a) => THREADS.map((b) => deltaE(a.hex, b.hex)));

/** Cost of weaving thread `b` where the design asked for `a`. Metal ↔ silk swaps are penalised extra. */
export function swapCost(a: number, b: number): number {
  if (a === b) return 0;
  const metalPenalty = THREADS[a].metal !== THREADS[b].metal ? 25 : 0;
  return DELTA[a][b] + metalPenalty;
}
