/* ── La fiche d'un volet : ce qui se calcule (chantier Volets, § 3.5 à 3.8, 4, 7) ──
 *
 * Pur — ni React ni Home Assistant —, testable à sec (tests/voletsfiche.test.mjs),
 * et chargé AVEC la fiche (fichevolet.jsx) : rien de ceci n'entre dans le
 * paquet de démarrage. La carte décide quelle ligne du § 4 s'applique
 * (`ligneVolet`, voletecran.js) ; la fiche la dit en entier (`phraseLongue`).
 *
 * Les heures du serveur se lisent dans leur partie MURALE (l'heure de la
 * maison, `finMurale`) ; celles de l'historique de Home Assistant, des
 * instants UTC, se disent dans le fuseau de la maison (`hass.config.time_zone`).
 */
import { tr, trN, trSens, locale, comparerTextes } from './i18n.js';
import { finMurale, heureMurale, jourDeLaFin } from './chauffageecran.js';
import { coverFerme, coverOuvert, motPosition, mouvementUtile } from './voletecran.js';
import { mot } from './journalmots.js';
import { nombre } from './format.js';
import { gestesCover, positionPubliee } from './outils.js';

// Une valeur en tête de ligne prend sa majuscule : « Demain 07:48 », « Lun. 07:46 ».
const capitale = (s) => (s ? s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1) : s);

/* ════════════ L'en-tête (§ 3.5) ════════════ */

/** Le type d'un volet, tiré de sa `device_class` : une fonction, lue au rendu. */
export function typeVolet(classe) {
  if (classe === 'shutter') return tr('volet roulant');
  if (classe === 'blind') return tr('store');
  if (classe === 'awning') return tr('store banne');
  if (classe === 'curtain') return tr('rideau');
  if (classe === 'shade') return tr('store intérieur');
  return tr('volet');
}

/** « Cuisine · volet roulant » sous le nom de la fiche ; sans pièce, le type seul. */
export function sousNomVolet(piece, classe) {
  const type = typeVolet(classe);
  return piece ? [piece, type].join(' · ') : capitale(type);
}

// SET_POSITION (4) — SET_TILT_POSITION (128) d'un store qui ne fait que s'incliner : le volet sait se placer, sa fenêtre se glisse.
export const saitSePlacer = (st) => !!st && !!gestesCover(st).placer;

/* ════════════ La phrase longue (§ 4) et le prochain mouvement ════════════ */

/* « +30 », « −15 » (le vrai signe moins), « 0 » : un décalage en minutes. */
const signe = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + -n : '0');

/** Le soleil d'un mouvement : « lever du soleil +30 min », « coucher du soleil ». */
function motSoleil(m) {
  const lever = m.source === 'lever' || (m.source !== 'coucher' && m.sens === 'ouverture');
  const d = Number(m.decalage) || 0;
  if (!d) return lever ? tr('lever du soleil') : tr('coucher du soleil');
  return lever ? tr('lever du soleil {d} min', { d: signe(d) }) : tr('coucher du soleil {d} min', { d: signe(d) });
}

/* « Ouverture à 07:48 », « Fermeture demain à 20:22 », « Ouverture lundi à 08:26 ». */
function quandLong(m, ref) {
  const f = finMurale(m.heure, ref);
  if (!f) return null;
  const mots = { heure: f.heure, jour: f.jour };
  if (m.sens === 'ouverture') {
    return f.demain ? tr('Ouverture demain à {heure}', mots) : f.jour ? tr('Ouverture {jour} à {heure}', mots) : tr('Ouverture à {heure}', mots);
  }
  return f.demain ? tr('Fermeture demain à {heure}', mots) : f.jour ? tr('Fermeture {jour} à {heure}', mots) : tr('Fermeture à {heure}', mots);
}

/**
 * La phrase LONGUE d'une ligne du § 4 (le haut de l'Accueil). `nomPorte` :
 * le nom de la porte qui retient la fermeture (ligne 5).
 */
export function phraseLongue(l, { pos = null, ferme = false, ouvert = false, etat = null, nomPorte = null } = {}) {
  const ref = etat && etat.maintenant;
  switch (l && l.ligne) {
    case 1: return tr('Indisponible');
    case 2: return l.sens === 'ouverture' ? tr('En ouverture · vers {n} %', { n: l.cible }) : tr('En fermeture · vers {n} %', { n: l.cible });
    case 3: return tr('À l’abri du vent · reste ouvert tant qu’il souffle');
    case 4: {
      const f = l.jusqua ? finMurale(l.jusqua, ref) : null;
      if (!f) return tr('Protection solaire · remonte quand le soleil quitte la façade');
      return f.demain ? tr('Protection solaire · remonte demain vers {heure}', { heure: f.heure }) : tr('Protection solaire · remonte vers {heure}', { heure: f.heure });
    }
    case 5: return nomPorte ? tr('Fermeture en attente · {porte} est ouverte', { porte: nomPorte }) : tr('Fermeture en attente');
    case 6: {
      const q = quandLong(l.mouvement, ref);
      return q ? [q, motSoleil(l.mouvement)].join(' · ') : motPosition(ferme, ouvert, pos);
    }
    case 7: return tr('Manuel · ne suit pas le soleil');
    default: return motPosition(ferme, ouvert, pos);
  }
}

/* « 20:24 », « Demain 07:48 », « Lun. 07:46 » : une heure du serveur, son jour
 * à l'horloge de la maison. */
function quandFiche(iso, ref) {
  const heure = heureMurale(iso);
  if (!heure) return '—';
  const j = jourDeLaFin(iso, ref);
  if (!j || j.dans <= 0) return heure;
  if (j.dans === 1) return capitale(tr('demain {heure}', { heure }));
  return capitale(new Date(2024, 0, 1 + j.jour).toLocaleDateString(locale(), { weekday: 'short' })) + ' ' + heure;
}

/* Rien de prévu : « Jamais », Manuel, le planning coupé, ou des heures à lui
 * sans aucun jour — le soleil connu, `a_venir` vide (le § 4, ligne 7). */
function rienDePrevu(v, etat) {
  const plan = etat && etat.config && etat.config.planning;
  if (!v || !plan) return false;
  if (v.regle === 'jamais' || !plan.actif || plan.mode === 'manuel') return true;
  return Array.isArray(etat.soleil_jours) && etat.soleil_jours.length > 0 && !(Array.isArray(v.a_venir) && v.a_venir.length);
}

/**
 * La rangée « Prochain mouvement » de l'Accueil : `{ valeur, sous }` — la
 * protection qui relâche (« Vers 18:30 », « Remontée · le soleil quitte la
 * façade »), sinon le mouvement utile, sinon le prochain prévu (une fermeture
 * d'un volet déjà fermé part quand même : le moteur l'envoie), sinon « Aucun »
 * et « Ce volet ne suit pas le soleil ». Sans heures du soleil : « — ».
 */
export function prochainFiche({ v = null, etat = null, ferme = false, ouvert = false } = {}) {
  const ref = etat && etat.maintenant;
  if (v && v.protection) {
    const jusqua = v.protection.jusqu_a;
    const f = jusqua ? finMurale(jusqua, ref) : null;
    return { valeur: f ? tr('Vers {heure}', { heure: f.heure }) : '—', sous: tr('Remontée · le soleil quitte la façade') };
  }
  const liste = v && Array.isArray(v.a_venir) ? v.a_venir : [];
  const m = mouvementUtile(liste, ferme, ouvert) || liste[0] || null;
  if (m) return { valeur: quandFiche(m.heure, ref), sous: [m.sens === 'ouverture' ? tr('Ouverture') : tr('Fermeture'), motSoleil(m)].join(' · ') };
  if (rienDePrevu(v, etat)) return { valeur: tr('Aucun'), sous: tr('Ce volet ne suit pas le soleil') };
  return { valeur: '—', sous: null };
}

/**
 * La rangée « Porte devant » (§ 3.6) : `{ valeur, couleur, sous }`. `porte` :
 * `{ entite, etat }` du serveur ; `nom` : son nom ; `prochain` : le mouvement
 * à venir (une fermeture, et la porte ouverte : elle attendra) ; `regleActive` :
 * « Volet bloqué » allumé pour la maison — coupé, la rangée le dit.
 */
export function porteFiche(porte, nom, { prochain = null, regleActive = true, ref = null } = {}) {
  if (!porte) return null;
  const n = nom || porte.entite;
  if (porte.etat === 'muette') return { valeur: tr('{nom} · muette', { nom: n }), couleur: 'var(--o-text3)', sous: tr('Un capteur muet ne retient rien : le volet fermera.') };
  const ouverte = porte.etat === 'ouverte';
  // L'heure de la fermeture, quand elle tombe AUJOURD'HUI : demain, la porte aura eu le temps de changer.
  const f = ouverte && prochain && prochain.sens === 'fermeture' ? finMurale(prochain.heure, ref) : null;
  const sous = !regleActive ? tr('Coupée pour toute la maison')
    : f && !f.demain && !f.jour ? tr('Si elle l’est encore à {heure}, la fermeture attendra.', { heure: f.heure })
      : tr('Le volet ne ferme pas sur une porte ouverte.');
  return ouverte
    ? { valeur: tr('{nom} · ouverte', { nom: n }), couleur: 'var(--o-warn)', sous }
    : { valeur: tr('{nom} · fermée', { nom: n }), couleur: 'var(--o-ok)', sous };
}

/* ════════════ Le Planning (§ 3.7) ════════════ */

const objet = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const SEPT = [0, 1, 2, 3, 4, 5, 6];

/* V5, acceptée (ADR 0191) : les jours propres d'un volet « Heures à lui »
 * REMPLACENT ceux de la maison — le moteur et le jumeau (voletsplanning.js)
 * le font depuis la tâche 7 du plan 1 ; sans jours propres, il suit la
 * maison. Aucune puce n'est inerte : la règle d'avant, où ils restreignaient,
 * est partie du code (19/10). */

const reglageDe = (plan, id) => {
  const t = objet(plan) && objet(plan.volets) ? plan.volets : null;
  return t && objet(t[id]) ? t[id] : null;
};
/** Les jours de la maison (0 = lundi) : une liste absente, c'est tous ; une
 * liste VIDE, aucun (audit du 19/10 — le jumeau de `jour_actif` au serveur,
 * et ce que Paramètres affiche). */
const joursMaison = (plan) => (objet(plan) && Array.isArray(plan.jours) ? plan.jours.filter(x => SEPT.includes(x)) : SEPT);
/** Le décalage de la maison pour un sens, en minutes. */
export const decalageMaison = (plan, sens) => {
  const s = objet(plan) && objet(plan[sens]) ? Number(plan[sens].decalage) : 0;
  return Number.isFinite(s) ? s : 0;
};
/** « +30 min », « −15 min », « 0 min » (sa maquette). */
export const decalageDit = (n) => tr('{n} min', { n: signe(Number(n) || 0) });

/* La note sous « Comme les autres · Heures à lui · Jamais ». En « Fermeture
 * nuit », le matin n'ouvre aucun volet : la note le dit, pour un volet qui
 * suit les autres comme pour un volet à ses heures — un volet « Jamais » ne
 * ferme pas le soir, il garde la sienne (relecture des tâches 6 à 12, point 7). */
export function notePlanning(plan, regle) {
  if (!objet(plan) || !plan.actif) return tr('Le lever et le coucher sont coupés pour toute la maison.');
  if (plan.mode === 'manuel') return tr('Le mode de la maison est sur Manuel : aucun volet ne bouge seul.');
  if (regle === 'jamais') return tr('Ce volet ne bouge qu’à la main, ou par la protection solaire et le vent fort.');
  if (plan.mode === 'nuit') return tr('Le mode de la maison est sur Fermeture nuit : il ferme le soir et laisse fermé le matin.');
  if (regle === 'perso') return tr('Ses propres heures et ses propres jours, réglés plus bas.');
  const o = decalageMaison(plan, 'ouverture'), f = decalageMaison(plan, 'fermeture');
  if (!o && !f) return tr('Ouvre au lever du soleil et ferme au coucher, comme les autres volets.');
  return tr('Ouvre au lever du soleil {o} et ferme au coucher {f}, comme les autres volets.', { o: decalageDit(o), f: decalageDit(f) });
}

/**
 * Les sept rangées de la semaine, d'après le JUMEAU (`semaine`,
 * voletsplanning.js) : `[{ date, gauche, largeur, heures }]` — le segment en
 * pourcentage de la journée, de l'ouverture à la fermeture (sans fermeture,
 * jusqu'à 24 h) ; `inactif` (Jamais, Manuel, planning coupé) : ni segment, et
 * « — ».
 */
export function lignesSemaine(jours, inactif) {
  const minute = (hm) => { const m = /^(\d\d):(\d\d)$/.exec(hm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  return (Array.isArray(jours) ? jours : []).map((j) => {
    const o = inactif ? null : minute(j.ouverture);
    const f = inactif ? null : minute(j.fermeture);
    const fin = f != null && f > (o || 0) ? f : 1440;
    return {
      date: j.date,
      gauche: o == null ? null : o / 1440 * 100,
      largeur: o == null ? null : (fin - o) / 1440 * 100,
      heures: inactif ? '—' : o == null ? tr('Reste fermé') : j.ouverture + ' – ' + (f != null ? j.fermeture : '…'),
    };
  });
}

/** Le lundi de la semaine en cours (« AAAA-MM-JJ »), à l'horloge de la maison. */
export function lundiDe(maintenant) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof maintenant === 'string' ? maintenant : '');
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * Les puces des jours d'un sens : `[{ jour, on }]`. Les jours propres du volet
 * s'il en porte, sinon ceux de la maison (V5).
 */
export function joursDuSens(plan, id, sens) {
  const r = reglageDe(plan, id);
  const propres = r && Array.isArray(r['jours_' + sens]) ? r['jours_' + sens].filter(x => SEPT.includes(x)) : null;
  const jours = propres || joursMaison(plan);
  return SEPT.map(jour => ({ jour, on: jours.includes(jour) }));
}

/* CE volet seulement (`null` : il quitte la table). Le serveur fusionne volet par
 * volet (sa demande du 25/10) : la table partait entière et remplaçait
 * l'ancienne — deux écrans qui réglaient deux volets ensemble, et le second
 * effaçait le premier. `plan` ne sert plus qu'à lire le réglage d'avant. */
const tableAvec = (plan, id, reglage) => ({ [id]: reglage || null });

/** Comme les autres · Heures à lui · Jamais : le patch de `loggia/volets/config`. */
export function patchRegle(plan, id, regle) {
  const r = reglageDe(plan, id);
  const perso = r && !r.exclu && (r.perso || r.ouverture != null || r.fermeture != null);
  const reglage = regle === 'jamais' ? { exclu: true }
    : regle === 'perso' ? (perso ? { ...r, perso: true } : { perso: true, ouverture: null, fermeture: null })
      : null;
  return { planning: { volets: tableAvec(plan, id, reglage) } };
}

/** ± 15 min, de −120 à +240 ; vide (null), le décalage de la maison sert de départ. */
export function patchDecalage(plan, id, sens, pas) {
  const r = reglageDe(plan, id) || {};
  const depart = r[sens] != null && Number.isFinite(Number(r[sens])) ? Number(r[sens]) : decalageMaison(plan, sens);
  const valeur = Math.max(-120, Math.min(240, depart + pas * 15));
  return { planning: { volets: tableAvec(plan, id, { ...r, perso: true, [sens]: valeur }) } };
}

/** Un jour coché ou décoché pour un sens. La liste qui redevient celle de la
 * maison s'efface (`null`) : le volet suit alors ses jours, et leurs changements. */
export function patchJour(plan, id, sens, jour) {
  const r = reglageDe(plan, id) || {};
  const actuels = joursDuSens(plan, id, sens).filter(x => x.on).map(x => x.jour);
  const suite = actuels.includes(jour) ? actuels.filter(x => x !== jour) : [...actuels, jour].sort((a, b) => a - b);
  const maison = joursMaison(plan);
  const commeLaMaison = suite.length === maison.length && suite.every(x => maison.includes(x));
  return { planning: { volets: tableAvec(plan, id, { ...r, perso: true, ['jours_' + sens]: commeLaMaison ? null : suite }) } };
}

/** Le mode de la maison, pour tous les volets. */
export const patchMode = (mode) => ({ planning: { mode } });

/** Les huit façades (orientations 0 à 315), une fonction lue au rendu. */
export const FACADES = () => [
  { deg: 0, nom: tr('Nord'), facade: tr('Façade nord') },
  { deg: 45, nom: tr('Nord-est'), facade: tr('Façade nord-est') },
  { deg: 90, nom: tr('Est'), facade: tr('Façade est') },
  { deg: 135, nom: tr('Sud-est'), facade: tr('Façade sud-est') },
  { deg: 180, nom: tr('Sud'), facade: tr('Façade sud') },
  { deg: 225, nom: tr('Sud-ouest'), facade: tr('Façade sud-ouest') },
  { deg: 270, nom: tr('Ouest'), facade: tr('Façade ouest') },
  { deg: 315, nom: tr('Nord-ouest'), facade: tr('Façade nord-ouest') },
];
/** La façade la plus proche d'une orientation, ou null. */
export function facadeDe(deg) {
  if (deg == null || !Number.isFinite(Number(deg))) return null;
  const n = ((Math.round(Number(deg) / 45) % 8) + 8) % 8;
  return FACADES()[n];
}

/** V11 — choisir une façade ALLUME la protection solaire si elle est coupée ;
 * « Aucune » (`null`) n'éteint rien. CE volet seulement : le serveur fusionne. */
export function patchFacade(config, id, deg) {
  const sol = (config && config.soleil) || {};
  const avant = objet(sol.volets) && objet(sol.volets[id]) ? sol.volets[id] : null;
  const reglage = deg == null ? null : { orientation: deg, ouverture: (avant && avant.ouverture) || 90 };
  return { soleil: { volets: { [id]: reglage }, ...(deg != null && !sol.actif ? { actif: true } : null) } };
}

/** V11 — choisir une porte ALLUME « Volet bloqué » (`baies.actif`) ; « Aucune » n'éteint rien. */
export function patchPorte(config, id, capteur) {
  const baies = (config && config.baies) || {};
  return { baies: { volets: { [id]: capteur || null }, ...(capteur && !baies.actif ? { actif: true } : null) } };
}

/** La fusion locale d'un patch, miroir de celle du serveur (`_poser_patch`) : une
 * section reçoit le patch, le reste de la section survit ; sa table `volets` se
 * fusionne volet par volet, et `null` en retire un. */
export function fusionConfig(config, patch) {
  const n = { ...(config || {}) };
  for (const section of Object.keys(patch || {})) {
    const avant = (config || {})[section] || {};
    const p = patch[section] || {};
    n[section] = { ...avant, ...p };
    if (objet(p.volets)) {
      const t = { ...(objet(avant.volets) ? avant.volets : {}) };
      for (const id of Object.keys(p.volets)) { if (p.volets[id] == null) delete t[id]; else t[id] = p.volets[id]; }
      n[section].volets = t;
    }
  }
  return n;
}

/**
 * Les écritures d'une fiche, l'une après l'autre (relecture des tâches 6 à 12,
 * point 2). Le serveur remplaçait les tables qu'il recevait : un patch bâti sur le
 * dernier sondage effaçait ce qu'un autre appareil venait d'écrire (il fusionne
 * volet par volet depuis le 25/10), et deux écritures en vol pouvaient perdre un
 * pas. Donc :
 *  - avant la PREMIÈRE écriture d'une série, la configuration se relit
 *    (`relire`, une promesse) ;
 *  - chaque patch se bâtit (`fabriquer(config)`) sur la configuration que rend
 *    l'écriture précédente — après un échec, sur une relecture ;
 *  - une seule écriture en vol : la suivante attend la réponse.
 * `ecrire(fabriquer, envoyer)` rend une promesse : la réponse du serveur
 * (`envoyer` la rend, ou null s'il n'a pas pris), ou null si `fabriquer` n'a
 * rien à écrire. Pur : `relire` et `envoyer` se doublent.
 */
export function fileEcritures(relire) {
  let reference = null;   // la configuration de la série ; null : à relire
  let enAttente = 0;      // les écritures pas encore finies
  let suite = Promise.resolve();
  return function ecrire(fabriquer, envoyer) {
    enAttente += 1;
    const tour = suite.then(async () => {
      if (!reference) reference = (await relire()) || null;
      const patch = fabriquer(reference || {});
      if (!patch) return null;
      const r = await envoyer(patch);
      reference = r && r.config ? r.config : null;
      return r || null;
    }).finally(() => { enAttente -= 1; if (!enAttente) reference = null; });
    suite = tour.catch(() => null);
    return tour;
  };
}

/* Le clavier de la fenêtre (relecture des tâches 6 à 12, point 1) : une rafale
 * de touches finit au relâché, ou après 500 ms sans touche — un seul ordre. */
export const RAFALE_MS = 500;

/** L'avertissement de la rangée « Protection solaire » : la règle coupée, ou son thermomètre manquant (volets.py:656-660). */
export function avertissementSoleil(config, orientation) {
  const sol = (config && config.soleil) || {};
  if (orientation == null) return null;
  if (!sol.actif) return tr('Coupée pour toute la maison');
  if (!sol.temp_entite) return tr('Choisissez le thermomètre du dehors dans Paramètres');
  return null;
}

/** Les trois modes de la maison, chacun avec sa phrase (une fonction, lue au rendu). */
export const MODES_MAISON = () => [
  { id: 'auto', label: tr('Auto lever/coucher'), sub: tr('Ferme le soir, ouvre le matin') },
  { id: 'nuit', label: tr('Fermeture nuit'), sub: tr('Ferme le soir, laisse fermé le matin') },
  { id: 'manuel', label: tr('Manuel'), sub: tr('Ne touche à rien') },
];

const CLASSES_PORTE = ['door', 'window', 'opening', 'garage_door'];
/**
 * Les portes proposées devant un volet (§ 3.7) : d'abord les capteurs
 * d'ouverture de SA pièce, puis « Autres capteurs », puis « Aucune ».
 * `pieceDe(id)` : la pièce d'une entité (l'index de Loggia).
 */
export function optionsPortes(S, piece, pieceDe) {
  const ids = Object.keys(S || {}).filter(id => id.indexOf('binary_sensor.') === 0 && CLASSES_PORTE.includes((S[id].attributes || {}).device_class));
  const nom = (id) => (S[id].attributes || {}).friendly_name || id;
  const tri = (a, b) => comparerTextes(nom(a), nom(b));
  const ici = piece ? ids.filter(id => pieceDe(id) === piece).sort(tri) : [];
  const ailleurs = ids.filter(id => !ici.includes(id)).sort(tri);
  return [
    ...ici.map(id => ({ id, label: nom(id), groupe: piece })),
    ...ailleurs.map(id => ({ id, label: nom(id), groupe: tr('Autres capteurs') })),
    { id: '', label: tr('Aucune') },
  ];
}

/* ════════════ L'Historique (§ 3.8, 7) ════════════ */

/** Les deux périodes : leurs jours (la fiche du chauffage a les mêmes). */
export const PERIODES_VOLET = Object.freeze({ '24h': 1, '7j': 7 });

/* La position d'un état de l'historique : `current_position` (celle des lames
 * d'un store qui ne fait que s'incliner, `positionPubliee`), sinon 100 ou 0
 * pour `open` ou `closed` ; null pour ce qui ne se lit pas (muet, en
 * mouvement sans position). */
function positionHisto(e) {
  if (!e || e.state === 'unavailable' || e.state === 'unknown') return null;
  const p = positionPubliee(e);
  if (p != null) return Math.max(0, Math.min(100, Math.round(p)));
  return e.state === 'open' ? 100 : e.state === 'closed' ? 0 : null;
}

/**
 * Les points de l'historique d'un volet, dans l'ordre : `[{ t, pos, etat }]`.
 * L'instant est `last_updated` : une position qui bouge SANS changer l'état ne
 * touche pas `last_changed`. `unavailable` est ignoré. L'état vivant ferme la
 * liste (le recorder écrit par lots).
 */
export function pointsHistorique(liste, vivant = null) {
  const brut = [...(Array.isArray(liste) ? liste : []), ...(vivant ? [vivant] : [])];
  return brut.map(e => ({ t: Date.parse((e && (e.last_updated || e.last_changed)) || ''), pos: positionHisto(e), etat: e && e.state }))
    .filter(p => Number.isFinite(p.t) && p.pos != null)
    .sort((a, b) => a.t - b.t);
}

/**
 * La courbe en escalier (sa maquette, cadre 1d) dans un SVG de 400 × 100 :
 * `{ ligne, aire }`, ou null sans aucun point. La position d'avant la période
 * part du bord gauche ; sinon la courbe commence à son premier point.
 */
export function courbeVolet(points, debut, fin) {
  const H = fin - debut;
  if (!(H > 0)) return null;
  const X = (t) => (Math.max(0, Math.min(1, (t - debut) / H)) * 400).toFixed(1);
  const Y = (p) => (100 - p).toFixed(1);
  const avant = points.filter(p => p.t <= debut).pop();
  const dans = points.filter(p => p.t > debut && p.t <= fin);
  if (!avant && !dans.length) return null;
  const x0 = avant ? '0.0' : X(dans[0].t);
  let ligne = 'M' + x0 + ' ' + Y((avant || dans[0]).pos);
  for (const p of dans) ligne += 'H' + X(p.t) + 'V' + Y(p.pos);
  ligne += 'H400';
  return { ligne, aire: ligne + 'V100H' + x0 + 'Z' };
}

/** Ce qu'une manœuvre a fait : « Fermé », « Ouvert », « Mis à 30 % » (le seuil fixe de V12). */
function quoiManoeuvre(pos) {
  if (coverFerme(null, pos)) return tr('Fermé');
  return coverOuvert(pos) ? tr('Ouvert') : tr('Mis à {n} %', { n: pos });
}

/* Le premier argument nommé `cle` d'un champ du journal (`g`, ADR 0070). */
function argument(l, champ, cle) {
  const parts = l && l.g && Array.isArray(l.g[champ]) ? l.g[champ] : [];
  for (const p of parts) if (Array.isArray(p) && p[1] && p[1][cle] != null) return p[1][cle];
  return null;
}

/* Le motif de la protection solaire, par façade : « Soleil sur la façade ouest, 26° dehors ». */
function motifSoleil(orientation, dehors) {
  const f = facadeDe(orientation);
  if (!f) return null;
  const t = Number.isFinite(Number(dehors)) && dehors != null ? nombre(Number(dehors), 0) + '°' : null;
  const avec = {
    0: () => tr('Soleil sur la façade nord, {t} dehors', { t }), 45: () => tr('Soleil sur la façade nord-est, {t} dehors', { t }),
    90: () => tr('Soleil sur la façade est, {t} dehors', { t }), 135: () => tr('Soleil sur la façade sud-est, {t} dehors', { t }),
    180: () => tr('Soleil sur la façade sud, {t} dehors', { t }), 225: () => tr('Soleil sur la façade sud-ouest, {t} dehors', { t }),
    270: () => tr('Soleil sur la façade ouest, {t} dehors', { t }), 315: () => tr('Soleil sur la façade nord-ouest, {t} dehors', { t }),
  };
  const sans = {
    0: () => tr('Soleil sur la façade nord'), 45: () => tr('Soleil sur la façade nord-est'), 90: () => tr('Soleil sur la façade est'),
    135: () => tr('Soleil sur la façade sud-est'), 180: () => tr('Soleil sur la façade sud'), 225: () => tr('Soleil sur la façade sud-ouest'),
    270: () => tr('Soleil sur la façade ouest'), 315: () => tr('Soleil sur la façade nord-ouest'),
  };
  return (t ? avec : sans)[f.deg]();
}

/**
 * Qui a fait une manœuvre, d'après la ligne du journal qui l'a commandée
 * (§ 3.8) : `{ mot, sous, glyphe, motif }` — `mot` pour la pastille, `sous`
 * (en minuscules) pour « Dernier mouvement ». `porte(entite)` : le nom d'une
 * porte (le rattrapage d'une baie refermée).
 */
export function quiDeLigne(l, { porte = null, nomPorte = (x) => x } = {}) {
  const ouvre = l.quoi === 'ouvrir' || l.cible === 100;
  const soleil = { mot: trSens('Soleil · règle'), sous: tr('soleil'), glyphe: ouvre ? 'sunrise' : 'sunset' };
  if (l.module === 'volets') {
    if (l.regle === 'planning') return { ...soleil, motif: null };
    if (l.regle === 'rattrapage') {
      // Le nom vient de Home Assistant, son article est inconnu : une tournure neutre (relecture du 13/10).
      const motif = l.motif === 'baie refermee' && porte ? tr('Après fermeture : {porte}', { porte: nomPorte(porte) })
        : l.motif === 'volet revenu' ? tr('Le volet est revenu') : (mot(l, 'motif') || null);
      return { ...soleil, motif };
    }
    if (l.regle === 'soleil') {
      return { mot: tr('Protection solaire'), sous: tr('protection solaire'), glyphe: 'sun',
        motif: l.quoi === 'rouvrir' ? tr('Le soleil a quitté la façade') : motifSoleil(l.orientation, l.dehors) };
    }
    if (l.regle === 'vent') {
      const v = argument(l, 'motif', 'v');
      return { mot: tr('Vent fort'), sous: tr('vent fort'), glyphe: 'wind', motif: v != null ? tr('Vent à {v}', { v }) : null };
    }
  }
  if (l.module === 'alertes') return { mot: tr('Alerte'), sous: tr('alerte'), glyphe: 'triangle-warning', motif: mot(l, 'motif') || null };
  if (l.module === 'scenarios') return { mot: tr('Scénario'), sous: String(l.quoi || ''), glyphe: 'magic-wand', motif: String(l.quoi || '') || null };
  return aLaMain();
}
const aLaMain = () => ({ mot: tr('À la main'), sous: tr('à la main'), glyphe: 'hand', motif: null });

/* Une ligne du journal qui a COMMANDÉ ce volet : il est dans ses cibles (ou
 * son détail le nomme), quelque chose est parti (`n`), ni simulée ni en échec. */
const commande = (l, id) => !!l && !l.simule && !l.echec && Number(l.n) > 0
  && ((Array.isArray(l.cibles) && l.cibles.includes(id)) || (typeof l.detail === 'string' && l.detail.includes(id)));

export const REGROUPEMENT_MS = 4 * 60000;   // des changements à moins de 4 min font UNE manœuvre
export const AVANT_MS = 180000;             // la ligne du journal : de 180 s avant…
export const APRES_MS = 60000;              // …à 60 s après l'heure de la manœuvre
/* …et de 360 s avant quand l'état n'a pas changé dans le groupe : sans bascule,
 * le groupe date de l'arrivée de la position, une à trois minutes après l'ordre
 * (une protection : 185 s mesurées — relecture des tâches 6 à 12, point 4). */
export const AVANT_SANS_BASCULE_MS = 360000;

/**
 * Les manœuvres d'un volet (§ 7), de la plus récente à la plus ancienne :
 * `[{ t, pos, quoi, motif, qui }]`. Les changements — d'état ou de position —
 * qui se suivent à moins de 4 min font un groupe : son heure est celle de son
 * PREMIER changement, sa position la dernière. Un groupe qui revient à la
 * position d'avant n'est pas une manœuvre. C'est ce regroupement qui fait UNE
 * manœuvre de la bascule Netatmo et de la position qui arrive deux minutes
 * après (`closed 100` puis `open 1`).
 *
 * Qui : une ligne de `loggia/volets/manoeuvres` pour ce volet, de 180 s avant
 * à 60 s après — de 360 s avant quand l'état n'a pas changé dans le groupe
 * (`AVANT_SANS_BASCULE_MS`) — : sa règle dit qui, son motif pourquoi, son
 * heure est affichée. Une ligne ne fait qu'UNE manœuvre : la fenêtre élargie ne
 * prend pas à la fermeture du soir la ligne qu'elle a déjà. Sans ligne, et le
 * journal couvre TOUTE la fenêtre utilisée (`couvreDepuis`, en secondes) :
 * « À la main » ; sinon, pas de pastille — on ne dit pas « à la main » sans le
 * savoir. Sans réponse du serveur (`journal` null) : pas de pastille non plus.
 */
export function manoeuvres(points, { id, journal = null, couvreDepuis = null, debut = -Infinity, porte = null, nomPorte } = {}) {
  const changements = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.pos !== b.pos || a.etat !== b.etat) changements.push({ t: b.t, avant: a.pos, pos: b.pos, bascule: a.etat !== b.etat });
  }
  const groupes = [];
  for (const c of changements) {
    const g = groupes[groupes.length - 1];
    if (g && c.t - g.dernier < REGROUPEMENT_MS) { g.pos = c.pos; g.dernier = c.t; g.bascule = g.bascule || c.bascule; }
    else groupes.push({ t: c.t, avant: c.avant, pos: c.pos, dernier: c.t, bascule: c.bascule });
  }
  const lignes = Array.isArray(journal) ? journal.filter(l => commande(l, id)) : null;
  const couvre = couvreDepuis == null ? Infinity : Number(couvreDepuis) * 1000;
  const prises = new Set();
  return groupes.filter(g => g.pos !== g.avant && g.t > debut).map((g) => {
    const avant = g.bascule ? AVANT_MS : AVANT_SANS_BASCULE_MS;
    const l = lignes ? lignes.find(x => !prises.has(x) && x.ts * 1000 >= g.t - avant && x.ts * 1000 <= g.t + APRES_MS) : null;
    if (l) prises.add(l);
    const qui = l ? quiDeLigne(l, { porte, nomPorte }) : lignes && g.t - avant >= couvre ? aLaMain() : null;
    return { t: l ? l.ts * 1000 : g.t, pos: g.pos, quoi: quoiManoeuvre(g.pos), motif: qui ? qui.motif : null, qui };
  }).reverse();
}

/* Le jour d'un instant à la maison, « AAAA-MM-JJ », et son heure « HH:MM ». */
const jourMaison = (t, fuseau) => new Intl.DateTimeFormat('en-CA', { timeZone: fuseau || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
const heureMaison = (t, fuseau) => new Intl.DateTimeFormat(locale(), { timeZone: fuseau || undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);

/** « 17:40 », « Hier 22:10 », « Ven. 15:00 » — à l'heure de la maison (`fuseau`). */
export function heureManoeuvre(t, maintenant, fuseau) {
  const h = heureMaison(t, fuseau);
  const ecart = Math.round((Date.parse(jourMaison(maintenant, fuseau)) - Date.parse(jourMaison(t, fuseau))) / 86400000);
  if (ecart <= 0) return h;
  if (ecart === 1) return capitale(tr('hier')) + ' ' + h;
  return capitale(new Intl.DateTimeFormat(locale(), { timeZone: fuseau || undefined, weekday: 'short' }).format(t)) + ' ' + h;
}

/** Le compte des manœuvres : « 5 sur 24 h », « 3 sur 7 jours », « 8 sur 23 » (au-delà de huit). */
export function compteManoeuvres(n, periode) {
  if (n > 8) return tr('{a} sur {b}', { a: 8, b: n });
  return periode === '7j' ? trN(n, '{n} sur 7 jours', '{n} sur 7 jours') : trN(n, '{n} sur 24 h', '{n} sur 24 h');
}
