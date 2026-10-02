/* ── L'heure du rail de l'Accueil (ADR 0041) ─────────────────────────
 *
 * Un widget EN OPTION sur le côté de l'Accueil, en deux styles : « aiguilles »
 * (des aiguilles sur les chiffres) ou « tuiles » (heures · minutes · secondes).
 *
 * Ce fichier porte ce qui se calcule : les chiffres, les angles, le premier
 * jour de la semaine d'une langue, le prochain lever ou coucher. Pas de React,
 * pas de Home Assistant : le dashboard lui passe des dates et des objets déjà
 * lus, les tests aussi. Rien n'est inventé : un soleil sans date à venir ne
 * donne pas de tuile.
 *
 * Le widget « calendrier » a vécu ici jusqu'à la décision 0132 ; la semaine, la
 * grille du mois, l'heure d'un fuseau et le mot de l'agenda du jour sont partis
 * avec lui. `premierJourSemaine` reste : la fiche d'un robot s'en sert.
 */
import { tr } from './i18n.js';

/** Les sections du rail EN OPTION : la croix les retire, « Ajouter » les rend
 * (mode édition). Depuis le 19/09, elles sont là par défaut (App.jsx,
 * `ACC_AJOUTEES_DEFAUT`). */
/* Le calendrier a quitte cette liste le 02/10 : la carte Agenda disait la
 * meme semaine, en mieux. Son style « mois » et ses heures d'ailleurs sont
 * partis avec lui — ils ne vivaient que dans ce widget. */
export const WIDGETS_OPTION = ['heure', 'co2'];

/** Les styles de chaque widget ; le premier est celui d'un widget qu'on vient
 * d'ajouter, ou jamais réglé — l'heure en tuiles, comme la capture du 19/09. */
export const STYLES_WIDGETS = { heure: ['tuiles', 'aiguilles'] };

/** Le nom d'un style, tel que le bandeau d'outils de la section l'écrit. */
export const NOMS_STYLES = () => ({ aiguilles: tr('Aiguilles'), tuiles: tr('Tuiles') });

/** Le style choisi d'un widget ; un style inconnu (version future, faute de frappe) retombe sur le premier. */
export function styleDe(styles, id) {
  const connus = STYLES_WIDGETS[id] || [];
  const choisi = styles && typeof styles === 'object' ? styles[id] : null;
  return connus.indexOf(choisi) >= 0 ? choisi : (connus[0] || null);
}

const deux = (n) => String(n).padStart(2, '0');

/** Heures, minutes et secondes sur deux chiffres — l'heure de l'APPAREIL, comme partout dans Loggia. */
export function chiffresHeure(date) {
  const d = date instanceof Date ? date : new Date(date);
  return { h: deux(d.getHours()), m: deux(d.getMinutes()), s: deux(d.getSeconds()) };
}

/**
 * Les angles des trois aiguilles, en degrés depuis midi. L'aiguille des heures
 * avance avec les minutes, celle des minutes avec les secondes : à 18 h 30 la
 * petite est à mi-chemin entre 6 et 7, pas posée sur le 6.
 */
export function anglesAiguilles(date) {
  const d = date instanceof Date ? date : new Date(date);
  const h = d.getHours() % 12, m = d.getMinutes(), s = d.getSeconds();
  return { heures: h * 30 + m * 0.5, minutes: m * 6 + s * 0.1, secondes: s * 6 };
}

/**
 * Le premier jour de la semaine d'une langue : 1 = lundi … 7 = dimanche.
 * `Intl` le sait quand le moteur est récent ; sinon lundi, la règle d'ici.
 * `lire` s'injecte pour les tests : la réponse dépend du moteur, pas du code.
 */
export function premierJourSemaine(loc, lire = infosSemaine) {
  const n = lire(loc);
  return n >= 1 && n <= 7 ? n : 1;
}
function infosSemaine(loc) {
  try {
    const l = new Intl.Locale(loc);
    const w = typeof l.getWeekInfo === 'function' ? l.getWeekInfo() : l.weekInfo;
    return w && w.firstDay;
  } catch { return null; }
}

/**
 * Le prochain rendez-vous du soleil : le coucher s'il vient d'abord, sinon le
 * lever. Lu dans les attributs de `sun.sun` ; sans date lisible à venir, rien.
 */
export function prochainSoleil(soleil, maintenant) {
  const a = (soleil && soleil.attributes) || {};
  const t = maintenant instanceof Date ? maintenant.getTime() : Number(maintenant);
  const lever = Date.parse(a.next_rising || ''), coucher = Date.parse(a.next_setting || '');
  const aVenir = [['coucher', coucher], ['lever', lever]].filter(([, x]) => !isNaN(x) && x > t).sort((x, y) => x[1] - y[1]);
  if (!aVenir.length) return null;
  return { type: aVenir[0][0], date: new Date(aVenir[0][1]) };
}
