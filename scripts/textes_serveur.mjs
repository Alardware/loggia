/* Le catalogue des textes que le SERVEUR envoie au telephone (ADR 0070).
 *
 * Les notifications partent du composant Python, dans la langue de Home
 * Assistant : il lui faut ses propres traductions. Plutot qu'un second
 * catalogue ecrit a la main — et qui divergerait —, ce script recopie depuis
 * `src/langues/<code>.js` les seules cles du telephone dans
 * `custom_components/loggia/textes_catalogue.py`. Un test verifie que le
 * fichier genere est a jour.
 *
 *   node scripts/textes_serveur.mjs          # ecrit le fichier
 *   node scripts/textes_serveur.mjs --check  # sort en erreur s'il differe
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CIBLE = join(RACINE, 'custom_components', 'loggia', 'textes_catalogue.py');

/* Ce qui part au telephone : les alertes de surete, les veilles, et le titre. */
export const CLES_TELEPHONE = [
  'Loggia — sûreté',
  'Fumée détectée : {nom}',
  'Gaz détecté : {nom}',
  'Monoxyde de carbone détecté : {nom}',
  'Fuite d’eau détectée : {nom}',
  /* « Alerte de sûreté » est partie le 06/10 avec la classe `safety` : elle ne
   * nomme pas le danger, et Meteoalarm s'en sert pour une alerte météo. */
  'Alarme déclenchée : {nom}',
  'Ouverture pendant que l’alarme est armée : {nom}',
  '{nom} : {v} ppm, il faut aerer',
  /* Le monoxyde chiffré au palier Danger (ADR 0251, « Téléphone, sans réaction »). */
  '{nom} : monoxyde de carbone à {v} ppm, aérez et sortez',
  '{nom} : pile a {v} %',
  /* La pile binaire (`on` = faible) et le détecteur de sûreté muet (audit du 19/10, M3 et M5). */
  '{nom} : pile faible',
  'Détecteur muet, à vérifier : {nom}',
  /* Plusieurs détecteurs muets ensemble, une seule notification (relecture du lot 2, point 8). */
  'Détecteurs muets, à vérifier : {nom}',
  '{nom} : {reste} restant, a remplacer',
  'Heures creuses : c’est le moment de lancer les machines',
  /* La fin d'un cycle d'electromenager (chantier Prises, P6). */
  '{nom} : cycle terminé à {h} ({kwh} kWh)',
  /* Le mode enfant (chantier Mode enfant, E13, E22) : le titre, la demande de
   * l'enfant, l'insistance au volume et au rallumage. */
  'Loggia — mode enfant',
  '{nom} demande 15 min de plus ({appareil})',
  'Volume ramené trois fois en dix minutes sur {appareil}',
  '{appareil} se rallume après l’heure',
  /* Le rappel de collecte, la veille au soir (chantier G2, S2 ; ADR 0301). */
  'Demain : {types}',
];

/* Ce que le serveur dit ou montre SANS passer par le telephone (chantier Mode
 * enfant) : la voix de l'Echo cinq minutes avant la coupure (E4 B), et les deux
 * boutons de la notification de la demande (E13). Traduits comme les textes
 * du telephone, dans la langue de la maison ; a part, parce que la garde de
 * tests/python/test_lot16_alertes_traduites.py ne compte dans CLES_TELEPHONE
 * que ce qu'un envoi au telephone cite. */
export const CLES_VOIX = [
  '{nom}, l’écran s’éteint dans cinq minutes',
  'Accorder 15 min',
  'Refuser',
  /* Le bouton du rappel de collecte (ADR 0301) : le même mot que le bandeau de l'Accueil. */
  'C’est sorti',
];

/* Les cles du telephone d'un catalogue, en chaines. Une valeur qui n'en est
 * pas une (un pluriel {few, many, other}, ADR 0071) aurait ete recopiee
 * telle quelle, et remplir() du serveur aurait envoye son str() au
 * telephone : le generateur s'arrete et le dit (05/10). Une cle absente
 * reste ecartee — textes_serveur et langues_catalogues l'attrapent deja. */
export function clesTelephone(cat, code) {
  const out = [];
  for (const cle of [...CLES_TELEPHONE, ...CLES_VOIX]) {
    const v = cat[cle];
    if (v == null) continue;
    if (typeof v !== 'string') throw new Error(`src/langues/${code}.js : « ${cle} » part au telephone, il doit etre une chaine`);
    if (v) out.push([cle, v]);
  }
  return out;
}

export async function catalogueTelephone() {
  const { CHARGEURS } = await import(pathToFileURL(join(RACINE, 'src', 'langues', 'index.js')).href);
  const textes = {};
  for (const code of Object.keys(CHARGEURS)) {
    let cat;
    try { cat = (await CHARGEURS[code]()).default; } catch { continue; } // catalogue pas encore ecrit
    const t = {};
    for (const [cle, v] of clesTelephone(cat, code)) t[cle] = v;
    if (Object.keys(t).length) textes[code] = t;
  }
  return textes;
}

export function rendrePython(textes) {
  const json = JSON.stringify(textes, null, 2);
  return '"""Genere par `node scripts/textes_serveur.mjs` depuis src/langues/ — ne pas editer a la main."""\n'
    + 'import json\n\n'
    + 'TEXTES: dict[str, dict[str, str]] = json.loads(r"""\n' + json + '\n""")\n';
}

const lance = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/').replace(/^([a-z]):/i, (m, d) => d.toUpperCase() + ':');
if (lance || (process.argv[1] && process.argv[1].endsWith('textes_serveur.mjs'))) {
  const attendu = rendrePython(await catalogueTelephone());
  if (process.argv.includes('--check')) {
    const actuel = readFileSync(CIBLE, 'utf8');
    if (actuel !== attendu) { console.error('textes_catalogue.py est en retard sur src/langues : node scripts/textes_serveur.mjs'); process.exit(1); }
    console.log('textes_catalogue.py a jour');
  } else {
    writeFileSync(CIBLE, attendu, 'utf8');
    console.log('ecrit', CIBLE);
  }
}
