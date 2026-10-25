// Le français VOUVOIE (sa règle, 19/10) : « Choisis le téléphone dans
// Paramètres › Alertes » (fiche d'une prise) tutoyait. Seule la CLÉ française
// change ; les valeurs traduites restent (l'allemand et l'espagnol tutoient
// comme Home Assistant, le polonais ne se réécrit jamais). Un texte qui DÉCRIT
// ce que fait l'appareil (« Coupe la prise au bout du temps choisi ») n'est pas
// un ordre donné à l'utilisateur : il reste.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

test('les textes français des prises vouvoient', () => {
  const fichiers = [['src', 'ficheprise.jsx'], ['src', 'ficheswitch.jsx'], ['src', 'prisesfiche.js'], ['src', 'enteteprises.jsx'],
    ['src', 'prises.js'], ['src', 'prisesetat.js']];
  const textes = fichiers.flatMap((p) => [...lire(...p).matchAll(/tr(?:N|Sens|Court)?\('((?:[^'\\]|\\.)*)'/g)].map(m => [p.join('/'), m[1]]));
  assert.ok(textes.length > 50, 'les textes ne sont plus lus : ' + textes.length);
  const tutoie = textes.filter(([, t]) => /(^|[.:!?]\s)(Clique|Touche|Appuie|Sélectionne|Choisis|Glisse|Ajoute|Tape|Fais|Va|Donne|Règle|Mets|Garde|Vérifie|Regarde|Ouvre)\b/.test(t)
    || /\b(tu|ton|ta|tes|toi|te)\b/i.test(t));
  assert.deepEqual(tutoie, [], 'tutoiement');
  assert.ok(lire('src', 'ficheprise.jsx').includes("tr('Choisissez le téléphone dans Paramètres › Alertes')"));
});

test('la clé change dans les six catalogues, la valeur traduite reste', () => {
  const valeurs = { en: 'Choose the phone in Settings › Alerts', de: 'Wähle das Telefon in Einstellungen › Warnungen',
    es: 'Elige el teléfono en Ajustes › Alertas', it: 'Scegli il telefono in Impostazioni › Allerte',
    nl: 'Kies de telefoon in Instellingen › Waarschuwingen', pl: 'Wybierz telefon w Ustawienia › Alerty' };
  for (const [l, v] of Object.entries(valeurs)) {
    const cat = lire('src', 'langues', l + '.js');
    assert.ok(cat.includes("'Choisissez le téléphone dans Paramètres › Alertes': '" + v + "'"), l);
    assert.ok(!cat.includes("'Choisis le téléphone dans Paramètres › Alertes'"), l + ' : l’ancienne clé est partie');
  }
});
