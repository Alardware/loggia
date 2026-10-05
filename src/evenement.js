/* ── Le dernier événement d'une caméra ──────────────────────────────────────
 *
 * Étape 4 de la refonte de l'Accueil (ADR 0031). Une tuile caméra disait
 * « Direct » et rien d'autre ; la vue Sécurité, seulement ce qui se passe à
 * l'instant. Ici, ce qui s'est passé en dernier — « Mouvement · il y a 3 min »
 * — d'après deux sources que l'on a déjà :
 *   - les DÉTECTEURS que la résolution connaît par caméra (mouvement,
 *     personne, véhicule, sonnette, colis : le choix de l'utilisateur,
 *     complété par les binary_sensor du même appareil) ;
 *   - le JOURNAL de Home Assistant (logbook) pour le dernier déclenchement de
 *     chacun. Jamais `last_changed` : après un redémarrage il vaut l'heure du
 *     redémarrage, et la tuile inventerait un mouvement qui n'a pas eu lieu.
 *
 * Aucun détecteur, aucun déclenchement dans les 24 h : null — la tuile dit
 * « Direct », rien d'inventé. Les libellés se disent au rendu, dans la langue
 * du moment. Aucun React ici : tout se teste à la main. */
import { tr, locale } from './i18n.js';

/** Les états d'un détecteur qui valent « ça se passe » (les mêmes que la vue Sécurité). */
export const ACTIFS_DETECTION = ['on', 'true', 'True', 'detected', 'Detected'];

/** Les genres, du plus parlant au plus commun : quand deux détecteurs
 * s'allument ensemble, la sonnette prime sur le mouvement. */
export const GENRES_DETECTION = ['sonnette', 'person', 'vehicle', 'colis', 'motion'];

export const ICONES_DETECTION = { sonnette: 'bell', person: 'user', vehicle: 'car', colis: 'box', motion: 'eye' };

/** Le journal ne remonte que 24 h ; au-delà, rien à dire. */
export const FENETRE_EVENEMENT = 24 * 3600 * 1000;

/** Le mot d'un genre : en cours (« Personne détectée ») ou passé
 * (« Quelqu’un » — « Personne » seul dirait le contraire en français). */
export function libelleDetection(genre, enCours = false) {
  const mots = enCours
    ? { sonnette: tr('Sonnette'), person: tr('Personne détectée'), vehicle: tr('Véhicule présent'), colis: tr('Colis livré'), motion: tr('Mouvement') }
    : { sonnette: tr('Sonnette'), person: tr('Quelqu’un'), vehicle: tr('Véhicule'), colis: tr('Colis'), motion: tr('Mouvement') };
  return mots[genre] || null;
}

/** Les détecteurs d'une caméra résolue, dans l'ordre des genres : [{ genre, id }].
 * Un champ absent ou vide n'est pas un détecteur. */
export function detecteursDe(cam) {
  if (!cam || typeof cam !== 'object') return [];
  return GENRES_DETECTION.filter(g => typeof cam[g] === 'string' && cam[g]).map(g => ({ genre: g, id: cam[g] }));
}

/** L'instant d'un événement, en millisecondes : le journal parle en secondes
 * (flottantes), un état en ISO. Null quand on ne sait pas lire. */
export function instantDe(quand) {
  if (quand == null || quand === '') return null;
  if (typeof quand === 'number') return isNaN(quand) ? null : (quand < 1e12 ? Math.round(quand * 1000) : Math.round(quand));
  const t = Date.parse(quand);
  return isNaN(t) ? null : t;
}

/** Réduit un paquet d'événements du journal au DERNIER déclenchement par
 * entité : { id → instant (ms) }. `prev` est repris — le flux arrive par
 * paquets, l'historique d'abord puis le direct — et rendu tel quel quand rien
 * ne change, pour ne pas faire rendre l'écran pour rien. */
export function reduireDerniers(prev, evenements, actifs = ACTIFS_DETECTION) {
  const base = prev || {};
  const out = { ...base };
  let change = false;
  (evenements || []).forEach(e => {
    if (!e || !e.entity_id || actifs.indexOf(e.state) < 0) return;
    const t = instantDe(e.when);
    if (t == null) return;
    if (out[e.entity_id] == null || t > out[e.entity_id]) { out[e.entity_id] = t; change = true; }
  });
  return change ? out : base;
}

/** Ce que la caméra a à dire : la détection EN COURS s'il y en a une (le genre
 * le plus parlant), sinon le DERNIER déclenchement du journal (le plus récent,
 * dans les 24 h), sinon null.
 *   → { genre, enCours, quand (ms | null), libelle, icone } */
export function evenementCamera(cam, S, derniers, maintenant = Date.now()) {
  const dets = detecteursDe(cam);
  if (!dets.length) return null;
  const etats = S || {};
  const enCours = dets.find(d => etats[d.id] && ACTIFS_DETECTION.indexOf(etats[d.id].state) >= 0);
  if (enCours) {
    return { genre: enCours.genre, enCours: true, quand: instantDe(etats[enCours.id].last_changed), libelle: libelleDetection(enCours.genre, true), icone: ICONES_DETECTION[enCours.genre] };
  }
  let meilleur = null;
  dets.forEach(d => {
    const t = derniers ? derniers[d.id] : null;
    // Trop vieux, ou dans le futur (une horloge fausse) : on n'en parle pas.
    if (t == null || maintenant - t > FENETRE_EVENEMENT || t > maintenant + 60000) return;
    if (!meilleur || t > meilleur.quand) meilleur = { genre: d.genre, quand: t };
  });
  if (!meilleur) return null;
  return { genre: meilleur.genre, enCours: false, quand: meilleur.quand, libelle: libelleDetection(meilleur.genre, false), icone: ICONES_DETECTION[meilleur.genre] };
}

/** « il y a 3 min », « il y a 2 h », « à l’instant » ; au-delà d'un jour, le
 * jour et l'heure. Dans la langue de l'interface, par Intl. */
export function depuis(quand, maintenant = Date.now(), lang = null) {
  const t = instantDe(quand);
  if (t == null) return '';
  const l = lang || locale();
  const secs = Math.max(0, Math.round((maintenant - t) / 1000));
  if (secs < 60) return tr('à l’instant');
  try {
    const rtf = new Intl.RelativeTimeFormat(l, { numeric: 'always', style: 'short' });
    if (secs < 3600) return rtf.format(-Math.round(secs / 60), 'minute');
    if (secs < 86400) return rtf.format(-Math.round(secs / 3600), 'hour');
    return new Intl.DateTimeFormat(l, { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
  } catch { return new Date(t).toLocaleTimeString(); }
}

/* ── Le journal « 24 h, en direct » (audit du 03/10) ─────────────────────────
 *
 * L'abonnement au journal remonte 24 h en arrière de son OUVERTURE, puis
 * ajoute ce qui arrive sans jamais rien retirer. Sur une tablette allumée
 * plusieurs jours, la carte « Les dernières 24 heures, en direct » gardait le
 * jeudi un événement de lundi — et le datait « 16:00 », comme s'il était du
 * jour. Les deux fonctions vivent ici, à côté de `instantDe` et de la fenêtre
 * de 24 h qu'elles partagent avec les caméras : sans React, elles se testent
 * à sec. */

/** Les événements encore dans la fenêtre au moment `maintenant` (ms). Un
 * instant illisible ne prouve pas qu'il est récent : il tombe. Un instant dans
 * le futur reste — c'est l'horloge de la tablette qui retarde, pas l'événement
 * qui est faux. Rend le MÊME tableau quand rien ne tombe : la mémoïsation de
 * l'appelant tient. */
export function dansLaFenetre(evenements, maintenant = Date.now(), fenetre = FENETRE_EVENEMENT) {
  const l = Array.isArray(evenements) ? evenements : [];
  const garde = l.filter(e => {
    const t = e ? instantDe(e.when) : null;
    return t != null && maintenant - t <= fenetre;
  });
  return garde.length === l.length ? l : garde;
}

/** L'heure d'une ligne du journal : seule aujourd'hui, « hier » la veille, la
 * date avant. La forme de `quandCourt` (views/parcommun.jsx), qui ne lit que
 * des secondes et l'horloge du moment ; ici l'instant se lit comme le journal
 * le donne (`instantDe`) et `maintenant` se passe, pour qu'un test fixe le
 * jour sans truquer l'horloge. La veille se cherche sur le CALENDRIER :
 * « maintenant moins 24 h » retombe l'avant-veille entre 0 h et 1 h, le
 * lendemain du passage à l'heure d'été. Sans instant lisible : « — »
 * (ADR 0030), jamais « Invalid Date ». */
export function heureJournal(quand, maintenant = Date.now(), lang = null) {
  const t = instantDe(quand);
  if (t == null) return '—';
  const l = lang || locale();
  const d = new Date(t);
  const h = d.toLocaleTimeString(l, { hour: '2-digit', minute: '2-digit' });
  const auj = new Date(maintenant);
  if (d.toDateString() === auj.toDateString()) return h;
  const hier = new Date(auj); hier.setDate(hier.getDate() - 1);
  if (d.toDateString() === hier.toDateString()) return tr('hier') + ' ' + h;
  return d.toLocaleDateString(l, { day: 'numeric', month: 'short' }) + ' ' + h;
}
