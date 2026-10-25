/* ── Ce que les cartes d'un lecteur partagent entre elles (chantier Médias ; M8, M9) ──
 *
 *  - L'ANNONCE EN VOL (M9) : Home Assistant ne raconte pas une annonce — aucun
 *    état ne dit qu'une Echo parle. Seul l'onglet qui l'a envoyée le sait : il
 *    la note ici, et les cartes des Echo visées écrivent « Annonce : « … » »
 *    pendant six secondes (`ANNONCE_MS`), puis redisent ce que la maison dit.
 *    Le motif est celui de l'avance d'un geste des lumières (lumieresetat.js) :
 *    un magasin, une version, `useSyncExternalStore`.
 *  - La TEINTE D'UNE POCHETTE (M8) : un crochet qui demande la teinte au cache
 *    (pochette.js) et rend « r,g,b » — la dernière teinte connue le temps de la
 *    lecture (la carte ne clignote pas en rose entre deux morceaux), le rose de
 *    la maison quand il n'y en a pas encore, ou quand la pochette n'en donne pas.
 */
import { useState, useEffect, useSyncExternalStore } from 'react';
import { teintePochette, teinteConnue, rgbTexte } from './pochette.js';

/** Combien de temps une carte visée écrit l'annonce : six secondes (M9). */
export const ANNONCE_MS = 6000;
const ANNONCES = new Map();
const ECOUTE = new Set();
let version = 0;
const prevenir = () => { version += 1; ECOUTE.forEach(f => { try { f(); } catch { /* un écouteur tombé n'arrête pas les autres */ } }); };
const ecouter = (f) => { ECOUTE.add(f); return () => { ECOUTE.delete(f); }; };

/** Les lecteurs `ids` portent `texte` tout de suite, six secondes. */
export function annoncer(ids, texte, maintenant = Date.now()) {
  const t = String(texte == null ? '' : texte).trim();
  if (!t) return;
  for (const id of ids || []) if (typeof id === 'string' && id) ANNONCES.set(id, { texte: t, at: maintenant });
  prevenir();
  // À l'échéance, les annonces passées s'en vont, et les cartes redisent ce que la maison dit.
  setTimeout(() => { const n = Date.now(); for (const [id, a] of ANNONCES) if (n - a.at >= ANNONCE_MS) ANNONCES.delete(id); prevenir(); }, ANNONCE_MS + 50);
}

/** L'annonce qu'un lecteur porte encore, ou null. */
export function annonceDe(id, maintenant = Date.now()) {
  const a = ANNONCES.get(id);
  return a && maintenant - a.at < ANNONCE_MS ? a.texte : null;
}

/** Se redessiner quand une annonce se pose ou expire. */
export function useAnnonces() {
  return useSyncExternalStore(ecouter, () => version, () => version);
}

/**
 * « r,g,b » de la pochette `url`, lue une fois par `cle` (le titre et l'artiste :
 * pochette.js). Tant que la pochette du moment n'est pas lue, la DERNIÈRE teinte
 * connue reste (passe bis du 17/10 : la carte passait par le rose à chaque
 * nouvelle pochette, puis changeait de couleur) ; une clé déjà lue se rend sans
 * attendre. `TEINTE_REPLI` quand rien n'a encore été lu, ou quand le canvas est
 * souillé. `null` sans pochette : la carte ne se teinte pas.
 */
export function useTeintePochette(url, cle) {
  const k = url ? (cle || url) : null;
  // Ce qui a été lu, et pour quelle clé : `t` est `[r, g, b]`, `null` (lue, sans teinte) ou `undefined` (rien encore).
  const [lue, setLue] = useState(() => ({ k, t: k ? teinteConnue(k) : undefined }));
  useEffect(() => {
    let vivant = true;
    if (!k) return undefined;
    const connue = teinteConnue(k);
    if (connue !== undefined) { setLue(x => (x.k === k && x.t === connue ? x : { k, t: connue })); return undefined; }
    teintePochette(url, cle).then((t) => { if (vivant) setLue({ k, t }); });
    return () => { vivant = false; };
  }, [url, cle, k]);
  if (!k) return null;
  // Lue pour cette clé : sa teinte (le rose si elle n'en a pas) ; en attendant : la dernière connue, le rose à défaut.
  return rgbTexte(lue.t);
}

/** Pour les tests : le magasin des annonces vidé. */
export function reglerLecteurs() { ANNONCES.clear(); ECOUTE.clear(); version = 0; }
