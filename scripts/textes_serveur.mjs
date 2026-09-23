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
  'Alerte de sûreté : {nom}',
  'Alarme déclenchée : {nom}',
  'Ouverture pendant que l’alarme est armée : {nom}',
  '{nom} : {v} ppm, il faut aerer',
  '{nom} : pile a {v} %',
  '{nom} : {reste} restant, a remplacer',
  'Heures creuses : c’est le moment de lancer les machines',
];

export async function catalogueTelephone() {
  const { CHARGEURS } = await import(pathToFileURL(join(RACINE, 'src', 'langues', 'index.js')).href);
  const textes = {};
  for (const code of Object.keys(CHARGEURS)) {
    let cat;
    try { cat = (await CHARGEURS[code]()).default; } catch { continue; } // catalogue pas encore ecrit
    const t = {};
    for (const cle of CLES_TELEPHONE) if (cat[cle]) t[cle] = cat[cle];
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
