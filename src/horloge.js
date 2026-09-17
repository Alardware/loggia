/* ── L'heure et le calendrier du rail de l'Accueil (ADR 0041) ───────────────
 *
 * Deux widgets EN OPTION sur le côté de l'Accueil, chacun en deux styles :
 * l'heure (« aiguilles » : des aiguilles sur les chiffres, ou « tuiles » :
 * heures · minutes · secondes) et le calendrier (« semaine » : l'agenda du
 * jour, le soleil, la semaine ; ou « mois » : l'heure d'ici et d'ailleurs à
 * côté de la grille du mois).
 *
 * Ce fichier porte ce qui se calcule : les angles, la semaine, la grille du
 * mois, l'heure d'un fuseau, le prochain lever ou coucher, le mot de l'agenda
 * du jour. Pas de React, pas de Home Assistant : le dashboard lui passe des
 * dates et des objets déjà lus, les tests aussi. Rien n'est inventé : un
 * fuseau inconnu ne donne pas d'heure, un soleil sans date pas de tuile.
 */
import { tr } from './i18n.js';

/** Les sections du rail qui ne se montrent que si on les AJOUTE (mode édition). */
export const WIDGETS_OPTION = ['heure', 'calendrier'];

/** Les styles de chaque widget ; le premier est celui d'un widget qu'on vient d'ajouter. */
export const STYLES_WIDGETS = { heure: ['aiguilles', 'tuiles'], calendrier: ['semaine', 'mois'] };

/** Le nom d'un style, tel que le bandeau d'outils de la section l'écrit. */
export const NOMS_STYLES = () => ({ aiguilles: tr('Aiguilles'), tuiles: tr('Tuiles'), semaine: tr('Semaine'), mois: tr('Mois') });

/** Le style choisi d'un widget ; un style inconnu (version future, faute de frappe) retombe sur le premier. */
export function styleDe(styles, id) {
  const connus = STYLES_WIDGETS[id] || [];
  const choisi = styles && typeof styles === 'object' ? styles[id] : null;
  return connus.indexOf(choisi) >= 0 ? choisi : (connus[0] || null);
}

export const VILLES_MAX = 4;

/** Les villes d'un widget qu'on n'a jamais réglé : celles de la capture fournie le 17/09. */
export const villesDefaut = () => [
  { nom: tr('N. York'), fuseau: 'America/New_York' },
  { nom: tr('Tokyo'), fuseau: 'Asia/Tokyo' },
  { nom: tr('Londres'), fuseau: 'Europe/London' },
  { nom: tr('Sydney'), fuseau: 'Australia/Sydney' },
];

/**
 * Les villes à montrer. Jamais réglées (`null`) : les quatre de départ. Une
 * liste VIDE reste vide — on a le droit de n'en vouloir aucune. Une ligne sans
 * fuseau valable disparaît plutôt que d'afficher une heure fausse.
 */
export function villesDe(v) {
  if (!Array.isArray(v)) return villesDefaut();
  return v
    .filter(x => x && typeof x.fuseau === 'string' && fuseauValide(x.fuseau))
    .slice(0, VILLES_MAX)
    .map(x => ({ nom: String(x.nom || '').trim() || x.fuseau.split('/').pop().replace(/_/g, ' '), fuseau: x.fuseau }));
}

/** Un fuseau que `Intl` sait lire. */
export function fuseauValide(fuseau) {
  if (!fuseau || typeof fuseau !== 'string') return false;
  try { new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau }); return true; } catch { return false; }
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

/** L'heure qu'il est dans un fuseau, « 12:10 » ; `null` si le fuseau ne se lit pas. */
export function heureVille(date, fuseau, loc = 'fr-FR') {
  if (!fuseauValide(fuseau)) return null;
  const d = date instanceof Date ? date : new Date(date);
  try {
    const p = new Intl.DateTimeFormat(loc, { timeZone: fuseau, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    const v = (t) => (p.find(x => x.type === t) || {}).value;
    return deux(parseInt(v('hour'), 10) % 24) + ':' + deux(parseInt(v('minute'), 10));
  } catch { return null; }
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

const minuit = (date) => { const d = new Date(date instanceof Date ? date.getTime() : date); d.setHours(0, 0, 0, 0); return d; };
const plusJours = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const memeJour = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/* `getDay()` : 0 = dimanche … 6 = samedi ; `premier` : 1 = lundi … 7 = dimanche. */
const reculVersDebut = (d, premier) => (d.getDay() - (premier % 7) + 7) % 7;

/** Les sept jours de la semaine qui contient `date`, du premier jour de la langue au dernier. */
export function semaineDe(date, premier = 1) {
  const j = minuit(date);
  const debut = plusJours(j, -reculVersDebut(j, premier));
  return Array.from({ length: 7 }, (_, i) => { const d = plusJours(debut, i); return { date: d, aujourdhui: memeJour(d, j) }; });
}

/**
 * La grille du mois de `date` : des semaines entières, du premier jour de la
 * langue au dernier, complétées par les jours des mois voisins (`horsMois`).
 * Autant de rangées qu'il en faut — quatre à six —, jamais une rangée vide.
 */
export function grilleMois(date, premier = 1) {
  const j = minuit(date);
  const un = new Date(j.getFullYear(), j.getMonth(), 1);
  const fin = new Date(j.getFullYear(), j.getMonth() + 1, 0);
  const debut = plusJours(un, -reculVersDebut(un, premier));
  const semaines = [];
  for (let d = debut; d <= fin; d = plusJours(d, 7)) {
    semaines.push(Array.from({ length: 7 }, (_, i) => {
      const x = plusJours(d, i);
      return { date: x, horsMois: x.getMonth() !== j.getMonth(), aujourdhui: memeJour(x, j) };
    }));
  }
  return semaines;
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

/**
 * Ce que la tuile « Agenda » dit d'aujourd'hui, à partir des événements du jour
 * encore à venir (déjà triés) : rien, ou le prochain — et combien d'autres.
 */
export function resumeAgendaDuJour(evenementsDuJour) {
  const liste = Array.isArray(evenementsDuJour) ? evenementsDuJour : [];
  if (!liste.length) return { n: 0, prochain: null, autres: 0 };
  return { n: liste.length, prochain: liste[0], autres: liste.length - 1 };
}
