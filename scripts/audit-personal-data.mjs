// Controle avant publication.
//
// Le depot est distribuable ; les sources, elles, portent encore les constantes
// de l'installation d'origine — gardees comme repli le temps de la transition.
// Ce script dit exactement ce qui reste a retirer avant de rendre le depot
// public, et sort en erreur tant qu'il reste quelque chose.
//
//   npm run audit
//
// Volontairement separe de `npm test` : il est rouge aujourd'hui, et un jeu de
// tests rouge en permanence cesse d'etre un signal.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const SCAN = ['src', 'custom_components', 'tests'];
const EXT = /\.(m?js|jsx|py|json|css|html|md)$/;
const SKIP = /(node_modules|__pycache__|\.avant-|frontend[/\\]assets|frontend[/\\]fonts)/;

// Chaque motif porte ce qu'il faut faire, pas seulement ce qu'il trouve.
const RULES = [
  // « nebula » n'est pas dans la liste : ciel3d.jsx parle de la nebuleuse
  // d'Loggia, et le serveur qui porte ce nom expose des entites `192_168_0_212_*`
  // que la regle d'adresse IP attrape deja. L'audit ne doit pas crier au loup.
  { re: /\b(wall_e|luba_vpruqjbj|andromeda|ucg_max|haos_nova|g6_bullet|g6_entry|powerstream|plant_sensor_00)/i,
    why: 'identifiant d’appareil de l’installation d’origine' },
  { re: /\blinky_\d{6,}/i, why: 'numero de compteur Linky' },
  { re: /\bperson\.(guillaume|clara|liam|nova)\b/i, why: 'personne nommee' },
  { re: /\b192_168_\d+_\d+\b/, why: 'adresse IP dans un identifiant d’entite' },
  { re: /\b(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d+\.\d+\b/, why: 'adresse IP privee' },
  { re: /lat:\s*-?\d+\.\d{4,}/, why: 'coordonnees du domicile' },
  { re: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/, why: 'adresse e-mail' },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP.test(path)) continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXT.test(name)) out.push(path);
  }
  return out;
}

const hits = [];
for (const base of SCAN) {
  let files;
  try { files = walk(join(ROOT, base)); } catch { continue; }
  for (const path of files) {
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        const m = line.match(rule.re);
        if (m) { hits.push({ file: relative(ROOT, path), line: i + 1, why: rule.why, sample: m[0] }); break; }
      }
    });
  }
}

if (!hits.length) {
  console.log('Aucune donnee personnelle trouvee — le depot peut etre publie.');
  process.exit(0);
}

const byFile = new Map();
hits.forEach(h => { if (!byFile.has(h.file)) byFile.set(h.file, []); byFile.get(h.file).push(h); });

console.log(hits.length + ' occurrence(s) a retirer avant publication :\n');
for (const [file, list] of byFile) {
  console.log('  ' + file + '  (' + list.length + ')');
  const shown = list.slice(0, 6);
  shown.forEach(h => console.log('    l.' + String(h.line).padStart(5) + '  ' + h.why + ' — ' + h.sample));
  if (list.length > shown.length) console.log('    … et ' + (list.length - shown.length) + ' autres');
}
console.log('\nCes references sont les constantes de transition (VAC_HAIDS, EN_HAIDS,');
console.log('SYS_SENSORS…). Plus aucune vue ne les lit : elles ne servent que de repli');
console.log('et a alimenter loggiaConfig.adopt(). Les supprimer est la derniere etape.');
process.exit(1);
