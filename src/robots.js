/* ── Les robots de la maison : ce que le DÉMARRAGE emploie (ADR 0042 ; chantier IoT, tâche 1) ──
 *
 * Les cartes d'un aspirateur et d'une tondeuse, la compacte, « En ce moment » et l'en-tête d'Objets › IoT
 * lisent ici la phase d'un robot, le service qui le renvoie à sa base, et son prochain passage ; les fiches
 * des autres appareils (chauffage, volets, distributeur) y prennent les jours, les heures et les durées.
 * Tout ce que la seule popup d'un robot calcule — ses sœurs, ses pièces, son entretien, ses sessions, ses
 * réglages, sa fiche technique — vit dans `robotsfiche.js`, chargé avec elle : le démarrage n'avait plus
 * que 420 octets de marge (§ 12 de la conception, la place d'abord). Pas de React, pas de Home Assistant :
 * la vue passe des entités déjà lues, les tests aussi.
 *
 * La carte y prend aussi (chantier IoT, tâche 2) ce qu'elle dit et ce qu'elle offre : la PHRASE d'état
 * (`phraseRobot`, I7, § 6 de la conception) — la première ligne qui s'applique, son encre —, les PUCES de
 * son pied (`commandesRobot`, I9), que la phase et les bits de l'appareil décident, et le prochain passage
 * qui partira vraiment (`prochainPassage`, qui saute « Ne pas déranger », I18).
 */
import { tr, locale } from './i18n.js';
import { quandLumiere } from './lumieres.js';

export const DOMAINES_ROBOT = ['vacuum', 'lawn_mower'];

/** La phase d'un robot, d'après l'état normalisé par Home Assistant. */
export function phaseRobot(domaine, etat) {
  const s = String(etat == null ? '' : etat).toLowerCase();
  if (!s || s === 'unavailable' || s === 'unknown') return 'absent';
  if (s === 'cleaning' || s === 'mowing') return 'travail';
  if (s === 'paused') return 'pause';
  if (s === 'returning') return 'retour';
  if (s === 'docked') return 'base';
  if (s === 'error') return 'erreur';
  return 'repos';
}

/** La batterie d'un robot (passe bis du 18/10, point 8) : l'attribut `battery_level`, sinon l'état de sa sœur `battery` — bornée de 0 à
 *  100 et arrondie ; une valeur vide ou qui n'est pas un nombre est INCONNUE (null) : jamais un faux « 0 % ». */
export function batterieRobot(attributs, etatSoeur = null) {
  const lire = (v) => {
    if (v == null || (typeof v === 'string' && !v.trim())) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const n = lire(attributs && attributs.battery_level) ?? lire(etatSoeur);
  return n == null ? null : Math.round(Math.min(100, Math.max(0, n)));
}

/** Le service du retour à la base. */
export const serviceRetour = (domaine) => (domaine === 'lawn_mower' ? 'dock' : 'return_to_base');

/* Les bits de Home Assistant (`VacuumEntityFeature`, `LawnMowerEntityFeature`) : une puce n'existe que si
 * l'appareil a le sien (I9). Une tondeuse n'a pas de « Localiser » : Home Assistant n'en a pas pour elle. */
export const BITS_ROBOT = Object.freeze({
  vacuum: Object.freeze({ pause: 4, base: 16, localiser: 512, demarrer: 8192 }),
  lawn_mower: Object.freeze({ demarrer: 1, pause: 2, base: 4, localiser: 0 }),
});

/**
 * Les interrupteurs d'aire d'une tondeuse (passe bis 2 du 18/10, point D) : ceux de SON appareil, ni masqués ni désactivés, reconnus
 * à leur clé de traduction (`area`), à défaut à leur identifiant — la règle du serveur (`aires_de`, robots.py). `index` : celui de la
 * découverte (`entityMeta`). Triés ; vide sans appareil.
 */
export function airesTondeuse(index, idRobot) {
  const t = index && index.entityMeta;
  const moi = t && idRobot ? t.get(idRobot) : null;
  if (!moi || !moi.deviceId) return [];
  const out = [];
  t.forEach((m, id) => {
    if (id.indexOf('switch.') === 0 && m && m.deviceId === moi.deviceId && !m.hidden && !m.disabled
      && (m.translationKey === 'area' || /(^|_)(zone|area)_/.test(id.slice(7)))) out.push(id);
  });
  return out.sort();
}

/**
 * Les puces du pied de la carte (I9) : `[{ cle, service, glyphe, mot, choisie }]`, dans l'ordre de la maquette.
 *  - sur la base : « Démarrer » (le logement entier ; une tondeuse, ses zones allumées) et « Localiser » ;
 *  - au travail : « Pause » et « Base » ;
 *  - en pause ou au retour : « Reprendre » et « Base » — choisie pendant le retour ;
 *  - en erreur : « Base » seule ; arrêté hors de sa base : « Démarrer » et « Base » ;
 *  - muet : rien.
 * Des services explicites — `start`, `start_mowing`, `pause`, `return_to_base`, `dock`, `locate` —, jamais `toggle`. `depart` faux :
 * pas de « Démarrer » — une tondeuse à aires dont aucune n'est allumée ne partirait pas (passe bis 2 du 18/10, point D) ; rien
 * d'inerte, la ligne garde ce qui reste possible.
 */
export function commandesRobot(domaine, phase, bits, { depart: peutPartir = true } = {}) {
  const b = BITS_ROBOT[domaine] || BITS_ROBOT.vacuum;
  const f = Number(bits) || 0;
  const a = (k) => !!(b[k] && (f & b[k]) && (k !== 'demarrer' || peutPartir || phase === 'pause' || phase === 'retour'));
  const depart = domaine === 'lawn_mower' ? 'start_mowing' : 'start';
  const puce = (cle, service, glyphe, mot, choisie = false) => ({ cle, service, glyphe, mot, choisie });
  const demarrer = () => puce('demarrer', depart, 'play', tr('Démarrer'));
  const base = (choisie = false) => puce('base', serviceRetour(domaine), 'home', tr('Base'), choisie);
  const out = [];
  if (phase === 'base') {
    if (a('demarrer')) out.push(demarrer());
    if (a('localiser')) out.push(puce('localiser', 'locate', 'marker', tr('Localiser')));
  } else if (phase === 'travail') {
    if (a('pause')) out.push(puce('pause', 'pause', 'pause', tr('Pause')));
    if (a('base')) out.push(base());
  } else if (phase === 'pause' || phase === 'retour') {
    if (a('demarrer')) out.push(puce('reprendre', depart, 'play', tr('Reprendre')));
    if (a('base')) out.push(base(phase === 'retour'));
  } else if (phase === 'erreur') {
    if (a('base')) out.push(base());
  } else if (phase === 'repos') {
    if (a('demarrer')) out.push(demarrer());
    if (a('base')) out.push(base());
  }
  return out;
}

/* ── Le geste en vol (passe bis du 18/10, point 1) ──
 * Deux appuis rapprochés sur « Pause » relançaient le robot : la puce basculait sur l'avance du geste (« Reprendre ») et le second
 * appui envoyait `start`. Le geste en vol vit dans le magasin de robotsetat.js, partagé par la carte, la compacte et la popup ;
 * ici, ce qu'il change aux puces. La phase qu'annonce chaque geste : */
export const PHASE_GESTE = Object.freeze({ demarrer: 'travail', reprendre: 'travail', pause: 'pause', base: 'retour' });

/** Un geste de plus, pendant celui qui vole (`enVol`, ou null) ? Seulement rentrer à la base — qui ne relance rien — et localiser :
 *  jamais l'inverse ni le même, pas de reprise par un second appui. Localiser en vol ne retient que lui (passe bis 2 du 20/10) : le
 *  robot bipe, « Nettoyer tout le logement » reste offert — et un second appui ne le fait pas rebiper. */
export function gestePermis(cle, enVol) {
  return !enVol || (enVol.cle === 'localiser' ? cle !== 'localiser' : cle === 'localiser' || (cle === 'base' && enVol.cle !== 'base'));
}

/**
 * Les puces pendant un geste en vol : celle qui l'a lancé garde sa place et son mot, choisie et marquée `enVol` — elle ne fait plus
 * rien ; les autres sont celles de la phase qu'il annonce, sans ce qui l'annulerait (`gestePermis`). `geste` : `{ cle, depuis }` —
 * la puce, et la phase RÉELLE d'avant lui —, ou null : la phase seule décide (`commandesRobot`). La puce qui l'a lancé se cherche
 * parmi celles d'avant lui, sinon parmi celles qu'il annonce : « Base » posée pendant le vol d'un départ, le robot encore sur sa
 * base, n'est pas une puce de la base — la carte et la compacte restaient sans puce (passe bis 2 du 18/10, point H). `opts` : ceux
 * de `commandesRobot` (`depart`).
 */
export function commandesEnVol(domaine, phase, bits, geste, opts) {
  const apres = commandesRobot(domaine, phase, bits, opts);
  if (!geste) return apres;
  const avant = commandesRobot(domaine, geste.depuis, bits, opts);
  let i = avant.findIndex(p => p.cle === geste.cle);
  let lanceur = avant[i];
  if (!lanceur) { i = apres.findIndex(p => p.cle === geste.cle); lanceur = apres[i]; }
  const out = apres.filter(p => p.cle !== geste.cle && gestePermis(p.cle, geste));
  if (lanceur) out.splice(Math.min(i, out.length), 0, { ...lanceur, choisie: true, enVol: true });
  return out;
}

/** « 2 h 15 », « 48 min ». */
export function dureeLisible(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return tr('{n} min', { n: m });
  const h = Math.floor(m / 60), r = m % 60;
  return r ? tr('{h} h {m}', { h, m: String(r).padStart(2, '0') }) : tr('{h} h', { h });
}

/* ════════════ Le planning (ADR 0043) ════════════
 *
 * Aucun robot ne publie son planning : c'est Loggia qui le tient, côté serveur
 * (`custom_components/loggia/robots.py`), et qui lance le robot à l'heure. Ici,
 * seulement ce que l'écran en calcule. Côté serveur lundi vaut 0 — le
 * `weekday()` de Python —, et non dimanche comme le `getDay()` du navigateur.
 */

/** Le jour d'une date, lundi = 0. */
export const jourPlanning = (date) => (new Date(date).getDay() + 6) % 7;

/** Les sept jours dans l'ordre de la langue : `premier` vaut 1 (lundi) à 7 (dimanche). */
export function ordreJours(premier = 1) {
  const d = (((Number(premier) || 1) - 1) % 7 + 7) % 7;
  return Array.from({ length: 7 }, (_, i) => (d + i) % 7);
}

/** Le nom d'un jour (0 = lundi) dans la langue : « L », « lun », « lundi ». */
export function nomJour(j, loc = 'fr-FR', forme = 'narrow') {
  // Le 1er janvier 2024 est un lundi.
  const mot = new Date(2024, 0, 1 + j).toLocaleDateString(loc, { weekday: forme }).replace(/\./g, '');
  return mot.charAt(0).toUpperCase() + mot.slice(1);
}

export const heureValide = (hhmm) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(hhmm == null ? '' : hhmm));
const minutesDe = (hhmm) => { if (!heureValide(hhmm)) return null; const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

/** « Tous les jours », « En semaine », « Le week-end », sinon les jours courts dans l'ordre de la langue. */
export function resumeJours(jours, premier = 1, loc = 'fr-FR') {
  const retenus = new Set((jours || []).filter(j => Number.isInteger(j) && j >= 0 && j <= 6));
  if (!retenus.size) return tr('Aucun jour');
  if (retenus.size === 7) return tr('Tous les jours');
  const cle = [...retenus].sort().join('');
  if (cle === '01234') return tr('En semaine');
  if (cle === '56') return tr('Le week-end');
  return ordreJours(premier).filter(j => retenus.has(j)).map(j => nomJour(j, loc, 'short')).join(' · ');
}

/** Le prochain départ d'un robot : la première échéance STRICTEMENT après maintenant — d'un passage qui
 *  PARTIRA (I18). `calme`, la plage « Ne pas déranger » du robot : le serveur retient tout passage dont
 *  l'heure y tombe (ADR 0043), et un passage a toujours la même heure — il ne se propose donc jamais. */
export function prochainPassage(plannings, idRobot, maintenant = Date.now(), calme = null) {
  const m = new Date(maintenant);
  let mieux = null;
  (plannings || []).forEach(p => {
    if (!p || !p.actif || p.robot !== idRobot) return;
    if (calme && dansLaPlage(calme, p.heure)) return;
    const min = minutesDe(p.heure);
    if (min == null) return;
    const jours = new Set(p.jours || []);
    const dans = (k) => new Date(m.getFullYear(), m.getMonth(), m.getDate() + k, Math.floor(min / 60), min % 60, 0, 0);
    // Huit jours : si l'heure d'aujourd'hui est passée, le même jour revient dans sept.
    const k = [0, 1, 2, 3, 4, 5, 6, 7].find(n => dans(n).getTime() > m.getTime() && jours.has(jourPlanning(dans(n))));
    if (k == null) return;
    if (!mieux || dans(k).getTime() < mieux.date.getTime()) mieux = { date: dans(k), planning: p };
  });
  return mieux;
}

/** Une heure tombe-t-elle dans une plage {actif, debut, fin} ? La plage peut enjamber minuit. */
export function dansLaPlage(plage, hhmm) {
  if (!plage || !plage.actif) return false;
  const d = minutesDe(plage.debut), f = minutesDe(plage.fin), t = minutesDe(hhmm);
  if (d == null || f == null || t == null || d === f) return false;
  return d < f ? (t >= d && t < f) : (t >= d || t < f);
}

/* ════════════ La phrase de la carte (I7 ; § 6 de la conception) ════════════ */

const heureDe = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const jourDe = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** « Passage à 09:30 » aujourd'hui, « Passage demain 09:30 », « Passage mardi 09:30 » au-delà. */
export function libellePassage(date, maintenant = Date.now()) {
  const t = new Date(date).getTime();
  const ecart = Math.round((jourDe(t) - jourDe(maintenant)) / 86400000);
  const h = heureDe(t);
  if (ecart <= 0) return tr('Passage à {h}', { h });
  if (ecart === 1) return tr('Passage demain {h}', { h });
  return tr('Passage {jour} {h}', { jour: new Date(t).toLocaleDateString(locale(), { weekday: 'long' }), h });
}

/** Les pièces d'un passage, telles que la carte les dit : « Salon, Cuisine », « tout le logement », ou null quand on ne les sait pas. */
export function piecesDites(domaine, pieces, tout = false) {
  if (Array.isArray(pieces) && pieces.length) return pieces.join(', ');
  if (tout) return domaine === 'lawn_mower' ? tr('tout le jardin') : tr('tout le logement');
  return null;
}

/**
 * La phrase d'état d'un robot (I7, § 6), la première ligne qui s'applique, et son encre — la carte, la compacte, la popup
 * et « En ce moment » la partagent :
 *  1. muet : « Indisponible depuis 14:20 », en rouge, le liseré qui respire (`panne`) ;
 *  2. « Il bipe : suivez le son », trois secondes après un `locate` accepté, dans l'onglet qui l'a envoyé ;
 *  3. en erreur : « En erreur · {message de l'appareil} », ou « En erreur », en rouge ;
 *  4. au travail : « Nettoie · Salon, Cuisine », « Tond · Pelouse arrière », « Nettoie · tout le logement » — ce que le
 *     carnet du serveur sait du passage ; sans lui, « Nettoyage en cours », « Tonte en cours » —, dans la teinte du robot ;
 *  5. en pause : « En pause · {pièces} », ou « En pause » ; 6. au retour : « Retour à la base » ;
 *  7. sur la base : « Passage à 09:30 », « Passage demain 09:30 », « Passage mardi 09:30 » — le prochain qui partira —,
 *     sinon « Sur la base », ou « Sur la base · en charge » quand un capteur le dit ;
 *  8. arrêté ailleurs : « À l’arrêt ».
 * `phase` : celle de `phaseRobot`, l'avance d'un geste comprise ; `depuis` : le `last_changed` d'un robot muet ; `pieces`,
 * `tout` : le passage en cours selon le carnet, `libelle` le nom du script maison qui l'a lancé ; `prochain` : ce que rend
 * `prochainPassage`, ou null ; `sansZone` : une tondeuse à aires dont aucune n'est allumée — sur la base ou arrêtée, la phrase le dit,
 * « Aucune zone allumée », puisqu'elle n'offre pas « Démarrer » (passe bis 2 du 18/10, point D). Rend `{ texte, encre, panne }`.
 */
export function phraseRobot({ domaine = 'vacuum', phase = 'absent', depuis = null, bipe = false, erreur = null, pieces = null, tout = false, libelle = null, prochain = null, charge = false, sansZone = false, maintenant = Date.now() } = {}) {
  const tondeuse = domaine === 'lawn_mower';
  const gris = 'var(--o-text2)';
  if (phase === 'absent') {
    const q = depuis ? quandLumiere(depuis, maintenant) : null;
    return { texte: q ? tr('Indisponible depuis {h}', { h: q }) : tr('Indisponible'), encre: 'var(--o-bad)', panne: true };
  }
  if (bipe) return { texte: tr('Il bipe : suivez le son'), encre: 'var(--o-accent-soft)', panne: false };
  if (phase === 'erreur') return { texte: erreur ? tr('En erreur · {m}', { m: erreur }) : tr('En erreur'), encre: 'var(--o-bad)', panne: false };
  // Le nom d'un script maison (`libelle`, passe bis du 18/10, point A) dit le passage quand ses pièces ne se savent pas.
  const p = piecesDites(domaine, pieces, tout) || libelle || null;
  if (phase === 'travail') {
    const texte = p ? (tondeuse ? tr('Tond · {p}', { p }) : tr('Nettoie · {p}', { p })) : (tondeuse ? tr('Tonte en cours') : tr('Nettoyage en cours'));
    return { texte, encre: tondeuse ? 'var(--o-ok)' : 'var(--o-accent-soft)', panne: false };
  }
  if (phase === 'pause') return { texte: p ? tr('En pause · {p}', { p }) : tr('En pause'), encre: gris, panne: false };
  if (phase === 'retour') return { texte: tr('Retour à la base'), encre: gris, panne: false };
  if (sansZone) return { texte: tr('Aucune zone allumée'), encre: gris, panne: false };
  if (phase === 'base') {
    if (prochain && prochain.date) return { texte: libellePassage(prochain.date, maintenant), encre: gris, panne: false };
    return { texte: charge ? tr('Sur la base · en charge') : tr('Sur la base'), encre: gris, panne: false };
  }
  return { texte: tr('À l’arrêt'), encre: gris, panne: false };
}
