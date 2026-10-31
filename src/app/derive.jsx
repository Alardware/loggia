/* Ce que l’application dérive de Home Assistant : l’Accueil (`deriveAccueil`) et les notifications (`deriveNotifs`).
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { loggiaEnt, LOGGIA_INDEX, ctxLumieres, secAlarm, plateformeDe, enHaids } from '../state.js';
import { wattsDe, uniteTemp, moyenneTemperatures } from '../unites.js';
import { idsDe, sommeLue } from '../energieparts.js';
import { pickSibling } from '../discovery.js';
import { VACUUM_STATE_FR } from '../resolve.js';
import { dureePrise } from '../prises.js';
import { lumieresDe } from '../lumieres.js';
import { couleurPile, motsSurete, fuiteCalculee, niveauPile } from '../attention.js';
import { fmtWatts, minutesDepuisHeure } from '../format.js';
import { notifIds, plantsCfg } from '../lectures.js';
import { locale, tr } from '../i18n.js';
import { estDehors, plantCapteur } from './noyau.jsx';
import { lireNombre } from '../cartes/mesure.jsx';
import { peopleList } from '../cartescustom/galerie.jsx';
import { nomDuCycle } from '../accueil/briques.jsx';

/* La vue Lumieres a disparu le 14/09/2026 : la vue Objets, filtre « Lumieres »,
 * dessine les memes lampes aux cartes de la piece. La route `lumieres` y mene. */

/* La bibliothèque des ambiances Hue (`HUE_SCENES`), son nuancier et la
 * section des Scènes (`ScenesContent`) vivent dans `scenes.jsx`, chargé à la
 * demande depuis le 11/10 (voir son en-tête) ; `dimmableLights` vit dans
 * state.js. */

// Tondeuse : le domaine `lawn_mower` suffit ; la configuration tranche s'il y
// en a plusieurs. Ses capteurs sont ceux du même appareil.
function mowerId(S) {
  const c = loggiaEnt('mower', null);
  if (c && c.main && (!S || S[c.main])) return c.main;
  return S ? (Object.keys(S).find(id => id.indexOf('lawn_mower.') === 0) || null) : null;
}
function mowerSensor(S, kind) {
  const id = mowerId(S);
  if (!id || !LOGGIA_INDEX) return null;
  const opts = kind === 'battery' ? { domain: 'sensor', deviceClass: 'battery' }
    : kind === 'charging' ? { domain: 'binary_sensor', deviceClass: 'battery_charging' }
      : { domain: 'sensor', match: /(progress|progression)/ };
  return pickSibling(LOGGIA_INDEX, S || {}, id, opts);
}
// Dérive les données live de l'Accueil depuis hass + config. null si pas de hass (→ démo).
// `resolved` vient de la resolution (App) : cette fonction n'a pas de hooks,
// on lui passe donc ce qu'elle ne peut pas aller chercher elle-meme.
/** La fiche Énergie seule (`loggia_energyHaids`), sans ce que la découverte y ajoute. */
const ficheEnergie = () => { const f = loggiaEnt('energy', null); return f && typeof f === 'object' ? f : {}; };

function deriveAccueil(hass, cfg, resolved) {
  if (!hass || !hass.states) return null;
  const S = hass.states;
  // Lu strictement (audit du 19/10) : « 1,659 » ppm ne vaut plus 1.
  const num = (id, d = null) => { const n = id && S[id] ? lireNombre(S[id].state) : null; return n == null ? d : n; };
  const fmtW = fmtWatts;
  const E = cfg.energy || {};
  // ⚠️ E.consoNow = flux NET du compteur : positif = import, négatif = export.
  //    Quand E.surplusNow n'existe pas, l'export vient de la partie négative du net.
  /* Les puissances en WATTS, quelle que soit l'unité du capteur (audit du
   * 03/10) : un compteur P1/DSMR en kW donnait « ↓ 1 W » au bandeau, et les
   * seuils « > 5 W » ci-dessous ne se franchissaient jamais. */
  const numW = (id) => (id && S[id] ? wattsDe(S[id]) : null);
  /* Les deux noms de chaque rôle (25/10) : la fiche Énergie écrit `gridNow`,
   * `injectionNow`, `solarNow`, `consoMaison` — l'Accueil ne lisait que
   * `consoNow`, et la tuile restait absente chez qui avait rempli la fiche.
   * Même lecture que la vue Énergie : le net signé d'abord, sinon le soutirage
   * et l'injection séparés ; la maison, son capteur s'il existe. */
  const ou = (a, b) => { const v = numW(a); return v != null ? v : numW(b); };
  /* Deux onduleurs : leurs deux puissances (chantier G3, ADR 0302) — la clé seule, sinon ses parts. */
  const solarParts = sommeLue(idsDe(E, 'solarNow'), numW);
  const solarW = solarParts != null ? solarParts : numW(E.solarOutput), netW = sommeLue(idsDe(E, 'consoNow'), numW), surplusRaw = ou(E.surplusNow, E.injectionNow);
  const exp = (surplusRaw != null && surplusRaw > 5) ? surplusRaw : (netW != null ? Math.max(0, -netW) : surplusRaw);
  const exporting = exp != null && exp > 5;
  const importW = netW != null ? Math.max(0, netW) : numW(E.gridNow);
  const gridVal = exporting ? exp : importW;
  const maisonW = numW(E.consoMaison);
  const consoW = maisonW != null ? Math.max(0, maisonW) : (importW != null ? Math.max(0, importW + (solarW || 0) - (exp || 0)) : null);
  const rooms = (cfg.rooms || []).map(r => ({ name: r.room, area: r.area || null, icon: r.icon || null, lights: (r.haid && r.haid.lights) || [], temp: num(r.haid && r.haid.temp), hum: num(r.haid && r.haid.humidity), co2: num(r.haid && r.haid.co2), tempId: r.haid && r.haid.temp, humId: r.haid && r.haid.humidity, co2Id: r.haid && r.haid.co2, co2Seuil: r.haid && Number(r.haid.co2seuil) > 0 ? Math.round(Number(r.haid.co2seuil)) : null }));
  const indoor = rooms.filter(r => !estDehors(r.name));
  const avg = arr => { const x = arr.filter(v => v != null); return x.length ? x.reduce((s, v) => s + v, 0) / x.length : null; };
  /* La température intérieure (salutation de l'Accueil, écran de veille) :
   * chaque pièce lue dans la VRAIE unité de son capteur, ramenée au Celsius
   * avant l'addition, et la moyenne redite dans l'unité de l'installation —
   * celle que l'écran de veille affiche déjà. Audit du 03/10 : la moyenne
   * additionnait des nombres bruts et la salutation collait « °C » en dur
   * derrière — « 72.0°C » dans une maison réglée en Fahrenheit. */
  const inTempUnite = uniteTemp(null, hass);
  const inTemp = moyenneTemperatures(indoor.map(r => ({ v: r.temp, unite: uniteTemp(r.tempId && S[r.tempId] ? S[r.tempId].attributes : null, hass) })), inTempUnite);
  const inHum = avg(indoor.map(r => r.hum));
  const co2vals = rooms.map(r => r.co2).filter(v => v != null);
  const maxCo2 = co2vals.length ? Math.max(...co2vals) : null;
  // Sans lumières choisies, celles de la maison (L11) : le compte d'Objets › Lumières — la LED d'une borne Wi-Fi n'en est pas une.
  let lightIds = (cfg.lights || []).map(l => l.haid).filter(Boolean);
  if (!lightIds.length) lightIds = lumieresDe(S, ctxLumieres());
  const lightsOn = lightIds.filter(id => S[id] && S[id].state === 'on').length;
  // `etat` : l'état de la personne, que l'avatar de l'Accueil dit en un mot — sa zone, ou « Inconnu » (G1-D8).
  const people = peopleList().map(p => ({ name: p.name, img: p.img, home: !!(S[p.haid] && S[p.haid].state === 'home'), etat: S[p.haid] ? S[p.haid].state : null }));
  const cams = (cfg.cams || []).map(c => ({ name: c.name, haid: c.haid, online: (S[c.haid] ? S[c.haid].state !== 'unavailable' : c.online !== false) }));
  // États À-venir — aspirateur : état de l'entité `vacuum`, complété par les
  // capteurs configurés (texte déjà traduit, batterie).
  const rVac = (resolved && resolved.vacuum && resolved.vacuum.available) ? resolved.vacuum : null;
  const eVac = (cfg && cfg.entities && cfg.entities.vacuum) || {};
  const vacRaw = rVac ? rVac.state : null;
  const vacEtatS = eVac.etat ? S[eVac.etat] : null;
  const vacEtat = (vacEtatS && vacEtatS.state && vacEtatS.state !== 'unknown' && vacEtatS.state !== 'unavailable') ? vacEtatS.state : null;
  const vacCleaning = vacRaw ? vacRaw === 'cleaning' : !!(eVac.cleaning && S[eVac.cleaning] && S[eVac.cleaning].state === 'on');
  const vacOnBase = vacRaw ? vacRaw === 'docked' : !!(eVac.onBase && S[eVac.onBase] && S[eVac.onBase].state === 'on');
  const vacLabel = vacEtat || (vacRaw ? (VACUUM_STATE_FR[vacRaw] || vacRaw) : null);
  const vacBattery = (rVac && rVac.batteryLevel != null) ? rVac.batteryLevel : num(eVac.battery || (rVac && rVac.battery), null);
  const alarmId = (secAlarm() && S[secAlarm()]) ? secAlarm()
    : ((resolved && resolved.alarm && resolved.alarm.available) ? resolved.alarm.main : null);
  const alarmS = alarmId ? S[alarmId] : null;
  const alarmArmed = !!(alarmS && typeof alarmS.state === 'string' && alarmS.state.indexOf('armed') === 0);
  const camOnline = cams.filter(c => c.online).length, camTotal = cams.length;
  const ssA = S['sun.sun'] && S['sun.sun'].attributes ? S['sun.sun'].attributes.next_setting : null;
  let sunsetHM = null; if (ssA) { const d = new Date(ssA); if (!isNaN(d.getTime())) sunsetHM = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); }
  // ── Machines À venir ──
  const machines = {};
  { const low = (vacEtat || '').toLowerCase(); const bat = vacBattery; // null si capteur indispo → « — », pas un faux 0 %
    const paused = /pause/.test(low);
    const returning = /retour/.test(low);
    const charging = (vacOnBase || /charge/.test(low)) && bat != null && bat < 100;
    let phase, color, anim = null, spin = false;
    if (vacCleaning && !paused) { phase = tr('Nettoyage'); color = 'var(--o-cold)'; anim = 'wiggle'; spin = true; }
    else if (paused) { phase = tr('En pause'); color = 'var(--o-warn2)'; }
    else if (returning) { phase = tr('Retour base'); color = 'var(--o-purple)'; }
    else if (/erreur|error/.test(low)) { phase = tr('Erreur'); color = 'var(--o-bad)'; }
    else if (vacOnBase || /station|base|accueil|charge/.test(low)) { if (bat != null && bat < 100) { phase = tr('En charge'); color = 'var(--o-warn)'; anim = 'charge'; } else { phase = tr('Sur base'); color = 'var(--o-ok)'; } }
    else { phase = vacEtat || tr('Inactif'); color = 'var(--o-text3)'; }
    const batColor = couleurPile(bat);
    // Les clés d'une machine disent sa nature, plus le surnom d'un appareil (chantier IoT, passe bis 2 du 18/10, point L).
    machines.aspirateur = { label: (rVac && rVac.name) || tr('Aspirateur'), iconKey: 'vacuum', phase, color, active: (vacCleaning && !paused) || returning, anim, spin, valueIcon: charging ? 'battery-charging' : 'battery', valueText: bat != null ? Math.round(bat) + '%' : '—', bar: bat, barColor: batColor };
  }
  { const mid = mowerId(S); const lm = mid ? S[mid] : null; const st = lm ? lm.state : 'unknown';
    const bat = num(mowerSensor(S, 'battery'), null);
    const chgS = S[mowerSensor(S, 'charging')]; const chg = !!(chgS && ['on', 'true', 'True', 'Oui'].indexOf(chgS.state) >= 0);
    const prog = num(mowerSensor(S, 'progress'), 0) || 0;
    let phase, color, anim = null, spin = false;
    if (st === 'mowing') { phase = tr('Tonte'); color = 'var(--o-ok)'; anim = 'wiggle'; spin = true; }
    else if (st === 'returning') { phase = tr('Retour base'); color = 'var(--o-purple)'; }
    else if (st === 'docked') { if (chg) { phase = tr('En charge'); color = 'var(--o-warn)'; anim = 'charge'; } else { phase = tr('Sur base'); color = 'var(--o-ok)'; } }
    else if (st === 'paused') { phase = tr('En pause'); color = 'var(--o-warn2)'; }
    else if (st === 'error') { phase = tr('Erreur'); color = 'var(--o-bad)'; }
    else { phase = tr('Inactif'); color = 'var(--o-text3)'; }
    const mowing = st === 'mowing'; const batColor = couleurPile(bat);
    machines.tondeuse = { label: (lm && lm.attributes && lm.attributes.friendly_name) || tr('Tondeuse'), iconKey: 'mower', phase, color, active: st === 'mowing' || st === 'returning', anim, spin, valueIcon: chg ? 'battery-charging' : 'battery', valueText: Math.round(bat) + '%', bar: mowing ? prog : bat, barColor: mowing ? color : batColor, extra: mowing ? (tr('Tonte') + ' ' + Math.round(prog) + '%') : null };
  }
  // Les seuils de phase (100, 200, 500, 1500) sont des watts : la prise du
  // lave-vaisselle se lit par `numW`, comme les flux (audit du 03/10).
  { const power = numW(notifIds().dishwasher) || 0; const active = power > 100;
    let phase, color, anim = null, spin = false;
    if (!active) { phase = tr('Éteint'); color = 'var(--o-text3)'; }
    else if (power > 1500) { phase = tr('Lavage'); color = 'var(--o-cold)'; spin = true; }
    else if (power > 500) { phase = tr('Rinçage'); color = 'var(--o-ok)'; spin = true; }
    else if (power > 200) { phase = tr('Séchage'); color = 'var(--o-warn)'; anim = 'charge'; }
    else { phase = tr('En cours'); color = 'var(--o-cold)'; spin = true; }
    /* La barre de progression et le « ~X min restant » sont PARTIS (audit du
     * 27/09). Ils se calculaient sur une durée de cycle de quatre-vingts
     * minutes écrite en dur — un chiffre qu'aucune entité ne donne, et faux
     * dès que le cycle ne fait pas cette durée-là. « Il reste 12 min » sur une
     * machine qui en a encore pour une heure est pire que rien.
     *
     * Ce qui reste est MESURÉ : la phase d'après la puissance, la durée
     * écoulée d'après l'heure de départ, les watts.
     *
     * L'horodatage compte les secondes depuis minuit : un départ à 23 h 30
     * vu à 0 h 40 est celui de la VEILLE. On l'ajoutait au minuit du jour,
     * l'écart devenait négatif et s'affichait « 0min » jusqu'à la fin du
     * cycle (audit du 03/10) — voir `minutesDepuisHeure`. */
    const idt = S[notifIds().dishwasherStart];
    const ts = (idt && idt.attributes && idt.attributes.timestamp) ? idt.attributes.timestamp : 0;
    const elapsedMin = minutesDepuisHeure(ts);
    const departSu = elapsedMin != null && elapsedMin <= 1440;
    machines.lv = { label: tr('Lave-vaisselle'), iconKey: 'dishwasher', phase, color, active, anim, spin, valueIcon: 'timer', valueText: active ? (departSu ? dureePrise(elapsedMin) : tr('En cours')) : '--:--', bar: null, barColor: color, extra: active ? (Math.round(power) + 'W') : null };
  }
  { const pbE = S[notifIds().bins];
    if (pbE) {
      const at = pbE.attributes || {}; const jours = parseInt(at.jours_restants) || 0;
      const today = at.est_aujourd_hui === true || at.est_aujourd_hui === 'True';
      const demain = at.est_demain === true || at.est_demain === 'True';
      let phase, color;
      if (today) { phase = tr("Aujourd'hui !"); color = 'var(--o-bad)'; }
      else if (demain) { phase = tr('Demain soir'); color = 'var(--o-warn2)'; }
      else if (jours <= 3) { phase = tr('Dans {j}j', { j: jours }); color = 'var(--o-warn)'; }
      else { phase = tr('Dans {j}j', { j: jours }); color = 'var(--o-ok)'; }
      const dateDisp = at.decale_samedi ? (tr('Sam.') + ' ' + (at.date_formatee || '')) : (((at.jour_semaine || '') + ' ' + (at.date_formatee || '')).trim());
      const mainText = today ? tr('Sortir les poubelles !') : demain ? tr('Préparer ce soir') : (dateDisp || tr('Prochain ramassage'));
      machines.poubelles = { label: tr('Poubelles'), iconKey: today ? 'trash-full' : 'trash', phase, color, active: today || demain, anim: today ? 'shake' : (jours <= 3 ? 'bounce' : null), valueText: mainText, dotsFilled: Math.max(0, 14 - jours), dotsTotal: 14 };
    }
  }
  // Plantes (MiFlora) : null si capteur indispo → la ligne affiche « — »
  const plants = plantsCfg().map(p => ({
    name: p.name || p.base, img: p.img || null,
    hum: num(plantCapteur(S, p.base, 'moisture')), cond: num(plantCapteur(S, p.base, 'conductivity', 'µS/cm')),
    lux: num(plantCapteur(S, p.base, 'illuminance', 'lx')), temp: num(plantCapteur(S, p.base, 'temperature')),
    bat: num(plantCapteur(S, p.base, 'battery', '%')),
  }));
  return {
    flux: { solar: fmtW(solarW), home: fmtW(consoW), grid: (exporting ? '↑ ' : '↓ ') + fmtW(gridVal), exporting },
    /* La tuile de la bannière n'existe que si un compteur se lit (audit du
     * 03/10, ADR 0030) : `null` la retire, jamais de « 0 W » inventé. Elle dit
     * ce que la MAISON consomme en ce moment (25/10, « savoir combien je
     * consomme ») — en vert quand le soleil couvre tout et que le surplus
     * repart au réseau. */
    metricConso: consoW == null ? null : { raw: consoW, color: exporting ? 'var(--o-ok)' : 'var(--o-accent-soft)' },
    rooms, inTemp, inTempUnite, inHum, maxCo2, lightsOn, lightsTotal: lightIds.length,
    people, cams, hass,
    vacLabel, vacBattery, alarmArmed, camOnline, camTotal, sunsetHM, machines, plants,
  };
}

/* `cycles` : les cycles d'électroménager que le serveur suit (`cyclesElectromenager`, prisesetat.js) — `null`, l'ancien
 * chemin : le capteur de puissance du lave-vaisselle de Paramètres › Notifications, au-dessus de 100 W. */
function deriveNotifs(hass, cycles = null) {
  const S = hass && hass.states; if (!S) return [];
  const out = [];
  const stOf = (id) => (S[id] && S[id].state) || null;
  // Les deux seuils lus plus bas (surplus, lave-vaisselle) sont des WATTS : la
  // valeur s'y ramène, quelle que soit l'unité du capteur (audit du 03/10).
  const wattsOf = (id) => (id && S[id] ? wattsDe(S[id]) : null);
  for (const id in S) { if (id.indexOf('alarm_control_panel.') === 0 && S[id].state === 'triggered') { out.push({ k: 'alarme:' + id, c: 'var(--o-bad)', t: tr('Alarme'), m: tr('Intrusion détectée') }); break; } }
  /* Alertes sûreté, sans aucune configuration : tout binary_sensor dont la
   * device_class désigne un danger passe en tête de liste dès qu'il est `on`.
   * La device_class est un standard HA, multilingue par nature — c'est elle
   * qui porte le sens, jamais le nom de l'entité. Une notification PAR
   * capteur : deux fuites = deux lignes, on ne résume pas un danger.
   *
   * Deux exclusions, constatées sur l'installation réelle avant d'écrire :
   * — `moisture` sur un binaire veut dire fuite d'eau, MAIS les plantes de la
   *   vue Plantes publient des binaires `<base>_besoin_eau` de cette classe :
   *   une dracaena assoiffée n'est pas un dégât des eaux. Tout binaire dont
   *   l'id commence par la base d'une plante configurée est écarté — et tout
   *   `moisture` qu'un modèle ou un groupe calcule (`fuiteCalculee`, la
   *   plateforme de l'index ; ADR 0022, 16/10), comme chez le serveur.
   * — `safety` sert aussi à MeteoAlarm, qui reste `on` des jours entiers en
   *   vigilance jaune. Ce n'est pas un danger domestique : il devient une
   *   notification de vigilance à part, ambre, portant l'événement réel
   *   (« Vigilance jaune orages ») — rouge seulement en Severe/Extreme. */
  // Les mots : LA table de sûreté (`motsSurete`, attention.js) — celle des points de l'Accueil et des fiches (audit du 19/10, lot 4).
  const basesPlantes = plantsCfg().map(p => p.base).filter(Boolean);
  const estPlante = (id) => basesPlantes.some(b => id.indexOf(b) === 0 && (id.length === b.length || id.charAt(b.length) === '_'));
  const surete = [];
  for (const id in S) {
    if (id.indexOf('binary_sensor.') !== 0) continue;
    const e = S[id]; if (!e || e.state !== 'on') continue;
    const a = e.attributes || {};
    const duo = motsSurete(a.device_class);
    if (!duo) continue;
    const nom = a.friendly_name || id;
    if (a.device_class === 'safety' && (a.awareness_level != null || /meteoalarm/i.test(id) || /meteoalarm/i.test(a.attribution || ''))) {
      const grave = a.severity === 'Severe' || a.severity === 'Extreme';
      out.push({ k: 'meteo:' + id + ':' + (a.event || a.headline || ''), c: grave ? 'var(--o-bad)' : 'var(--o-warn)', t: tr('Vigilance météo'), m: a.event || a.headline || tr('Alerte météo en cours') });
      continue;
    }
    if (a.device_class === 'moisture' && (estPlante(id) || fuiteCalculee(plateformeDe(id)))) continue;
    surete.push({ k: 'surete:' + id, c: 'var(--o-bad)', t: tr(duo[0]), m: tr(duo[1]) + ' · ' + nom });
  }
  out.unshift(...surete.slice(0, 4)); // les dangers d'abord, avant même l'alarme
  const mid = mowerId(S), mchg = mowerSensor(S, 'charging');
  const mow = mid ? stOf(mid) : null;
  if (mow === 'returning') out.push({ k: 'tondeuse:retour', c: 'var(--o-accent-soft)', t: tr('Tondeuse'), m: tr('Retour à la base') });
  else if (mchg && stOf(mchg) === 'on') out.push({ k: 'tondeuse:charge', c: 'var(--o-ok)', t: tr('Tondeuse'), m: tr('En charge') });
  /* Le surplus est une PUISSANCE (relecture du 03/10). L'index cumulé de
   * l'export (`injectionJour`, 850 kWh) passait le seuil de 100 W en
   * permanence, la nuit comprise. Même ordre que la vue Énergie : le flux net
   * du compteur (négatif à l'export), sinon l'injection, sinon le surplus. */
  /* LE FLUX NET : LA FICHE SEULE (relecture G3 du 30/10, point 6 ; ADR 0302). Il est désormais DÉCOUVERT (`stat_rate`) : lu
   * d'ici, « Surplus solaire » s'allumerait dès 100 W d'export, chaque jour de soleil — du bruit, pas un point rare et
   * actionnable. Comme avant le chantier, `consoNow` vient de la fiche ; l'injection et le surplus se lisent comme avant
   * (`enHaids`), découverte comprise (contre-relecture). */
  const EH = enHaids();
  const net = sommeLue(idsDe(ficheEnergie(), 'consoNow'), wattsOf);
  const sur = net != null ? Math.max(0, -net) : wattsOf(EH.injectionNow || EH.surplusNow);
  if (sur != null && sur > 100) out.push({ k: 'energie:surplus', c: 'var(--o-accent-soft)', t: tr('Énergie'), m: tr('Surplus solaire — export réseau') });
  const lv = wattsOf(notifIds().dishwasher);
  // Un cycle par entrée, et par départ : le suivant entre à neuf dans le journal des notifications.
  if (cycles) cycles.forEach(c => out.push({ k: 'cycle:' + c.id + ':' + c.debut, c: 'var(--o-accent)', t: nomDuCycle(c, cycles, S), m: tr('Cycle en cours') }));
  else if (lv != null && lv > 100) out.push({ k: 'lv:cycle', c: 'var(--o-accent)', t: tr('Lave-vaisselle'), m: tr('Cycle en cours') });
  const bins = stOf(notifIds().bins);
  if (bins && bins !== 'unknown' && bins !== 'unavailable') out.push({ k: 'poubelles:' + bins, c: 'var(--o-warn)', t: tr('Poubelles'), m: tr('Prochain ramassage : {d}', { d: bins }) });

  /* DEUX SOURCES DE PLUS (01/10). Elles existent dans toute installation, sans
   * la moindre configuration, et personne ne les disait : cinq mises à jour en
   * attente et une pile à plat sur l'installation d'essai.
   *
   * Une par entité, et non un total : « 5 mises à jour » changerait de texte à
   * chaque installation, donc de clé, donc rentrerait à neuf dans le journal.
   * Une par entité entre une fois, se marque lue, et s'en va.
   *
   * Ce qui n'y entre PAS : les entités indisponibles. Il y en a 912 sur
   * l'installation d'essai — c'est du bruit, pas un point d'attention, et la
   * règle est posée depuis le 19/09. */
  for (const id in S) {
    if (id.indexOf('update.') !== 0) continue;
    const e = S[id]; if (!e || e.state !== 'on') continue;
    const a = e.attributes || {};
    const v = a.latest_version ? ' ' + a.latest_version : '';
    out.push({ k: 'maj:' + id + ':' + (a.latest_version || ''), c: 'var(--o-accent-soft)', t: tr('Mise à jour'), m: (a.title || a.friendly_name || id) + v });
  }
  for (const id in S) {
    const e = S[id]; if (!e) continue;
    const a = e.attributes || {};
    if (a.device_class !== 'battery') continue;
    const n = parseFloat(e.state);
    // Le seuil de la maison (attention.js) : celui de la veille des piles (chantier Capteurs, C32, § 19.8).
    if (isNaN(n) || !niveauPile(n)) continue;
    out.push({ k: 'pile:' + id, c: 'var(--o-warn)', t: tr('Pile faible'), m: (a.friendly_name || id) + ' · ' + Math.round(n) + ' %' });
  }
  return out;
}

export { mowerId, mowerSensor, deriveAccueil, deriveNotifs };
