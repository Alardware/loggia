/* ── Les appareils composés : la voiture, la litière, la fontaine (chantier du 20/11, A11 et A12 ; ADR 0386) ──
 *
 * Trois APPAREILS que Loggia reconnaît sans réglage, chacun avec SA carte et SA popup (un appareil = sa carte + sa popup) :
 *
 *  — LA VOITURE, par FAMILLE, comme la borne (borne.js) : un appareil qui porte une DISTANCE (une autonomie ou un compteur
 *    kilométrique : un `sensor` de classe `distance`) ET au moins un indice de voiture — sa position (`device_tracker`), un
 *    verrou (`lock`, ou un binaire de classe `lock`), une prise (`plug`, `battery_charging`), un niveau de batterie ou de
 *    carburant. Pas un robot : une tondeuse a un compteur et une position, mais son appareil porte un `lawn_mower`. Aucun nom de
 *    marque : les clés de traduction, lues dans le code des intégrations (Tesla Fleet, Teslemetry, Tessie, Renault, Volvo,
 *    Škoda, Subaru, Kia et Hyundai, Mercedes), ne servent qu'à TRIER les rôles quand la classe ne suffit pas — la batterie de
 *    traction contre celle de 12 V, le compteur contre l'autonomie, le verrou des portes contre celui de la trappe de charge.
 *  — LA LITIÈRE et LA FONTAINE, par leurs clés de traduction (Litter-Robot, du cœur de Home Assistant ; les deux intégrations
 *    PetKit, qui partagent le domaine `petkit` ; Petlibro) : rien dans leurs classes ne les distingue d'un autre appareil.
 *    Une litière a un bac, un niveau de sable ou un état ; une fontaine, une alerte d'eau ou un filtre.
 *
 * Ce module porte la découverte (l'index, gardée tant que l'index ne change pas), ce que « actif » veut dire dans Objets et
 * les points d'attention. Il se charge à la demande, et seulement dans une maison qui a de quoi le nourrir (`composesboot.js`) ;
 * la carte et la popup aussi (`cartes/compose.jsx`). Pur : ni React ni Home Assistant ; les tests le rejouent à sec.
 */
import { tr } from './i18n.js';
import { PLATEFORMES_ANIMAUX } from './composesboot.js';

const MUETS = ['unavailable', 'unknown'];
const vivant = (st) => !!st && st.state != null && MUETS.indexOf(String(st.state)) < 0;
const mots = (s) => s.split(' ');
const domaine = (id) => String(id).split('.')[0];

/* LA VOITURE : les clés qui TRIENT, jamais celles qui reconnaissent. */
const V = {
  // La batterie de TRACTION. `car_battery_percentage` est celle de 12 V (Kia, Hyundai), de la même classe `battery`.
  batterie: mots('charge_state_battery_level charge_state_usable_battery_level battery_percentage ev_battery_level ev_battery_percentage soc'),
  douze: mots('car_battery_percentage'),
  carburant: mots('fuel_level tanklevelpercent'),
  compteur: mots('vehicle_state_odometer mileage odometer'),
  // L'autonomie : la totale d'abord, puis l'électrique, puis celle du réservoir.
  autonomie: mots('total_range total_driving_range remaining_range_total charge_state_battery_range battery_autonomy distance_to_empty_battery electric_range ev_range ev_driving_range rangeelectrickm remaining_range_electric fuel_autonomy distance_to_empty_tank range fuel_driving_range rangeliquid remaining_range_fuel'),
  verrou: mots('vehicle_state_locked lock door_lock door_locks'),
  // Le verrou de la trappe de charge (Tesla) n'est pas celui des portes.
  trappe: mots('charge_state_charge_port_latch'),
  // Le câble branché : un binaire `connectivity` chez Tesla, un état `connected` chez Volvo.
  cable: mots('charge_state_conn_charge_cable charger_connection_status'),
  /* La charge en détail (ADR 0392) — chaque rôle n'existe que si la voiture le publie : sa puissance, le temps qui reste ou
   * l'heure de la fin, l'énergie prise, la limite et le courant demandés, de quoi la lancer ou l'arrêter. */
  puissance: mots('charge_state_charger_power charging_power charge_power ev_charging_power charger_power'),
  reste: mots('charging_remaining_time remaining_charging_time estimated_charging_time charge_time_remaining ev_charge_remaining_time time_to_fully_charged ev_charge_duration'),
  fin: mots('charge_state_minutes_to_full_charge charging_end_time charge_end_time estimated_charge_end charging_finished_at'),
  ajoutee: mots('charge_state_charge_energy_added charging_energy_added charge_energy_added energy_added'),
  limite: mots('charge_state_charge_limit_soc charge_limit target_soc ev_charge_limits_ac charging_target target_battery_charge_level charge_limit_soc max_charge_level'),
  courant: mots('charge_state_charge_current_request charging_current charge_current ac_charging_current max_charge_current'),
  lancer: mots('charge_state_user_charge_enable_request charging charge start_stop_charging'),
  demarrer: mots('start_charge start_charging charge_start'),
  arreter: mots('stop_charge stop_charging charge_stop'),
  // La trappe de charge qui s'ouvre (une `cover`) : ni une portière, ni un coffre — branchée, elle est ouverte sans rien d'anormal.
  trappeCover: mots('charge_state_charge_port_door_open charge_port charge_port_door charging_flap'),
  // Le climat : une `climate`, sinon un interrupteur ou un bouton ; le dégivrage et le volant chauffant, des interrupteurs.
  clim: mots('climatisation air_conditioning climate preconditioning hvac climate_control'),
  climBouton: mots('start_air_conditioner activate_air_conditioning start_climate precondition climate_start start_climatisation'),
  degivrage: mots('climate_state_defrost_mode defrost window_heating rear_window_heating front_window_heating windows_heating'),
  volant: mots('climate_state_steering_wheel_heater steering_wheel_heater steering_wheel_heating'),
  interieur: mots('climate_state_inside_temp inside_temperature interior_temperature cabin_temperature'),
  exterieur: mots('climate_state_outside_temp outside_temperature exterior_temperature ambient_temperature outdoor_temperature'),
  consommation: mots('average_consumption consumption energy_consumption average_energy_consumption'),
};
// Une consommation se reconnaît aussi à son unité : « kWh/100km », « Wh/km », « mi/kWh »…
const UNITE_CONSO = /kwh\s*\/\s*100|wh\s*\/\s*(km|mi)|(km|mi)\s*\/\s*kwh/i;
/* La charge en cours, dans les états publiés : Tesla, Volvo, Škoda disent `charging`, Renault `charge_in_progress`. */
const EN_CHARGE = ['charging', 'charge_in_progress'];
const OUVRANTS = ['door', 'window', 'opening', 'garage_door'];
const PNEU = /tire|tyre|tpms/;

/* LA LITIÈRE ET LA FONTAINE : [rôle, domaine, clés]. Un binaire `on` dit le problème (bac plein, sable ou eau qui manque). */
const A = [
  ['bac', 'binary_sensor', 'wastebin waste_bin rubbish_full_state'],
  ['tiroir', 'sensor', 'waste_drawer'],
  ['etat', 'sensor', 'status_code litter_state max_work_state running_state'],
  ['sable', 'sensor', 'litter_level'],
  ['sableBas', 'binary_sensor', 'litter sand_lack'],
  ['tremie', 'sensor', 'hopper_status'],
  ['passages', 'sensor', 'times_used visits_today'],
  ['eauBasse', 'binary_sensor', 'water_level lack_warning'],
  ['eau', 'sensor', 'weight_percent'],
  ['filtre', 'sensor', 'filter filter_percent'],
  ['filtreJours', 'sensor', 'filter_left_days remaining_filter_days'],
  ['filtreChanger', 'binary_sensor', 'replace_filter'],
  ['pompe', 'switch', 'power'],
  ['remise', 'button', 'reset_filter filter_reset'],
].map(([role, dom, cles]) => ({ role, dom, cles: mots(cles) }));
const DE_LITIERE = ['bac', 'tiroir', 'etat', 'sable', 'sableBas'];
const DE_FONTAINE = ['eauBasse', 'filtre', 'filtreJours', 'filtreChanger'];
/* Les codes de Litter-Robot (`status_code`) : le bac plein ; la trémie qui se vide (`hopper_status`). */
const BAC_PLEIN = ['dfs', 'sdf'];
const TREMIE_VIDE = ['empty', 'litter_low'];

/** Le premier de `ids` dont la clé vient la plus tôt dans `ordre`, ou null. */
function premier(ids, ordre, tk) {
  return ids.filter(id => ordre.indexOf(tk(id)) >= 0).sort((x, y) => ordre.indexOf(tk(x)) - ordre.indexOf(tk(y)))[0] || null;
}

/**
 * Ce que la carte et la fiche de la voiture montrent de plus (ADR 0392) : la charge en détail, le climat, la trappe, les
 * températures, la consommation. La classe d'abord, la clé de traduction pour TRIER quand il y en a plusieurs ; un rôle sans
 * entité vaut null, et l'écran ne dessine rien à sa place (règle 46 : ce que la voiture publie, pas ce qu'une autre a).
 */
function detailsVoiture(S, tk, de) {
  const unite = (id) => (S[id] && S[id].attributes && S[id].attributes.unit_of_measurement) || '';
  const cle = (id) => tk(id) || String(id).split('.').slice(1).join('.');
  const parCle = (liste, ordre, motif = null) => premier(liste, ordre, tk) || (motif ? liste.find(id => motif.test(cle(id))) || null : null);
  const puissances = de('sensor', ['power']);
  const temperatures = de('sensor', ['temperature']);
  const pourcents = de('number').filter(id => unite(id) === '%');
  const climats = de('climate');
  return {
    puissance: parCle(puissances, V.puissance, /charg/) || (puissances.length === 1 ? puissances[0] : null),
    reste: parCle(de('sensor', ['duration']), V.reste, /charg/),
    fin: parCle(de('sensor', ['timestamp']), V.fin, /charg.*(end|fin|full)|full.*charg/),
    ajoutee: parCle(de('sensor', ['energy']), V.ajoutee, /charg.*added|added/),
    // La limite : réglable (un `number` en %), sinon seulement lue (un capteur que sa clé nomme).
    limite: parCle(pourcents, V.limite, /limit|target|soc/) || parCle(de('sensor'), V.limite),
    courant: parCle(de('number', ['current']), V.courant, /charg/),
    lancer: parCle(de('switch'), V.lancer, /^charg(e|ing)$|charge_enable|charging_enable/),
    demarrer: parCle(de('button'), V.demarrer),
    arreter: parCle(de('button'), V.arreter),
    trappeCover: parCle(de('cover'), V.trappeCover),
    clim: climats[0] || parCle(de('switch'), V.clim),
    climBouton: climats.length ? null : parCle(de('button'), V.climBouton),
    degivrage: parCle(de('switch'), V.degivrage),
    volant: parCle(de('switch'), V.volant),
    interieur: parCle(temperatures, V.interieur, /inside|interior|cabin|interieur/),
    exterieur: parCle(temperatures, V.exterieur, /outside|exterior|ambient|outdoor|exterieur/),
    consommation: parCle(de('sensor'), V.consommation) || de('sensor').find(id => UNITE_CONSO.test(unite(id))) || null,
  };
}

/** Les rôles d'une voiture sur les entités `ids` d'un appareil, ou null si ce n'en est pas une. */
function voitureDe(ids, S, m) {
  const tk = (id) => m(id).translationKey || '';
  const cls = (id) => (S[id] && S[id].attributes && S[id].attributes.device_class) || m(id).deviceClass || '';
  const de = (d, c) => ids.filter(id => domaine(id) === d && (!c || c.indexOf(cls(id)) >= 0));
  // Ni un robot (une tondeuse a un compteur et une position), ni un téléphone (son podomètre est une distance, sa position aussi).
  if (de('vacuum').length || de('lawn_mower').length || ids.some(id => m(id).platform === 'mobile_app')) return null;
  const classeEtat = (id) => (S[id] && S[id].attributes && S[id].attributes.state_class) || '';
  const distances = de('sensor', ['distance']);
  /* La distance d'une voiture : une AUTONOMIE (une mesure, pas un cumul) ou une clé de voiture. Le cumul d'un podomètre ou
   * d'un traceur de vélo n'en est pas une ; la distance de la foudre d'une station météo l'est, mais l'indice fort lui manque. */
  if (!distances.some(id => V.autonomie.indexOf(tk(id)) >= 0 || V.compteur.indexOf(tk(id)) >= 0 || ['total_increasing', 'total'].indexOf(classeEtat(id)) < 0)) return null;
  const compteur = premier(distances, V.compteur, tk) || distances.find(id => classeEtat(id) === 'total_increasing') || null;
  const autonomies = distances.filter(id => id !== compteur);
  const verrous = de('lock').filter(id => V.trappe.indexOf(tk(id)) < 0);
  const batteries = de('sensor', ['battery']).filter(id => V.douze.indexOf(tk(id)) < 0);
  const v = {
    genre: 'voiture', compteur, autonomies,
    autonomie: premier(autonomies, V.autonomie, tk) || (autonomies.length === 1 ? autonomies[0] : null),
    position: de('device_tracker')[0] || null,
    // Le verrou des portes : le seul de l'appareil, sinon celui que sa clé nomme — jamais un au hasard.
    verrou: verrous.length === 1 ? verrous[0] : premier(verrous, V.verrou, tk),
    // Ou des binaires de classe `lock`, un par porte parfois : `on` veut dire DÉVERROUILLÉ (la règle de Home Assistant).
    verrous: de('binary_sensor', ['lock']),
    prise: de('binary_sensor', ['plug'])[0] || ids.find(id => V.cable.indexOf(tk(id)) >= 0) || null,
    charge: de('binary_sensor', ['battery_charging'])[0]
      || de('sensor').find(id => S[id] && S[id].attributes && Array.isArray(S[id].attributes.options) && S[id].attributes.options.some(o => EN_CHARGE.indexOf(o) >= 0)) || null,
    batterie: premier(batteries, V.batterie, tk) || (batteries.length === 1 ? batteries[0] : null),
    carburant: premier(de('sensor'), V.carburant, tk),
    // La trappe de charge (une `cover` de classe `door` chez Tesla) n'est pas un ouvrant : branchée, elle est ouverte (ADR 0392).
    ouvrants: de('binary_sensor', OUVRANTS).concat(de('cover', ['door']).filter(id => V.trappeCover.indexOf(tk(id)) < 0)),
    pneus: de('binary_sensor', ['problem']).filter(id => PNEU.test(tk(id))),
    pressions: de('sensor', ['pressure', 'atmospheric_pressure']),
    ...detailsVoiture(S, tk, de),
  };
  /* Un INDICE FORT : une position, un verrou, une prise, une charge, ou une batterie de traction et un carburant que leur clé
   * nomme. Une pile seule ne suffit pas — une station météo en a une. */
  return v.position || v.verrou || v.verrous.length || v.prise || v.charge || premier(batteries, V.batterie, tk) || v.carburant ? v : null;
}

/** Les rôles d'une litière ou d'une fontaine sur les entités `ids` d'un appareil, ou null. */
function animalDe(ids, m) {
  const r = {};
  ids.forEach(id => {
    const x = m(id);
    if (PLATEFORMES_ANIMAUX.indexOf(x.platform) < 0) return;
    const a = A.find(y => y.dom === domaine(id) && y.cles.indexOf(x.translationKey) >= 0);
    if (a && !r[a.role]) r[a.role] = id;
  });
  const genre = DE_LITIERE.some(k => r[k]) ? 'litiere' : DE_FONTAINE.some(k => r[k]) ? 'fontaine' : null;
  // Le pourcentage de Petlibro est le sable d'une litière, l'eau d'une fontaine (la même clé).
  if (genre === 'litiere' && r.eau) { if (!r.sable) r.sable = r.eau; delete r.eau; }
  return genre ? { genre, ...r } : null;
}

let CACHE = { index: null, plein: false, liste: [] };
/**
 * Les appareils composés de la maison : `[{ appareil, nom, genre, …rôles }]`, rangés par appareil — vide sans index. Les rôles
 * sont des `entity_id` (ou des listes d'`entity_id`). Gardée tant que l'index ne change pas — une fois les états arrivés : la
 * classe d'état d'une distance et les options d'une charge ne se lisent que là, et elles ne changent pas.
 */
export function composesDe(index, S = {}) {
  let plein = false;
  for (const k in S || {}) { if (k) { plein = true; break; } }
  if (CACHE.index === index && CACHE.plein === plein) return CACHE.liste;
  const table = index && index.entityMeta;
  const par = new Map();
  if (table && typeof table.forEach === 'function') {
    table.forEach((x, id) => {
      if (!x || !x.deviceId || x.hidden || x.disabled) return;
      if (!par.has(x.deviceId)) par.set(x.deviceId, []);
      par.get(x.deviceId).push(id);
    });
  }
  const m = (id) => (table && table.get(id)) || {};
  const liste = [];
  // Les passages du jour de Litter-Robot vivent sur l'appareil de CHAQUE animal : ils vont à la litière quand il n'y en a qu'une.
  const visites = [];
  par.forEach((ids, appareil) => {
    ids.sort();
    const c = voitureDe(ids, S || {}, m) || animalDe(ids, m);
    if (c) {
      const d = index.deviceMeta && index.deviceMeta.get ? index.deviceMeta.get(appareil) : null;
      liste.push({ appareil, nom: (d && d.name) || null, ...c });
    } else ids.forEach(id => { if (m(id).platform === 'litterrobot' && m(id).translationKey === 'visits_today') visites.push(id); });
  });
  liste.sort((x, y) => (x.appareil < y.appareil ? -1 : x.appareil > y.appareil ? 1 : 0));
  const robots = liste.filter(c => c.genre === 'litiere' && m(c.etat || c.tiroir || '').platform === 'litterrobot');
  if (robots.length === 1 && visites.length) robots[0].visites = visites.sort();
  CACHE = { index, plein, liste };
  return liste;
}

let APPAREILS = { liste: null, ids: new Set() };
/** L'appareil `d` est-il une voiture, une litière ou une fontaine ? Ses entités ne sont pas « la maison » : ni ses portières
 *  parmi les portes, ni ses alertes en « Défaut signalé » — il a sa carte et ses points à lui (`alertesComposes`). */
export function appareilCompose(index, S, d) {
  const liste = composesDe(index, S);
  if (APPAREILS.liste !== liste) APPAREILS = { liste, ids: new Set(liste.map(c => c.appareil)) };
  return !!d && APPAREILS.ids.has(d);
}

/** Le nom d'un genre, quand l'appareil n'en a pas. */
export const nomGenre = (genre) => (genre === 'voiture' ? tr('Voiture') : genre === 'litiere' ? tr('Litière') : tr('Fontaine'));

/* ─── Ce que l'écran lit des états ─── */
const etatDe = (S, id) => (id && S && vivant(S[id]) ? String(S[id].state) : null);
const allume = (S, id) => etatDe(S, id) === 'on';
/** Un état de charge (d'un binaire ou d'un capteur) qui dit « en charge » — l'historique le relit aussi (ADR 0392). */
export const etatEnCharge = (e) => e === 'on' || EN_CHARGE.indexOf(String(e)) >= 0;
/** La voiture charge-t-elle ? Son binaire, ou un état `charging`. */
export const voitureEnCharge = (c, S) => !!c && (allume(S, c.charge) || EN_CHARGE.indexOf(etatDe(S, c.charge)) >= 0);
/** Est-elle branchée ? Le binaire de la prise, ou l'état `connected`. */
export const voitureBranchee = (c, S) => !!c && (allume(S, c.prise) || etatDe(S, c.prise) === 'connected');
/** Est-elle verrouillée ? `true`, `false`, ou null quand elle ne le dit pas. Un binaire `lock` allumé est DÉVERROUILLÉ. */
export function voitureVerrouillee(c, S) {
  if (!c) return null;
  if (c.verrou && etatDe(S, c.verrou) != null) return etatDe(S, c.verrou) === 'locked';
  const lus = (c.verrous || []).map(id => etatDe(S, id)).filter(e => e != null);
  return lus.length ? lus.every(e => e === 'off') : null;
}
/** Les ouvrants ouverts : un binaire allumé, un coffre (`cover`) ouvert. */
export const ouvrantsOuverts = (c, S) => (c && c.ouvrants ? c.ouvrants.filter(id => allume(S, id) || etatDe(S, id) === 'open') : []);
/** Le bac de la litière est-il plein ? Son binaire, ou le code de Litter-Robot. */
export const bacPlein = (c, S) => !!c && (allume(S, c.bac) || BAC_PLEIN.indexOf(etatDe(S, c.etat)) >= 0);
/** Le sable manque-t-il ? Son binaire, ou la trémie qui se vide. */
export const sableBas = (c, S) => !!c && (allume(S, c.sableBas) || TREMIE_VIDE.indexOf(etatDe(S, c.tremie)) >= 0);
/** Le filtre de la fontaine est-il à changer ? Son binaire, ou à bout (0 %, 0 jour) — jamais un seuil deviné. */
export const filtreUse = (c, S) => !!c && (allume(S, c.filtreChanger) || [c.filtre, c.filtreJours].some(id => { const n = parseFloat(etatDe(S, id)); return Number.isFinite(n) && n <= 0; }));

/** Objets compte « actif » ce qui FAIT quelque chose : la voiture qui charge, la litière qui nettoie. */
export function composeActif(c, S) {
  if (!c) return false;
  if (c.genre === 'voiture') return voitureEnCharge(c, S);
  const e = etatDe(S, c.etat);
  return c.genre === 'litiere' && !!e && (e === 'ccp' || e === 'ec' || /^clean/.test(e) || e === 'RUNNING');
}

/**
 * Les points d'attention des appareils composés (`pointsAttention`, `autres`) : `[{ cle, niveau, titre, sous, vue, haid }]`.
 * Rares et actionnables. La voiture ouverte ou déverrouillée ne se dit que LA NUIT (`nuit`) — le jour, on la charge, on la
 * vide ; un pneu bas, toujours. Le bac plein et l'eau qui manque sont des alertes ; le sable et le filtre, des infos.
 */
export function alertesComposes(liste, S, { nuit = false } = {}) {
  const out = [];
  (Array.isArray(liste) ? liste : []).forEach(c => {
    const nom = c.nom || nomGenre(c.genre);
    const dire = (genre, niveau, titre, haid) => out.push({ cle: genre + ':' + c.appareil, niveau, titre, sous: nom, vue: 'objets', haid: haid || null });
    if (c.genre === 'voiture') {
      const ouverts = ouvrantsOuverts(c, S);
      if (nuit && ouverts.length) dire('voiture', 'alerte', tr('Voiture ouverte la nuit'), ouverts[0]);
      else if (nuit && voitureVerrouillee(c, S) === false) dire('voiture', 'alerte', tr('Voiture déverrouillée la nuit'), c.verrou || c.verrous[0]);
      const pneu = c.pneus.find(id => allume(S, id));
      if (pneu) dire('pneu', 'alerte', tr('Pneu sous-gonflé'), pneu);
    } else if (c.genre === 'litiere') {
      if (bacPlein(c, S)) dire('litiere', 'alerte', tr('Bac de la litière plein'), c.bac || c.etat);
      else if (sableBas(c, S)) dire('litiere', 'info', tr('Litière à remettre'), c.sableBas || c.tremie);
    } else {
      if (allume(S, c.eauBasse)) dire('fontaine', 'alerte', tr('Fontaine à remplir'), c.eauBasse);
      else if (filtreUse(c, S)) dire('fontaine', 'info', tr('Filtre de la fontaine à changer'), c.filtreChanger || c.filtre || c.filtreJours);
    }
  });
  return out;
}

/** Les entités d'un appareil composé que l'écran suit : tous ses rôles. */
export const entitesCompose = (c) => (c ? [].concat(...Object.keys(c).filter(k => k !== 'appareil' && k !== 'nom' && k !== 'genre').map(k => c[k])).filter(x => typeof x === 'string' && x.indexOf('.') > 0) : []);
