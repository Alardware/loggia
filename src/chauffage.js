/* ── Le calcul du chauffage, sans React ni Home Assistant (chantier Chauffage, § 5.2) ──
 *
 * Le JUMEAU de `custom_components/loggia/chauffage_calcul.py` : mêmes
 * fonctions, mêmes résultats. L'écran s'en sert pour dessiner la barre du
 * planning et dire « jusqu'à 23:00, puis Éco » ; le serveur, pour décider.
 * Les deux ne doivent jamais diverger : `tests/fixtures/chauffage_parite.json`
 * est lue par les deux suites (tests/chauffage.test.mjs et
 * tests/python/test_chauffage_parite.py).
 *
 * Tout se calcule en HEURE MURALE — un jour (0 = lundi … 6 = dimanche) et une
 * minute dans la journée. Les instants et le changement d'heure appartiennent
 * au serveur.
 *
 * Pur : pas de React, pas de Home Assistant, testable à sec.
 */

export const MODES = ['confort', 'confort_1', 'confort_2', 'eco', 'hors_gel', 'arret'];
/* Du plus froid au plus chaud : la fenêtre ne fait que baisser. Exporté pour
 * un test : l'ordre de la carte (`ORDRE_MODES`, chauffageecran.js) doit rester
 * le même, sans que la carte importe ce calcul. */
export const FROID = ['arret', 'hors_gel', 'eco', 'confort_2', 'confort_1', 'confort'];
export const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const MINUTES_JOUR = 24 * 60;
const MAISONS = ['planning', 'absence', 'vacances', 'ete'];
const MAISON_DEFAUT = { absence: 'eco', vacances: 'hors_gel' };
/* Les seuls blancs admis autour (espace, tabulation, fins de ligne) sont DANS le
 * motif : `trim()` retire aussi le BOM et d'autres blancs que le serveur laisse,
 * et un `replace` de blancs serait quadratique sur une longue suite de blancs. */
const HEURE = /^[ \t\r\n]*([0-9]{1,2}):([0-9]{2})[ \t\r\n]*$/;

/** « 06:30 » -> 390 ; null si ce n'est pas une heure de 00:00 à 23:59. */
export function lireHeure(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = HEURE.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** 390 -> « 06:30 ». */
export function ecrireHeure(minute) {
  const t = ((Math.trunc(minute) % MINUTES_JOUR) + MINUTES_JOUR) % MINUTES_JOUR;
  const h = Math.floor(t / 60);
  const mi = t % 60;
  return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
}

/**
 * Les changements de la semaine, en minutes depuis lundi 00:00, triés ;
 * l'illisible est écarté, et à la même minute le DERNIER de la liste l'emporte.
 */
function changements(semaine) {
  if (!semaine || typeof semaine !== 'object' || Array.isArray(semaine)) return [];
  const vus = new Map();
  JOURS.forEach((nom, j) => {
    const liste = semaine[nom];
    if (!Array.isArray(liste)) return;
    for (const c of liste) {
      if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
      const minute = lireHeure(c.h);
      if (minute === null || !MODES.includes(c.mode)) continue;
      vus.set(j * MINUTES_JOUR + minute, c.mode);
    }
  });
  return [...vus].sort((a, b) => a[0] - b[0]);
}

/** Le changement en vigueur à (jour, minute) : [jour, minute, mode], ou null pour une semaine vide. */
export function changementEnCours(semaine, jour, minute) {
  const liste = changements(semaine);
  if (!liste.length) return null;
  const t = jour * MINUTES_JOUR + minute;
  let [w, mode] = liste[liste.length - 1];
  for (const [wc, mc] of liste) {
    if (wc > t) break;
    w = wc;
    mode = mc;
  }
  return [Math.floor(w / MINUTES_JOUR), w % MINUTES_JOUR, mode];
}

/** Le mode du créneau en cours, ou null pour une semaine vide. */
export function modePlanning(semaine, jour, minute) {
  const enCours = changementEnCours(semaine, jour, minute);
  return enCours ? enCours[2] : null;
}

/** Le prochain changement EFFECTIF strictement après (jour, minute) : [jour, minute, mode], ou null. */
export function prochainChangement(semaine, jour, minute) {
  const liste = changements(semaine);
  if (!liste.length) return null;
  const t = jour * MINUTES_JOUR + minute;
  const courant = modePlanning(semaine, jour, minute);
  const suite = liste.filter(([w]) => w > t).concat(liste.filter(([w]) => t >= w));
  for (const [w, m] of suite) {
    if (m !== courant) return [Math.floor(w / MINUTES_JOUR), w % MINUTES_JOUR, m];
  }
  return null;
}

function repriseActive(reprise) {
  if (!reprise || typeof reprise !== 'object' || Array.isArray(reprise)) return false;
  const reste = 'reste' in reprise ? reprise.reste : 0;
  if (reste === null) return true;
  return typeof reste === 'number' && reste > 0;
}

function modeMaison(maison) {
  const m = maison && typeof maison === 'object' ? maison.mode : null;
  return MAISONS.includes(m) ? m : 'planning';
}

function reglageMaison(maison, mode) {
  const m = maison && typeof maison === 'object' ? maison[mode] : null;
  return MODES.includes(m) ? m : MAISON_DEFAUT[mode];
}

/* Vacances : son réglage tel quel (la garde contre le gel). Absence : pour
 * BAISSER seulement (décision du 09/10) — jamais plus chaud que le planning,
 * et la suite du planning ramenée à son réglage. */
function maisonOuPlanning(semaine, maison, jour, minute) {
  const regime = modeMaison(maison);
  if (regime === 'ete') return { mode: 'arret', source: 'maison', fin: null, puis: null };
  if (regime === 'vacances') return { mode: reglageMaison(maison, regime), source: 'maison', fin: null, puis: null };
  const mode = modePlanning(semaine, jour, minute);
  const plafond = regime === 'absence' ? reglageMaison(maison, regime) : null;
  if (plafond !== null && (mode === null || FROID.indexOf(plafond) <= FROID.indexOf(mode))) {
    return { mode: plafond, source: 'maison', fin: null, puis: null };
  }
  const suivant = mode !== null ? prochainChangement(semaine, jour, minute) : null;
  if (suivant === null) return { mode, source: 'planning', fin: null, puis: null };
  const puis = plafond !== null && FROID.indexOf(plafond) < FROID.indexOf(suivant[2]) ? plafond : suivant[2];
  return { mode, source: 'planning', fin: [suivant[0], suivant[1]], puis };
}

/* La fin d'une reprise, [jour, minute] murale, ou null si elle est illisible :
 * deux entiers, un jour de 0 à 6, une minute de 0 à 1439. Un état abîmé ne
 * doit jamais faire lever le calcul. */
function finLisible(fin) {
  if (!Array.isArray(fin) || fin.length !== 2) return null;
  const [jour, minute] = fin;
  if (!Number.isInteger(jour) || !Number.isInteger(minute)) return null;
  if (jour < 0 || minute < 0) return null;
  if (jour >= JOURS.length || minute >= MINUTES_JOUR) return null;
  return [jour, minute];
}

/**
 * Ce que le chauffage doit faire à cette heure murale (§ 5.1) — la première
 * marche qui répond l'emporte : fenêtre (si elle baisse vraiment : à mode égal
 * elle se tait, une fenêtre qui ne coupe rien n'est pas une source), reprise
 * en main, mode de la maison, planning. Mêmes entrées et même sortie que
 * `mode_voulu` du serveur : { mode, source, fin, puis }.
 */
export function modeVoulu(semaine, maison, reprise, fenetre, jour, minute, reglageFenetre = 'arret') {
  let sansFenetre;
  if (repriseActive(reprise)) {
    const mode = MODES.includes(reprise.mode) ? reprise.mode : null;
    const fin = finLisible(reprise.fin);
    const puis = fin ? maisonOuPlanning(semaine, maison, fin[0], fin[1]).mode : null;
    sansFenetre = { mode, source: 'main', fin, puis };
  } else {
    sansFenetre = maisonOuPlanning(semaine, maison, jour, minute);
  }
  if (fenetre && (reglageFenetre === 'arret' || reglageFenetre === 'eco')) {
    if (sansFenetre.mode === null || FROID.indexOf(reglageFenetre) < FROID.indexOf(sansFenetre.mode)) {
      return { mode: reglageFenetre, source: 'fenetre', fin: null, puis: null };
    }
  }
  return sansFenetre;
}
