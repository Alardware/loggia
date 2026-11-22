// ─────────────────────────────────────────────────
// Lot 5b de l'audit du 12/11 (ADR 0373), partie « sans changement visible ».
//
// Des mémos qui se recalculaient pour rien — un `[]` ou un `{}` de repli neuf à
// chaque rendu, une dépendance en trop —, un mémo `cfg` qui attendait `ready`
// quand il lit l'INDEX, deux seuils d'écran à un pixel de la feuille de style,
// une bascule recopiée sans son rôle, un rail dessiné deux fois, un pas à pas
// qui jetait le focus du clavier à sa borne. Ce test tient chaque point, et
// empêche chacun de revenir en silence.
//
// Le mémo `cfg` vit dans `App.jsx` : il se lit dans `MONOLITHE`
// (tests/monolithe.mjs), jamais dans `App.jsx` seul.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MONOLITHE } from './monolithe.mjs';
import { composant } from './rendu.mjs';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const CSS = lire('src/index.css');

/** Les dépendances, triées, du crochet qui s'ouvre à `debut` dans `src` : le tableau qui ferme l'appel, lu par
 *  équilibrage des parenthèses. */
function dependances(src, debut) {
  const d = src.indexOf(debut);
  assert.ok(d >= 0, '« ' + debut + ' » a disparu');
  let i = d + debut.length;
  for (let n = 1; n > 0; i += 1) {
    assert.ok(i < src.length, '« ' + debut + ' » ne se referme pas');
    if (src[i] === '(') n += 1; else if (src[i] === ')') n -= 1;
  }
  const corps = src.slice(d, i);
  const m = corps.match(/\[([^\]]*)\]\s*\)$/);
  assert.ok(m, '« ' + debut + ' » n’a pas de tableau de dépendances');
  return m[1].split(',').map(s => s.trim()).filter(Boolean).sort();
}

// ── A. Les replis constants ──────────────────────────────────────────────────

const REPLIS = [
  // [fichier, constante, la ligne de repli qui l'emploie]
  ['src/agendarail.jsx', 'AUCUN_EVENEMENT', 'const evts = Array.isArray(evenements) ? evenements : AUCUN_EVENEMENT;'],
  ['src/feuilleagenda.jsx', 'AUCUN_EVENEMENT', 'const evts = Array.isArray(evenements) ? evenements : AUCUN_EVENEMENT;'],
  ['src/rappelsrail.jsx', 'AUCUNE_TACHE', 'const liste = Array.isArray(taches) ? taches : AUCUNE_TACHE;'],
  ['src/rappelsrail.jsx', 'AUCUN_ETAT', 'const S = (hass && hass.states) || AUCUN_ETAT;'],
  ['src/fichemeteo.jsx', 'SANS_ETATS', 'const S = (hass && hass.states) || SANS_ETATS;'],
  ['src/fichemeteo.jsx', 'SANS_ATTRIBUTS', 'const a = (st && st.attributes) || SANS_ATTRIBUTS;'],
  ['src/cartescustom/galerie.jsx', 'SANS_ETATS_ACTIVITE', 'const S = (hass && hass.states) || SANS_ETATS_ACTIVITE;'],
];

test('A : chaque repli est une constante GELÉE du module, plus un `[]` ou un `{}` neuf à chaque rendu', () => {
  for (const [f, nom, ligne] of REPLIS) {
    const src = lire(f);
    assert.ok(src.includes(ligne), f + ' : le repli n’emploie plus ' + nom);
    const defini = f === 'src/feuilleagenda.jsx'
      ? /import \{[^}]*\bAUCUN_EVENEMENT\b[^}]*\} from '\.\/agendarail\.jsx';/.test(src)
      : new RegExp('^(export )?const ' + nom + ' = Object\\.freeze\\((\\[\\]|\\{\\})\\);$', 'm').test(src);
    assert.ok(defini, f + ' : ' + nom + ' n’est plus une constante gelée du module');
    // Une constante partagée qu'on modifierait en place se modifierait pour tous les rendus.
    assert.ok(!new RegExp('\\b' + nom + '\\s*(\\.(push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin)\\(|\\[[^\\]]*\\]\\s*=[^=]|\\.[A-Za-z_]+\\s*=[^=])').test(src), f + ' : ' + nom + ' est modifié en place');
  }
  // Les noms locaux qui portent ces replis ne sont pas modifiés en place non plus.
  for (const [f, local] of [['src/agendarail.jsx', 'evts'], ['src/feuilleagenda.jsx', 'evts'], ['src/rappelsrail.jsx', 'liste']]) {
    assert.ok(!new RegExp('\\b' + local + '\\.(push|pop|shift|unshift|splice|sort|reverse|fill)\\(').test(lire(f)), f + ' : ' + local + ' est modifié en place');
  }
});

test('A : le repli de l’agenda est vide, gelé, et la carte se dessine sans événement', async () => {
  const AUCUN = await composant('agendarail.jsx', 'AUCUN_EVENEMENT');
  assert.ok(Array.isArray(AUCUN) && AUCUN.length === 0 && Object.isFrozen(AUCUN));
  const CarteAgenda = await composant('agendarail.jsx', 'CarteAgenda');
  assert.ok(renderToStaticMarkup(createElement(CarteAgenda, {})).length > 0, 'la carte sans événement');
});

test('A : la liste des agendas suit `hass`, sans le nombre d’entités en plus', () => {
  const src = lire('src/feuilleagenda.jsx');
  assert.ok(!src.includes('nbEntites'), 'le nombre d’entités est revenu');
  assert.deepEqual(dependances(src, 'const cals = useMemo('), ['evts', 'hass']);
});

test('A : l’activité de la maison relit sa liste quand les ÉTATS changent', () => {
  const src = lire('src/cartescustom/galerie.jsx');
  const i = src.indexOf('function CvActivite(');
  assert.ok(i >= 0, 'CvActivite a disparu');
  assert.deepEqual(dependances(src.slice(i), 'const ids = useMemo('), ['S']);
});

// ── B. Le mémo `cfg` dépend de l'index ───────────────────────────────────────

test('B : `cfg` dépend de `loggiaRuntime.index`, qu’il lit — plus de `ready`', () => {
  const deps = dependances(MONOLITHE, 'const cfg = useMemo(');
  assert.deepEqual(deps, ['loggiaRuntime.index', 'serverCfg']);
  const i = MONOLITHE.indexOf('const cfg = useMemo(');
  const corps = MONOLITHE.slice(i, MONOLITHE.indexOf('}, [serverCfg, loggiaRuntime.index]);', i));
  assert.ok(corps.includes('loggiaRuntime.index') && !corps.includes('loggiaRuntime.ready'), 'le mémo lit l’index');
});

test('B : l’index garde sa référence d’un rendu à l’autre — `cfg` ne se recalcule pas à chaque rendu', async () => {
  const { buildRuntime } = await import('../src/runtime.js');
  const index = { areaList: [], entityMeta: new Map(), services: {} };
  const discovery = { ready: true, index, caps: {}, raw: null };
  const avertir = console.warn;
  console.warn = () => {};   // une résolution sur un index si maigre peut se plaindre : seul l'index compte ici
  try {
    const a = buildRuntime({ discovery, userCfg: {}, states: {} });
    const b = buildRuntime({ discovery, userCfg: { autre: 1 }, states: { 'light.x': { state: 'on' } } });
    assert.equal(a.index, index, 'le runtime reprend l’index de la découverte tel quel');
    assert.equal(b.index, a.index, 'deux runtimes de la même découverte, le même index');
    assert.equal(buildRuntime({ discovery: { ready: false }, userCfg: {}, states: {} }).index, null, 'rien de prêt : `null`');
  } finally {
    console.warn = avertir;
  }
});

// ── C. Les seuils d'écran alignés sur la feuille ─────────────────────────────

test('C : « téléphone » jusqu’à 760 px et 640 px INCLUS, dans le code comme dans la feuille', () => {
  // La feuille : `max-width` est inclusif.
  assert.ok(CSS.includes('@media (max-width: 760px) {'), 'la feuille ne dit plus « téléphone » jusqu’à 760 px');
  assert.ok(CSS.includes('@media (max-width: 640px) {'), 'la feuille ne dit plus « téléphone » jusqu’à 640 px');
  // `useWide(n)` est vrai à partir de n px (`min-width`) : son contraire s'arrête à n − 1.
  assert.ok(lire('src/app/ecran.jsx').includes("window.matchMedia('(min-width:' + bp + 'px)')"), 'useWide ne lit plus `min-width`');
  const energie = lire('src/views/energie.jsx');
  assert.ok(energie.includes('const etroit = !useWide(761);'), 'Énergie');
  assert.ok(!energie.includes('basculent au meme endroit'), 'le commentaire d’Énergie promet encore un seuil commun avec ses règles à 820 px');
  assert.ok(lire('src/ecranveille.jsx').includes('const large = useWide(761);'), 'l’écran de veille');
  assert.ok(lire('src/Onboarding.jsx').includes('const telephone = !useWide(641);'), 'le premier lancement');
  assert.ok(lire('src/accueil/dashboard.jsx').includes('const etroitPieces = !useWide(641);'), 'témoin : l’Accueil écrit déjà 641');
  for (const f of ['src/views/energie.jsx', 'src/ecranveille.jsx', 'src/Onboarding.jsx', 'src/accueil/dashboard.jsx']) {
    assert.ok(!/useWide\((760|640)\)/.test(lire(f)), f + ' : un seuil exclut de nouveau la borne de la feuille');
  }
});

// ── D. La bascule de Fenêtres ────────────────────────────────────────────────

test('D : Fenêtres emploie la bascule de ui.jsx — même dessin, et son rôle d’interrupteur', async () => {
  const src = lire('src/views/fenetres.jsx');
  assert.ok(!/const Bascule = /.test(src), 'la copie locale est revenue');
  assert.ok(/^import \{[^}]*\bBascule\b[^}]*\} from '\.\.\/ui\.jsx';$/m.test(src), 'la bascule de ui.jsx');
  assert.ok(src.includes("<Bascule nom={tr('Couper le chauffage dans cette pièce')} on={on} cb={() => basculerPiece(p)} />"), 'la bascule d’une pièce, nommée');
  const Bascule = await composant('ui.jsx', 'Bascule');
  const allumee = renderToStaticMarkup(createElement(Bascule, { on: true, nom: 'Couper', cb: () => {} }));
  const eteinte = renderToStaticMarkup(createElement(Bascule, { on: false, nom: 'Couper', cb: () => {} }));
  assert.ok(allumee.includes('role="switch" aria-checked="true" aria-label="Couper"') && eteinte.includes('aria-checked="false"'), 'le rôle et l’état');
  // Le dessin de l'ancienne copie, trait pour trait : rail 46 × 26, rond de 20, mêmes couleurs.
  assert.ok(allumee.includes('style="width:46px;height:26px;border-radius:999px;border:none;cursor:pointer;flex-shrink:0;padding:3px;background:var(--o-accent-fond);display:flex;justify-content:flex-end"'), 'le rail allumé');
  assert.ok(allumee.includes('<span style="width:20px;height:20px;border-radius:50%;background:#fff"></span>'), 'le rond allumé');
  assert.ok(eteinte.includes('background:var(--o-s1);display:flex;justify-content:flex-start') && eteinte.includes('background:var(--o-text3)'), 'éteinte');
});

// ── E. Le rail de « Comparer », dessiné une fois ─────────────────────────────

test('E : le rail de « Comparer » est dessiné UNE fois, et porté par les deux boutons', () => {
  const src = lire('src/views/energiehisto.jsx');
  assert.equal(src.split('width: 34, height: 20').length - 1, 1, 'le rail est de nouveau recopié');
  assert.equal(src.split('function RailComparer(').length - 1, 1);
  assert.equal(src.split('<RailComparer allume={comparer} />').length - 1, 2, 'l’ordinateur et le téléphone');
  assert.equal(src.split("{tr('Comparer')}").length - 1, 2);
  assert.equal(src.split('<button className="o-doigt" onClick={() => setComparer(v => !v)}').length - 1, 2);
});

// ── F. Le pas à pas garde le focus à sa borne ────────────────────────────────

test('F : à la borne, le pas à pas se dit coupé sans l’être, et ignore le clic', async () => {
  const PasAPas = await composant('fichecommune.jsx', 'PasAPas');
  const appuis = [];
  const props = { valeur: '45 g', nom: 'Portion', moins: () => appuis.push('-'), plus: () => appuis.push('+'), peutMoins: true, peutPlus: false };
  const html = renderToStaticMarkup(createElement(PasAPas, props));
  assert.ok(!html.includes('disabled=""'), '`disabled` retirerait le bouton de l’ordre du clavier');
  assert.ok(/<button type="button" aria-disabled="true" aria-label="Portion : Plus"/.test(html), '« Plus » se dit coupé');
  assert.ok(!/aria-disabled="true" aria-label="Portion : Moins"/.test(html), '« Moins » ne l’est pas');
  const [moins, , plus] = [].concat(PasAPas(props).props.children);
  assert.equal(plus.props.onClick, undefined, 'le clic à la borne ne part pas');
  moins.props.onClick();
  assert.deepEqual(appuis, ['-']);
  // Le dessin : l'opacité de la borne, et pas d'enfoncement — ce qu'un bouton `disabled` n'avait pas non plus.
  assert.equal(plus.props.style.opacity, 0.4);
  assert.equal(plus.props.style.transform, 'none');
  assert.equal(moins.props.style.transform, undefined);
});
