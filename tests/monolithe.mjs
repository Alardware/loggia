/* Les vues sorties d'App.jsx pour alléger le boot (ADR 0274).
 *
 * Beaucoup de tests lisent le monolithe pour y trouver une fonction. Une vue
 * qui en sort pour se charger à la demande garde son code tel quel, ailleurs :
 * ces tests lisent `App.jsx + VUES_SORTIES`. Une vue de plus à sortir ? Elle
 * s'ajoute ici, une seule fois. */
import { readFileSync } from 'node:fs';

const lire = (chemin) => readFileSync(new URL('../src/' + chemin, import.meta.url), 'utf8');

export const VUES_SORTIES = ['views/energie.jsx', 'views/securite.jsx'].map((f) => '\n' + lire(f)).join('');
