/* ── Ce que l'écran lit du mode enfant, une fois pour tout l'écran (chantier Mode enfant, E21 ; spec 7.4) ──
 *
 * `loggia/enfant/etat` : les profils de la maison et, pour chaque lecteur sous
 * profil, ce que le serveur en fait — le plafond de volume du moment (baissé
 * au coucher), le blocage (`coucher`, `temps`, ou rien), l'heure où tout
 * revient, le budget d'écran du jour, la demande en attente. Le magasin est
 * celui des prises (`magasin`, prisesetat.js) : compté par abonnés, rien ne
 * part sans abonné ; 60 s pour les cartes, 15 s fiche ouverte (`rapide`) ; un
 * serveur muet — un composant d'avant ce chantier, un module qui n'a pas
 * démarré — garde ce qu'on savait et le dit (`erreur`) ; une réponse plus
 * vieille ne recouvre pas une plus fraîche.
 *
 * Une maison SANS profil n'a pas de mode enfant : `maisonAvecEnfant()` lit la
 * configuration commune (`loggia_enfant`), et la carte ne s'abonne que si un
 * profil existe — rien n'est demandé au serveur pour les autres maisons.
 *
 * Le temps d'écran DESCEND à l'écran entre deux sondages (le motif des
 * minuteurs) : la réponse porte l'heure de sa réception (`recu`), et
 * `budgetEcran` retranche ce qui s'est écoulé depuis, tant que l'écran est
 * allumé. Rien d'autre que des lectures ici : les commandes (`enfant/lever`,
 * `enfant/demander`…) sont celles de la popup et de la feuille des réglages,
 * qui reposent ce qu'elles reçoivent (`poserReponseEnfant`, `poserEtatEnfant`)
 * sans attendre le sondage.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { magasin, reglerPrisesEtat } from './prisesetat.js';
import { cfgVal, cfgRecue } from './state.js';
import { tr } from './i18n.js';

const ETAT = magasin((h) => Promise.resolve(h.callWS({ type: 'loggia/enfant/etat' }))
  .then(r => (r && typeof r === 'object' ? { ...r, recu: Date.now() } : r)), 60000, 15000);
const RIEN = Object.freeze({ etat: null, erreur: false });

/** `{ etat, erreur }` de `loggia/enfant/etat` — le même objet tant que rien ne change. */
export const lireEtatEnfant = () => ETAT.lire();
/** Un état plus frais remplace le cache — l'état seul ; la réponse entière d'une commande passe par `poserReponseEnfant`. */
export const poserEtatEnfant = (etat) => ETAT.poser(etat && typeof etat === 'object' && etat.recu == null ? { ...etat, recu: Date.now() } : etat);
/** La réponse d'une commande remplace les caches : la configuration que le serveur vient d'écrire — `loggia/enfant/config` rend
 *  `{config, etat}` —, PUIS l'état ; `lever` et `repondre` ne rendent que l'état. La configuration d'abord : la fiche qui se redessine
 *  à l'état posé relit `cfgVal('loggia_enfant')`, et rien d'autre ne la lui rendait (retour du 18/10 : le « Volume maximum » repassait
 *  de 20 à 40 % une fois l'optimiste expiré, alors que le serveur tenait bien 20). */
export function poserReponseEnfant(r) {
  if (!r || typeof r !== 'object') return;
  if (r.config && typeof r.config === 'object') cfgRecue('loggia_enfant', r.config);
  const e = r.etat && r.etat.lecteurs ? r.etat : r.lecteurs ? r : null;
  if (e) poserEtatEnfant(e);
}
/** Un abonné de plus — une carte, ou la fiche (`rapide`). Rend la fonction qui désabonne. */
export const abonnerEnfant = ({ rapide = false } = {}) => ETAT.abonner({ rapide });

/** La maison a un mode enfant : `loggia_enfant` porte au moins un profil (E21). */
export function maisonAvecEnfant() {
  const c = cfgVal('loggia_enfant', null);
  const p = c && typeof c === 'object' ? c.profils : null;
  return !!(p && typeof p === 'object' && Object.keys(p).length);
}

/** `{ etat, erreur }`. `actif` faux : rien ne s'abonne et rien ne se lit ; `rapide` : la fiche. */
export function useEtatEnfant(actif = true, { rapide = false } = {}) {
  useEffect(() => (actif ? abonnerEnfant({ rapide }) : undefined), [actif, rapide]);
  const e = useSyncExternalStore(ETAT.ecouter, ETAT.lire, ETAT.lire);
  return actif ? e : RIEN;
}

/** Ce que le serveur dit d'un lecteur, par son entité ou par sa jumelle (M14 : une Echo exposée deux fois), ou null. */
export function lecteurEnfant(etat, ...ids) {
  const t = etat && etat.lecteurs;
  if (!t || typeof t !== 'object') return null;
  for (const id of ids) if (id && t[id] && typeof t[id] === 'object') return t[id];
  return null;
}

/** Un profil de `loggia/enfant/etat` par son identifiant (la zone), ou null. */
export function profilEnfant(etat, ident) {
  const p = etat && etat.profils;
  return ident && p && typeof p === 'object' && p[ident] && typeof p[ident] === 'object' ? p[ident] : null;
}

/** Les mots de la maquette pour une durée en minutes : « 35 min », « 1 h », « 1 h 25 », « 1 h 30 » ; jamais sous zéro. */
export function dureeTexte(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return tr('{n} min', { n: m });
  const h = Math.floor(m / 60), r = m % 60;
  return r ? tr('{h} h {m}', { h, m: String(r).padStart(2, '0') }) : tr('{n} h', { n: h });
}

/**
 * Le budget d'un écran (E8) : `{ total_s, utilise_s, reste_s, bonus_min }` — le total du jour avec les minutes accordées,
 * l'utilisé et le reste —, ou null : pas un écran, ou sans budget (0 = illimité : pas de pied du temps). Le reste descend et
 * l'utilisé monte depuis la réception (`recu`) tant que l'écran est allumé ; jamais sous zéro, jamais au-delà du total.
 */
export function budgetEcran(lecteur, etat, maintenant = Date.now(), allume = false) {
  const e = lecteur && lecteur.ecran;
  if (!e || typeof e !== 'object' || !(Number(e.budget_min) > 0)) return null;
  const bonus_min = Number(e.bonus_min) || 0;
  const total_s = Math.round((Number(e.budget_min) + bonus_min) * 60);
  const ecoule = allume && etat && etat.recu ? Math.max(0, (maintenant - etat.recu) / 1000) : 0;
  const utilise_s = Math.min(total_s, Math.max(0, Math.round((Number(e.utilise_s) || 0) + ecoule)));
  const reste_s = e.reste_s == null ? null : Math.max(0, Math.round(Number(e.reste_s) - ecoule));
  return { total_s, utilise_s, reste_s, bonus_min };
}

/** Pour les tests : la source et l'horloge du magasin (celles des prises, `reglerPrisesEtat`), le cache vidé. */
export function reglerEnfantEtat(options = {}) {
  reglerPrisesEtat(options);
  ETAT.remettre();
}
