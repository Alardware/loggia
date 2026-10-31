/* ── Ce qui n'est pas l'air d'une pièce (audit du 19/10, H8, H9 ; décision D5) ──────────────────
 *
 * « Deviner d'abord, corriger à la main ensuite. » Une température ou une
 * humidité rangée dans une pièce n'en est pas toujours l'air : le frigo de la
 * cuisine (« Cuisine 4 °C · Trop froid »), la sonde d'un processeur, la buse ou
 * le plateau d'une imprimante 3D, un point de rosée calculé, la température
 * interne d'une prise (47 °C au salon). Jugées sur le confort d'une pièce,
 * elles étaient « à regarder » pour toujours ; prises par la découverte des
 * pièces, elles devenaient LA température de la pièce.
 *
 * La règle devine, dans cet ordre :
 *  - une entité de catégorie (`diagnostic`, `config`) n'est pas une mesure de
 *    l'air ;
 *  - son nom, celui de son appareil ou son modèle disent un frigo, un
 *    congélateur, une cave à vin, un processeur, un disque, une imprimante 3D,
 *    un point de rosée, un ressenti, une sonde interne, un aquarium, une
 *    piscine — dans les sept langues de Loggia ; et, pour une pièce du dehors
 *    (chantier G4, A3), le RealFeel, le refroidissement éolien, le thermomètre
 *    mouillé, l'indice de chaleur d'un service météo, une sonde de sol ;
 *  - son appareil a un autre rôle (`autreRole`) : un chauffe-eau, une prise ou
 *    un relais (un `switch`, ou une puissance mesurée).
 * La sonde d'un thermostat ou d'un humidificateur (tado, Nest, Ecobee, Sensibo)
 * EST l'air de la pièce (relecture du lot 3) : jugée comme lui. La découverte
 * des pièces la prend seulement à défaut d'un thermomètre à part
 * (`sondeDAppareil`). Les mots de la PIÈCE ne comptent pas (`piece`) : une
 * « Piscine » nommée ainsi n'est pas l'eau d'une piscine.
 * Ce qu'elle écarte reste visible, en neutre, sous son nom de Home Assistant.
 * Le réglage « Ne pas juger cette mesure » de sa fiche corrige la devinette
 * dans les deux sens (`loggia_mesures_nonjugees`, App.jsx).
 *
 * Pur : pas de React, pas de Home Assistant. `meta(id)` : ce que l'index sait
 * d'une entité (`category`, `name`, `device`) ; `appareil` : son appareil
 * (`name`, `model`) ; `soeurs` : les entités de son appareil.
 */
import { sansAccents } from './outils.js';

/** La correction à la main, dans la configuration de la maison (réservée aux administrateurs) : `{ entity_id: true | false }` —
 *  vrai, ne pas juger ; faux, juger malgré la devinette. */
export const CLE_NON_JUGEES = 'loggia_mesures_nonjugees';

// Des RACINES, prises au début d'un mot : « réfrigérateur », « Kühlschrank », « congélateur », « extrudeuse » ; le plateau d'une
// IMPRIMANTE seulement (« heatbed », « plateau chauffant »), jamais un plateau quelconque.
const RACINES = /(^|[^a-z0-9])(frigo|fridge|refrigera|frigorif|congel|freezer|kuhl|gefrier|koelkast|vriez|nevera|lodowk|zamraz|cave a vin|wine|weinkuhl|processeu|processo|chipset|carte mere|motherboard|mainboard|nozzle|hotend|extrud|heat ?bed|heater bed|print bed|plateau chauff|plateau d.?imprim|rosee|dew ?point|taupunkt|dauwpunt|rugiada|rocio|punkt rosy|ressenti|feels like|apparent temp|internal|device temp|aquarium|piscin|zwembad|schwimmbad|basen)/;
/* Une température qui n'est pas l'AIR du dehors (chantier G4, A3 ; ADR 0303), dans les sept langues : le RealFeel d'AccuWeather
 * (actif par défaut, à l'ombre aussi), le refroidissement éolien, le thermomètre mouillé, l'indice de chaleur, la température
 * apparente ou ressentie (« gefühlte », « percepita », « sensación térmica », « odczuwalna ») — et le SOL : « soil », « Boden »,
 * « bodem », « suolo », « suelo », « gleba ». Rangée dans « Jardin », chacune devenait LA température du jardin. Le « ł » polonais
 * ne se décompose pas : il reste un espace dans le nom, un « l » dans l'identifiant (`[l ]`). */
const RESSENTI_SOL = /(^|[^a-z0-9])(realfeel|real feel|wind ?chill|refroidissement eolien|windkuhl|raffreddamento|enfriamiento|wych[l ]odz|wet ?bulb|thermometre mouille|bulbe humide|feuchtkugel|natte ?bol|bulbo umido|bulbo humedo|termometr[a-z]* wilgotn|heat ?index|indice de chaleur|hitzeindex|hitte ?index|indice di calore|indice de calor|indeks ciep[l ]a|apparent|gefuhlt|gevoelstemp|percepit|sensacion termica|odczuwaln|soil|boden|bodem|suolo|suelo|gleba|gleby|glebie)/;
// Des mots entiers, trop courts pour une racine : « CPU », « SoC », « interne » (pas « internet »), « Pool » ; le « sol » (A3), mais
// jamais celui d'une pièce : « Sous-sol », « S/sol », « Ss-sol », « Entre-sol » (relecture G4, point 4) — des mots entiers eux
// aussi : « Capteurs sol » reste un sol.
const MOTS = /(^|[^a-z0-9])(cpu|gpu|soc|nvme|ssd|hdd|disk|disque|buse|interne|tool ?0|pool|(?<!(?:^|[^a-z0-9])(?:sous|ss|s|entre) )sol)(?![a-z0-9])/;
/* « Bed temperature » : le lit d'une imprimante (OctoPrint, Prusa, Bambu, Klipper), mais aussi « Master Bed Temperature », une chambre.
 * Il ne compte qu'avec un signe d'imprimante dans le texte ou chez ses sœurs. */
const LIT = /(^|[^a-z0-9])bed temp/;
const IMPRIMANTE = /print|imprim|octoprint|prusa|bambu|klipper|moonraker|creality|nozzle|hotend|extrud|tool ?0/;
// Les domaines d'un appareil qui a un autre rôle que mesurer l'air.
const ROLES = ['water_heater', 'switch'];

/** La sonde d'un thermostat ou d'un humidificateur : l'air de la pièce, que la découverte prend à défaut d'un thermomètre à part. */
export const sondeDAppareil = (soeurs) => (soeurs || []).some(e => e.indexOf('climate.') === 0 || e.indexOf('humidifier.') === 0);

/** L'appareil de cette entité a-t-il un autre rôle (H9) ? Un chauffe-eau, une prise (un `switch` qui n'est pas un réglage, ou une
 *  puissance mesurée). */
function autreRole(soeurs, S, meta) {
  return (soeurs || []).some(e => !(meta(e) || {}).category && (ROLES.indexOf(e.split('.')[0]) >= 0
    || (e.indexOf('sensor.') === 0 && ((S && S[e] && S[e].attributes) || {}).device_class === 'power')));
}

/* Le texte d'une entité, sans accents : son nom, son identifiant, son appareil — moins le nom de sa PIÈCE, en mots entiers (une pièce
 * « A » n'efface pas les « a » du reste). */
function texteDe(id, S, m, appareil, piece) {
  const a = (S && S[id] && S[id].attributes) || {};
  let texte = ' ' + sansAccents([a.friendly_name, String(id).replace(/[._]/g, ' '), m.name, m.device, appareil && appareil.name, appareil && appareil.model].filter(Boolean).join(' ')).replace(/[^a-z0-9]+/g, ' ') + ' ';
  const p = sansAccents(piece).replace(/[^a-z0-9]+/g, ' ').trim();
  if (p) texte = texte.split(' ' + p + ' ').join('  ');
  return texte;
}

/** Une mesure qui n'est pas l'air de sa pièce : sa catégorie, ses mots — hors ceux du nom de sa pièce (`piece`) —, ou le rôle de son
 *  appareil. */
export function horsAir(id, S, meta, appareil, soeurs, piece = null) {
  const m = meta(id) || {};
  if (m.category) return true;
  const texte = texteDe(id, S, m, appareil, piece);
  return RACINES.test(texte) || RESSENTI_SOL.test(texte) || MOTS.test(texte) || (LIT.test(texte) && IMPRIMANTE.test(texte + ' ' + (soeurs || []).join(' '))) || autreRole(soeurs, S, meta);
}

/* Ce que mesure aussi un thermostat, et qui n'est pas la pièce : l'eau de la chaudière, le départ, le retour, l'eau chaude sanitaire,
 * le dehors — dans les sept langues (contre-relecture du lot 3 : OpenTherm donnait 62 °C au cellier). Pas « chaudière » : l'identifiant
 * de la sonde d'une pièce le porte souvent (`sensor.chaudiere_piece`). */
const EAU_DEHORS = /(^| )(eau|water|wasser|acqua|agua|woda|wody|depart|supply|flow|vorlauf|aanvoer|mandata|impulsion|zasilan|retour|return|rucklauf|ritorno|retorno|powrot|ecs|dhw|exterieur|exterieure|exterior|outdoor|outside|aussen|ausen|buiten|esterno|esterna|zewnetrz)/;

/** La sonde d'un thermostat (ou d'un humidificateur) qui dit l'air de la pièce, parmi `ids` : celle qui vaut ce que l'appareil affiche
 *  (`current_temperature`, `current_humidity`, à 0,1 près) ; sinon une qui ne dit ni l'eau, ni le dehors ; sinon aucune. */
export function sondeDeLaPiece(ids, S, soeurs, meta, classe, piece = null) {
  const attr = classe === 'humidity' ? 'current_humidity' : 'current_temperature';
  const affiche = (id) => {
    const app = soeurs(id).find(e => /^(climate|humidifier)\./.test(e) && S[e] && S[e].attributes && S[e].attributes[attr] != null);
    return app ? Number(S[app].attributes[attr]) : NaN;
  };
  const egale = ids.find(id => Math.abs(Number(S[id] && S[id].state) - affiche(id)) <= 0.1);
  if (egale) return egale;
  // Le nom de l'ENTITÉ seulement : l'appareil d'un thermostat de chaudière s'appelle souvent « Chaudière ».
  const propres = ids.filter(id => !EAU_DEHORS.test(texteDe(id, S, { name: (meta(id) || {}).name }, null, piece)));
  return propres.find(id => ((S[id] || {}).attributes || {}).state_class === 'measurement') || propres[0] || null;
}
