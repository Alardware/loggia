/* La fiche d'un PURIFICATEUR d'air — ce qui se calcule (sa consigne du 21/11, ADR 0387).
 *
 * Sa consigne veut une popup sur le modèle du poêle : un bandeau qui dit ce qu'il fait, une scène animée (le halo qui respire,
 * les particules aspirées, les pales qui tournent au rythme du ventilateur), les modes et les vitesses fusionnés en une rangée,
 * des actions rapides, un planning, le filtre, l'historique. Ici, tout ce qui se LIT de Home Assistant : le niveau de l'air, le
 * mode, les crans, les entités sœurs (écran, verrou, filtre) — chacune proposée seulement si l'appareil l'a —, et le planning,
 * semaine de plages que tient le composant (`purificateurs.py`). Pur : `tr` pour les mots, l'index et les états qu'on lui passe.
 *
 * Les couleurs sont des JETONS du thème, jamais des valeurs : le vert de « Très bon » est `--o-ok`, l'orange de « Mauvais »
 * `--o-warn2`. Les cinq niveaux de sa consigne gardent leur ordre et leur sens ; c'est le thème qui donne la teinte.
 */
import { tr, trSens } from './i18n.js';
import { siblingsOf } from './discovery.js';
import { vitesseDuVentilo, etapeDe, pctDeLEtape } from './reglagesair.js';

/* ════════════ Le niveau de l'air ════════════ */

/* Les cinq niveaux de sa consigne (§ 3) : la vitesse que prend l'appareil en Auto (quand il ne la publie pas) et le nombre de
 * particules de la scène. « Pollué » est un cinquième niveau que le LV-PUR131S ne remonte sans doute pas : il sert à d'autres. */
export const NIVEAUX = ['excellent', 'good', 'moderate', 'poor', 'polluted'];
const NIVEAU = {
  excellent: { couleur: 'var(--o-ok)', auto: 1, particules: 16, mot: () => trSens('Très bon · air') },
  good: { couleur: 'color-mix(in srgb, var(--o-ok) 55%, var(--o-warn))', auto: 2, particules: 24, mot: () => trSens('Bon · air') },
  moderate: { couleur: 'var(--o-warn)', auto: 3, particules: 36, mot: () => trSens('Moyen · air') },
  poor: { couleur: 'var(--o-warn2)', auto: 3, particules: 46, mot: () => trSens('Mauvais · air') },
  polluted: { couleur: 'var(--o-bad)', auto: 3, particules: 62, mot: () => trSens('Pollué · air') },
};
export const motNiveau = (n) => (NIVEAU[n] ? NIVEAU[n].mot() : '—');
export const couleurNiveau = (n) => (NIVEAU[n] ? NIVEAU[n].couleur : 'var(--o-accent)');

// Les mots qu'écrivent les intégrations pour une qualité d'air, ramenés aux cinq niveaux.
const MOTS_AIR = {
  excellent: 'excellent', very_good: 'excellent', good: 'good', fair: 'moderate', moderate: 'moderate', medium: 'moderate', average: 'moderate',
  poor: 'poor', bad: 'poor', inferior: 'poor', unhealthy: 'poor', very_poor: 'polluted', very_bad: 'polluted', polluted: 'polluted',
  hazardous: 'polluted', severe: 'polluted', very_unhealthy: 'polluted',
};
/* Les particules fines (µg/m³) aux paliers de la table des capteurs (`confort.js` : bon sous 10, moyen sous 25, mauvais
 * au-delà), coupés en cinq : la fiche du purificateur et la carte de son capteur ne se contredisent jamais. */
const PALIERS_PM25 = [[5, 'excellent'], [10, 'good'], [25, 'moderate'], [50, 'poor']];
// L'indice américain (AQI, 0 à 500) : bon jusqu'à 50, modéré jusqu'à 100, mauvais pour les sensibles jusqu'à 150.
const PALIERS_AQI = [[25, 'excellent'], [50, 'good'], [100, 'moderate'], [150, 'poor']];
const parPaliers = (v, paliers) => { for (const [max, n] of paliers) if (v <= max) return n; return 'polluted'; };

/** Le niveau (une clé de `NIVEAUX`) que dit une valeur lue sur l'entité `m` (sa fiche d'index) ; null s'il ne se lit pas.
 * Un mot (« excellent », « poor »), un rang de 1 à 5 (VeSync en publie un sur ses Core), des particules ou un indice. */
export function niveauDeLAir(valeur, m = {}, unite = null) {
  if (valeur == null) return null;
  const brut = String(valeur).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (MOTS_AIR[brut]) return MOTS_AIR[brut];
  const n = Number(brut);
  if (brut === '' || !Number.isFinite(n) || n < 0) return null;
  const cle = String((m && m.translationKey) || '').toLowerCase();
  const classe = (m && m.deviceClass) || null;
  if (classe === 'pm25' || classe === 'pm10' || cle === 'pm25' || cle === 'pm2_5' || /µg|ug\/m/.test(String(unite || ''))) return parPaliers(n, PALIERS_PM25);
  if (classe === 'aqi' || cle === 'aqi') return parPaliers(n, PALIERS_AQI);
  if (cle === 'air_quality' && Number.isInteger(n) && n >= 1 && n <= 5) return NIVEAUX[n - 1];
  return null;
}

/* ════════════ Les entités de l'appareil ════════════ */

// Les clés de traduction des intégrations (VeSync, Xiaomi Miio) : jamais un nom.
const CLES = {
  air: ['air_quality'],
  particules: ['pm25', 'pm2_5'],
  indice: ['aqi'],
  filtre: ['filter_life', 'filter_life_remaining'],
  remiseFiltre: ['reset_filter', 'filter_reset', 'reset_filter_life'],
  ecran: ['display', 'led', 'screen', 'display_backlight'],
  verrou: ['child_lock', 'physical_controls_locked'],
};
const MUET = ['unavailable', 'unknown'];

/** Les entités sœurs utiles d'un purificateur : `{ air, filtre, remiseFiltre, ecran, verrou }`, chacune un `entity_id` ou null.
 * `air` : la qualité de l'air de l'appareil — son mot d'abord, ses particules sinon, son indice en dernier. L'écran est un
 * `switch` ou une `light` de l'appareil (VeSync, Xiaomi, Philips ne le publient pas pareil). Une sœur désactivée, absente des
 * états ou muette (`unavailable`, `unknown`) n'existe pas pour la fiche : sa commande n'apparaît pas. */
function entitesPurificateur(index, S, id) {
  const meta = (index && index.entityMeta) || new Map();
  const vivantes = siblingsOf(index, id).filter((e) => { const m = meta.get(e) || {}; return !m.disabled && S && S[e] && MUET.indexOf(S[e].state) < 0; });
  const cle = (e) => String((meta.get(e) || {}).translationKey || '').toLowerCase();
  const classe = (e) => (meta.get(e) || {}).deviceClass || ((S[e] && S[e].attributes) || {}).device_class || null;
  const trouve = (dom, cles, classes = []) => vivantes.find(e => e.indexOf(dom + '.') === 0 && (cles.indexOf(cle(e)) >= 0 || classes.indexOf(classe(e)) >= 0)) || null;
  return {
    air: trouve('sensor', CLES.air) || trouve('sensor', CLES.particules, ['pm25']) || trouve('sensor', CLES.indice, ['aqi']),
    filtre: trouve('sensor', CLES.filtre),
    remiseFiltre: trouve('button', CLES.remiseFiltre),
    ecran: trouve('switch', CLES.ecran) || trouve('light', CLES.ecran),
    verrou: trouve('switch', CLES.verrou),
  };
}

/* ════════════ Les modes et les vitesses ════════════ */

const MODES_AUTO = ['auto', 'smart'];
const MODES_NUIT = ['sleep', 'night', 'silent', 'advanced_sleep'];
const bas = (p) => String(p == null ? '' : p).toLowerCase();
const MOTS_PRESET = { pet: 'Animaux', turbo: 'Turbo', favorite: 'Favori', manual: 'Manuel' };
const motPreset = (p) => (MOTS_PRESET[bas(p)] ? tr(MOTS_PRESET[bas(p)]) : String(p).charAt(0).toUpperCase() + String(p).slice(1).replace(/_/g, ' '));

/** Le mot d'un cran sur `n` : Faible · Moyen · Fort pour trois, Faible · Fort pour deux, son numéro au-delà. */
function motCran(k, n) {
  // Le contexte « vitesse » : « Moyen » se dit Medium d'une vitesse, Fair d'un air (confort.js).
  if (n === 3) return [trSens('Faible · vitesse'), trSens('Moyen · vitesse'), trSens('Fort · vitesse')][k - 1] || String(k);
  if (n === 2) return k === 1 ? trSens('Faible · vitesse') : trSens('Fort · vitesse');
  return String(k);
}
// « vitesse faible » : la vitesse dans la ligne du disque, en minuscules.
function motVitesse(k, n) {
  if (n === 3) return [tr('vitesse faible'), tr('vitesse moyenne'), tr('vitesse forte')][k - 1] || tr('vitesse {n}', { n: k });
  if (n === 2) return k === 1 ? tr('vitesse faible') : tr('vitesse forte');
  return tr('vitesse {n}', { n: k });
}

/* Le rythme de la scène (§ 5) : éteint 0, Nuit 0,45, puis de 0,7 au premier cran à 1,5 au dernier (1 au milieu de trois). */
export function rythme(mode, cran, n) {
  if (mode === 'arret') return 0;
  if (mode === 'nuit') return 0.45;
  if (!cran || !n) return 1;
  if (n === 3) return [0.7, 1, 1.5][cran - 1] || 1;
  return n <= 1 ? 1 : 0.7 + (0.8 * (cran - 1)) / (n - 1);
}

/** Tout ce que la fiche montre d'un purificateur, d'un seul calcul. `minuteur` : `{ duree }` (minutes) quand le composant en
 * tient un ; `prochain` : la phrase du prochain changement du planning, quand il est allumé. */
export function vuePurificateur(index, S, id, { minuteur = null, prochain = null } = {}) {
  const st = S && id ? S[id] || null : null;
  const a = (st && st.attributes) || {};
  const muet = !st || st.state === 'unavailable' || st.state === 'unknown';
  const allume = !!st && st.state === 'on';
  const ent = entitesPurificateur(index, S || {}, id);
  const meta = (index && index.entityMeta) || new Map();
  const sAir = ent.air ? S[ent.air] : null;
  const niveau = sAir ? niveauDeLAir(sAir.state, meta.get(ent.air), (sAir.attributes || {}).unit_of_measurement) : null;

  /* Ce que l'entité SAIT, lu dans son `supported_features` (FanEntityFeature : 1 vitesse, 8 préréglages, 16 éteindre,
   * 32 allumer) : une commande que le masque ne déclare pas n'apparaît pas. Sans masque du tout (un état incomplet), allumer
   * et éteindre restent possibles, comme pour tout ventilateur ; rien d'autre. */
  const bits = typeof a.supported_features === 'number' ? a.supported_features : null;
  const sait = (b) => (bits == null ? b === 16 || b === 32 : (bits & b) !== 0);
  const peutAllumer = sait(32), peutEteindre = sait(16);
  const vitesse = st ? vitesseDuVentilo(id, st) : null;
  const n = vitesse && vitesse.etapes.length ? vitesse.etapes.length : 0;
  // Une vitesse sans crans (un pas de 1 à 10 %) : un réglage pas à pas, sous les pilules.
  const vitesseLibre = vitesse && !n ? vitesse : null;
  const presets = sait(8) && Array.isArray(a.preset_modes) ? a.preset_modes.filter(p => typeof p === 'string' && p) : [];
  const presetAuto = presets.find(p => MODES_AUTO.indexOf(bas(p)) >= 0) || null;
  const presetNuit = presets.find(p => MODES_NUIT.indexOf(bas(p)) >= 0) || null;
  const autres = presets.filter(p => p !== presetAuto && p !== presetNuit && bas(p) !== 'manual');
  const p = a.preset_mode;
  const pct = allume && a.percentage != null && Number.isFinite(Number(a.percentage)) ? Number(a.percentage) : null;
  let mode = 'arret';
  if (allume) {
    if (p && p === presetAuto) mode = 'auto';
    else if (p && p === presetNuit) mode = 'nuit';
    else if (p && autres.indexOf(p) >= 0) mode = 'preset:' + p;
    // Allumé hors de ses modes : à une vitesse choisie s'il en a une, simplement en marche sinon.
    else mode = n || vitesseLibre ? 'manuel' : 'marche';
  }
  const cranPublie = n && pct != null ? etapeDe(vitesse, pct) : null;
  // En Auto, l'appareil ne publie pas toujours sa vitesse (le LV-PUR131S : `percentage` nul) : celle que son niveau appelle.
  const cran = mode === 'auto' ? (cranPublie || (n ? Math.min(n, (NIVEAU[niveau] || { auto: 2 }).auto) : null)) : mode === 'manuel' ? cranPublie : null;

  // La rangée de pilules (§ 2.1, 3) : Auto · les crans · Nuit · ses autres modes. Choisir allume l'appareil.
  const pilules = [];
  if (presetAuto) pilules.push({ cle: 'auto', mot: tr('Auto'), signe: 'auto', on: mode === 'auto', envoi: { service: 'turn_on', data: { preset_mode: presetAuto } } });
  if (n) vitesse.etapes.forEach(k => pilules.push({ cle: 'v' + k, mot: motCran(k, n), on: mode === 'manuel' && cranPublie === k, envoi: { service: 'turn_on', data: { percentage: pctDeLEtape(vitesse, k) } } }));
  if (presetNuit) pilules.push({ cle: 'nuit', mot: tr('Nuit'), signe: 'nuit', on: mode === 'nuit', envoi: { service: 'turn_on', data: { preset_mode: presetNuit } } });
  autres.forEach(x => pilules.push({ cle: 'preset:' + x, mot: motPreset(x), on: mode === 'preset:' + x, envoi: { service: 'turn_on', data: { preset_mode: x } } }));

  const f = rythme(mode, cran, n);
  const base = NIVEAU[niveau] ? NIVEAU[niveau].particules : 20;
  const particules = allume ? Math.round(base * (mode === 'nuit' ? 0.6 : 1)) : 0;

  // La ligne du disque : le mode, la vitesse, la minuterie.
  let ligne = '';
  if (allume) {
    if (mode === 'auto') ligne = cran && n ? tr('Auto') + ' · ' + motVitesse(cran, n) : tr('Auto');
    else if (mode === 'nuit') ligne = tr('Nuit · silencieux');
    else if (mode === 'manuel') ligne = cranPublie && n ? tr('Manuel') + ' · ' + motVitesse(cranPublie, n) : pct != null ? tr('Manuel') + ' · ' + Math.round(pct) + ' %' : tr('Manuel');
    else if (mode !== 'marche') ligne = motPreset(p);
    if (minuteur && minuteur.duree > 0) ligne = (ligne ? ligne + ' · ' : '') + tr('{n} h', { n: Math.round(minuteur.duree / 6) / 10 });
  }

  // Le filtre (§ 2.3) : à remplacer sous 10 %, bientôt sous 25 %.
  const sF = ent.filtre ? S[ent.filtre] : null;
  const filtrePct = sF && String(sF.state).trim() !== '' && Number.isFinite(Number(sF.state)) ? Math.max(0, Math.min(100, Math.round(Number(sF.state)))) : null;
  const filtre = filtrePct == null ? null : {
    pct: filtrePct,
    niveau: filtrePct <= 10 ? 'bas' : filtrePct <= 25 ? 'moyen' : 'bon',
    etat: filtrePct <= 10 ? tr('À remplacer') : filtrePct <= 25 ? tr('Bientôt à changer') : tr('En bon état'),
  };

  const ecranAllume = ent.ecran ? (S[ent.ecran] || {}).state === 'on' : null;
  return {
    st, muet, allume, mode, niveau, cran, n, pct, pilules, f, particules, ligne, ent, filtre, ecranAllume, presetAuto, presetNuit, vitesse, vitesseLibre,
    peutAllumer, peutEteindre,
    // Sans mesure de l'air, la scène dit seulement si l'appareil tourne : ni « QUALITÉ DE L'AIR », ni un niveau inventé.
    air: !!ent.air,
    couleur: allume ? (niveau ? couleurNiveau(niveau) : 'var(--o-accent)') : 'var(--o-text3)',
    motNiveau: allume ? (ent.air ? motNiveau(niveau) : tr('En marche')) : tr('Éteint'),
    alerte: allume && (niveau === 'poor' || niveau === 'polluted'),
    bandeau: bandeau({ mode, niveau, ecranAllume, auto: !!presetAuto, crans: n > 0, choix: pilules.length > 0, prochain }),
    verrouille: ent.verrou ? (S[ent.verrou] || {}).state === 'on' : null,
    dernier: st ? st.last_updated || st.last_changed || null : null,
  };
}

/* Le bandeau (§ 4) : ce que fait l'appareil, en une phrase, puis le prochain changement du planning. */
const PHRASES_AUTO = {
  excellent: () => tr('Air très bon : il tourne au ralenti, en silence.'),
  good: () => tr('Air bon : vitesse moyenne pour le garder propre.'),
  moderate: () => tr('Air moyen : il accélère pour filtrer la pièce.'),
  poor: () => tr('Air mauvais : vitesse forte jusqu’à ce que ça redescende.'),
  polluted: () => tr('Air pollué : vitesse maximale. Fermez la porte de la pièce pour qu’il soit plus efficace.'),
};
// Sans crans, l'Auto ne se dit pas en vitesses : « vitesse moyenne » n'aurait pas de sens.
const PHRASES_AUTO_SANS_CRANS = {
  good: () => tr('Air bon : il le garde propre.'),
  poor: () => tr('Air mauvais : il accélère jusqu’à ce que ça redescende.'),
  polluted: () => tr('Air pollué : il tourne au plus fort. Fermez la porte de la pièce pour qu’il soit plus efficace.'),
};
/** `crans` : l'appareil a des vitesses nommées ; `choix` : la fiche lui offre au moins un mode ou une vitesse. */
export function bandeau({ mode, niveau, ecranAllume = null, auto = true, crans = true, choix = true, prochain = null }) {
  let texte;
  if (mode === 'arret') texte = choix ? tr('Purificateur à l’arrêt. Choisissez un mode pour le relancer.') : tr('Purificateur à l’arrêt.');
  else if (mode === 'marche') texte = tr('Purificateur en marche.');
  else if (mode === 'auto') {
    const phrase = (!crans && PHRASES_AUTO_SANS_CRANS[niveau]) || PHRASES_AUTO[niveau];
    texte = phrase ? phrase() : tr('Mode automatique : il s’adapte à la qualité de l’air.');
  }
  // « écran éteint » n'est vrai que si l'écran l'est : un appareil qui le garde allumé la nuit n'entend pas ce mot.
  else if (mode === 'nuit') texte = ecranAllume === true ? tr('Mode nuit : ventilateur au minimum.') : tr('Mode nuit : ventilateur au minimum et écran éteint.');
  else if (mode === 'manuel') texte = auto ? tr('Vitesse fixe. Repassez en Auto pour qu’il s’adapte à l’air.') : tr('Vitesse fixe.');
  else texte = tr('Mode {mode}.', { mode: motPreset(mode.slice(7)) });
  return prochain ? texte + ' ' + tr('Planning : {prochain}.', { prochain }) : texte;
}

/* La minuterie (§ 2.1, 4) : celle du composant (`minuteurs.py`), qui éteint l'appareil même quand aucun écran n'est ouvert. Un
 * appui fait 2 h, puis 4 h, puis 8 h — le composant AJOUTE à ce qui reste, on lui donne donc l'écart —, puis l'annule.
 * `duree` : la durée totale du minuteur en cours (minutes), 0 sans minuteur. */
const PALIERS_MINUTERIE = [120, 240, 480];
export function suiteMinuterie(duree) {
  if (!(duree > 0)) return { poser: PALIERS_MINUTERIE[0] };
  const i = PALIERS_MINUTERIE.findIndex(p => p > duree);
  return i < 0 ? { annuler: true } : { poser: PALIERS_MINUTERIE[i] - duree };
}

/* ════════════ La scène ════════════ */

/* Les particules, FIGÉES une fois pour toutes (§ 5) : une graine fixe, un hasard que chaque rendu retrouve — sans quoi
 * l'animation repartirait de zéro à chaque relevé de Home Assistant. 64 au plus ; la scène en prend selon l'air. */
export const PARTICULES = (() => {
  let graine = 7;
  const hasard = () => { graine = (graine * 16807) % 2147483647; return (graine - 1) / 2147483646; };
  const sortie = [];
  for (let i = 0; i < 64; i++) {
    const taille = 3 + hasard() * 6;
    sortie.push({ angle: hasard() * 360, voie: 1 + Math.floor(hasard() * 3), taille, base: 2.6 + hasard() * 2.4, phase: hasard() });
  }
  return sortie;
})();

/* ════════════ Le planning (§ 2.2) ════════════
 *
 * Une semaine (lundi = 0) de plages : `{ debut, mode }`, `debut` en minutes depuis minuit, la première à 00:00. Les modes :
 * `arret`, `auto`, `nuit`, un cran par vitesse (`v1`…`v6`), `marche` pour un appareil qui ne sait que s'allumer. Le composant tient la semaine et l'applique au début de chaque
 * plage ; un réglage à la main tient jusqu'à la plage suivante. */
const PAS_PLANNING = 30;
const FIN = 1440;

/** Les modes qu'un planning peut donner à CET appareil, avec leur mot et leur couleur — seulement ce qu'il sait : Arrêt s'il
 * sait s'éteindre, Auto et Nuit s'il a ces préréglages, ses crans, et « Marche » pour un appareil qui ne sait que s'allumer.
 * Moins de deux modes : pas de planning. */
export function modesPlanning(vue) {
  const out = [];
  if (!vue) return out;
  if (vue.peutEteindre) out.push({ cle: 'arret', mot: tr('Arrêt'), couleur: 'var(--o-text3)' });
  if (vue.presetAuto) out.push({ cle: 'auto', mot: tr('Auto'), couleur: 'var(--o-ok)' });
  const n = vue.n || 0;
  for (let k = 1; k <= n; k++) {
    const part = n <= 1 ? 100 : Math.round(40 + (60 * (k - 1)) / (n - 1));
    out.push({ cle: 'v' + k, mot: motCran(k, n), couleur: part >= 100 ? 'var(--o-accent)' : 'color-mix(in srgb, var(--o-accent) ' + part + '%, transparent)' });
  }
  if (vue.presetNuit) out.push({ cle: 'nuit', mot: tr('Nuit'), couleur: 'var(--o-purple)' });
  if (!vue.presetAuto && !n && !vue.presetNuit && vue.peutAllumer) out.push({ cle: 'marche', mot: tr('Marche'), couleur: 'var(--o-accent)' });
  return out;
}
export const modeDe = (modes, cle) => modes.find(m => m.cle === cle) || { cle, mot: cle, couleur: 'var(--o-text3)' };

/** « 07:30 » */
export const hhmm = (min) => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

/** Une semaine type (sa maquette : la nuit, l'auto le matin et le soir, l'arrêt la journée en semaine), aux modes de l'appareil. */
export function semaineType(modes) {
  // Le premier des modes voulus que l'appareil sait ; à défaut, son premier mode.
  const choisir = (...voulus) => voulus.find(c => modes.some(m => m.cle === c)) || (modes[0] || { cle: 'arret' }).cle;
  const nuit = choisir('nuit', 'v1', 'marche', 'auto');
  const auto = choisir('auto', 'v2', 'v1', 'marche');
  const arret = choisir('arret', 'nuit', 'v1');
  const semaine = [{ debut: 0, mode: nuit }, { debut: 420, mode: auto }, { debut: 510, mode: arret }, { debut: 1050, mode: auto }, { debut: 1350, mode: nuit }];
  const weekend = [{ debut: 0, mode: nuit }, { debut: 570, mode: auto }, { debut: 1380, mode: nuit }];
  return [0, 1, 2, 3, 4, 5, 6].map(j => (j < 5 ? semaine : weekend).map(x => ({ ...x })));
}

/** Une journée rangée, propre : la première plage à 00:00, des débuts au pas de 30 min, croissants, sans doublon. */
export function journeePropre(jour) {
  const l = (Array.isArray(jour) ? jour : []).filter(x => x && Number.isInteger(x.debut) && x.debut >= 0 && x.debut < FIN && typeof x.mode === 'string')
    .map(x => ({ debut: x.debut - (x.debut % PAS_PLANNING), mode: x.mode })).sort((x, y) => x.debut - y.debut);
  const out = [];
  l.forEach(x => { if (!out.length || out[out.length - 1].debut !== x.debut) out.push(x); else out[out.length - 1] = x; });
  if (!out.length) return [{ debut: 0, mode: 'arret' }];
  if (out[0].debut !== 0) out[0] = { ...out[0], debut: 0 };
  return out;
}

const finDe = (jour, i) => (i + 1 < jour.length ? jour[i + 1].debut : FIN);

/** L'indice de la plage en cours à `minute`. */
export function plageEnCours(jour, minute) {
  let i = 0;
  jour.forEach((x, k) => { if (x.debut <= minute) i = k; });
  return i;
}

/** Le prochain CHANGEMENT de mode après (`jour`, `minute`), sur huit jours : `{ jour, debut, mode, ecart }` (`ecart` en jours,
 * 0 aujourd'hui), ou null. Deux plages de suite au même mode — minuit compris — ne changent rien. */
export function prochainChangement(semaine, jour, minute) {
  const auj = semaine[jour] || [];
  const courant = auj.length ? auj[plageEnCours(auj, minute)].mode : null;
  for (let e = 0; e < 8; e++) {
    const j = (jour + e) % 7;
    for (const x of semaine[j] || []) {
      if (e === 0 && x.debut <= minute) continue;
      if (x.mode !== courant) return { jour: j, debut: x.debut, mode: x.mode, ecart: e };
    }
  }
  return null;
}

/** « Nuit à 22:30 », « Auto demain à 07:00 », « Auto lundi à 07:00 ». `nomJour(j)` : le nom du jour tel que sa langue
 * l'écrit dans une phrase (« lundi », « Monday »). */
export function phraseProchain(p, modes, nomJour) {
  if (!p) return '';
  const mot = modeDe(modes, p.mode).mot;
  if (p.ecart === 0) return tr('{mode} à {heure}', { mode: mot, heure: hhmm(p.debut) });
  if (p.ecart === 1) return tr('{mode} demain à {heure}', { mode: mot, heure: hhmm(p.debut) });
  return tr('{mode} {jour} à {heure}', { mode: mot, jour: nomJour(p.jour), heure: hhmm(p.debut) });
}

/** La plage la plus longue coupée en son milieu (au pas), le mode `mode` ; null si aucune ne fait une heure. */
export function ajouterPlage(jour, mode = 'auto') {
  let meilleure = -1, longueur = -1;
  jour.forEach((x, i) => { const l = finDe(jour, i) - x.debut; if (l > longueur) { longueur = l; meilleure = i; } });
  if (longueur < 2 * PAS_PLANNING) return null;
  const milieu = Math.round((jour[meilleure].debut + finDe(jour, meilleure)) / 2 / PAS_PLANNING) * PAS_PLANNING;
  const l = jour.map(x => ({ ...x }));
  l.splice(meilleure + 1, 0, { debut: milieu, mode });
  return { jour: l, indice: meilleure + 1 };
}

/** Le début de la plage `i` déplacé de `sens` pas, entre ses voisines (30 min d'écart au moins) ; la première ne bouge pas. */
export function deplacerPlage(jour, i, sens) {
  if (i <= 0 || i >= jour.length) return null;
  const min = jour[i - 1].debut + PAS_PLANNING;
  const max = finDe(jour, i) - PAS_PLANNING;
  const vise = Math.min(max, Math.max(min, jour[i].debut + sens * PAS_PLANNING));
  if (vise === jour[i].debut) return null;
  const l = jour.map(x => ({ ...x }));
  l[i].debut = vise;
  return l;
}
export const peutDeplacer = (jour, i, sens) => deplacerPlage(jour, i, sens) != null;

/** La plage `i` retirée (jamais la première). */
export function retirerPlage(jour, i) {
  if (i <= 0 || i >= jour.length) return null;
  return jour.filter((_, k) => k !== i).map(x => ({ ...x }));
}

/** Le mode de la plage `i`. */
export const modePlage = (jour, i, mode) => jour.map((x, k) => (k === i ? { ...x, mode } : { ...x }));

/** La journée `j` recopiée sur les jours `cibles`. */
export const copierJour = (semaine, j, cibles) => semaine.map((jour, k) => (cibles.indexOf(k) >= 0 && k !== j ? semaine[j].map(x => ({ ...x })) : jour.map(x => ({ ...x }))));

/** Les bandes de la frise d'une journée : `{ debut, fin, mode }`. */
export const bandesJour = (jour) => jour.map((x, i) => ({ debut: x.debut, fin: finDe(jour, i), mode: x.mode }));

/* ════════════ L'historique (§ 2.4) ════════════ */

/** La courbe en escalier d'un jour de qualité d'air : `[{ t, n }]` (n = rang 0…4), à partir des points de `history/period`.
 * `lire(state)` rend le niveau d'un état ; les états muets sont sautés. */
export function escalierAir(points, lire, debut, fin) {
  const out = [];
  (Array.isArray(points) ? points : []).forEach((p) => {
    const t = Date.parse(p.last_changed || p.last_updated || '');
    const n = NIVEAUX.indexOf(lire(p.state));
    if (!Number.isFinite(t) || n < 0) return;
    const tt = Math.max(debut, Math.min(fin, t));
    if (out.length && out[out.length - 1].n === n) return;
    out.push({ t: tt, n });
  });
  return out;
}

/** Le pire niveau d'un escalier (son rang), ou -1. */
export const pireNiveau = (escalier) => escalier.reduce((m, x) => Math.max(m, x.n), -1);

/** Les événements d'une journée : l'appareil allumé, éteint, changé de mode, et l'air qui change de niveau.
 * `fan` : les points du ventilateur avec leurs attributs ; le second, l'escalier de l'air. Les plus récents d'abord, `max` au plus. */
export function evenementsJour(fan, escalier, { presetAuto = 'auto', presetNuit = 'sleep', n = 0, vitesse = null, max = 8 } = {}) {
  const ev = [];
  let avant = null;
  (Array.isArray(fan) ? fan : []).forEach((p) => {
    const t = Date.parse(p.last_changed || p.last_updated || '');
    if (!Number.isFinite(t) || !p.state || p.state === 'unavailable' || p.state === 'unknown') return;
    const at = p.attributes || {};
    const mode = p.state !== 'on' ? 'arret' : at.preset_mode && at.preset_mode === presetAuto ? 'auto' : at.preset_mode && at.preset_mode === presetNuit ? 'nuit'
      : 'manuel:' + (at.percentage == null ? '' : at.percentage);
    if (avant === null) { avant = mode; return; }
    if (mode === avant) return;
    const mot = motMode(mode, n, vitesse);
    // Un appareil qui ne sait que s'allumer : « Allumé », sans mot de mode ; un changement sans mot n'est pas un événement.
    const texte = mode === 'arret' ? tr('Éteint') : avant === 'arret' ? (mot ? tr('Allumé') + ' · ' + mot : tr('Allumé')) : mot;
    avant = mode;
    if (!texte) return;
    ev.push({ t, texte, couleur: mode === 'arret' ? 'var(--o-text3)' : mode === 'nuit' ? 'var(--o-purple)' : mode === 'auto' ? 'var(--o-ok)' : 'var(--o-accent)' });
  });
  (Array.isArray(escalier) ? escalier : []).slice(1).forEach(x => ev.push({ t: x.t, texte: tr('Air {niveau}', { niveau: motNiveau(NIVEAUX[x.n]).toLowerCase() }), couleur: couleurNiveau(NIVEAUX[x.n]) }));
  return ev.sort((x, y) => y.t - x.t).slice(0, max);
}
function motMode(mode, n, vitesse) {
  if (mode === 'auto') return tr('mode Auto');
  if (mode === 'nuit') return tr('mode Nuit');
  const brut = mode.slice(7);
  const pct = Number(brut);
  if (brut === '' || !Number.isFinite(pct) || pct <= 0) return '';
  if (vitesse && n) return motVitesse(etapeDe(vitesse, pct), n);
  return vitesse ? tr('Manuel') + ' · ' + Math.round(pct) + ' %' : '';
}
