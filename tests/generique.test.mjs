// ─────────────────────────────────────────────────────────────────────────────
// La garantie centrale : ce code doit marcher chez quelqu'un d'autre.
//
// Loggia est écrit sur une installation, et destiné à toutes. Rien de ce qui
// n'existe que chez son auteur n'a le droit de figurer dans le code : ni
// identifiant d'entité, ni nom de personne, ni adresse, ni marque citée comme
// s'il n'en existait qu'une.
//
// Ces tests lisent les fichiers source eux-mêmes. Ils sont lents et grossiers,
// mais ils tiennent une promesse qu'aucun test de comportement ne peut tenir :
// celle de ce qui n'est PAS écrit.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'src');

/** Les fichiers source, avec leur contenu. */
function sources() {
  return readdirSync(SRC)
    .filter(f => /\.(js|jsx)$/.test(f))
    // demo.js est la maison de démonstration : ses identifiants sont INVENTÉS
    // et publics par construction — c'est tout son objet. L'exempter ici ne
    // troue pas le filet : il ne s'exécute que derrière `?demo`.
    .filter(f => f !== 'demo.js')
    .map(f => ({ nom: f, texte: readFileSync(join(SRC, f), 'utf8') }));
}

/**
 * Retire commentaires et documentation.
 *
 * Un commentaire a le droit de citer un exemple — « ex. cover.volet_salon » est
 * une explication, pas une dépendance. Ce qui compte est ce que le code
 * EXÉCUTE.
 */
function sansCommentaires(texte) {
  return texte
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/** Les lignes d'un texte qui contiennent un motif, avec leur numéro. */
function lignes(texte, motif) {
  const out = [];
  texte.split('\n').forEach((l, i) => {
    if (motif.test(l)) out.push(`${i + 1}: ${l.trim().slice(0, 120)}`);
  });
  return out;
}

// Les domaines dont un identifiant complet désignerait une entité précise.
const DOMAINES = ['light', 'switch', 'sensor', 'binary_sensor', 'climate', 'cover',
  'vacuum', 'camera', 'media_player', 'lock', 'fan', 'scene', 'script', 'automation',
  'input_boolean', 'input_number', 'input_select', 'person', 'alarm_control_panel',
  'lawn_mower', 'water_heater', 'humidifier', 'siren', 'valve', 'todo', 'update'];

/**
 * Un identifiant d'entité DANS UNE CHAÎNE littérale.
 *
 * On ne cherche que les chaînes : `light.turn_on` écrit dans du code est un
 * accès à une propriété, et `states[id]` ne cite rien. Un `'light.salon'` entre
 * guillemets, en revanche, ne peut être qu'une entité de l'installation de son
 * auteur.
 */
const ENTITE_LITTERALE = new RegExp(
  `['"\`](?:${DOMAINES.join('|')})\\.[a-z0-9_]{3,}['"\`]`, 'g');

test('aucun identifiant d’entité n’est écrit en dur dans le code exécuté', () => {
  const fautes = [];
  sources().forEach(({ nom, texte }) => {
    const trouves = sansCommentaires(texte).match(ENTITE_LITTERALE) || [];
    // Un domaine seul suivi d'un point (`'light.'`) est un préfixe de filtre,
    // pas une entité : il vaut pour toutes les lampes de n'importe qui.
    const vrais = [...new Set(trouves.filter(s => !/^['"`][a-z_]+\.['"`]$/.test(s)))];
    if (vrais.length) fautes.push(`${nom} : ${vrais.join(', ')}`);
  });
  assert.deepEqual(fautes, [],
    'ces identifiants n’existent que sur une installation :\n  ' + fautes.join('\n  '));
});

test('aucun prénom ni nom de personne dans le code exécuté', () => {
  // Une installation nomme ses pièces et ses appareils d'après ses habitants.
  // Ces noms ne doivent pas voyager avec le code — c'est une question de
  // confidentialité autant que de portabilité.
  // « Sam. » abrège samedi et « Alex » est un prénom de fixture : trop ambigus
  // pour être cherchés dans du texte libre. Les autres sont sans équivoque.
  const interdits = /\b(guillaume|alard|liam|luna)\b/i;
  const fautes = [];
  sources().forEach(({ nom, texte }) => {
    const l = lignes(sansCommentaires(texte), interdits);
    if (l.length) fautes.push(`${nom}\n    ` + l.join('\n    '));
  });
  assert.deepEqual(fautes, [], 'noms propres trouvés :\n  ' + fautes.join('\n  '));
});

test('aucune adresse d’installation ni jeton', () => {
  // Une adresse IP fixe, un jeton, un mot de passe : autant de choses qui font
  // marcher le dashboard chez une seule personne, ou qui ne devraient jamais
  // sortir de chez elle.
  const motifs = [
    // Un chemin SVG est plein de nombres pointés : seule une adresse écrite
    // dans une chaîne, éventuellement précédée d'un schéma, en est vraiment une.
    { quoi: 'adresse IP', re: /['"`](?:https?:\/\/)?(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?[/'"`]/ },
    { quoi: 'jeton', re: /\b(?:eyJ[A-Za-z0-9_-]{20,}|[A-Fa-f0-9]{64})\b/ },
    { quoi: 'mot de passe', re: /\b(password|passwd|api_key|secret)\s*[:=]\s*['"`][^'"`]+['"`]/i },
  ];
  const fautes = [];
  sources().forEach(({ nom, texte }) => {
    const code = sansCommentaires(texte);
    motifs.forEach(({ quoi, re }) => {
      lignes(code, re).forEach(l => fautes.push(`${nom} (${quoi}) ${l}`));
    });
  });
  assert.deepEqual(fautes, [], 'à retirer :\n  ' + fautes.join('\n  '));
});

test('les moteurs génériques ne citent aucune marque', () => {
  // Les moteurs doivent raisonner sur ce que Home Assistant publie. Une marque
  // citée y serait une dépendance à un catalogue qui vieillit — sauf dans les
  // profils, dont c'est précisément le rôle, et qui la déclarent alors comme
  // une donnée et non comme une condition écrite dans la logique.
  const moteurs = ['devices.js', 'capabilities.js', 'actions.js', 'present.js', 'health.js'];
  const marques = /\b(philips|hue|ikea|tradfri|sonos|xiaomi|aqara|shelly|tuya|netatmo|ecovacs|roborock|unifi|ubiquiti|alexa|samsung)\b/i;
  const fautes = [];
  sources().filter(s => moteurs.indexOf(s.nom) >= 0).forEach(({ nom, texte }) => {
    lignes(sansCommentaires(texte), marques).forEach(l => fautes.push(`${nom} ${l}`));
  });
  assert.deepEqual(fautes, [], 'marques citées :\n  ' + fautes.join('\n  '));
});

test('les moteurs sont indépendants de React et du navigateur', () => {
  // Ils doivent pouvoir tourner dans un test, dans un script, ailleurs. Un
  // import de React ou un accès à `window` les enchaînerait à l'interface.
  const moteurs = ['devices.js', 'capabilities.js', 'actions.js', 'profiles.js',
    'present.js', 'health.js'];
  const fautes = [];
  sources().filter(s => moteurs.indexOf(s.nom) >= 0).forEach(({ nom, texte }) => {
    const code = sansCommentaires(texte);
    if (/from ['"]react['"]/.test(code)) fautes.push(`${nom} importe React`);
    lignes(code, /\b(window|document|localStorage)\./).forEach(l => fautes.push(`${nom} ${l}`));
  });
  assert.deepEqual(fautes, [], 'dépendances à l’interface :\n  ' + fautes.join('\n  '));
});
