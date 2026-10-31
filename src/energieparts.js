/* ── Les sources d'énergie qui se comptent à plusieurs (chantier G3, ADR 0302) ──
 *
 * Le tableau Énergie de Home Assistant déclare autant de sources qu'il y en a :
 * deux onduleurs, deux batteries, deux compteurs. `resolveEnergy` les rend
 * toutes — une clé seule quand il n'y en a qu'une (`solarNow`), sinon ses PARTS
 * (`solarNowParts`), et jamais l'une élue pour le tout (ADR 0030). Ce module
 * les relit : la vue Énergie, l'Accueil et la carte Énergie maison font la
 * même somme.
 *
 * Les CONVENTIONS DE SIGNE :
 *   — `batNow` (la fiche, le voisin de l'ancien chemin, la puissance
 *     « inversée » de Home Assistant) est positif en CHARGE, la convention de
 *     Loggia ;
 *   — `batRate` (le `stat_rate` de Home Assistant) est positif en DÉCHARGE :
 *     il s'inverse ici, à la lecture, et nulle part ailleurs ;
 *   — `consoNow` (le `stat_rate` du réseau) est positif en import, comme le
 *     flux net du compteur l'a toujours été pour Loggia.
 *
 * Pur : des identifiants et une fonction `lire(id) → nombre | null` entrent,
 * un nombre ou `null` sort. `null` veut dire « rien de lisible », jamais zéro.
 * Ce module est au DÉMARRAGE (l'Accueil, la carte Énergie maison) : la batterie,
 * son niveau et son autonomie, que seule la vue Énergie lit, sont dans
 * `energiebatterie.js`.
 */
export const fini = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Les identifiants d'une grandeur : la clé seule si elle est posée (la fiche, ou une source unique), sinon ses parts. */
export function idsDe(EN, cle) {
  const E = EN || {};
  if (typeof E[cle] === 'string' && E[cle]) return [E[cle]];
  const parts = E[cle + 'Parts'];
  return Array.isArray(parts) ? parts.filter(x => typeof x === 'string' && x) : [];
}

/** La somme de ce qui se lit ; `null` quand rien ne se lit. Un onduleur muet ne fait pas tomber l'autre. */
export function sommeLue(ids, lire) {
  let s = null;
  for (const id of ids || []) {
    const v = fini(lire(id));
    if (v != null) s = (s || 0) + v;
  }
  return s;
}
