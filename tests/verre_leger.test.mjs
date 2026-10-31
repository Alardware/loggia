/* « Verre des cartes » : Plein ou Léger, réglage de l'appareil (ADR 0284).
 *
 * Le même verre — pas une seconde matière, la décision du 29/08 tient — à un
 * coût différent. Ce qui se vérifie ici :
 *  1. le choix : Auto suit la mesure du ciel, Plein et Léger s'imposent, le
 *     choix reste sur l'appareil, et sans mesure Auto vaut Plein ;
 *  2. la classe `loggia-verre-leger` posée au démarrage, avant le rendu ;
 *  3. la ligne des Paramètres : sous « Ciel animé », alignée, trois choix ;
 *  4. ce que la classe change en CSS — et ce qu'elle ne change pas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composant, rendre } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

// Un stockage d'appareil, et une racine dont on lit les classes.
const magasin = new Map();
const stockage = {
  getItem: (k) => (magasin.has(k) ? magasin.get(k) : null),
  setItem: (k, v) => { magasin.set(k, String(v)); },
  removeItem: (k) => { magasin.delete(k); },
  clear: () => magasin.clear(),
  key: (i) => [...magasin.keys()][i] ?? null,
  get length() { return magasin.size; },
};
Object.defineProperty(globalThis, 'localStorage', { value: stockage, configurable: true, writable: true });
const classes = new Set();
const racine = { classList: { toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); return on; }, contains: (c) => classes.has(c), add: (c) => classes.add(c), remove: (c) => classes.delete(c) } };
Object.defineProperty(globalThis, 'document', { value: { documentElement: racine }, configurable: true, writable: true });

const V = await import('../src/verre.js');
const W = await import('../src/wxpresets.js');

const poser = (o) => { magasin.clear(); for (const [k, v] of Object.entries(o)) magasin.set(k, v); };

test('sans réglage ni mesure, Auto vaut Plein : rien ne change pour qui ne touche à rien', () => {
  poser({});
  assert.equal(V.lireVerre(), 'auto');
  assert.equal(V.verreMesure(), null);
  assert.equal(V.verreLeger(), false);
});

test('Auto suit la fluidité que le ciel a mesurée ICI : plein → Plein, léger ou fixe → Léger', () => {
  for (const [niveau, attendu] of [['plein', false], ['leger', true], ['fixe', true]]) {
    poser({ 'loggia-ciel-actuel': niveau });
    // La même clé que le ciel écrit et que Paramètres affiche (« ici : … ») : pas une recopie qui divergerait.
    assert.equal(W.niveauCielIci(), niveau);
    assert.equal(V.verreMesure(), niveau === 'plein' ? 'plein' : 'leger');
    assert.equal(V.verreLeger(), attendu, 'ciel ' + niveau);
  }
  poser({ 'loggia-ciel-actuel': 'n’importe quoi' });
  assert.equal(V.verreLeger(), false, 'une valeur inconnue n’est pas une mesure');
});

test('sans mesure EN COURS, Auto reste à Plein : effets coupés, ou qualité du ciel forcée', () => {
  poser({ 'loggia-ciel-actuel': 'leger', 'loggia-wxfx': '0' });
  assert.equal(V.verreMesure(), null, 'effets coupés : la dernière mesure est ancienne');
  assert.equal(V.verreLeger(), false);
  for (const q of ['leger', 'fixe']) {
    poser({ 'loggia-ciel-actuel': 'leger' });
    W.ecrireQualiteCiel(q);
    assert.equal(W.lireQualiteCiel(), q);
    assert.equal(V.verreMesure(), null, 'ciel forcé en ' + q + ' : il ne mesure plus');
    assert.equal(V.verreLeger(), false);
  }
});

test('Plein et Léger s’imposent, quelle que soit la mesure', () => {
  poser({ 'loggia-verre': 'plein', 'loggia-ciel-actuel': 'fixe' });
  assert.equal(V.lireVerre(), 'plein');
  assert.equal(V.verreLeger(), false);
  poser({ 'loggia-verre': 'leger', 'loggia-ciel-actuel': 'plein' });
  assert.equal(V.lireVerre(), 'leger');
  assert.equal(V.verreLeger(), true);
  poser({ 'loggia-verre': 'opaque' });
  assert.equal(V.lireVerre(), 'auto', 'une valeur inconnue retombe sur Auto');
});

test('le choix est retenu par l’APPAREIL, et la classe suit sur-le-champ', async () => {
  const ecrireVerre = await composant('views/parametres.jsx', 'ecrireVerre');
  poser({});
  ecrireVerre('leger');
  assert.equal(magasin.get('loggia-verre'), 'leger', 'dans le stockage local, comme le « Ciel animé »');
  assert.equal(classes.has('loggia-verre-leger'), true);
  ecrireVerre('plein');
  assert.equal(magasin.get('loggia-verre'), 'plein');
  assert.equal(classes.has('loggia-verre-leger'), false);
  ecrireVerre('auto');
  assert.equal(magasin.has('loggia-verre'), false, 'Auto efface la clé : le défaut n’est pas écrit');
  assert.equal(classes.has('loggia-verre-leger'), false);
  // Ni le profil ni la configuration commune : la clé n'est écrite que là.
  const src = lire('src', 'views', 'parametres.jsx') + lire('src', 'verre.js');
  assert.ok(!/cfgSet\([^)]*verre/.test(src) && !/poserApparence\([^)]*verre/.test(src));
});

test('la classe est posée au DÉMARRAGE : à l’import du thème, avant tout rendu', async () => {
  poser({ 'loggia-verre': 'leger' });
  classes.clear();
  await composant('theme.js');
  assert.equal(classes.has('loggia-verre-leger'), true, 'theme.js n’a pas posé la classe en se chargeant');
  /* Et pas plus tard : un appel dans un effet viendrait après le premier
   * rendu, et chaque carte sauterait de Plein à Léger. */
  const theme = lire('src', 'theme.js');
  assert.match(theme, /\nposerVerre\(\);\n/, 'l’appel est au niveau du module');
  assert.ok(theme.indexOf('poserVerre();') < theme.indexOf('function applyLook'), 'avant applyLook');
  // verre.js ne tire rien : le démarrage n'emporte ni le ciel ni sa table.
  assert.ok(!/^import /m.test(lire('src', 'verre.js')), 'verre.js ne doit rien importer');
});

test('la ligne des Paramètres : « Verre des cartes » sous « Ciel animé », alignée, Auto / Plein / Léger', async () => {
  const PAR = lire('src', 'views', 'parametres.jsx');
  const ciel = PAR.indexOf("<OptRow eteint={!wxFx} title={tr('Ciel animé')}");
  const verre = PAR.indexOf("<OptRow title={tr('Verre des cartes')} desc={descVerre}>");
  const veille = PAR.indexOf("<OptRow title={tr('Écran de veille')}");
  assert.ok(ciel > 0 && verre > ciel && veille > verre, 'juste sous « Ciel animé », avant l’écran de veille');
  assert.ok(!/<OptRow[^>]*retrait[^>]*title=\{tr\('Verre des cartes'\)\}/.test(PAR), 'sans `retrait` : alignée sur les autres');

  // Le rendu : la section Apparence ouverte, Auto choisi. Le peu de fenêtre que Paramètres lit au rendu.
  const session = { getItem: () => 'apparence', setItem: () => {}, removeItem: () => {} };
  const rien = () => {};
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: {
    localStorage: stockage, sessionStorage: session, location: { search: '', href: 'http://loggia.test/', pathname: '/' },
    addEventListener: rien, removeEventListener: rien, dispatchEvent: () => true, innerWidth: 1280, innerHeight: 800,
    matchMedia: () => ({ matches: false, addEventListener: rien, removeEventListener: rien }),
  } });
  globalThis.sessionStorage = session;
  poser({});
  const { setLoggiaState } = await import('../src/state.js');
  setLoggiaState({ cfg: {} });
  const Par = await composant('views/parametres.jsx', 'ParametresContent');
  const html = rendre(Par, { hass: { states: {}, user: { is_admin: true } }, isAdmin: true, onLook: () => {} });
  const ligne = (titre) => {
    const i = html.indexOf('>' + titre + '</div>');
    assert.ok(i > 0, titre + ' absent du rendu');
    const d = html.lastIndexOf('<div class="o-optrow"', i);
    const f = html.indexOf('<div class="o-optrow"', i);
    return html.slice(d, f > 0 ? f : undefined);
  };
  const v = ligne('Verre des cartes'), c = ligne('Ciel animé'), plage = ligne('Plage horaire');
  const style = (s) => s.slice(0, s.indexOf('>')).replace(/opacity:[^;"]*;?/, '');
  assert.equal(style(v), style(c), 'la ligne n’a pas l’alignement de « Ciel animé »');
  assert.notEqual(style(v), style(plage), 'témoin : une ligne en retrait se distingue');
  assert.ok(v.includes('role="group" aria-label="Verre des cartes"'), 'le groupe porte son nom');
  const choix = [...v.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]*)<\/button>/g)].map(m => [m[2], m[1]]);
  assert.deepEqual(choix, [['Auto', 'true'], ['Plein', 'false'], ['Léger', 'false']]);
  assert.ok(v.includes('Suit la fluidité de l’appareil'), 'Auto sans mesure : la phrase existante, sans « ici »');
});

test('Auto dit ce qu’il a retenu ; Plein et Léger disent leur coût', () => {
  const PAR = lire('src', 'views', 'parametres.jsx');
  const d = PAR.slice(PAR.indexOf('const descVerre'), PAR.indexOf("tr('Suit la fluidité de l’appareil');", PAR.indexOf('const descVerre')));
  assert.ok(d.includes("verre === 'plein' ? tr('Flou calculé en direct derrière chaque carte')"));
  assert.ok(d.includes("verre === 'leger' ? tr('Fond flouté une seule fois, pour les tablettes anciennes')"));
  assert.ok(d.includes("veIci === 'plein' ? tr('Suit la fluidité de l’appareil · ici : plein')"), 'les phrases du ciel, reprises telles quelles');
  assert.ok(d.includes("veIci === 'leger' ? tr('Suit la fluidité de l’appareil · ici : léger')"));
  for (const lg of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const cat = lire('src', 'langues', lg + '.js');
    for (const k of ['Verre des cartes', 'Plein', 'Flou calculé en direct derrière chaque carte', 'Fond flouté une seule fois, pour les tablettes anciennes']) {
      assert.ok(cat.includes("  '" + k + "': "), lg + ' : « ' + k + ' » manque');
    }
  }
});

test('en CSS, Léger retire le flou des cartes — et garde ce qui flotte', () => {
  const css = lire('src', 'index.css');
  const regles = css.split('\n').filter(l => l.startsWith('html.loggia-verre-leger'));
  const de = (sel) => regles.find(l => l.startsWith(sel)) || '';
  // Les cartes, la tuile de l'alarme : plus de flou d'arrière-plan.
  const cartes = de('html.loggia-verre-leger [style*="--o-surfA"]');
  assert.ok(cartes.includes('.o-tuile-alarme') && /backdrop-filter: none/.test(cartes), 'les cartes gardent un flou');
  assert.ok(cartes.includes(':not([style*="position: fixed"])'), 'ce qui flotte (bandeau d’erreur) garde le sien');
  assert.ok(css.indexOf(cartes) > css.indexOf('html.loggia-frosted [style*="--o-surfA"] {'), 'la règle vient après celle du verre, à spécificité égale');
  // La feuille : pleine, sans flou, sur le fond assombri de l'ombre du voile ; le voile garde son ombre.
  const voile = (lire('src', 'ui.jsx').match(/ref=\{voileRef\} className="o-voile"[\s\S]*?background: '(rgba\([^)]*\))'/) || [])[1];
  assert.equal(voile, 'rgba(0,0,0,.32)', 'l’ombre du voile a changé : celle de la feuille légère doit la suivre');
  assert.ok(de('html.loggia-verre-leger .o-sheet').includes('backdrop-filter: none; background: linear-gradient(var(--o-surfA), var(--o-surfA)), linear-gradient('
    + voile + ', ' + voile + '), var(--o-bg) !important;'), 'la feuille légère n’a plus la teinte du Plein');
  assert.match(de('html.loggia-verre-leger .o-voile'), /backdrop-filter: none !important/);
  assert.ok(lire('src', 'ui.jsx').includes('<div role="presentation" ref={voileRef} className="o-voile"'), 'le voile des feuilles porte sa classe');
  // La photo, floutée une seule fois, avec le flou et la saturation des cartes.
  const photo = de('html.loggia-verre-leger .o-fond-photo');
  assert.match(photo, /filter: blur\(16px\) saturate\(1\.35\)/);
  assert.match(photo, /inset: -\d+px !important/, 'le bord flou déborde de l’écran');
  assert.match(css, /html\.loggia-frosted \[style\*="--o-surfA"\] \{ -webkit-backdrop-filter: blur\(16px\) saturate\(1\.35\); backdrop-filter: blur\(16px\) saturate\(1\.35\); \}/,
    'le flou du Plein a changé : celui de la photo doit le suivre');
  // Aucune couleur nouvelle : seulement les jetons du thème.
  assert.ok(!regles.some(l => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(l.split('rgba(0,0,0,.32)').join(''))),
    'une couleur en dur dans les règles du verre léger (hors l’ombre du voile, reprise telle quelle)');
  // Une seule matière : aucun nouveau jeton de surface, aucune règle hors de la classe.
  assert.ok(!/--o-surf[A-Z]?-leger|--o-verre/.test(css));
});
