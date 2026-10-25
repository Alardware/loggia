/* ── Le planning des volets, sans React ni Home Assistant (chantier Volets, § 6.2) ──
 *
 * Le JUMEAU de `custom_components/loggia/volets_calcul.py` : mêmes fonctions,
 * mêmes résultats. L'onglet Planning de la fiche d'un volet s'en sert pour
 * redessiner la semaine dès qu'un réglage change, la démo pour tout ; la carte,
 * elle, lit `a_venir` dans l'état du serveur. Les deux ne doivent jamais
 * diverger : `tests/fixtures/volets_parite.json` est lue par les deux suites
 * (tests/voletsplanning.test.mjs et tests/python/test_volets_calcul.py).
 *
 * Les heures du soleil viennent du serveur (`soleil_jours`) : des instants ISO
 * à l'heure de la maison, à la seconde, avec leur décalage
 * (« 2026-10-12T07:47:12+02:00 »). On n'y ajoute que des minutes, en gardant ce
 * décalage : jamais de `Date` locale, qui parlerait le fuseau du navigateur.
 *
 * Il dit ce que fait le moteur : les jours propres d'un volet « Heures à lui »
 * remplacent ceux de la maison (vide : jamais), les autres suivent la maison ;
 * le décalage propre s'il y en a un, même sans `perso` ; `exclu` ne bouge jamais.
 * Le jour qui compte est celui de l'HEURE du mouvement.
 *
 * Pur : pas de React, pas de Home Assistant, testable à sec. Chargé à la
 * demande, avec la fiche : il n'entre pas dans le premier chargement.
 */

export const SENS = ['ouverture', 'fermeture'];
const SOURCES = { ouverture: 'lever', fermeture: 'coucher' };
const MODES = ['auto', 'nuit', 'manuel'];
const HORIZON_S = 7 * 24 * 3600;
const A_VENIR_MAX = 14;
const MS_JOUR = 24 * 3600 * 1000;
const PLUS = '+';
const MOINS = '-';

const INSTANT = /^([1-9][0-9]{3})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})([+-])([0-9]{2}):([0-9]{2})$/;
const DATE = /^([1-9][0-9]{3})-([0-9]{2})-([0-9]{2})$/;
/* Les seuls blancs admis autour d'un entier sont DANS le motif, comme côté
 * serveur : `trim()` retirerait d'autres blancs que Python laisse. Neuf
 * chiffres au plus, des deux côtés : au-delà, `Number` rendrait Infinity, et
 * Python lèverait sur plus de 4 300 chiffres. */
const ENTIER = /^[ \t\r\n]*([+-]?[0-9]{1,9})[ \t\r\n]*$/;

const deux = (n) => String(n).padStart(2, '0');

/* Une date du calendrier, lue comme de l'UTC : null si elle n'existe pas
 * (« 2026-02-30 »), comme `datetime` côté serveur. */
function murale(a, mo, j, h, mi, s) {
  const t = Date.UTC(a, mo - 1, j, h, mi, s);
  const d = new Date(t);
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== j) return null;
  return t;
}

/**
 * « 2026-10-12T07:47:12+02:00 » -> { mur, decalage } : l'heure murale lue
 * comme de l'UTC (en ms) et le décalage en minutes ; null si ce n'est pas un
 * instant écrit comme le serveur l'écrit.
 */
function lireInstant(texte) {
  if (typeof texte !== 'string') return null;
  const m = INSTANT.exec(texte);
  if (!m) return null;
  const [a, mo, j, h, mi, s, dh, dm] = [m[1], m[2], m[3], m[4], m[5], m[6], m[8], m[9]].map(Number);
  if (h > 23 || mi > 59 || s > 59 || dh > 23 || dm > 59) return null;
  const mur = murale(a, mo, j, h, mi, s);
  if (mur === null) return null;
  return { mur, decalage: (m[7] === '-' ? -1 : 1) * (dh * 60 + dm) + 0 };
}

/* « +02:00 », « -06:30 », « +00:00 » : le signe, les heures, les minutes. */
function ecrireDecalage(minutes) {
  const abs = Math.abs(minutes);
  return (minutes < 0 ? MOINS : PLUS) + deux(Math.floor(abs / 60)) + ':' + deux(abs % 60);
}

function ecrireInstant(mur, decalage) {
  const d = new Date(mur);
  return String(d.getUTCFullYear()).padStart(4, '0') + '-' + deux(d.getUTCMonth() + 1) + '-' + deux(d.getUTCDate())
    + 'T' + deux(d.getUTCHours()) + ':' + deux(d.getUTCMinutes()) + ':' + deux(d.getUTCSeconds())
    + ecrireDecalage(decalage);
}

/** L'instant en secondes depuis le 1er janvier 1970, ou null s'il est illisible. */
export function epoque(texte) {
  const lu = lireInstant(texte);
  return lu ? (lu.mur - lu.decalage * 60000) / 1000 : null;
}

/** « 2026-10-12 » -> l'instant de son minuit, lu comme de l'UTC (ms), ou null. */
function lireDate(texte) {
  if (typeof texte !== 'string') return null;
  const m = DATE.exec(texte);
  if (!m) return null;
  return murale(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, 0);
}

function ecrireDate(mur) {
  const d = new Date(mur);
  return String(d.getUTCFullYear()).padStart(4, '0') + '-' + deux(d.getUTCMonth() + 1) + '-' + deux(d.getUTCDate());
}

/* La vérité de Python, que le moteur applique : 0, '', [], {} et null sont
 * faux ; NaN est vrai. */
function vrai(x) {
  if (x === null || x === undefined || x === false || x === 0 || x === '') return false;
  if (Array.isArray(x)) return x.length > 0;
  if (typeof x === 'object') return Object.keys(x).length > 0;
  return true;
}

const objet = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/* Un entier comme l'écran l'écrit : un nombre (tronqué), un booléen, ou des
 * chiffres ASCII (neuf au plus) avec des blancs autour. `+ 0` : jamais de -0. */
function entier(valeur) {
  if (typeof valeur === 'boolean') return valeur ? 1 : 0;
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? Math.trunc(valeur) + 0 : null;
  if (typeof valeur === 'string') {
    const m = ENTIER.exec(valeur);
    return m ? Number(m[1]) + 0 : null;
  }
  return null;
}

/* L'instant plus des minutes, en gardant SON décalage ; null hors des années
 * 1 à 9999, comme `datetime` côté serveur. */
function ajouterMinutes(texte, minutes) {
  const lu = lireInstant(texte);
  if (!lu) return null;
  const mur = lu.mur + minutes * 60000;
  const an = new Date(mur).getUTCFullYear();
  if (!(an >= 1 && an <= 9999)) return null;
  return { mur, decalage: lu.decalage };
}

function reglageDe(plan, haid) {
  const parVolet = objet(plan) ? plan.volets : null;
  const reglage = objet(parVolet) ? parVolet[haid] : null;
  return objet(reglage) ? reglage : null;
}

/** « jamais » (exclu), « perso » (le drapeau, ou un décalage propre sans lui), sinon « comme ». */
export function regleDe(plan, haid) {
  const r = reglageDe(plan, haid);
  if (!r) return 'comme';
  if (vrai(r.exclu)) return 'jamais';
  if (vrai(r.perso) || (r.ouverture !== null && r.ouverture !== undefined)
    || (r.fermeture !== null && r.fermeture !== undefined)) return 'perso';
  return 'comme';
}

function modeBouge(mode, sens) {
  let m = typeof mode === 'string' && mode ? mode.toLowerCase() : 'auto';
  if (!MODES.includes(m)) m = 'auto';
  if (m === 'manuel') return false;
  if (m === 'nuit') return sens === 'fermeture';
  return true;
}

/* `jour in jours` de Python : un nombre ou un booléen égal au jour. Une liste
 * ABSENTE vaut tous les jours ; une liste VIDE, aucun (audit du 19/10 : c'est
 * ce que Paramètres affiche, et ce que `jours_propres` lisait déjà). */
function jourDeLaMaison(plan, jour) {
  const jours = objet(plan) ? plan.jours : null;
  if (!Array.isArray(jours)) return true;
  return jours.some(x => (typeof x === 'number' || typeof x === 'boolean') && Number(x) === jour);
}

function joursPropres(plan, haid, sens) {
  const r = reglageDe(plan, haid);
  const liste = r ? r['jours_' + sens] : null;
  if (!Array.isArray(liste)) return null;
  return new Set(liste.map(entier).filter(n => n !== null));
}

/** Le moteur commande-t-il ce volet dans ce sens le jour `jour` (0 = lundi) ? */
export function bouge(plan, haid, sens, jour) {
  if (!objet(plan) || !vrai(plan.actif)) return false;
  const regle = regleDe(plan, haid);
  if (!modeBouge(plan.mode, sens) || regle === 'jamais') return false;
  const propres = regle === 'perso' ? joursPropres(plan, haid, sens) : null;
  if (propres !== null) return propres.has(jour);
  return jourDeLaMaison(plan, jour);
}

/** Le décalage du mouvement, en minutes : le sien, sinon celui de la maison, sinon 0. */
export function decalageDe(plan, haid, sens) {
  const r = reglageDe(plan, haid);
  const brut = r ? r[sens] : null;
  const propre = brut !== null && brut !== undefined && brut !== '' ? entier(brut) : null;
  if (propre !== null) return propre;
  const section = objet(plan) ? plan[sens] : null;
  const general = objet(section) ? entier(section.decalage) : null;
  return general !== null ? general : 0;
}

function soleilParDate(soleilJours) {
  const table = new Map();
  if (!Array.isArray(soleilJours)) return table;
  for (const jour of soleilJours) {
    if (objet(jour) && lireDate(jour.date) !== null) table.set(jour.date, jour);
  }
  return table;
}

/* Le mouvement de ce volet, ce jour de soleil, dans ce sens : { t, quand, m }, ou null. */
function mouvement(plan, haid, jourSoleil, sens) {
  if (!objet(jourSoleil)) return null;
  const decalage = decalageDe(plan, haid, sens);
  const quand = ajouterMinutes(jourSoleil[SOURCES[sens]], decalage);
  if (!quand) return null;
  const jour = (new Date(quand.mur).getUTCDay() + 6) % 7;
  if (!bouge(plan, haid, sens, jour)) return null;
  return {
    t: (quand.mur - quand.decalage * 60000) / 1000,
    quand,
    m: { sens, heure: ecrireInstant(quand.mur, quand.decalage), source: SOURCES[sens], decalage },
  };
}

/**
 * Les mouvements de ce volet strictement APRÈS `maintenant` (ISO) et dans les
 * sept jours, du plus proche au plus lointain, quatorze au plus :
 * [{ sens, heure, source, decalage }]. `maintenant` illisible : aucun.
 */
export function aVenir(plan, haid, soleilJours, maintenant) {
  const t0 = epoque(maintenant);
  if (t0 === null) return [];
  const trouves = [];
  for (const jourSoleil of soleilParDate(soleilJours).values()) {
    SENS.forEach((sens, rang) => {
      const lu = mouvement(plan, haid, jourSoleil, sens);
      if (lu && lu.t > t0 && lu.t <= t0 + HORIZON_S) trouves.push({ t: lu.t, rang, m: lu.m });
    });
  }
  trouves.sort((a, b) => a.t - b.t || a.rang - b.rang);
  return trouves.slice(0, A_VENIR_MAX).map(x => x.m);
}

/**
 * Les sept jours à partir de `lundi` (« AAAA-MM-JJ »), passés compris :
 * [{ date, ouverture, fermeture }], chaque heure en « HH:MM » à l'horloge de la
 * maison, ou null. `lundi` illisible : [].
 */
export function semaine(plan, haid, soleilJours, lundi) {
  const debut = lireDate(lundi);
  if (debut === null) return [];
  if (new Date(debut + 6 * MS_JOUR).getUTCFullYear() > 9999) return [];
  const table = soleilParDate(soleilJours);
  const lignes = [];
  for (let i = 0; i < 7; i++) {
    const date = ecrireDate(debut + i * MS_JOUR);
    const ligne = { date };
    for (const sens of SENS) {
      const lu = mouvement(plan, haid, table.get(date), sens);
      const d = lu ? new Date(lu.quand.mur) : null;
      ligne[sens] = d ? deux(d.getUTCHours()) + ':' + deux(d.getUTCMinutes()) : null;
    }
    lignes.push(ligne);
  }
  return lignes;
}
