/* Ce que la découverte range par pièce : les entités d’une pièce, les lumières, les volets.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { medPlayers, LOGGIA_INDEX, switchLights, loggiaEnt, LOGGIA_RESOLVED } from '../state.js';
import { versHex } from '../contraste.js';
import { interrupteurDeModule } from '../resolve.js';
import { lumieresDe } from '../lumieres.js';
import { CLASSES_SURETE, CLASSES_MOUVEMENT, CLASSES_OUVRANT } from '../attention.js';
import { comparerTextes, tr } from '../i18n.js';
import { rmNorm, climateZones, estClimate, cvEstLumiere, ecartDe } from './noyau.jsx';

/** Ce que la decouverte propose pour une piece, avant tout agencement. */
function roomEntitiesBrutes(hass, roomName) {
  if (!hass || !hass.states) return [];
  const target = rmNorm(roomName);
  const out = [];
  // 1) éclairages — ordre voulu : plafonnier, lampadaire, puis ampoules/rubans (comme la vue Lumières)
  const LT_ORDER = { plafonnier: 0, lampadaire: 1, ampoule: 2, veilleuse: 3 };
  try {
    discoverLights(hass).filter(l => rmNorm(l.room) === target)
      .sort((a, b) => (LT_ORDER[lightType(a)] - LT_ORDER[lightType(b)]) || comparerTextes(a.name, b.name))
      .forEach(l => out.push(l.id));
  } catch {}
  // 2) chauffage : toutes les zones de la pièce — poêle (climate.*) ET radiateurs fil pilote (switch + input_*,
  //    ou le select d'un module découvert), ces derniers référencés par « zone:<id> » car ils n'ont pas
  //    d'entité climate unique.
  climateZones(hass && hass.states).filter(z => rmNorm(z.room) === target).forEach(z => {
    if (estClimate(z) && z.haid && hass.states[z.haid]) out.push(z.haid);
    else if (hass.states[z.haid] || hass.states[z.tempCible]) out.push('zone:' + z.id);
  });
  // 3) volets (mappés par leur nom de config, ex. « Volet Séjour » → cover.volet_salon)
  voletCovers(hass.states).filter(c => rmNorm(c.name).indexOf(target) >= 0 && hass.states[c.haid]).forEach(c => out.push(c.haid));
  // 4) médias (lecteurs configurés dont le nom porte la pièce)
  medPlayers().filter(p => rmNorm(p.name).indexOf(target) >= 0 && hass.states[p.haid]).forEach(p => out.push(p.haid));
  // 5) le reste de la piece, depuis sa ZONE Home Assistant (maquettes du
  //    14/09) : prises, serrures, cameras, ventilateurs, capteurs d'ouverture,
  //    de mouvement, de surete, d'air — une carte par APPAREIL. Pas les
  //    temperatures ni les humidites : l'en-tete de la piece les porte deja.
  //    Ce que les zones de chauffage pilotent n'y revient pas en double, et
  //    l'editeur d'agencement retire ce qu'on ne veut pas voir.
  try {
    const zone = ((LOGGIA_INDEX && LOGGIA_INDEX.areaList) || []).find(z => rmNorm(z.name) === target);
    const pris = new Set(out);
    climateZones(hass.states).forEach(z => ['haid', 'tempCible', 'modeEnt', 'autoEnt'].forEach(k => { if (typeof z[k] === 'string') pris.add(z[k]); }));
    const meta = (id) => (LOGGIA_INDEX && LOGGIA_INDEX.entityMeta && LOGGIA_INDEX.entityMeta.get(id)) || {};
    const candidats = [];
    (zone ? zone.entities : []).forEach(id => {
      const st = hass.states[id]; if (!st || pris.has(id)) return;
      const m = meta(id); if (m.hidden || m.disabled || m.category) return;
      const d = id.split('.')[0]; const dc = (st.attributes || {}).device_class || '';
      const rang = ROOM_ZONE_DOMAINES.indexOf(d); if (rang < 0) return;
      if (d === 'switch' && cvEstLumiere(id)) return;
      // L'interrupteur d'un module fil pilote le rend sourd une fois coupé :
      // l'appareil a la carte de sa zone (étape 2), lui reste dans la fiche.
      if (d === 'switch' && interrupteurDeModule(LOGGIA_INDEX, id)) return;
      // Le pont de Zigbee2MQTT et une sirène n'ont pas de carte dans une pièce (chantier Prises, P1).
      if (d === 'switch' && ecartDe(hass.states, id)) return;
      if (d === 'binary_sensor' && ROOM_BIN_CLASSES.indexOf(dc) < 0) return;
      if (d === 'sensor' && (ROOM_SENSOR_CLASSES.indexOf(dc) < 0 || dc === 'temperature' || dc === 'humidity')) return;
      candidats.push({ id, rang, appareil: m.deviceId || null });
    });
    const parAppareil = new Set();
    candidats.sort((x, y) => x.rang - y.rang || rangClasse(x.id, hass.states) - rangClasse(y.id, hass.states) || comparerTextes(x.id, y.id)).forEach(c => {
      if (c.appareil) { if (parAppareil.has(c.appareil)) return; parAppareil.add(c.appareil); }
      out.push(c.id);
    });
  } catch {}
  return out.filter((id, i) => out.indexOf(id) === i);
}
// Ce que la zone d'une piece apporte a sa grille, par ordre de preference dans
// un meme appareil : la commande avant le capteur.
const ROOM_ZONE_DOMAINES = ['lock', 'camera', 'switch', 'fan', 'humidifier', 'valve', 'vacuum', 'lawn_mower', 'binary_sensor', 'sensor'];
// Les binaires d'une pièce : LA table des classes (attention.js) — la sûreté, la présence, les ouvrants —, plus la vibration.
const ROOM_BIN_CLASSES = [...CLASSES_SURETE, ...CLASSES_MOUVEMENT, ...CLASSES_OUVRANT, 'vibration'];
/* Les mesures d'une pièce, par ordre de PRIORITÉ (audit du 19/10, M9) : la carte unique d'un appareil est celle de sa première classe —
 * un purificateur montre son CO₂, pas son indice. Le monoxyde, les PM1, les COV en ppb, le dioxyde d'azote, l'ozone et la pression
 * atmosphérique y entrent (H10, M7) ; la température et l'humidité, l'en-tête de la pièce les porte. */
const ROOM_SENSOR_CLASSES = ['carbon_dioxide', 'carbon_monoxide', 'pm25', 'volatile_organic_compounds', 'volatile_organic_compounds_parts', 'pm10', 'pm1', 'nitrogen_dioxide', 'ozone',
  'temperature', 'humidity', 'aqi', 'sound_pressure', 'illuminance', 'pressure', 'atmospheric_pressure'];
const rangClasse = (id, S) => { const r = ROOM_SENSOR_CLASSES.indexOf(((S[id] && S[id].attributes) || {}).device_class); return r < 0 ? ROOM_SENSOR_CLASSES.length : r; };

// ── Acces des fonctions pures a la decouverte et a la configuration ──
// App les alimente a chaque rendu ; avant la premiere reponse elles valent
// null / {} et tout retombe sur les replis historiques.

// Fournie par App : envoie un lot de reglages au serveur et rafraichit l'etat.

// Piece d'un luminaire. La zone Home Assistant fait foi ; le decoupage par nom
// ne sert que pour les installations qui n'ont pas range leurs entites.
const LIGHT_ROOM = (id) => {
  const area = LOGGIA_INDEX && LOGGIA_INDEX.areaNameOf ? LOGGIA_INDEX.areaNameOf(id) : null;
  if (area) return area;
  const s = id.toLowerCase();
  if (/enfant|kid|child/.test(s)) return 'Chambre enfant';
  if (/chambre/.test(s)) return 'Chambre';
  if (/sejour|salon|lampadaire|_s\d/.test(s)) return 'Séjour';
  if (/cuisine/.test(s)) return 'Cuisine';
  if (/bureau/.test(s)) return 'Bureau';
  if (/sdb|salle_de_bain|_bain/.test(s)) return 'Salle de bain';
  if (/exter|jardin|facade|terrasse|balcon/.test(s)) return 'Extérieur';
  return tr('Autres');
};
/* `switchLights` (les switch déclarés lumière) et `ctxLumieres` vivent dans state.js, à côté du réglage (ADR 0261). */
// Découvre les lumières de la maison (L11, `lumieresDe`), groupées par pièce : les `light.*` sans catégorie, ni cachés ni
// désactivés, les groupes dédoublonnés, et les interrupteurs déclarés lumière (on/off).
function discoverLights(hass, index) {
  const S = hass.states;
  // La PIECE d'une lumiere est celle que Home Assistant lui donne. Le nom ne
  // sert que de repli, pour les entites qui n'ont pas encore ete rangees dans
  // une zone : deduire la piece des mots de l'identifiant obligeait a nommer
  // ses lumieres selon une convention qui n'existe que sur une installation.
  const pieceDe = (id) => {
    const zone = index && index.areaNameOf ? index.areaNameOf(id) : null;
    return zone || LIGHT_ROOM(id);
  };
  /* UNE définition (ADR 0261) : la LED d'une borne Wi-Fi (`config`) n'est pas une lumière de la maison, quel que soit
   * son nom — aucun motif de nom ne la cherche. Avant que l'index ne dise les catégories, tout `light.*` compte. */
  const meta = (index && index.entityMeta) || (LOGGIA_INDEX && LOGGIA_INDEX.entityMeta) || null;
  const ids = lumieresDe(S, { meta, switchsLumiere: switchLights() });
  const lights = ids.filter(id => id.indexOf('light.') === 0).map(id => {
    const st = S[id], at = st.attributes || {};
    const on = st.state === 'on';
    const modes = at.supported_color_modes || [];
    const dimmable = modes.some(m => m !== 'onoff');
    const rgbCap = modes.some(m => ['rgb', 'rgbw', 'rgbww', 'hs', 'xy'].indexOf(m) >= 0);
    const ct = modes.indexOf('color_temp') >= 0;
    const bri = (on && at.brightness != null) ? Math.max(1, Math.round(at.brightness / 255 * 100)) : (on ? 100 : 0);
    const rgb = at.rgb_color || null;
    const color = rgb ? versHex(rgb) : null;
    return { id, domain: 'light', name: at.friendly_name || id.replace('light.', '').replace(/_/g, ' '), room: pieceDe(id), on, bri, dimmable, rgb: rgbCap, ct, color, lc: st.last_changed };
  });
  const switches = ids.filter(id => id.indexOf('switch.') === 0).map(id => {
    const st = S[id], at = st.attributes || {}, on = st.state === 'on';
    return { id, domain: 'switch', name: at.friendly_name || id.replace('switch.', '').replace(/_/g, ' '), room: pieceDe(id), on, bri: on ? 100 : 0, dimmable: false, rgb: false, ct: false, color: null, lc: st.last_changed };
  });
  return [...lights, ...switches];
}
/* Type de luminaire d'après le nom/id — il ne sert plus qu'à RANGER les lampes d'une pièce (`LT_ORDER`, plus haut).
 * Toute lumière porte la même ampoule (`<Fi i="bulb" />`, sa demande du 14/10), un nom n'y change plus rien :
 * seule une icône choisie à la main l'emporte (`GlypheCarte`). */
function lightType(l) {
  const s = ((l.name || '') + ' ' + (l.id || '')).toLowerCase();
  if (/veilleuse|night/.test(s)) return 'veilleuse';
  if (/lampadaire|floor|pied|standing/.test(s)) return 'lampadaire';
  if (/plafonnier|plafond|ceiling|interrupteur|spot|downlight|dome/.test(s)) return 'plafonnier';
  return 'ampoule';
}
// Volets pilotés : configuration de l'utilisateur, sinon tout le domaine `cover`
// tel que la découverte l'a trouvé — les noms viennent de Home Assistant.
function voletCovers(S) {
  const c = loggiaEnt('covers', null);
  const list = (c && Array.isArray(c.list) && c.list.length) ? c.list : null;
  if (list) return list.filter(x => x && x.haid && (!S || S[x.haid]));
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.covers;
  if (r && r.available) return r.list.map(x => ({ id: x.id, name: x.name, haid: x.id }));
  return [];
}

export { roomEntitiesBrutes, ROOM_BIN_CLASSES, ROOM_SENSOR_CLASSES, rangClasse, discoverLights, voletCovers };
