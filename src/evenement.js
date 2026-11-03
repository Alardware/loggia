/* ── Le dernier événement d'une caméra ──────────────────────────────────────
 *
 * Étape 4 de la refonte de l'Accueil (ADR 0031). Une tuile caméra disait
 * « Direct » et rien d'autre ; la vue Sécurité, seulement ce qui se passe à
 * l'instant. Ici, ce qui s'est passé en dernier — « Mouvement · il y a 3 min »
 * — d'après deux sources que l'on a déjà :
 *   - les DÉTECTEURS que la résolution connaît par caméra (mouvement,
 *     personne, véhicule, animal, sonnette, colis : le choix de l'utilisateur,
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
export const GENRES_DETECTION = ['sonnette', 'person', 'vehicle', 'animal', 'colis', 'motion'];

export const ICONES_DETECTION = { sonnette: 'bell', person: 'user', vehicle: 'car', animal: 'paw', colis: 'box', motion: 'eye' };

/** Le journal ne remonte que 24 h ; au-delà, rien à dire. */
export const FENETRE_EVENEMENT = 24 * 3600 * 1000;

/** Le mot d'un genre : en cours (« Personne détectée ») ou passé
 * (« Quelqu’un » — « Personne » seul dirait le contraire en français). */
export function libelleDetection(genre, enCours = false) {
  const mots = enCours
    ? { sonnette: tr('Sonnette'), person: tr('Personne détectée'), vehicle: tr('Véhicule présent'), animal: tr('Animal détecté'), colis: tr('Colis livré'), motion: tr('Mouvement') }
    : { sonnette: tr('Sonnette'), person: tr('Quelqu’un'), vehicle: tr('Véhicule'), animal: tr('Animal'), colis: tr('Colis'), motion: tr('Mouvement') };
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

/* ── Ce qui arrive à la porte : la sonnette et le colis (lot 8 Gladys, ADR 0312) ──
 *
 * UniFi Protect ne dit le colis qu'en entité `event` (clé `package`), et l'appui
 * sur la sonnette aussi (classe `doorbell`, le standard de Home Assistant). Un
 * `event` n'a pas d'état allumé ou éteint : son état est l'INSTANT du dernier
 * événement. Loggia ne les lisait pas.
 *
 * Ils vont au journal des notifications de l'écran et dans « En ce moment »,
 * jusqu'à ce qu'on les ait vus (le geste « Vu ») ou que leur temps passe :
 * 30 min pour un appui, 12 h pour un colis (`DUREE_PORTE`). Rien au téléphone.
 * Aucun React ici. */

/** Les clés de traduction d'un `event` de colis. Sans clé, le nom en repli — sur l'appareil d'une caméra seulement. */
const CLES_COLIS_EVENT = ['package'];

/** Combien de temps un événement de la porte reste à dire. */
const DUREE_PORTE = { sonnette: 30 * 60 * 1000, colis: 12 * 3600 * 1000 };

/** 'sonnette', 'colis' ou null, d'après l'entrée de l'index d'une entité `event`. */
function genreEvenementPorte(id, m) {
  if (!m || String(id).indexOf('event.') !== 0) return null;
  if (m.deviceClass === 'doorbell') return 'sonnette';
  if (m.translationKey) return CLES_COLIS_EVENT.indexOf(m.translationKey) >= 0 ? 'colis' : null;
  return /(package|colis|parcel)/.test(String(id)) ? 'colis' : null;
}

const PORTE_PAR_INDEX = new WeakMap();
/** Les entités `event` de la porte, lues dans l'index, une fois par index :
 * [{ id, genre, deviceId, appareil, camera }], triées. `camera` : une caméra du
 * même appareil, null s'il n'en porte pas. Cachées et désactivées : dehors. */
export function evenementsPorte(index) {
  const meta = index && index.entityMeta;
  if (!meta || typeof meta.forEach !== 'function') return [];
  const deja = PORTE_PAR_INDEX.get(meta);
  if (deja) return deja;
  const out = [];
  const cams = new Map();
  meta.forEach((m, id) => {
    if (!m || !m.deviceId || m.hidden || m.disabled) return;
    if (String(id).indexOf('camera.') === 0) { if (!cams.has(m.deviceId) || id < cams.get(m.deviceId)) cams.set(m.deviceId, id); return; }
    const genre = genreEvenementPorte(id, m);
    // Reconnu au nom seul (aucune clé, aucune classe) : il ne compte que sur l'appareil d'une caméra.
    if (genre) out.push({ id, genre, deviceId: m.deviceId, appareil: m.device || null, camera: null, sur: !!m.translationKey || m.deviceClass === 'doorbell' });
  });
  const garde = out.filter(e => { e.camera = cams.get(e.deviceId) || null; const ok = e.sur || !!e.camera; delete e.sur; return ok; })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  PORTE_PAR_INDEX.set(meta, garde);
  return garde;
}

/** La caméra à montrer pour un événement de la porte : le flux que la résolution a retenu pour son appareil
 * (`cameras` : sa liste), sinon celle de l'index. */
export function cameraPorte(e, index, cameras = []) {
  const meta = index && index.entityMeta;
  const retenue = meta && typeof meta.get === 'function'
    ? (cameras || []).find(c => c && c.id && (meta.get(c.id) || {}).deviceId === e.deviceId) : null;
  return (retenue && retenue.id) || e.camera || null;
}

/** L'instant du dernier événement (ms), l'état de l'entité `event`. Null s'il est muet, illisible ou dans le futur. */
export function instantPorte(S, id, maintenant = Date.now()) {
  const e = S && S[id];
  if (!e) return null;
  // `unknown` (après un redémarrage de HA) et `unavailable` ne se lisent pas comme un instant : null.
  const t = instantDe(e.state);
  return t == null || t > maintenant + 60000 ? null : t;
}

/** Ce que la porte a à dire maintenant, le plus récent d'abord : [{ cle, id, genre, quand, camera, appareil }].
 * Un événement plus vieux que sa durée, ou déjà vu sur cet écran (`vus[id] >= quand`), ne dit rien. */
export function lignesPorte(evs, S, vus = {}, maintenant = Date.now()) {
  const out = [];
  (evs || []).forEach(e => {
    const t = instantPorte(S, e.id, maintenant);
    if (t == null || maintenant - t > DUREE_PORTE[e.genre]) return;
    const v = vus ? vus[e.id] : null;
    if (typeof v === 'number' && v >= t) return;
    out.push({ ...e, cle: 'porte:' + e.id + ':' + t, quand: t });
  });
  return out.sort((a, b) => b.quand - a.quand);
}

/** « Un colis déposé à 14:12 », « On a sonné à 14:12 » : l'heure seule, dans la langue de l'écran. */
export function textePorte(l, lang = null) {
  const heure = new Date(l.quand).toLocaleTimeString(lang || locale(), { hour: '2-digit', minute: '2-digit' });
  return l.genre === 'colis' ? tr('Un colis déposé à {heure}', { heure }) : tr('On a sonné à {heure}', { heure });
}

/** « Vu » : l'instant de l'événement, retenu par entité. Propre à l'écran, comme « lu » au journal (journal.js). */
const CLE_VUS = 'loggia_vus';
export function lireVus() {
  try { const v = JSON.parse(localStorage.getItem(CLE_VUS) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
export function marquerVu(vus, l) {
  const suite = { ...(vus || {}), [l.id]: l.quand };
  try { localStorage.setItem(CLE_VUS, JSON.stringify(suite)); } catch { /* stockage plein : la ligne partira à son heure */ }
  return suite;
}

/* La caméra en grand quand on sonne (C2, ADR 0312) : UNE OPTION DE L'ÉCRAN, décochée par défaut (Paramètres › Apparence,
 * près de la veille : c'est le même écran de couloir). Cochée, App monte `sonnettegrand.jsx`, qui guette l'appui neuf. */
export const CLE_SONNETTE_GRAND = 'loggia-sonnette-camera';
export function sonnetteEnGrand() {
  try { return localStorage.getItem(CLE_SONNETTE_GRAND) === '1'; } catch { return false; }
}
