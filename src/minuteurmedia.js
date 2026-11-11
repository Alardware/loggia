/* ── Le minuteur d'un lecteur (10/11, ADR 0341) ─────────────────────────────────
 *
 * Sa demande : « un minuteur configurable et activable à la demande pour les
 * médias ». Le serveur le tient, comme celui des lampes et des prises
 * (`custom_components/loggia/minuteurs.py`, ADR 0064) : il part même Loggia
 * fermée, et chaque écran lit la même heure de fin. À l'heure dite, la TV et la
 * barre de son s'éteignent ; ce qui ne s'éteint pas vraiment — une Echo —
 * s'arrête de jouer.
 *
 * PUR : ni React, ni Home Assistant. La fiche et la carte lisent ici ce que la
 * fin fera, l'entité qui porte le minuteur, et leurs phrases.
 */
import { tr, locale } from './i18n.js';
import { insecable, decompte } from './prises.js';
import { BITS } from './lecteur.js';

/** Les durées en un appui ; « Autre durée » va de 5 min à 4 h, de 5 en 5, et part de 25 min. */
export const DUREES_MEDIA = [15, 30, 45, 60, 90, 120];
export const AUTRE_DUREE = { min: 5, max: 240, pas: 5, depart: 25 };
/** En cours : ce qu'un appui ajoute à ce qui reste — ceux des lampes et des prises. */
export const AJOUTS_MEDIA = [15, 60];

/**
 * La règle du serveur (`fin_lecteur`, minuteurs.py), mot pour mot : ce que la
 * fin d'un minuteur fait d'une entité — `turn_off` si elle le sait et n'est pas
 * une Echo (ses bits on/off ne coupent rien), sinon `media_pause`, sinon
 * `media_stop` ; ni l'un ni l'autre, l'extinction d'avant. La démo la joue.
 */
export function finServeur(bits, alexa) {
  const b = Number(bits) || 0;
  if ((b & BITS.TURN_OFF) && !alexa) return { quoi: 'eteindre', service: 'turn_off' };
  if (b & BITS.PAUSE) return { quoi: 'arreter', service: 'media_pause' };
  if (b & BITS.STOP) return { quoi: 'arreter', service: 'media_stop' };
  return { quoi: 'eteindre', service: 'turn_off' };
}

/**
 * Le minuteur que ce lecteur peut porter, ou null : `{ cible, geste }`. Un
 * lecteur qui a l'interrupteur de sa carte (`commandesLecteur(l).marche` : la
 * TV, la barre de son) s'éteint par son entité principale ; les autres
 * s'arrêtent par celle qui commande (`ctl` : la jumelle HACS d'une Echo), si
 * elle sait la pause ou l'arrêt. `geste` : 'eteindre' ou 'arreter', ce que le
 * serveur fera de `cible`.
 */
export function minuteurDe(l, cmd) {
  if (!l || l.indispo) return null;
  if (cmd && cmd.marche) return { cible: l.haid, geste: 'eteindre' };
  const b = l.bitsCtl || 0;
  if (!(b & (BITS.PAUSE | BITS.STOP)) || !l.ctl) return null;
  return { cible: l.ctl, geste: finServeur(b, l.alexa).quoi };
}

/** Le minuteur EN COURS d'un lecteur, sur l'une ou l'autre de ses entités (celle qui commande peut changer : un jumeau qui tombe),
 *  ou null : `{ id, fin }`, `fin` en millisecondes. `finDe(id)` : la fin lue au relevé (`finMinuteur`, prisesetat.js). */
export function minuteurEnCours(finDe, l) {
  for (const id of [l && l.haid, l && l.ma]) {
    const fin = id ? finDe(id) : null;
    if (fin) return { id, fin };
  }
  return null;
}

const heure = (fin) => new Date(fin).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
/** « S’éteint à 22:40 », « S’arrête à 22:40 ». */
export const finTexte = (geste, fin) => (geste === 'arreter' ? tr('S’arrête à {h}', { h: heure(fin) }) : tr('S’éteint à {h}', { h: heure(fin) }));

/** La phrase de la fiche pendant qu'il tourne : « S’éteint à 22:40 · dans 29 min 41 s » — le décompte des lampes et des prises. */
export function phraseMinuteurMedia(geste, fin, maintenant = Date.now()) {
  return finTexte(geste, fin) + ' · ' + tr('dans {d}', { d: insecable(decompte(fin, maintenant)) });
}

/** Ce que la fiche dit du minuteur avant qu'il ne tourne. `peut` : le lecteur est en état de le recevoir. */
export function consigneMinuteur(geste, { tv = false, peut = true } = {}) {
  if (geste === 'arreter') return peut ? tr('Arrête la lecture au bout du temps choisi.') : tr('Disponible pendant une lecture.');
  if (!peut) return tr('Disponible une fois l’appareil allumé.');
  return tv ? tr('Éteint la TV au bout du temps choisi.') : tr('Éteint l’enceinte au bout du temps choisi.');
}

/**
 * La phrase de la carte, l'heure de fin devant : « S’éteint à 22:40 · Stranger Things · S4 E1 ». `fin` null, ou une phrase
 * de panne : la phrase telle quelle.
 */
export function phraseAvecMinuteur(phrase, geste, fin) {
  if (!fin || !phrase || phrase.panne) return phrase;
  return { ...phrase, texte: finTexte(geste, fin) + ' · ' + phrase.texte };
}
