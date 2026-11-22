// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Le Nuancier (20/11, son « Oui, fais le patch » sur la planche) : les éléments de base de Loggia sous le thème appliqué.
//
// Ce qui doit tenir :
//   • la page montre les VRAIS éléments (styles.js, parcommun.jsx, ui.jsx) — une copie dériverait sans que personne le voie ;
//   • le contraste se mesure là où la garde le tient (page et carte au seuil du jeton, puce au seuil WCAG) — mesuré
//     autrement, le Nuancier dénoncerait des défauts que le thème n'a pas ;
//   • on l'ouvre depuis Paramètres › Apparence, chargé à la demande ; la barre latérale ne gagne aucune entrée ;
//   • il ne pilote rien : aucun appel de service.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MONOLITHE } from './monolithe.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const nua = lire('src', 'edition', 'nuancier.jsx');
const coq = lire('src', 'edition', 'coquilles.jsx');
const app = MONOLITHE; // App.jsx et ce qui en est sorti (tests/monolithe.mjs)
const par = lire('src', 'views', 'parametres.jsx');
const ui = lire('src', 'ui.jsx');

test('le Nuancier montre les vrais éléments, pas des copies', () => {
  assert.ok(nua.includes("import { Fi, Bascule, ListeChoix, Gauge, MetricTile, BottomSheet, TitreFeuille } from '../ui.jsx';"));
  assert.ok(nua.includes("import { puce, puceHaute, petitesCapitales, NOM_CARTE, SOUS_CARTE, ICONE_CARTE, LISERE, sectionTitle } from '../styles.js';"));
  assert.ok(nua.includes("import { btnPrimaire, btnSecondaire, btnDiscret, btnDanger } from '../views/parcommun.jsx';"));
  // La liste des thèmes est celle du sélecteur de Paramètres, pas une seconde liste à tenir à jour.
  assert.ok(nua.includes("import { PRESET_META } from '../views/parametres.jsx';"));
  assert.ok(par.includes('export const PRESET_META = () => ['));
  // Une valeur affichée est lue sur la page, après que le thème l'a posée.
  assert.ok(nua.includes('getComputedStyle(document.documentElement).getPropertyValue(nom)'));
  assert.ok(nua.includes("attributeFilter: ['class', 'style', 'data-theme']"), 'les jetons se relisent quand le thème change');
});

test('le contraste se mesure où la garde le tient', () => {
  const g = lire('src', 'contraste.js');
  // La garde : page et cartes (surfA/surfB) au seuil du jeton ; --o-s1 / --o-s2 (puces) au seuil WCAG.
  assert.ok(g.includes("const surfaces = ['--o-surfA', '--o-surfB']"));
  assert.ok(g.includes("for (const t of ['--o-s1', '--o-s2'])"));
  assert.ok(nua.includes("const carte = sur('--o-surfA');"));
  assert.ok(nua.includes("const puceS1 = sur('--o-s1');"));
  assert.ok(nua.includes('ok: page >= seuil && (carte == null || carte >= seuil) && (puceS1 == null || puceS1 >= SEUILS.wcag)'));
  // Les seuils sont ceux de contraste.js, pas des chiffres recopiés.
  assert.ok(nua.includes("['--o-text', SEUILS.texte], ['--o-text1', SEUILS.wcag], ['--o-text2', SEUILS.text2], ['--o-text3', SEUILS.text3]"));
});

test('une pastille se voit sous tous les thèmes, filet ou non', () => {
  // Neumorphix et iOS n'ont pas de filet : avec le liseré du thème, une pastille de la couleur du fond disparaissait.
  assert.ok(nua.includes("border: '1px solid rgba(128,128,128,.35)'"));
});

test('on l’ouvre depuis Paramètres › Apparence, chargé à la demande, sans entrée dans la barre', () => {
  assert.ok(coq.includes("const NuancierViewDiffere = lazyRecharge(() => import('./nuancier.jsx').then(m => ({ default: m.NuancierView })));"));
  assert.ok(app.includes("'medias', 'biblio', 'nuancier']);"), 'la vue est connue : `?vue=nuancier` ne retombe pas sur l’Accueil');
  assert.ok(app.includes("view === 'nuancier' ? <NuancierView loggiaTheme={loggiaTheme} themeMode={themeMode} onPickTheme={onPickTheme} onMode={onMode} />"));
  assert.ok(par.includes("if (tab === 'apparence') return { sous: tr('Pour vous, sur ce type d’écran. Tout s’applique tout de suite.'), droite: onNav ? <button onClick={() => onNav('nuancier')} style={btnSecondaire}>{tr('Nuancier')}</button> : null };"));
  assert.ok(!/vid: 'nuancier'/.test(ui), 'le Nuancier n’a pas d’entrée dans la barre latérale');
  // Il n'est pas importé au démarrage : seule la coquille le charge.
  assert.ok(!/from '\.\/edition\/nuancier\.jsx'/.test(app));
});

test('le Nuancier ne pilote rien', () => {
  assert.ok(!/callService|callWS|callApi|getHass/.test(nua));
});
