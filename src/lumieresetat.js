/* ── Ce que l'écran lit des lumières, une fois pour tout l'écran (chantier Lumières, § 6.2, § 7) ──
 *
 * Deux lectures, partagées par les cartes, les compactes et la fiche :
 *  - `loggia/lumieres/etat` (§ 6.2) : le DERNIER niveau de chaque lampe, que
 *    le carnet du serveur garde tant qu'elle est allumée — « se rallumera à
 *    80 % », et le repère gris d'une lampe éteinte. 60 s pour les cartes, 15 s
 *    fiche ouverte (`rapide`). Un composant d'avant ce chantier ne répond pas :
 *    on ne sait rien, et l'écran marche quand même, sans repère gris ;
 *  - `loggia/minuteurs/etat` : le minuteur de chaque lampe, le magasin des
 *    prises (`abonnerMinuteurs`, prisesetat.js) — une lecture pour tout l'écran.
 * Le magasin est celui des prises (`magasin`) : compté par abonnés, rien ne
 * part sans abonné ; un serveur muet garde ce qu'on savait et le dit
 * (`erreur`) ; une réponse plus vieille ne recouvre pas une plus fraîche.
 *
 * Et l'AVANCE d'un geste fait ailleurs que sur la carte : « Tout éteindre »,
 * dans l'en-tête d'Objets › Lumières (§ 3.4). Les cartes la montrent tout de
 * suite, comme leur propre geste (`useOptimiste`), et elle expire de même :
 * dès que la lampe a répondu (son `last_changed` a bougé), 6 s au plus.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { magasin, abonnerMinuteurs, lireMinuteurs, ecouterMinuteurs, reglerPrisesEtat, relireMinuteurs } from './prisesetat.js';
import { reglerPartage } from './optimiste.js';

const ETAT = magasin((h) => h.callWS({ type: 'loggia/lumieres/etat' }), 60000, 15000);

/** `{ etat, erreur }` de `loggia/lumieres/etat` — le même objet tant que rien ne change. */
export const lireEtatLumieres = () => ETAT.lire();
/** Un état plus frais remplace le cache. */
export const poserEtatLumieres = (etat) => ETAT.poser(etat);

/** Un abonné de plus au carnet et aux minuteurs — une carte, ou la fiche (`rapide`). Rend la fonction qui désabonne. */
export function abonnerLumieres({ rapide = false } = {}) {
  const a = ETAT.abonner({ rapide }), b = abonnerMinuteurs({ rapide });
  return () => { a(); b(); };
}

/** `{ etat, minuteurs, erreur }`. `actif` faux : rien ne s'abonne, le cache se lit tel quel ; `rapide` : la fiche. */
export function useEtatLumieres(actif = true, { rapide = false } = {}) {
  useEffect(() => (actif ? abonnerLumieres({ rapide }) : undefined), [actif, rapide]);
  const e = useSyncExternalStore(ETAT.ecouter, ETAT.lire, ETAT.lire);
  const m = useSyncExternalStore(ecouterMinuteurs, lireMinuteurs, lireMinuteurs);
  return { etat: e.etat, minuteurs: m.etat, erreur: e.erreur };
}

/**
 * Le dernier niveau d'une lampe que garde le carnet (§ 6.2) : `{ bri, mode,
 * kelvin, hs }` — `bri` de 1 à 100, ou null —, ou null : la lampe n'a pas
 * d'entrée, ou le serveur est d'avant ce chantier.
 */
export function dernierDe(etat, id) {
  const t = etat && etat.lumieres;
  const e = id && t && typeof t === 'object' && t[id] && typeof t[id] === 'object' ? t[id].dernier : null;
  if (!e || typeof e !== 'object') return null;
  const bri = Number(e.bri);
  return {
    bri: bri >= 1 && bri <= 100 ? Math.round(bri) : null, mode: typeof e.mode === 'string' ? e.mode : null,
    kelvin: Number(e.kelvin) > 0 ? Math.round(Number(e.kelvin)) : null, hs: Array.isArray(e.hs) && e.hs.length === 2 ? e.hs.map(Number) : null,
  };
}

/**
 * La lampe a CHANGÉ D'ÉTAT (son `last_changed` réel a bougé) : les minuteurs se relisent tout de suite (audit du 19/10, B10).
 * Le serveur annule le minuteur d'une lampe dès qu'elle s'éteint, mais le magasin ne se relit que toutes les 60 s : « S'éteint
 * à … » restait sur une lampe éteinte puis rallumée à la main dans la minute. Une carte, une compacte et la fiche de la même
 * lampe le demandent ensemble : UNE relecture (`relireMinuteurs` les coalesce dans le tour) ; sans abonné, rien ne part.
 */
export function useRelireMinuteurs(change) {
  const avant = useRef(change);
  useEffect(() => {
    if (avant.current === change) return;
    avant.current = change;
    if (change) relireMinuteurs();
  }, [change]);
}

/* ── L'avance d'un geste fait ailleurs (« Tout éteindre ») ─────────────────── */

const AVANCE_MS = 6000;
const AVANCES = new Map();
const ECOUTE = new Set();
let version = 0;
const prevenir = () => { version += 1; ECOUTE.forEach(f => { try { f(); } catch { /* un écouteur tombé n'arrête pas les autres */ } }); };
const ecouter = (f) => { ECOUTE.add(f); return () => { ECOUTE.delete(f); }; };

/** Les lampes `ids` se montrent `on` (vrai ou faux) tout de suite. `S` : les états lus au moment du geste. */
export function avancerLumieres(ids, on, S, maintenant = Date.now()) {
  for (const id of ids) AVANCES.set(id, { on: !!on, t: S && S[id] ? S[id].last_changed : undefined, at: maintenant });
  prevenir();
  // À l'échéance, les avances passées s'en vont, et les cartes redisent ce que la maison dit.
  setTimeout(() => { const n = Date.now(); for (const [id, a] of AVANCES) if (n - a.at >= AVANCE_MS) AVANCES.delete(id); prevenir(); }, AVANCE_MS + 50);
}

/** L'avance d'une lampe, ou null : elle tient tant que la lampe n'a pas répondu (`last_changed` inchangé), 6 s au plus. */
export function avanceDe(id, st, maintenant = Date.now()) {
  const a = AVANCES.get(id);
  return a && st && st.last_changed === a.t && maintenant - a.at < AVANCE_MS ? a.on : null;
}

/** Se redessiner quand une avance se pose ou expire. */
export function useAvancesLumieres() {
  return useSyncExternalStore(ecouter, () => version, () => version);
}

/** Pour les tests : la source et l'horloge des magasins (celles des prises, `reglerPrisesEtat`), les caches vidés, les avances aussi —
 *  celles de « Tout éteindre » et les avances PARTAGÉES des cartes (`reglerPartage` : le geste d'abord vit hors du composant, B2). */
export function reglerLumieresEtat(options = {}) {
  reglerPrisesEtat(options);
  reglerPartage();
  ETAT.remettre();
  AVANCES.clear();
  ECOUTE.clear();
  version = 0;
}
