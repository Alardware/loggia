/* ── Le planning de chauffe dans la fiche : les aides pures (chantier Chauffage, plan 2) ──
 *
 * Ce que l'onglet Planning et l'Accueil de la fiche DESSINENT — et ce que
 * l'éditeur de la semaine ÉCRIT (tâche 9) — se calcule ici, sans React ni
 * Home Assistant : une valeur entre, une valeur sort
 * (tests/chauffageplanning.test.mjs). Ce module se charge AVEC la fiche
 * (fichechauffage.jsx, à la demande) : c'est lui qui fait atteindre le calcul
 * (`chauffage.js`, le jumeau de `chauffage_calcul.py`) par un écran. La carte,
 * elle, lit la journée que le serveur a déjà calculée (choix 4) : le paquet de
 * démarrage n'embarque pas ce calcul.
 *
 * Tout se compte en heure MURALE de la maison : un jour (0 = lundi …
 * 6 = dimanche), une minute dans la journée (0 … 1439) — sauf l'historique
 * (tâches 10 et 10 bis D), qui se lit en instants : les dernières 24 h, ou
 * les sept derniers jours.
 */
import { JOURS, FROID, lireHeure, ecrireHeure, changementEnCours, modeVoulu, modePlanning } from './chauffage.js';
import { modeDuModule, estMuet, enChauffe } from './chauffageecran.js';
import { deCelsius } from './unites.js';

/* Le jour d'une fin vit avec l'heure murale, et l'état muet d'un appareil,
 * dans `chauffageecran.js` : la carte, au démarrage, s'en sert aussi (tâche
 * 10 bis A). La fiche lit `estMuet` ici — et `finMurale`, qui dit le jour
 * d'une fin, là-bas (tâche 10 bis B) ; les tests lisent les deux ici. */
export { jourDeLaFin, estMuet } from './chauffageecran.js';

const MINUTES_JOUR = 24 * 60;
const JOUR_MS = 86400000;

/**
 * Les bandes de la semaine, une liste par jour du lundi au dimanche,
 * `[{ de, a, mode }]` en minutes murales, contiguës de 0 à 1440 : la journée
 * que le serveur donne à la carte (`_journee`, chauffage.py), pour les sept
 * jours. Les bornes : minuit et chaque changement du jour ; le mode d'une
 * bande est celui de son début, le mode de la maison appliqué (Été, Vacances,
 * Absence), sans reprise en main ni fenêtre ; deux bandes voisines du même
 * mode n'en font qu'une. Un jour sans changement reprend la fin de la veille
 * (la semaine boucle) ; une semaine sans aucun changement : sept listes vides.
 */
export function bandesSemaine(semaine, maison) {
  if (!changementEnCours(semaine, 0, 0)) return JOURS.map(() => []);
  return JOURS.map((nom, jour) => {
    const liste = Array.isArray(semaine[nom]) ? semaine[nom] : [];
    const bornes = new Set([0]);
    for (const c of liste) {
      const minute = c && typeof c === 'object' ? lireHeure(c.h) : null;
      if (minute !== null) bornes.add(minute);
    }
    const debuts = [...bornes].sort((x, y) => x - y);
    const bandes = [];
    debuts.forEach((de, i) => {
      const a = i + 1 < debuts.length ? debuts[i + 1] : MINUTES_JOUR;
      const mode = modeVoulu(semaine, maison, null, false, jour, de).mode;
      const avant = bandes[bandes.length - 1];
      if (avant && avant.mode === mode) avant.a = a;   // même mode : la bande d'avant s'allonge
      else bandes.push({ de, a, mode });
    });
    return bandes;
  });
}

/**
 * Le prochain changement de la semaine DESSINÉE (`bandesSemaine`, la maison
 * appliquée), strictement après (jour, minute) : `{ jour, minute, mode, dans }`
 * — `dans` compte les jours d'écart, 0 pour aujourd'hui, 7 pour le même jour
 * de la semaine suivante. Une bande voisine du même mode n'est pas un
 * changement (minuit entre deux soirées d'Éco). null quand plus rien ne
 * change : une semaine vide, la maison en Été ou en Vacances, un planning
 * d'un seul mode.
 */
export function prochainDeLaSemaine(bandes, jour, minute) {
  const du = (j) => (Array.isArray(bandes) && Array.isArray(bandes[j]) ? bandes[j] : []);
  const ici = du(jour).find(b => b && b.de <= minute && minute < b.a);
  if (!ici) return null;
  for (let dans = 0; dans <= 7; dans++) {
    const j = (jour + dans) % 7;
    for (const b of du(j)) {
      if (dans === 0 && b.de <= minute) continue;
      if (dans === 7 && b.de > minute) return null;   // le tour de la semaine est fait
      if (b.mode !== ici.mode) return { jour: j, minute: b.de, mode: b.mode, dans };
    }
  }
  return null;
}

/**
 * Les bandes de la semaine telles que l'appareil les RECEVRA (relecture de la
 * partie D, point 6) : chaque mode passé par `modeApplique` (le jumeau de
 * `mode_applicable`), puis deux bandes voisines devenues pareilles fondues en
 * une. Le prochain changement s'y cherche (`prochainDeLaSemaine`) : un module
 * sans Éco reçoit l'Éco de 19:00 en Hors-gel — le Hors-gel de 22:00 n'est
 * plus un changement.
 */
export function bandesAppliquees(bandes, ch) {
  return (Array.isArray(bandes) ? bandes : []).map(jour => (Array.isArray(jour) ? jour : []).reduce((sortie, b) => {
    const mode = modeApplique(ch, b.mode);
    const avant = sortie[sortie.length - 1];
    if (avant && avant.a === b.de && avant.mode === mode) avant.a = b.a;
    else sortie.push({ de: b.de, a: b.a, mode });
    return sortie;
  }, []));
}

/**
 * Les changements d'un jour (0 = lundi), dans l'ordre des heures :
 * `[{ h, mode, minute }]`. Ce qui ne se lit pas — une heure illisible, une
 * entrée abîmée — est écarté : le serveur ne l'aurait pas écrit, et l'écran
 * ne l'invente pas.
 */
export function changementsDuJour(semaine, jour) {
  const liste = semaine && typeof semaine === 'object' && Array.isArray(semaine[JOURS[jour]]) ? semaine[JOURS[jour]] : [];
  return liste
    .map(c => (c && typeof c === 'object' ? { h: c.h, mode: c.mode, minute: lireHeure(c.h) } : null))
    .filter(c => c && c.minute !== null)
    .sort((x, y) => x.minute - y.minute);
}

/* ════════════ La semaine type et l'éditeur (tâche 9) ════════════
 *
 * L'onglet Planning d'un administrateur ÉDITE la semaine. Chaque geste se
 * vérifie ici, sur place, avant de partir (choix 11) : une heure déjà prise
 * ce jour-là, un treizième changement, le dernier changement de la semaine
 * retiré ne partent pas — le serveur les refuserait (`valider_semaine`,
 * chauffage_config.py). Un geste rend une NOUVELLE semaine — les sept jours,
 * chacun trié par heure, l'heure au format du serveur —, ou `{ refus }` ; la
 * semaine reçue n'est jamais touchée. L'index d'un changement est sa place
 * dans son jour, dans l'ordre des heures : celle que `changementsDuJour` lui
 * donne, et l'écran avec lui.
 */

/** Douze changements par jour au plus, comme le serveur (MAX_CHANGEMENTS_JOUR, chauffage_config.py). */
export const MAX_CHANGEMENTS_JOUR = 12;

/* La semaine type du premier allumage (spec § 9.3) : du lundi au vendredi
 * Confort 06:30, Éco 08:30, Confort 18:00, Éco 22:30 ; le week-end Confort
 * 08:00, Éco 22:30. Une COPIE de SEMAINE_OUVREE et SEMAINE_REPOS
 * (chauffage_config.py), que tests/chauffageplanning.test.mjs tient égales en
 * lisant le fichier Python. Figées : `semaineType` en fait des copies. */
export const SEMAINE_OUVREE = Object.freeze([['06:30', 'confort'], ['08:30', 'eco'], ['18:00', 'confort'], ['22:30', 'eco']].map(c => Object.freeze(c)));
export const SEMAINE_REPOS = Object.freeze([['08:00', 'confort'], ['22:30', 'eco']].map(c => Object.freeze(c)));

/** La semaine type, une nouvelle à chaque appel : `{ lun: [{ h, mode }], … }`. */
export function semaineType() {
  return Object.fromEntries(JOURS.map(nom => [nom, (nom === 'sam' || nom === 'dim' ? SEMAINE_REPOS : SEMAINE_OUVREE).map(([h, mode]) => ({ h, mode }))]));
}

const jourValide = (j) => Number.isInteger(j) && j >= 0 && j < JOURS.length;

/* Un jour tel que l'éditeur l'écrit : ses changements lisibles, `{ h, mode }`,
 * l'heure au format du serveur (« 6:30 » devient « 06:30 »), dans l'ordre des
 * heures — l'ordre de `changementsDuJour`, celui de l'écran. */
const jourPropre = (semaine, jour) => changementsDuJour(semaine, jour).map(c => ({ h: ecrireHeure(c.minute), mode: c.mode }));

/**
 * La semaine telle que l'éditeur l'écrit : les sept jours et rien d'autre —
 * le serveur refuse un jour qu'il ne connaît pas —, chacun propre. Deux
 * semaines égales s'écrivent pareil : c'est aussi ce qui les compare.
 */
export function semainePropre(semaine) {
  return Object.fromEntries(JOURS.map((nom, j) => [nom, jourPropre(semaine, j)]));
}

const parHeure = (liste) => liste.slice().sort((x, y) => lireHeure(x.h) - lireHeure(y.h));
const nombreDeChangements = (propre) => JOURS.reduce((n, nom) => n + propre[nom].length, 0);
// Une semaine propre, son jour `jour` remplacé par `liste`, rangée par heure.
const avecJour = (propre, jour, liste) => ({ ...propre, [JOURS[jour]]: parHeure(liste) });
// Le changement `index` du jour, ou null : un jour ou un index qui ne désigne rien.
const ligneDe = (propre, jour, index) => (jourValide(jour) && Number.isInteger(index) && index >= 0 && index < propre[JOURS[jour]].length
  ? propre[JOURS[jour]][index] : null);
// Les modes que le chauffage comprend, du plus froid au plus chaud.
const compris = (modes) => FROID.filter(m => Array.isArray(modes) && modes.includes(m));

/**
 * L'heure d'un changement AJOUTÉ : la première heure pleine libre ce jour-là,
 * à partir de 08:00, puis depuis minuit — le modèle du distributeur
 * (`heureLibre`, fichedistributeur.jsx) : deux changements à la même heure ne
 * s'écrivent pas. `liste` : les changements du jour, `[{ h }]`. null si
 * aucune heure pleine n'est libre — un jour en a douze au plus, il en reste.
 */
export function heureLibre(liste) {
  const prises = new Set((Array.isArray(liste) ? liste : []).map(c => (c && typeof c === 'object' ? lireHeure(c.h) : null)));
  for (let i = 0; i < 24; i++) {
    const minute = ((8 + i) % 24) * 60;
    if (!prises.has(minute)) return ecrireHeure(minute);
  }
  return null;
}

/**
 * L'heure d'un changement AJOUTÉ depuis la fiche (son choix du 12/10,
 * « Toucher l’heure ») : le MILIEU du plus grand trou de la journée — de
 * minuit au premier changement, entre deux changements, du dernier à minuit —,
 * au quart d'heure ; à égalité, le premier trou. De là, ± 15 min et le champ
 * de l'heure le mènent où l'on veut. `liste` : les changements du jour, dans
 * l'ordre des heures (`changementsDuJour`). null s'il ne reste aucun quart
 * d'heure libre au milieu d'un trou — un jour en a douze au plus, il en reste.
 * `heureLibre` (la première heure pleine libre) ne change pas : elle reste
 * l'heure d'`ajouterChangement` quand on ne lui en donne pas.
 */
export function heureAuMilieu(liste) {
  const prises = (Array.isArray(liste) ? liste : []).map(c => (c && typeof c === 'object' ? lireHeure(c.h) : null)).filter(m => m !== null).sort((x, y) => x - y);
  const bornes = [...prises, MINUTES_JOUR];
  let de = 0, a = bornes[0];
  bornes.forEach((fin, i) => {
    const debut = i ? bornes[i - 1] : 0;
    if (fin - debut > a - de) { de = debut; a = fin; }
  });
  const minute = Math.round((de + a) / 2 / QUART) * QUART;
  return minute < MINUTES_JOUR && !prises.includes(minute) ? ecrireHeure(minute) : null;
}

/**
 * Le mode d'un changement ajouté à `hhmm` : celui qui CHANGE quelque chose à
 * cette heure. Le plus chaud que le chauffage comprend (le Confort), sauf si
 * la semaine y est déjà : alors l'Éco — ou, sans Éco plus froid, le mode
 * compris juste en dessous. null s'il n'en comprend aucun.
 */
export function modePropose(semaine, jour, hhmm, modes) {
  const liste = compris(modes);
  if (!liste.length) return null;
  const chaud = liste[liste.length - 1];
  const froid = liste.includes('eco') && chaud !== 'eco' ? 'eco' : liste[liste.length - 2] || chaud;
  const minute = lireHeure(hhmm);
  const enVigueur = minute === null || !jourValide(jour) ? null : modePlanning(semaine, jour, minute);
  return enVigueur === chaud ? froid : chaud;
}

/**
 * Un changement de plus le jour `jour` (0 = lundi), au mode `mode`, à l'heure
 * `hhmm` — sans elle, à la première heure libre (`heureLibre`).
 * `{ refus: 'douze' }` si le jour en a déjà douze : le serveur refuserait le
 * treizième ; `{ refus: 'heure_en_double' }` pour une heure prise,
 * `{ refus: 'heure_illisible' }` pour ce qui n'en est pas une.
 */
export function ajouterChangement(semaine, jour, mode, hhmm = null) {
  const propre = semainePropre(semaine);
  if (!jourValide(jour)) return propre;
  const liste = propre[JOURS[jour]];
  if (liste.length >= MAX_CHANGEMENTS_JOUR) return { refus: 'douze' };
  const voulue = hhmm === null ? null : lireHeure(hhmm);
  if (hhmm !== null && voulue === null) return { refus: 'heure_illisible' };
  const h = voulue === null ? heureLibre(liste) : ecrireHeure(voulue);
  if (h === null || liste.some(c => c.h === h)) return { refus: 'heure_en_double' };
  return avecJour(propre, jour, [...liste, { h, mode }]);
}

/**
 * Le changement `index` du jour, retiré. `{ refus: 'derniere' }` s'il était
 * le dernier de TOUTE la semaine : un planning garde toujours au moins un
 * changement (le serveur refuse une semaine vide). Un index qui ne désigne
 * rien : la semaine, inchangée.
 */
export function retirerChangement(semaine, jour, index) {
  const propre = semainePropre(semaine);
  if (!ligneDe(propre, jour, index)) return propre;
  const neuve = avecJour(propre, jour, propre[JOURS[jour]].filter((_, i) => i !== index));
  return nombreDeChangements(neuve) ? neuve : { refus: 'derniere' };
}

/**
 * L'heure du changement `index` du jour (« HH:MM »). `{ refus:
 * 'heure_illisible' }` pour ce qui n'est pas une heure de 00:00 à 23:59,
 * `{ refus: 'heure_en_double' }` pour une heure qu'un autre changement du
 * jour a déjà. Le jour se range de nouveau : le changement peut changer de
 * place.
 */
export function changerHeure(semaine, jour, index, hhmm) {
  const propre = semainePropre(semaine);
  if (!ligneDe(propre, jour, index)) return propre;
  const minute = lireHeure(hhmm);
  if (minute === null) return { refus: 'heure_illisible' };
  const liste = propre[JOURS[jour]];
  if (liste.some((c, i) => i !== index && lireHeure(c.h) === minute)) return { refus: 'heure_en_double' };
  return avecJour(propre, jour, liste.map((c, i) => (i === index ? { h: ecrireHeure(minute), mode: c.mode } : c)));
}

/** Le mode du changement `index` du jour. Un index qui ne désigne rien : la semaine, inchangée. */
export function changerMode(semaine, jour, index, mode) {
  const propre = semainePropre(semaine);
  if (!ligneDe(propre, jour, index)) return propre;
  return avecJour(propre, jour, propre[JOURS[jour]].map((c, i) => (i === index ? { h: c.h, mode } : c)));
}

/**
 * La semaine où chacun des `jours` (0 = lundi) reçoit une copie des
 * changements de `jour` — « Copier cette journée sur » : du lundi au
 * vendredi, ou toute la semaine. Une copie qui viderait la semaine entière
 * (un jour vide copié partout) : `{ refus: 'derniere' }`.
 */
export function copierJour(semaine, jour, jours) {
  const propre = semainePropre(semaine);
  if (!jourValide(jour)) return propre;
  const source = propre[JOURS[jour]];
  const neuve = { ...propre };
  for (const j of Array.isArray(jours) ? jours : []) {
    if (jourValide(j)) neuve[JOURS[j]] = source.map(c => ({ ...c }));
  }
  return nombreDeChangements(neuve) ? neuve : { refus: 'derniere' };
}

/**
 * Les changements d'un jour pour un chauffage qui ne comprend pas tous les
 * modes (choix 11) : chaque mode qu'il ne comprend pas devient le plus proche
 * qu'il comprend SANS être plus chaud — on ne chauffe jamais plus par une
 * copie —, à défaut le plus froid qu'il comprend. Les heures ne bougent pas.
 * Sans aucun mode compris, rien à quoi s'adapter : les changements tels quels.
 */
export function adapterAuxModes(liste, modes) {
  const ok = compris(modes);
  return (Array.isArray(liste) ? liste : []).filter(c => c && typeof c === 'object').map(c => {
    if (!ok.length || ok.includes(c.mode)) return { h: c.h, mode: c.mode };
    const rang = FROID.indexOf(c.mode);
    const plusFroids = rang < 0 ? [] : ok.filter(m => FROID.indexOf(m) < rang);
    return { h: c.h, mode: plusFroids.length ? plusFroids[plusFroids.length - 1] : ok[0] };
  });
}

/** Une semaine entière pour un chauffage qui ne comprend pas tous les modes,
 * jour par jour (`adapterAuxModes`) : toute semaine que la fiche envoie, et
 * la semaine type de « Créer un planning ». */
export function semaineAdaptee(semaine, modes) {
  const propre = semainePropre(semaine);
  return Object.fromEntries(JOURS.map(nom => [nom, adapterAuxModes(propre[nom], modes)]));
}

const QUART = 15;   // minutes

/**
 * L'heure du changement `index` d'un jour, un quart d'heure plus tôt (`sens`
 * < 0) ou plus tard (> 0) — « − 15 min » et « + 15 min » de sa rangée
 * dépliée (tâche 10 bis C, cadre 3c) : « HH:MM », ou null quand elle
 * toucherait un voisin ou sortirait de la journée (00:00 à 23:59) ; le bouton
 * est alors inerte. Un changement ne passe donc jamais par-dessus un autre :
 * il garde sa place, et sa rangée reste dépliée. `liste` : les changements du
 * jour dans l'ordre des heures (`changementsDuJour`).
 */
export function heureDecalee(liste, index, sens) {
  const s = Math.sign(sens);
  const c = Array.isArray(liste) && Number.isInteger(index) ? liste[index] : null;
  if (!s || !c || !Number.isFinite(c.minute)) return null;
  const minute = c.minute + s * QUART;
  if (minute < 0 || minute >= MINUTES_JOUR) return null;
  const voisin = liste[index + s];
  if (voisin && (s < 0 ? minute <= voisin.minute : minute >= voisin.minute)) return null;
  return ecrireHeure(minute);
}

/* ════════════ Ce que l'appareil dit (tâches 8 et 10) ════════════
 *
 * Les lectures de l'appareil que le serveur fait aussi (chauffage_familles.py),
 * pour l'Accueil de la fiche comme pour son historique. */

// Un nombre fini, ou null : un texte n'en est pas un (`_nombre`, chauffage_familles.py).
const nombreFini = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// Les modes `hvac` qui chauffent, dans l'ordre de préférence (CHAUFFE, chauffage_familles.py).
const CHAUFFE = ['heat', 'heat_cool', 'auto'];

/** Le préréglage d'un VTherm pour chaque mode (PRESETS_VTHERM, chauffage_familles.py) : ni Confort −1 ni −2. */
export const PRESETS_VTHERM = Object.freeze({ confort: 'comfort', eco: 'eco', hors_gel: 'frost' });

/** Les modes `hvac` qu'un `climate` publie, l'illisible écarté. */
export const modesHvac = (a) => (Array.isArray(a && a.hvac_modes) ? a.hvac_modes.filter(m => typeof m === 'string' && m) : []);

/** Le mode `hvac` qui chauffe (`mode_chauffe`) : heat, sinon heat_cool, sinon auto ; null s'il n'en a aucun. */
export const modeDeChauffe = (a) => CHAUFFE.find(m => modesHvac(a).includes(m)) || null;

/* ════════════ Le mode qui sera APPLIQUÉ (relecture de la partie B, point d) ════════════ */

/** Un mode que le chauffage ne comprend pas : le plus proche qu'il comprend,
 * dans cet ordre — la copie de REPLIS (chauffage_familles.py), que
 * tests/chauffageplanning.test.mjs tient égale en lisant le fichier Python. La
 * démo garde son jumeau (`REPLIS_CHA`) : elle n'importe pas ce module, qui
 * tirerait celui de la fiche à côté du démarrage (demo.js le dit). */
export const REPLIS = Object.freeze({
  confort: Object.freeze([]), confort_1: Object.freeze(['confort']), confort_2: Object.freeze(['confort_1', 'confort']),
  eco: Object.freeze(['hors_gel']), hors_gel: Object.freeze(['eco']), arret: Object.freeze(['hors_gel', 'eco']),
});

/** Le jumeau de `mode_applicable` (chauffage_familles.py) : le mode lui-même
 * s'il est compris (`permis`), sinon son premier repli compris ; null sinon. */
export function modeApplicable(mode, permis) {
  const p = Array.isArray(permis) ? permis : [];
  if (p.includes(mode)) return mode;
  const replis = Object.prototype.hasOwnProperty.call(REPLIS, mode) ? REPLIS[mode] : [];
  return replis.find(r => p.includes(r)) || null;
}

/**
 * Le mode que CE chauffage recevra pour `mode` — ce que le moteur appliquera
 * (`applique`, chauffage.py) : un module sans Éco reçoit son Hors-gel, un
 * thermostat sans `off` son Hors-gel pour l'Arrêt. Ses modes sont ceux que le
 * serveur lui reconnaît (`ch.modes`, `modes_permis(famille, attributs)` : la
 * famille y est déjà). Sans modes connus — un serveur d'avant, un chauffage
 * sans état —, le mode voulu, comme `applique || mode`.
 */
export function modeApplique(ch, mode) {
  const permis = ch && Array.isArray(ch.modes) && ch.modes.length ? ch.modes : null;
  return permis ? modeApplicable(mode, permis) : mode;
}

/* ════════════ Les températures des modes d'un thermostat (tâche 10) ════════════
 *
 * Le serveur les garde en °C (ADR 0128), de 5 à 30, au demi-degré, et dans
 * l'ordre du froid au chaud : Hors-gel sous l'Éco, l'Éco au plus le Confort
 * (`valider_temperatures`, chauffage_config.py). Confort −1 et −2 s'en
 * déduisent, sans jamais passer sous l'Éco (`temperature_du_mode`). */

/** Les consignes par défaut, en °C : la copie de TEMPERATURES_DEFAUT
 * (chauffage_familles.py), que tests/chauffageplanning.test.mjs tient égale
 * en lisant le fichier Python. */
export const TEMPERATURES_DEFAUT = Object.freeze({ confort: 20, eco: 17, hors_gel: 7 });
// Les bornes d'une consigne, en °C (TEMPERATURE_MIN, TEMPERATURE_MAX, chauffage_config.py).
const TEMPERATURE_MIN = 5;
const TEMPERATURE_MAX = 30;
const REGLEES = ['confort', 'eco', 'hors_gel'];

/** Les trois consignes, en °C : celles que la configuration garde, le défaut
 * de ce qui manque ou ne se lit pas — comme le moteur les lit. */
export function temperaturesDe(temperatures) {
  const t = { ...TEMPERATURES_DEFAUT };
  for (const cle of REGLEES) {
    const v = temperatures && typeof temperatures === 'object' ? nombreFini(temperatures[cle]) : null;
    if (v !== null) t[cle] = v;
  }
  return t;
}

/** La consigne d'un mode, en °C : Confort −1 et −2 se déduisent du Confort,
 * jamais sous l'Éco. null pour l'Arrêt ou un mode inconnu. */
export function temperatureDuMode(mode, temperatures) {
  const t = temperaturesDe(temperatures);
  if (REGLEES.includes(mode)) return t[mode];
  if (mode === 'confort_1') return Math.max(t.confort - 1, t.eco);
  if (mode === 'confort_2') return Math.max(t.confort - 2, t.eco);
  return null;
}

/* Une consigne sur la grille du demi-degré, comme le serveur la range
 * (`round(v * 2) / 2`) : le `round` de Python arrondit une moitié au PAIR —
 * 16,25 donne 16, 16,75 donne 17 —, là où `Math.round` monterait toujours. */
function auDemi(v) {
  const x = v * 2, bas = Math.floor(x), reste = x - bas;
  return (reste > 0.5 ? bas + 1 : reste < 0.5 ? bas : bas % 2 === 0 ? bas : bas + 1) / 2;
}

/**
 * Un cran sur la consigne d'un mode — `cle` : confort, eco ou hors_gel —, un
 * demi-degré plus chaud (`sens` > 0) ou plus froid : les TROIS consignes, en
 * °C, telles qu'elles partent ensemble. Vérifié ici comme le serveur le
 * ferait (`valider_temperatures`) : les trois d'abord rangées sur la grille du
 * demi-degré — une consigne venue d'ailleurs (16,8) s'y range avant que
 * l'ordre se juge, relecture de la tâche 10 —, puis `{ refus: 'bornes' }`
 * hors de 5 à 30 °C, `{ refus: 'desordre' }` si l'ordre ne tient plus — et
 * rien ne part. null pour une clé inconnue ou un sens nul.
 */
export function pasTemperature(temperatures, cle, sens) {
  const s = Math.sign(sens);
  if (!s || !REGLEES.includes(cle)) return null;
  const lues = temperaturesDe(temperatures);
  const t = Object.fromEntries(REGLEES.map(k => [k, auDemi(lues[k])]));
  const v = t[cle] + s * 0.5;
  if (v < TEMPERATURE_MIN || v > TEMPERATURE_MAX) return { refus: 'bornes' };
  const neuves = { ...t, [cle]: v };
  return neuves.hors_gel < neuves.eco && neuves.eco <= neuves.confort ? neuves : { refus: 'desordre' };
}

/* Le pas d'une consigne dans l'unité de l'appareil : celui qu'il publie
 * (`target_temp_step`), sinon 1 °F ou 0,5 °C (`pas_de_consigne`). */
function pasDe(attributs, unite) {
  const publie = nombreFini(attributs && attributs.target_temp_step);
  return publie !== null && publie > 0 ? publie : unite === 'F' ? 1 : 0.5;
}

/**
 * La consigne qu'un mode envoie à un thermostat, dans l'unité de la maison
 * (celle des services `climate`) : au pas de l'appareil, chaque demi vers le
 * haut, puis dans ses bornes (`min_temp`, `max_temp`) — `consigne_en_unite`
 * (chauffage_familles.py). null sans consigne lisible.
 */
export function consigneEnUnite(celsius, attributs, unite) {
  if (nombreFini(celsius) === null) return null;
  const a = attributs || {};
  const pas = pasDe(a, unite);
  let v = Math.floor(deCelsius(celsius, unite) / pas + 0.5) * pas;
  const bas = nombreFini(a.min_temp), haut = nombreFini(a.max_temp);
  if (bas !== null) v = Math.max(v, bas);
  if (haut !== null) v = Math.min(v, haut);
  return Math.round(v * 1e4) / 1e4;
}

/**
 * La plage d'un `climate` en `heat_cool` (`target_temp_low`,
 * `target_temp_high`) après un appui sur − ou + de l'une de ses bornes
 * (`bord` : 'bas' ou 'haut') : d'un pas de l'appareil, sur la grille de ce
 * pas, dans ses bornes, la basse toujours d'un pas au moins sous la haute —
 * Home Assistant refuse une basse au-dessus de la haute. `{ bas, haut }` dans
 * l'unité de l'appareil, les deux, qui partent ensemble ; null si rien ne
 * bouge.
 */
export function plageVoisine(plage, bord, sens, attributs, unite) {
  const s = Math.sign(sens);
  if (!plage || !s || (bord !== 'bas' && bord !== 'haut')) return null;
  const a = attributs || {};
  const pas = pasDe(a, unite);
  const grille = (v) => Math.round(Math.round(v / pas) * pas * 1e4) / 1e4;
  const min = nombreFini(a.min_temp), max = nombreFini(a.max_temp);
  const v = grille(plage[bord] + s * pas);
  if (bord === 'bas' ? (min !== null && v < min) || v > plage.haut - pas + 1e-9 : (max !== null && v > max) || v < plage.bas + pas - 1e-9) return null;
  return { ...plage, [bord]: v };
}

/* ════════════ Ce que l'historique dit (tâches 10 et 10 bis D) ════════════
 *
 * L'onglet Historique (cadre 3d de sa maquette) se lit dans l'historique de
 * Home Assistant (`history/period`), sur 24 h ou sur 7 jours. Deux règles
 * pour tout ce qui suit :
 *  - l'état VIVANT de l'entité (`hass.states`, avec son `last_updated`) est
 *    le dernier point : le recorder écrit par lots — la requête partie au
 *    changement ne le contenait souvent pas, et la bande restait sur l'ancien
 *    mode (relecture de la tâche 10) ;
 *  - rien ne s'invente (ADR 0030) : un état muet, une valeur illisible,
 *    l'avant de la première entrée sont des TROUS, jamais une valeur. */

const MAIN = 'main';
const QUART_DE_DEGRE = 0.25;   // °C
const PAR_CONSIGNE = ['confort', 'eco', 'hors_gel', 'confort_1', 'confort_2'];

// L'instant d'une entrée : `last_updated` d'abord — un préréglage, une consigne changent sans changer l'état.
const instantDe = (e) => Date.parse(e.last_updated || e.last_changed);
const DATEES = Symbol('datées');

/**
 * Un historique DATÉ ET RANGÉ une fois pour toutes : `{ liste: [{ e, t }] }`,
 * par instant — le tri est tenu : rien ne garantit l'ordre d'une liste reçue
 * —, l'illisible écarté. La fiche le fait UNE fois par réponse (`useMemo`,
 * relecture de la partie D) : sept jours d'un `climate` — chaque changement
 * d'attribut, jusqu'à des dizaines de milliers de lignes — ne se relisent ni
 * ne se rangent plus à chaque calcul. Les lectures de l'historique qui
 * suivent prennent cette liste-ci ou une liste brute, au même résultat. null
 * pour ce qui n'est pas une liste : pas encore lu, ou illisible.
 */
export function dater(points) {
  if (!Array.isArray(points)) return null;
  const liste = points.filter(e => e && typeof e === 'object').map(e => ({ e, t: instantDe(e) })).filter(x => Number.isFinite(x.t)).sort((x, y) => x.t - y.t);
  return Object.freeze({ [DATEES]: true, liste });
}
const estDatee = (p) => !!(p && typeof p === 'object' && p[DATEES]);

/**
 * L'écart entre le capteur d'un thermostat et la pièce (30/10) : la MÉDIANE de
 * « ce que lit l'appareil − ce que lit la pièce », dans l'unité de la maison.
 * `appareil` : l'historique du `climate` (sa `current_temperature`) ; `piece` :
 * celui de la sonde, son état — ou son `attribut`. Chaque relevé de l'appareil
 * se rapproche de la dernière mesure de la pièce d'au plus 30 min ; une lecture
 * de 0 ou moins est une trame fausse (un MCZ qui se reconnecte), écartée.
 * Chez lui, sept jours de son poêle donnaient −1,48 (842 relevés). `{ ecart, n }`,
 * l'écart au demi-degré ; null sous 48 relevés : pas de quoi proposer.
 */
export function ecartMesure(appareil, piece, attribut = null) {
  const A = (dater(appareil) || { liste: [] }).liste;
  const P = (dater(piece) || { liste: [] }).liste
    .map(x => ({ t: x.t, v: Number(attribut ? (x.e.attributes || {})[attribut] : x.e.state) }))
    .filter(x => Number.isFinite(x.v));
  const ecarts = [];
  let j = -1;
  for (const x of A) {
    const v = Number((x.e.attributes || {}).current_temperature);
    if (!Number.isFinite(v) || v <= 0) continue;
    while (j + 1 < P.length && P[j + 1].t <= x.t) j++;
    if (j < 0 || x.t - P[j].t > 30 * 60000) continue;
    ecarts.push(v - P[j].v);
  }
  if (ecarts.length < 48) return null;
  ecarts.sort((a, b) => a - b);
  const k = ecarts.length >> 1;
  const m = ecarts.length % 2 ? ecarts[k] : (ecarts[k - 1] + ecarts[k]) / 2;
  return { ecart: Math.round(m * 2) / 2 || 0, n: ecarts.length };
}
// Un historique lu : une liste brute, ou datée.
const estHistorique = (p) => Array.isArray(p) || estDatee(p);

/* Les entrées rangées (`dater`), et l'état vivant à sa place — presque
 * toujours au bout : il est le plus récent —, ramené à `fin` s'il est daté
 * d'après (une horloge en avance), après les entrées de son instant, comme un
 * tri stable l'aurait rangé. Sans recopier la liste quand il va au bout (des
 * dizaines de milliers de lignes) : `{ n, at(k) }`, `at(k)` : `{ e, t }`. */
function rangees(points, vivant, fin) {
  const base = estDatee(points) ? points.liste : (dater(points) || { liste: [] }).liste;
  const tv = vivant && typeof vivant === 'object' ? Math.min(instantDe(vivant), fin) : NaN;
  if (!Number.isFinite(tv)) return { n: base.length, at: (k) => base[k] };
  const dernier = { e: vivant, t: tv };
  if (!base.length || base[base.length - 1].t <= tv) return { n: base.length + 1, at: (k) => (k < base.length ? base[k] : dernier) };
  let i = base.length;
  while (i > 0 && base[i - 1].t > tv) i--;
  const liste = [...base.slice(0, i), dernier, ...base.slice(i)];
  return { n: liste.length, at: (k) => liste[k] };
}

/* Les bandes d'une valeur sur la période — de son début (0) à « maintenant »
 * (1440 × `jours`), en minutes au millième : `[{ de, a, valeur }]`. `lire(e)`
 * dit la valeur d'une entrée ; null est un trou. Deux bandes voisines de la
 * même valeur n'en font qu'une ; une entrée de largeur nulle (avant la
 * période) ne se lit même pas. Rien sans historique (`points` ni liste ni
 * liste datée : pas encore lu, illisible) — l'état vivant seul n'invente pas
 * la période. */
function bandesDeLaPeriode(points, maintenant, vivant, jours, lire) {
  const fin = Number(maintenant);
  const n = Number(jours);
  if (!estHistorique(points) || !Number.isFinite(fin) || !(n > 0)) return [];
  const debut = fin - n * JOUR_MS;
  const r = rangees(points, vivant, fin);
  // En minutes depuis le début de la période, au millième : bornées à la période.
  const minute = (t) => Math.round((Math.min(Math.max(t, debut), fin) - debut) / 60) / 1000;
  const bandes = [];
  let a = r.n ? minute(r.at(0).t) : 0;
  for (let k = 0; k < r.n; k++) {
    const de = a;   // la fin de la bande d'avant
    a = minute(k + 1 < r.n ? r.at(k + 1).t : fin);
    if (a <= de) continue;
    const valeur = lire(r.at(k).e);
    if (valeur === null) continue;
    const avant = bandes[bandes.length - 1];
    if (avant && avant.a === de && avant.valeur === valeur) avant.a = a;   // la même valeur : la bande s'allonge
    else bandes.push({ de, a, valeur });
  }
  return bandes;
}

/* Les attributs FIXES d'un `climate`, que Home Assistant n'enregistre pas
 * dans l'historique (`_entity_component_unrecorded_attributes`) — sans eux,
 * un point ne dit ni le mode qui chauffe, ni le pas, ni les bornes : une clim
 * en `cool` se lisait « Confort », un thermostat sur son propre programme
 * « Éco », un poêle au degré ou un Hors-gel sous `min_temp` « à la main »
 * (relecture de la tâche 10). Ils se reprennent de l'état VIVANT — ces
 * quatre-là seulement : une `temperature` vivante deviendrait la consigne
 * d'un point qui n'en a pas. */
const FIXES = ['hvac_modes', 'target_temp_step', 'min_temp', 'max_temp'];
function attributsFixes(vivant) {
  const a = vivant && typeof vivant === 'object' && vivant.attributes && typeof vivant.attributes === 'object' ? vivant.attributes : {};
  return Object.fromEntries(FIXES.filter(k => a[k] !== undefined).map(k => [k, a[k]]));
}

/* Les modes réellement appliqués (tâche 10, choix 13) — ce que l'APPAREIL a
 * fait, pas ce que le planning voulait : une fenêtre, une reprise en main, un
 * geste fait ailleurs s'y voient :
 *  - un fil pilote, par l'option de son module (`options` de l'état, lue à
 *    l'envers) ;
 *  - un VTherm, par son préréglage — comfort, eco, frost — ; `off`, l'Arrêt ;
 *  - un thermostat : `off`, l'Arrêt ; dans son mode qui chauffe, le mode dont
 *    la consigne est la sienne, à 0,25 °C près — celle que le moteur lui
 *    enverrait, au pas de l'appareil et dans ses bornes (`consigneEnUnite`) ;
 *    le Confort, l'Éco et le Hors-gel d'abord, leurs déductions ensuite ;
 *  - sinon « à la main » : un état lisible qui ne dit aucun mode du planning
 *    (une consigne posée ailleurs, un autre préréglage, un autre mode).
 * Un état muet (indisponible, inconnu) ne dessine rien : un trou. */

/* Le mode qu'une entrée de l'historique dit appliqué : un mode du planning,
 * MAIN pour « à la main », null pour un état muet ou une famille inconnue.
 * `fixes` : les attributs fixes de l'état vivant, sous ceux de l'entrée. */
function modeLu(e, ch, unite, fixes) {
  const etat = e.state == null ? '' : String(e.state);
  if (estMuet(etat)) return null;
  if (ch.famille === 'fil_pilote') return modeDuModule(ch.options, etat) || MAIN;
  if (ch.famille !== 'vtherm' && ch.famille !== 'thermostat') return null;
  if (etat === 'off') return 'arret';
  const propres = e.attributes && typeof e.attributes === 'object' ? e.attributes : {};
  if (ch.famille === 'vtherm') return REGLEES.find(m => PRESETS_VTHERM[m] === propres.preset_mode) || MAIN;
  const a = { ...fixes, ...propres };
  const chauffe = modeDeChauffe(a);
  const consigne = nombreFini(a.temperature);
  if ((chauffe && etat !== chauffe) || consigne === null) return MAIN;
  const permis = Array.isArray(ch.modes) && ch.modes.length ? ch.modes : PAR_CONSIGNE;
  const ecart = (unite === 'F' ? QUART_DE_DEGRE * 9 / 5 : QUART_DE_DEGRE) + 1e-9;
  return PAR_CONSIGNE.find(m => permis.includes(m) && Math.abs(consigne - consigneEnUnite(temperatureDuMode(m, ch.temperatures), a, unite)) <= ecart) || MAIN;
}

/**
 * Les modes que l'appareil a réellement appliqués sur la période : `[{ de,
 * a, mode }]` en minutes depuis son début (0) jusqu'à « maintenant » (1440 ×
 * `jours` : 1 ou 7) — la bande de 6 px sous la courbe (cadre 3d). « À la
 * main » : `{ de, a, mode: null, main: true }`, que la bande hachure. Deux
 * bandes voisines du même mode n'en font qu'une ; un état muet laisse un trou.
 * `points` : l'historique de l'appareil, `[{ state, attributes, last_changed,
 * last_updated }]`, dans n'importe quel ordre ; `ch` : le chauffage de
 * l'état ; `maintenant` : l'instant du navigateur ; `unite` : celle de la
 * maison ('C' ou 'F'), dans laquelle Home Assistant publie la consigne d'un
 * thermostat ; `vivant` : l'état vivant de l'appareil — son dernier point, et
 * ses quatre attributs fixes sous chaque point.
 */
export function modesAppliques(points, ch, maintenant, unite = 'C', { vivant = null, jours = 1 } = {}) {
  if (!ch || typeof ch !== 'object') return [];
  const fixes = attributsFixes(vivant);
  return bandesDeLaPeriode(points, maintenant, vivant, jours, (e) => modeLu(e, ch, unite, fixes))
    .map(b => (b.valeur === MAIN ? { de: b.de, a: b.a, mode: null, main: true } : { de: b.de, a: b.a, mode: b.valeur }));
}

/**
 * La CHAUFFE d'un thermostat sur la période (cadre 3d) : `[{ de, a, chauffe }]`
 * en minutes depuis son début. LA règle des cartes (`enChauffe`) : en marche,
 * `hvac_action` à `heating` — ou `preheating`, préchauffer c'est chauffer — ;
 * `off`, il ne chauffe pas. Un état muet, ou un appareil qui ne dit pas ce
 * qu'il fait (`hvac_action` absent), laisse un trou : on ne sait pas, on ne
 * l'invente pas. `vivant` : son état vivant, le dernier point.
 */
export function chauffeAppliquee(points, maintenant, { vivant = null, jours = 1 } = {}) {
  return bandesDeLaPeriode(points, maintenant, vivant, jours, (e) => {
    const etat = e.state == null ? '' : String(e.state);
    if (estMuet(etat)) return null;
    if (etat === 'off') return false;
    const action = actionDe(e);
    return action ? enChauffe({ famille: 'thermostat', marche: true, action }) : null;
  }).map(b => ({ de: b.de, a: b.a, chauffe: b.valeur }));
}

// Ce qu'une entrée dit faire (`hvac_action`), ou null.
const actionDe = (e) => { const a = e.attributes && typeof e.attributes === 'object' ? e.attributes.hvac_action : null; return typeof a === 'string' && a ? a : null; };

/**
 * L'appareil a-t-il dit ce qu'il faisait (`hvac_action`) au moins UNE fois
 * sur la période (relecture de la partie D, point 7) ? Un thermostat qui ne le
 * publie pas n'a pas de temps de chauffe : ses arrêts se compteraient seuls,
 * et « Chauffe 0 min » serait inventé.
 */
export function actionDite(points, maintenant, { vivant = null, jours = 1 } = {}) {
  const fin = Number(maintenant);
  if (!estHistorique(points) || !Number.isFinite(fin) || !(Number(jours) > 0)) return false;
  const debut = fin - Number(jours) * JOUR_MS;
  const r = rangees(points, vivant, fin);
  // Du plus récent au plus ancien : la première entrée qui le dit, et qui compte sur la période, suffit.
  for (let k = r.n - 1; k >= 0; k--) {
    const jusqua = Math.min(k + 1 < r.n ? r.at(k + 1).t : fin, fin);
    if (jusqua <= debut) return false;   // tout ce qui précède finit avant la période
    if (jusqua > Math.max(r.at(k).t, debut) && actionDe(r.at(k).e)) return true;
  }
  return false;
}

/* ════════════ La courbe et le temps de l'Historique (tâche 10 bis D, cadre 3d) ════════════ */

/** Les deux périodes de l'Historique : leurs jours, et le pas de la courbe en
 * minutes — le quart d'heure de sa maquette sur 24 h (97 points) ; l'heure sur
 * 7 jours (169 points : 673 au quart d'heure, pour un SVG de 400 de large). */
export const PERIODES = Object.freeze({ '24h': Object.freeze({ jours: 1, pas: 15 }), '7j': Object.freeze({ jours: 7, pas: 60 }) });

/**
 * Une mesure sur la période, échantillonnée EN ESCALIER : tous les `pas`
 * minutes, de « il y a `jours` jours » à « maintenant » bornes comprises, la
 * dernière valeur connue à cet instant — `[{ t, v }]`, `v` null pour un trou :
 * avant la première entrée, ou après une entrée qui ne se lit pas (un capteur
 * muet). `lire(entree)` : sa valeur, un nombre fini ou null ; `vivant` : son
 * état du moment, le dernier point.
 */
export function echantillons(points, maintenant, { jours = 1, pas = 15, lire = null, vivant = null } = {}) {
  const fin = Number(maintenant);
  const n = Number(jours) * MINUTES_JOUR / Number(pas);
  if (!Number.isFinite(fin) || typeof lire !== 'function' || !(n > 0) || !Number.isFinite(n)) return [];
  const r = rangees(points, vivant, fin);
  const debut = fin - Number(jours) * JOUR_MS;
  // Seule l'entrée retenue à chaque pas se lit : 97 ou 169 lectures, pas une par ligne.
  const valeur = (k) => { const v = lire(r.at(k).e); return typeof v === 'number' && Number.isFinite(v) ? v : null; };
  const sortie = [];
  let k = -1, lue = -1, v = null;
  for (let i = 0; i <= Math.round(n); i++) {
    const t = debut + i * Number(pas) * 60000;
    while (k + 1 < r.n && r.at(k + 1).t <= t) k++;
    if (k !== lue) { v = k < 0 ? null : valeur(k); lue = k; }
    sortie.push({ t, v });
  }
  return sortie;
}

// Le repère du SVG de la courbe : 400 × 120, étiré (`preserveAspectRatio="none"`).
const LARGEUR = 400, HAUTEUR = 120;
// Un degré de l'échelle ne bouge pas pour un reste de flottant (32,3 − 0,3 vaut 31,999 999 999 999 996).
const net = (x) => Math.round(x * 1e6) / 1e6;

/**
 * La courbe de la pièce (cadre 3d), sur ses échantillons (`echantillons`) :
 * l'échelle de sa maquette (`chart`) — le min et le max des mesures et des
 * consignes, ± 0,3, arrondis au degré, avec un écart pair : le milieu tombe
 * sur un degré —, et ses tracés dans le repère du SVG : la mesure (`ligne`),
 * son aire jusqu'en bas (`aire`), la consigne d'un thermostat en escalier
 * (`consigne`, sur les mêmes instants). Un trou coupe la ligne et l'aire ;
 * une consigne absente (éteint, sans consigne) coupe l'escalier. `{ lo, hi,
 * mn, mx, ligne, aire, consigne }` ; null sous deux mesures : rien à tracer.
 */
export function courbe(mesures, consignes = null) {
  const m = Array.isArray(mesures) ? mesures : [];
  const vals = m.map(p => p && p.v).filter(v => typeof v === 'number');
  if (vals.length < 2) return null;
  const cs = (Array.isArray(consignes) ? consignes : []).map(p => p && p.v).filter(v => typeof v === 'number');
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const lo = Math.floor(net(Math.min(mn, ...cs) - 0.3));
  let hi = Math.ceil(net(Math.max(mx, ...cs) + 0.3));
  if ((hi - lo) % 2) hi += 1;
  const X = (i) => (m.length > 1 ? i / (m.length - 1) * LARGEUR : 0).toFixed(1);
  const Y = (v) => (HAUTEUR - (v - lo) / (hi - lo) * HAUTEUR).toFixed(1);
  // Les morceaux de mesure sans trou : [[x, y], …].
  const morceaux = [];
  let cours = null;
  m.forEach((p, i) => {
    if (!p || typeof p.v !== 'number') { cours = null; return; }
    if (!cours) morceaux.push(cours = []);
    cours.push([X(i), Y(p.v)]);
  });
  const trace = (pts) => pts.map(([x, y], j) => (j ? 'L' : 'M') + x + ' ' + y).join('');
  const ligne = morceaux.map(trace).join('');
  const aire = morceaux.map(pts => trace(pts) + 'L' + pts[pts.length - 1][0] + ' ' + HAUTEUR + 'L' + pts[0][0] + ' ' + HAUTEUR + 'Z').join('');
  // L'escalier de la consigne : à chaque échantillon, l'horizontale jusqu'à lui, puis la marche.
  let consigne = '', avant = null;
  (Array.isArray(consignes) ? consignes : []).forEach((p, i) => {
    if (!p || typeof p.v !== 'number') { avant = null; return; }
    const y = Y(p.v);
    consigne += avant === null ? 'M' + X(i) + ' ' + y : 'L' + X(i) + ' ' + avant + 'L' + X(i) + ' ' + y;
    avant = y;
  });
  return { lo, hi, mn, mx, ligne, aire, consigne };
}

/** La place d'une bande sur la période, en % de sa largeur au centième : 0,6 %
 * au moins (la maquette), ramenée dans la piste au bout. `{ left, width }`. */
export function placeBande(b, jours = 1) {
  const total = Number(jours) * MINUTES_JOUR;
  const largeur = Math.max(0.6, (b.a - b.de) / total * 100);
  return { left: Math.min(b.de / total * 100, 100 - largeur).toFixed(2) + '%', width: largeur.toFixed(2) + '%' };
}

/** Le temps passé dans chaque mode, en minutes, de l'Arrêt au Confort, puis
 * « à la main » (`mode` null) : `[{ mode, minutes }]` — les modes vus
 * seulement. Un trou ne compte nulle part. */
export function tempsParMode(bandes) {
  const liste = Array.isArray(bandes) ? bandes : [];
  const somme = (garder) => liste.filter(garder).reduce((s, b) => s + (b.a - b.de), 0);
  return [...FROID.map(mode => ({ mode, minutes: somme(b => !b.main && b.mode === mode) })), { mode: null, minutes: somme(b => !!b.main) }]
    .filter(p => p.minutes > 0);
}

/** Le temps de chauffe d'un thermostat et le reste, en minutes (`chauffeAppliquee`) : `{ chauffe, sans }`. */
export function tempsDeChauffe(bandes) {
  const liste = Array.isArray(bandes) ? bandes : [];
  const somme = (v) => liste.filter(b => b.chauffe === v).reduce((s, b) => s + (b.a - b.de), 0);
  return { chauffe: somme(true), sans: somme(false) };
}
