/* ── La course d'un volet à l'écran (chantier Volets, § 5, V8) ───────────────
 *
 * Sa maquette fait bouger le volet « à la vitesse du moteur ». Chez lui, Home
 * Assistant ne publie ni `opening` ni `closing`, et la position arrive une à
 * trois minutes après l'ordre (Netatmo, § 0). Loggia JOUE donc la course
 * quand personne ne la publie : le petit volet de la carte et la fenêtre de la
 * fiche descendent à 20 s la course complète, puis la position visée TIENT,
 * 180 s au plus, en attendant que Home Assistant la confirme. Le chiffre d'une
 * course est une estimation : une position publiée la remplace aussitôt, et
 * passé 180 s Home Assistant fait foi — un volet bloqué se voit. C'est le
 * principe de `useOptimiste` : un affichage anticipé expire toujours.
 *
 * D'où vient une course, de la source la plus sûre à la moins sûre :
 *  1. un geste dans cet écran — la cible est connue ;
 *  2. un ordre du serveur — `manoeuvre` de loggia/volets/etat (§ 6.1) ;
 *  3. Home Assistant dit `opening` ou `closing` — cible : celle de l'ordre du
 *     serveur (2) s'il est frais et va dans ce sens, sinon 100 ou 0 ; et quand
 *     il cesse de le dire, la course finit, loin de la cible ou non : un Stop
 *     venu d'ailleurs (l'interrupteur, l'appli de la marque) se voit ;
 *  4. la bascule Netatmo — l'état passe de `open` à `closed`, ou de `closed` À
 *     0 % à `open`, SANS que la position change dans la même mise à jour, il y
 *     a moins de 180 s. Une position qui ARRIVE n'est pas une bascule : le
 *     09/10, `closed 100` → `open 1` est la FIN d'une fermeture (sa chambre
 *     bute à 1 %), pas une ouverture qui commence ; `closed 1` → `open 1` n'en
 *     est pas une non plus, ni `closed 60` → `open 60`, un volet bloqué. Au
 *     chargement de la page, on ne sait rien de l'état d'avant : rien ne se
 *     déduit.
 * Une source moins sûre ne remplace jamais la course d'une plus sûre.
 *
 * Le modèle est PUR — l'instant `t` passe en argument — et se teste à sec
 * (tests/voletcourse.test.mjs). Le magasin, un par volet, est partagé par la
 * carte, la compacte, l'en-tête d'Objets et la fiche (`useSyncExternalStore`,
 * comme chauffageetat.js) : 10 images par seconde pendant une course, et
 * plus rien ne tourne ensuite.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { positionPubliee } from './outils.js';

export const COURSE_COMPLETE_S = 20;   // V8 : une course complète, de 0 à 100 %
export const TENUE_S = 180;            // V8 : la cible tient au plus 180 s après l'arrivée
export const CONFIRMATION = 5;         // |réelle − cible| ≤ 5 : Home Assistant confirme
export const IMAGE_MS = 100;           // 10 images par seconde, pendant une course seulement

const SURETE = Object.freeze({ geste: 1, serveur: 2, ha: 3, bascule: 4 });
const TENUE_MS = TENUE_S * 1000;
const VIDE = Object.freeze({ course: null, vu: null, joue: null });
const borne = (x) => Math.max(0, Math.min(100, x));
const finDe = (c) => c.t0 + c.duree;
// Partie, et pas encore rendue : une horloge qui recule en pleine course ne la fige pas (relecture du 13/10, point 4).
const vivante = (c, t) => !!c && t >= c.t0 && t < finDe(c) + TENUE_MS;
/* Vers le bas, depuis toute position ; vers le HAUT, seulement d'un `closed` à
 * 0 % : sa chambre bute à 1 %, et `closed 1` → `open 1` est la position qui
 * arrive au bout d'une fermeture (relecture du 13/10, point 1). */
const basculeVers = (avant, apres) => (avant.etat === 'open' && apres.etat === 'closed') || (avant.etat === 'closed' && avant.pos === 0 && apres.etat === 'open');
// Où le moteur en est à `t`, d'après la course : d'où repart un geste, où s'arrête Stop.
const estimee = (c, t) => c.depart + (c.cible - c.depart) * (c.duree > 0 ? Math.min(1, Math.max(0, (t - c.t0) / c.duree)) : 1);

/** Une course de `depart` à `cible` partie à `t0` : sa durée suit l'écart
 * (`COURSE_COMPLETE_S` pour 100 %). Le mouvement réduit ne la raccourcit pas :
 * seul son DESSIN saute à la cible (`reduit`) — « En fermeture », Stop, la
 * tenue et la confirmation ne changent pas (§ 5 ; relecture du 13/10, point 3). */
export function nouvelleCourse(depart, cible, t0, source, reduit = false) {
  const d = borne(depart), c = borne(cible);
  return { depart: d, cible: c, t0, duree: Math.abs(c - d) / 100 * COURSE_COMPLETE_S * 1000, source, reduit: !!reduit };
}

/**
 * Ce que l'écran dessine à `t` : `{ pos, enCourse, sens, cible }`. En course,
 * la position glisse de `depart` à `cible` — réduite, elle est dessinée à la
 * cible dès le départ ; arrivée, elle tient la cible (`cible` non nulle,
 * `enCourse` faux) ; sans course — ou passé la tenue —, c'est `reelle`, la
 * position publiée.
 */
export function affichage(e, reelle, t) {
  const c = e && e.course;
  if (!vivante(c, t)) return { pos: reelle, enCourse: false, sens: null, cible: null };
  if (t >= finDe(c)) return { pos: c.cible, enCourse: false, sens: null, cible: c.cible };
  return { pos: c.reduit ? c.cible : estimee(c, t), enCourse: true, sens: c.cible > c.depart ? 'ouverture' : 'fermeture', cible: c.cible };
}

/* La position d'où l'on repart : celle que l'écran dessine, sauf pendant une
 * course réduite, dont le dessin a sauté à la cible — on repart alors de là où
 * le moteur EST, d'après la course. */
function positionEstimee(e, reelle, t) {
  const c = e && e.course;
  return vivante(c, t) && t < finDe(c) ? estimee(c, t) : affichage(e, reelle, t).pos;
}

/* La cible d'un `opening` / `closing` (source 3) : celle de l'ordre du
 * serveur s'il a moins de 180 s et va dans le sens du mouvement ; sinon le
 * bout de la course (relecture du 13/10, point 5). */
function cibleHA(manoeuvre, monte, ici, t) {
  const c = manoeuvre ? manoeuvre.cible : null;
  const t0 = manoeuvre && typeof manoeuvre.depuis === 'string' ? Date.parse(manoeuvre.depuis) : NaN;
  const sens = monte ? c > (ici == null ? 0 : ici) : c < (ici == null ? 100 : ici);
  return Number.isFinite(c) && Number.isFinite(t0) && t - t0 < TENUE_MS && sens ? c : monte ? 100 : 0;
}

/** Un état de Home Assistant, lu pour la course : `{ etat, pos, publie,
 * quand, bascule }` — `pos` : `current_position` (celle des lames d'un store
 * qui ne fait que s'incliner : `positionPubliee`), sinon 100 ou 0 pour `open`
 * ou `closed` ; `publie` : le volet publie sa position. null : muet. */
export function lireVolet(st) {
  if (!st || st.state === 'unavailable' || st.state === 'unknown') return null;
  const p = positionPubliee(st);
  const publie = p != null;
  const pos = publie ? borne(Math.round(p)) : st.state === 'open' ? 100 : st.state === 'closed' ? 0 : null;
  return { etat: st.state, pos, publie, quand: st.last_updated || st.last_changed || null, bascule: st.last_changed || null };
}

/**
 * Une mise à jour de Home Assistant (sources 3 et 4, et la fin d'une course).
 * Pendant une course, une position qui ARRIVE la confirme (à 5 près, l'état
 * arrêté), la recale si le moteur court encore — le dessin suit le vrai
 * moteur, sans saut —, ou la termine : Home Assistant dit autre chose, il fait
 * foi. Un état qui change sans position (la bascule) ne la touche pas — sauf
 * la fin d'un `opening` / `closing` : le moteur s'est arrêté, où qu'il soit
 * (un Stop venu d'ailleurs, loin de la cible), et la course finit au lieu de
 * descendre jusqu'à la cible puis d'y tenir 180 s (19/10).
 * `manoeuvre` donne la cible d'un `opening`/`closing` (source 2), fraîche et
 * dans son sens.
 */
export function voirHA(e, st, t, { manoeuvre = null, reduit = false } = {}) {
  const avant = e || VIDE;
  const vu = lireVolet(st);
  if (!vu) return avant;                       // muet : on garde ce qu'on savait
  const prec = avant.vu;
  if (prec && prec.quand === vu.quand && prec.etat === vu.etat && prec.pos === vu.pos) return avant;
  const enMouvement = (x) => !!x && (x.etat === 'opening' || x.etat === 'closing');
  const bouge = enMouvement(vu);
  const arrivee = !!prec && vu.pos != null && vu.pos !== prec.pos;
  let course = vivante(avant.course, t) ? avant.course : null;
  if (course && enMouvement(prec) && !bouge) course = null;
  else if (course && arrivee) {
    if (!bouge && Math.abs(vu.pos - course.cible) <= CONFIRMATION) course = null;
    else if (bouge || t < finDe(course)) course = nouvelleCourse(vu.pos, course.cible, t, course.source, reduit);
    else course = null;
  }
  if (!course && bouge) {
    const ici = vu.pos != null ? vu.pos : prec && prec.pos != null ? prec.pos : null;
    const cible = cibleHA(manoeuvre, vu.etat === 'opening', ici, t);
    course = nouvelleCourse(ici != null ? ici : 100 - cible, cible, t, 'ha', reduit);
  } else if (!course && prec && prec.publie && vu.publie && vu.pos === prec.pos && basculeVers(prec, vu)) {
    const t0 = Date.parse(vu.bascule);
    if (Number.isFinite(t0) && t - t0 < TENUE_MS) course = nouvelleCourse(vu.pos, vu.etat === 'closed' ? 0 : 100, Math.min(t, t0), 'bascule', reduit);
  }
  return { ...avant, course, vu };
}

/**
 * Un ordre du serveur (source 2), joué UNE fois : le serveur le publie tant
 * que sa vérification attend — six minutes au plus (plan 1, tâche 6) —, et
 * une reprise est un ordre nouveau, son `depuis` aussi. Plus vieux que 180 s,
 * il ne se joue pas : la course serait finie ; un geste en cours l'emporte ;
 * un volet déjà à la cible ne bouge pas. Il part de la position dessinée —
 * d'où l'ordre a été donné, s'il n'y avait rien à l'écran.
 */
export function voirServeur(e, manoeuvre, reelle, t, reduit = false) {
  const avant = e || VIDE;
  if (!manoeuvre || !Number.isFinite(manoeuvre.cible) || typeof manoeuvre.depuis !== 'string' || manoeuvre.depuis === avant.joue) return avant;
  const suite = { ...avant, joue: manoeuvre.depuis };
  const t0 = Date.parse(manoeuvre.depuis);
  if (!Number.isFinite(t0) || t - t0 >= TENUE_MS) return suite;
  const enVol = vivante(avant.course, t) ? avant.course : null;
  // Seul un geste l'emporte : un ordre plus récent du serveur — une reprise — remplace le précédent (relecture du 13/10, point 2).
  if (enVol && SURETE[enVol.source] < SURETE.serveur) return suite;
  if (!enVol && reelle != null && Math.abs(reelle - manoeuvre.cible) <= CONFIRMATION) return suite;
  const depart = enVol ? positionEstimee(avant, reelle, t) : reelle;
  if (depart == null) return suite;
  return { ...suite, course: nouvelleCourse(depart, manoeuvre.cible, enVol ? t : Math.min(t, t0), 'serveur', reduit) };
}

/** Un geste de cet écran (source 1) : il repart de la position DESSINÉE (estimée, si le mouvement est réduit). */
export function geste(e, cible, reelle, t, reduit = false) {
  const avant = e || VIDE;
  const depart = positionEstimee(avant, reelle, t);
  return { ...avant, course: nouvelleCourse(depart == null ? cible : depart, cible, t, 'geste', reduit) };
}

/** Stop : la course s'arrête là où elle est — là où le moteur en est, même
 * quand le dessin a sauté à la cible ; cette position tient jusqu'à la
 * prochaine position publiée, 180 s au plus. Hors course, rien ne change. */
export function arret(e, reelle, t) {
  const avant = e || VIDE;
  if (!affichage(avant, reelle, t).enCourse) return avant;
  const p = Math.round(positionEstimee(avant, reelle, t));
  return { ...avant, course: { depart: p, cible: p, t0: t, duree: 0, source: 'geste' } };
}

/* ── Le magasin, un par volet ──────────────────────────────────────────────── */

const DEPART = Object.freeze({ e: VIDE, n: 0 });

/**
 * Un magasin de courses. `horloge` et les minuteries se doublent dans les
 * tests ; `reduit` : `prefers-reduced-motion`. Chaque volet a son instantané
 * `{ e, n }`, remplacé à chaque changement et à chaque image d'une course.
 */
function creerMagasin({ horloge = () => Date.now(), repeter = (f, ms) => setInterval(f, ms), arreterMinuterie = (x) => clearInterval(x),
  plusTard = (f, ms) => setTimeout(f, ms), annuler = (x) => clearTimeout(x), reduit = false } = {}) {
  const entrees = new Map();
  const ecouteurs = new Map();
  const tous = new Set();
  let version = 0;
  let minuteur = null;
  let reveil = null;
  const lire = (id) => entrees.get(id) || DEPART;
  const appeler = (f) => { try { f(); } catch { /* un écouteur tombé n'arrête pas les autres */ } };
  function prevenir(id) {
    version += 1;
    const ls = ecouteurs.get(id);
    if (ls) ls.forEach(appeler);
    tous.forEach(appeler);
  }
  /* Dix images par seconde tant qu'une course COURT (une de plus à l'arrivée,
   * pour finir sur la cible) ; ensuite un seul réveil, au bout de la tenue la
   * plus proche, qui rend la main à la position publiée. */
  function cadence() {
    const t = horloge();
    let court = false;
    let prochaine = Infinity;
    entrees.forEach(({ e }) => {
      const c = e.course;
      if (!vivante(c, t)) return;
      if (t < finDe(c) + IMAGE_MS) court = true;
      else if (t < finDe(c) + TENUE_MS) prochaine = Math.min(prochaine, finDe(c) + TENUE_MS);
    });
    if (court && minuteur === null) minuteur = repeter(tic, IMAGE_MS);
    if (!court && minuteur !== null) { arreterMinuterie(minuteur); minuteur = null; }
    if (reveil !== null) { annuler(reveil); reveil = null; }
    if (!court && prochaine < Infinity) reveil = plusTard(() => { reveil = null; tic(); }, prochaine - t + 1);
  }
  function tic() {
    const t = horloge();
    entrees.forEach((s, id) => {
      const c = s.e.course;
      if (!c) return;
      if (!vivante(c, t)) { entrees.set(id, Object.freeze({ e: { ...s.e, course: null }, n: s.n + 1 })); prevenir(id); }
      else if (t < finDe(c) + 2 * IMAGE_MS) { entrees.set(id, Object.freeze({ e: s.e, n: s.n + 1 })); prevenir(id); }
    });
    cadence();
  }
  function poser(id, e) {
    const s = lire(id);
    if (s.e === e) return;
    entrees.set(id, Object.freeze({ e, n: s.n + 1 }));
    prevenir(id);
    cadence();
  }
  return {
    lire,
    maintenant: () => horloge(),
    version: () => version,
    ecouter(id, f) {
      let ls = ecouteurs.get(id);
      if (!ls) { ls = new Set(); ecouteurs.set(id, ls); }
      ls.add(f);
      return () => { ls.delete(f); };
    },
    ecouterTout(f) { tous.add(f); return () => { tous.delete(f); }; },
    /** Ce que Home Assistant et le serveur disent de ce volet. */
    voir(id, st, manoeuvre = null) {
      const t = horloge();
      const e = voirHA(lire(id).e, st, t, { manoeuvre, reduit });
      const v = lireVolet(st);
      poser(id, voirServeur(e, manoeuvre, v ? v.pos : null, t, reduit));
    },
    // Ils rendent la course posée : un refus de Home Assistant, plus tard, oublie CELLE-LÀ (`oublier`).
    lancer(id, cible, reelle) { const e = geste(lire(id).e, cible, reelle, horloge(), reduit); poser(id, e); return e.course; },
    arreter(id, reelle) { const avant = lire(id).e; const e = arret(avant, reelle, horloge()); poser(id, e); return e === avant ? null : e.course; },
    /** La course `c` de ce volet s'efface — si c'est toujours elle : un geste plus récent reste. */
    oublier(id, c) { const e = lire(id).e; if (c && e.course === c) poser(id, { ...e, course: null }); },
  };
}

/* `prefers-reduced-motion` : la même lecture que `REDUCE_MOTION` (ui.jsx) — ce
 * module ne l'importe pas, il se teste sans JSX. */
const REDUIT = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
let MAGASIN = creerMagasin({ reduit: REDUIT });

/** Pour les tests : un magasin neuf, son horloge et ses minuteries doublées. */
export function reglerCourses(options = {}) {
  MAGASIN = creerMagasin(options);
  return MAGASIN;
}

const posPubliee = (st) => { const v = lireVolet(st); return v ? v.pos : null; };

/** Un geste (source 1) : Monter, Descendre, un repère, la fenêtre, Tout ouvrir… Rend la course lancée. */
export const lancerCourse = (id, cible, st) => MAGASIN.lancer(id, cible, posPubliee(st));
/** Stop, depuis l'écran. Rend la course figée, ou null hors course. */
export const arreterCourse = (id, st) => MAGASIN.arreter(id, posPubliee(st));
/** Oublier la course `c` de ce volet — un ordre que Home Assistant a refusé : il fait foi. */
export const oublierCourse = (id, c) => MAGASIN.oublier(id, c);

/**
 * Un ordre, puis ce qu'il dessine (19/10). `envoyer(surEchec)` part — c'est
 * `commander` — et rend null si le moteur d'actions le refuse sur place : rien
 * ne se dessine. Accepté, `dessiner()` lance la course (ou fige celle d'un
 * Stop) ; si Home Assistant le REFUSE ensuite, `oublier(course)` l'efface —
 * elle seule : un geste plus récent reste. Pur : tout se double.
 */
export function ordreSuivi(envoyer, dessiner, oublier) {
  let c = null;
  let rate = false;
  const ok = envoyer(() => { rate = true; if (c) oublier(c); });
  if (ok == null) return null;
  if (!rate) c = dessiner();
  return ok;
}
/** Un ordre de mouvement et sa course ; `envoyer` : celui d'`ordreSuivi`. */
export const ordreEtCourse = (id, cible, st, envoyer) => ordreSuivi(envoyer, () => lancerCourse(id, cible, st), (c) => oublierCourse(id, c));
/** Stop et la course qu'il fige : refusé, elle s'efface aussi. */
export const ordreEtArret = (id, st, envoyer) => ordreSuivi(envoyer, () => arreterCourse(id, st), (c) => oublierCourse(id, c));
/** Ce que la course de ce volet dessine maintenant (l'en-tête d'Objets). */
export const afficherCourse = (id, st) => affichage(MAGASIN.lire(id).e, posPubliee(st), MAGASIN.maintenant());

const sansAbonnement = () => () => {};
const lireAucune = () => DEPART;

/**
 * La course d'un volet, pour un composant : `{ pos, enCourse, sens, cible }`.
 * Il remet au magasin chaque nouvel état de Home Assistant et chaque ordre du
 * serveur ; `id` nul — une carte qui n'est pas un volet — : rien ne s'abonne.
 */
export function useCourseVolet(id, st, manoeuvre = null) {
  const recu = useRef({ st, manoeuvre });
  useEffect(() => { recu.current = { st, manoeuvre }; });
  const a = (st && st.attributes) || {};
  const signe = st ? [st.state, st.last_updated || st.last_changed, a.current_position, a.current_tilt_position].join('|') : '';
  const ordre = manoeuvre ? manoeuvre.depuis + '|' + manoeuvre.cible : '';
  useEffect(() => { if (id) MAGASIN.voir(id, recu.current.st, recu.current.manoeuvre); }, [id, signe, ordre]);
  const ecouter = useCallback((f) => (id ? MAGASIN.ecouter(id, f) : sansAbonnement()), [id]);
  const lire = useCallback(() => (id ? MAGASIN.lire(id) : DEPART), [id]);
  const s = useSyncExternalStore(id ? ecouter : sansAbonnement, id ? lire : lireAucune, id ? lire : lireAucune);
  return affichage(s.e, posPubliee(st), MAGASIN.maintenant());
}

const ecouterTout = (f) => MAGASIN.ecouterTout(f);
const versionCourses = () => MAGASIN.version();

/** L'en-tête d'Objets › Volets : redessiné à chaque image d'une course, de n'importe quel volet. */
export function useCoursesVolets() {
  return useSyncExternalStore(ecouterTout, versionCourses, versionCourses);
}

/* Le sens que la course de `id` dessine maintenant, ou '' : pour un instantané qui ne change qu'avec lui. */
const sensDe = (id) => { const a = affichage(MAGASIN.lire(id).e, null, MAGASIN.maintenant()); return a.enCourse ? a.sens : ''; };

/**
 * Les volets de `ids` qui bougent À L'ÉCRAN — « En ce moment » de l'Accueil
 * (19/10) : `{ [id]: 'ouverture' | 'fermeture' }`. Chez lui, Home Assistant ne
 * dit jamais `opening` / `closing` : la ligne ne voyait pas un volet que sa
 * carte disait « En fermeture ». Chaque état de `S` est remis au magasin — la
 * bascule Netatmo se voit sans carte montée —, et seul un sens qui change
 * redessine, jamais une image de la course.
 */
export function useSensCourses(ids, S) {
  const cle = ids.join('|');
  const recu = useRef(S);
  useEffect(() => { recu.current = S; });
  const signe = ids.map(id => { const st = S && S[id]; return st ? st.state + (st.last_updated || '') : ''; }).join('|');
  useEffect(() => { cle.split('|').forEach(id => { if (id && recu.current) MAGASIN.voir(id, recu.current[id]); }); }, [cle, signe]);
  const lire = useCallback(() => cle.split('|').map(id => (id ? sensDe(id) : '')).join('|'), [cle]);
  const sens = useSyncExternalStore(ecouterTout, lire, lire).split('|');
  const out = {};
  ids.forEach((id, i) => { if (sens[i]) out[id] = sens[i]; });
  return out;
}
