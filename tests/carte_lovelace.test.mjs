// Poser une carte Lovelace dans Loggia (05/10).
//
// Le catalogue était riche mais FERMÉ : ni `mini-graph-card`, ni
// `apexcharts-card`, ni même une `tile`. Tout l'écosystème restait dehors.
//
// Le rendu lui-même se vérifie dans le navigateur (Node ne charge pas les
// `.jsx`, et `loadCardHelpers` n'existe que dans Home Assistant) : ici on
// épingle les décisions qui tiennent le branchement.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const CL = lire('src', 'cartelovelace.jsx');
const APP = lire('src', 'App.jsx');

test('la carte vient de Home Assistant, on ne la réécrit pas', () => {
  assert.ok(CL.includes('window.loadCardHelpers()'), 'ce sont SES aides qui fabriquent la carte');
  assert.ok(CL.includes('aides.createCardElement(cfg)'));
  /* Les aides ne se chargent qu'UNE fois par page : chaque carte posée ne doit
   * pas relancer le téléchargement de tout l'éditeur de Lovelace. */
  assert.ok(CL.includes('if (!aidesPromesse) {'), 'une seule promesse pour toute la page');
});

test('l’état de la maison se REPASSE, il ne fait pas renaître la carte', () => {
  /* Reconstruire la carte à chaque changement d'état la ferait clignoter, et
   * lui ferait perdre son animation en cours. */
  assert.ok(CL.includes('useEffect(() => { if (carte.current && hass) carte.current.hass = hass; }, [hass]);'),
    'un effet à part, qui ne fait que poser la nouvelle valeur');
  assert.ok(CL.includes('const hassRef = useRef(hass);'),
    'la construction lit `hass` par référence vivante : il n’a pas à figurer dans ses dépendances');
  assert.ok(CL.includes('}, [sig]);'),
    'la carte ne se rebâtit que si sa CONFIGURATION change — un objet recréé à l’identique ne compte pas');
});

test('trois pannes, trois messages — jamais une page blanche', () => {
  assert.ok(CL.includes("setErreur('aides')"), 'les aides n’ont pas répondu');
  assert.ok(CL.includes("setErreur('type')"), 'le type n’existe pas : ressource absente ou nom mal écrit');
  assert.ok(CL.includes("setErreur('vide')"), 'aucune configuration');
  /* `createCardElement` lève sur un type inconnu : sans ce `try`, la vue
   * entière tombait avec la carte. */
  assert.ok(/try \{\s*el = aides\.createCardElement\(cfg\);\s*\} catch \{/.test(CL),
    'une carte qui refuse de naître n’emporte pas la vue');
  assert.ok(CL.includes("tr('Carte « {t} » introuvable. La ressource est-elle installée ?'"),
    'on dit CE QUI manque : « ça ne marche pas » n’aide personne à le réparer');
});

test('le thème : la carte garde sa mise en page, elle prend nos couleurs', () => {
  /* Une carte Home Assistant lit SES variables, pas celles de Loggia. Sans ce
   * pont, elle détonnerait sur les trente thèmes. */
  for (const v of ['--primary-color', '--card-background-color', '--ha-card-background', '--primary-text-color']) {
    assert.ok(CL.includes("'" + v + "'"), v + ' doit pointer sur une variable de Loggia');
  }
  assert.ok(CL.includes('style={PONT_THEME}'), 'posé sur le conteneur : il ne fuit pas au-dehors');
  assert.ok(CL.includes("'--card-background-color': 'var(--o-surfA)'"), 'et il va de HA VERS Loggia');
});

test('le branchement : une carte du catalogue comme les autres', () => {
  assert.ok(APP.includes("lovelace: tr('Carte Home Assistant')"), 'son nom dans le catalogue');
  assert.ok(APP.includes("if (t === 'lovelace') { const lu = lireConfig(x && x.yaml);"),
    'la configuration se lit UNE fois, au rendu');
  assert.ok(APP.includes('const CV_ROWS = { lovelace: 2,'), 'deux rangées, comme les cartes riches');
  // Le crayon ouvre l'éditeur propre au type, aux deux endroits qui éditent.
  assert.equal((APP.match(/setLovelaceEdit\(x\)/g) || []).length, 2,
    'les favoris de l’Accueil ET les vues personnalisées');
  assert.equal((APP.match(/<LovelaceEditSheet /g) || []).length, 2, 'et la feuille est montée aux deux endroits');
});

test('l’éditeur montre ce qu’on obtiendra, et refuse ce qu’il ne lit pas', () => {
  assert.ok(APP.includes('<CarteLovelace config={lu.config} hass={hass} />'),
    'l’aperçu est la VRAIE carte, avec les vrais états');
  assert.ok(APP.includes('disabled={!lu.ok}'), 'on n’enregistre pas une configuration illisible');
  assert.ok(APP.includes("tr('Une carte se décrit par des clés, pas par une liste.')"));
  assert.ok(APP.includes("tr('Cette configuration ne se lit pas. Les ancres et les blocs « | » ne sont pas pris en charge.')"),
    'on dit CE QU’ON NE SAIT PAS lire, plutôt que de deviner de travers');
});
