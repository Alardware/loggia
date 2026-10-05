// Le journal de la vue Systeme se prend au clavier (audit du 03/10).
//
// Sa liste DEFILE dans la carte (retour du 17/09) : soixante evenements dans
// une hauteur fixe, et aucune ligne n'est un bouton. Firefox et les Chrome
// recents rendent focalisable un cadre a defilement sans enfant focalisable ;
// Safari et l'appli iOS non. Au clavier, la journee s'arretait donc a ce que la
// carte montrait — ni les fleches ni Page suivante n'atteignaient le reste.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const vue = readFileSync(join(RACINE, 'src', 'views', 'systeme.jsx'), 'utf8');
const EN = (await import(new URL('../src/langues/en.js', import.meta.url))).default;
const lignes = vue.split(/\r?\n/);
const iListe = lignes.findIndex(l => l.includes('className="sys-journal-liste"'));

test('la liste du journal se prend au clavier, et dit ce qu’elle est', () => {
  assert.ok(iListe > 0, 'la liste du journal est introuvable');
  const ligne = lignes[iListe];
  assert.ok(ligne.includes("overflowY: 'auto'"), 'c’est bien la zone qui defile');
  assert.ok(ligne.includes('tabIndex={0}'), 'focalisable, dans l’ordre de tabulation');
  assert.ok(ligne.includes('role="region"'), 'une region, que le lecteur d’ecran annonce en y entrant');
  const OUVRE = "aria-label={tr('";
  const a = ligne.indexOf(OUVRE);
  assert.ok(a > 0, 'nommee, et par tr() : le nom se lit dans les sept langues');
  const nom = ligne.slice(a + OUVRE.length, ligne.indexOf("')}", a));
  assert.ok(nom && nom in EN, 'le nom a sa cle au catalogue : ' + nom);
  assert.ok(vue.includes("<EntetePanneau titre={tr('" + nom + "')}"), 'le nom entendu est le titre lu a l’ecran');
});

test('toute zone qui defile dans la vue Systeme se prend au clavier', () => {
  const zones = lignes.filter(l => /overflowY: '(auto|scroll)'|overflow: '(auto|scroll)'/.test(l));
  assert.ok(zones.length >= 1, 'le journal defile toujours dans sa carte');
  for (const z of zones) assert.ok(z.includes('tabIndex={0}') && z.includes('aria-label='), 'une zone qui defile sans focus : ' + z.trim().slice(0, 80));
});

test('l’exception a la regle d’accessibilite est nommee, juste au-dessus, et justifiee', () => {
  const avant = lignes[iListe - 1].trim();
  assert.ok(avant.startsWith('{/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- '), 'une seule regle, nommee, sur la ligne d’avant, avec sa raison');
  assert.ok(!/eslint-disable(?!-next-line|-line)/.test(vue), 'jamais une regle coupee pour tout le fichier');
});
