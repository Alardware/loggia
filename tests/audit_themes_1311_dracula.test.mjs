// ─────────────────────────────────────────────────────────────────────────────
// Audit des thèmes du 13/11 — F2 : Dracula et Alucard refaits sur leurs sources
// (14/11), et D4a : la matière des cartes suit le thème.
//
// Sources : la palette officielle (draculatheme.com, Dracula et Alucard
// « Classic ») et le thème Home Assistant officiel (dracula/home-assistant).
// Forme du thème HA (12 px, aucune bordure, ombre 3px 3px 13px -6px), cartes
// OPAQUES, aucun dégradé, couleurs d'état de la palette, texte atténué
// « Comment » remonté dans sa teinte par la garde (D1a).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { garde, contraste, lireCouleur, SEUILS } from '../src/contraste.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const theme = lire('src', 'theme.js');
const d = theme.indexOf('\n  dracula: {'), bloc = theme.slice(d, theme.indexOf('\n  },', d));
const sombre = bloc.slice(bloc.indexOf('dark: {'), bloc.indexOf('\n    light: {')), clair = bloc.slice(bloc.indexOf('\n    light: {'));
const val = (seg, cle) => { const m = seg.match(new RegExp("\\b" + cle + ": '([^']*)'")); assert.ok(m, cle + ' introuvable'); return m[1]; };

test('F2 — la forme du thème Home Assistant : 12 px, aucune bordure, son ombre, aucun dégradé', () => {
  assert.ok(d >= 0 && sombre.length > 200 && clair.length > 200);
  for (const seg of [sombre, clair]) {
    assert.equal(val(seg, 'radius'), '12px');
    assert.equal(val(seg, 'borderWidth'), '0px');
    assert.equal(val(seg, 'bggrad'), '', 'la source n’a pas de dégradé de fond');
    assert.equal(val(seg, 'matiere'), 'opaque');
    assert.ok(val(seg, 'shadow').startsWith('3px 3px 13px -6px '));
  }
  assert.equal(val(sombre, 'shadow'), '3px 3px 13px -6px rgba(0,0,0,.4)');
  assert.ok(!/rgba\(189,147,249,\.14\)|rgba\(100,74,201/.test(bloc), 'la bordure et l’ombre violettes inventées sont revenues');
});

test('F2 — la palette : Dracula en sombre, Alucard en clair, texte atténué « Comment »', () => {
  // Sombre : Background Dark sous Background, Foreground, Comment, Purple.
  assert.deepEqual(['bg', 'surface', 'text', 'muted', 'accent'].map(k => val(sombre, k)), ['#21222c', '#282a36', '#f8f8f2', '#6272a4', '#bd93f9']);
  // Clair : Alucard. Le texte atténué était un violet inventé (#635d97) ; c'est le brun de la palette.
  assert.deepEqual(['bg', 'surface', 'text', 'muted', 'accent'].map(k => val(clair, k)), ['#ece9df', '#fffbeb', '#1f1f1f', '#6c664b', '#644ac9']);
  assert.ok(!bloc.includes('#635d97') && !bloc.includes('#8a94c0') && !bloc.includes('#f3efe0'), 'une couleur inventée est revenue');
  // Les traits fins : la « Selection » de la palette, comme elle le prescrit.
  assert.equal(val(sombre, 'border'), '#44475a'); assert.equal(val(clair, 'border'), '#cfcfde');
  // Les couleurs d'état : vert, jaune, orange, rouge, rose (les volets), cyan (les scènes), jaune (ce qu'on épingle).
  assert.ok(sombre.includes("etats: { ok: '#50fa7b', warn: '#f1fa8c', warn2: '#ffb86c', bad: '#ff5555', purple: '#ff79c6', cyan: '#8be9fd', gold: '#f1fa8c' }"));
  assert.ok(clair.includes("etats: { ok: '#14710a', warn: '#846e15', warn2: '#a34d14', bad: '#cb3a2a', purple: '#a3144d', cyan: '#036a96', gold: '#846e15' }"));
});

test('F2 et D1a — la garde remonte le texte atténué DANS SA TEINTE, et laisse l’accent et le vert du thème', () => {
  const jetons = (seg) => ({ '--o-bg': val(seg, 'bg'), '--o-surfA': val(seg, 'surfaceElevated'), '--o-surfB': val(seg, 'surface'), '--o-bw': '0px',
    '--o-s1': seg.match(/fonds: \['([^']+)', '([^']+)'/)[1], '--o-s2': seg.match(/fonds: \['([^']+)', '([^']+)'/)[2],
    '--o-text': val(seg, 'text'), '--o-text1': val(seg, 'text'), '--o-text2': val(seg, 'muted'), '--o-text3': val(seg, 'muted'),
    '--o-accent': val(seg, 'accent'), '--o-accent-soft': val(seg, 'accent'), '--o-ok': seg.match(/ok: '([^']+)'/)[1], '--o-ok-rgb': '0,0,0' });
  const teinte = (c) => { const [r, g, b] = lireCouleur(c); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return 0;
    const h = mx === r ? (g - b) / (mx - mn) + (g < b ? 6 : 0) : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; return h * 60; };
  for (const [nom, seg] of [['sombre', sombre], ['clair', clair]]) {
    const j = jetons(seg), o = garde((k) => j[k] || '');
    assert.equal(o['--o-accent'], undefined, nom + ' : l’accent du thème est retouché');
    // Le vert : exact en sombre ; en clair la garde le fonce d'un cheveu sur le fond de page (#14710a → #146f0a), invisible à l'œil.
    const vert = lireCouleur(o['--o-ok'] || j['--o-ok']), vertSrc = lireCouleur(j['--o-ok']);
    assert.ok(Math.max(...[0, 1, 2].map(i => Math.abs(vert[i] - vertSrc[i]))) <= 6, nom + ' : le vert de la palette est retouché : ' + o['--o-ok']);
    const t2 = o['--o-text2'] || j['--o-text2'];
    assert.ok(Math.abs(teinte(t2) - teinte(j['--o-text2'])) < 6, nom + ' : le texte atténué a changé de teinte (' + j['--o-text2'] + ' → ' + t2 + ')');
    const carte = lireCouleur(j['--o-surfB']);
    assert.ok(contraste(lireCouleur(t2), carte) >= SEUILS.wcag, nom + ' : le texte atténué ne se lit pas sur la carte');
  }
  // En sombre, le « Comment » d'origine ne se lit pas (3,2:1 sur la carte) : c'est bien la garde qui le remonte.
  assert.ok(contraste(lireCouleur('#6272a4'), lireCouleur('#282a36')) < 4.5);
});

test('D4a — la matière suit le thème : un thème opaque n’a ni voile ni flou, les autres restent en verre', () => {
  assert.ok(theme.includes("const verre = !(variante && variante.matiere === 'opaque');"));
  assert.ok(theme.includes("root.classList.toggle('loggia-frosted', verre);"), 'la classe du verre ne suit plus la matière');
  assert.ok(theme.includes('if (!verre) return;'), 'le plafond à 62 % s’appliquerait à une carte opaque');
  assert.ok(theme.includes('applyLook(root, L, variante, light);') && theme.includes('applyLook(root, L, null, !v.dark);'), '« Suivre Home Assistant » reste en verre');
  // Aucun thème de Loggia ne se dit opaque : seul un thème repris d'ailleurs le fait.
  // ASSERTION MODIFIÉE (14/11, F6) : Neumorphix sort de cette liste — rangé dans les natifs, il vient pourtant d'une source
  // (yakidd), et sa carte est pleine par principe.
  // ASSERTION MODIFIÉE (15/11, F7) : Google et iOS en sortent aussi — refaits sur leurs sources, l'un a des cartes pleines,
  // l'autre un voile sans flou. Restent les thèmes de Loggia.
  // ASSERTION MODIFIÉE (19/11) : The Projekt est retiré ; Prisme, thème de Loggia en verre, prend sa place.
  for (const n of ['atrium', 'prisme']) { const i = theme.indexOf('\n  ' + n + ': {'); assert.ok(i >= 0 && !theme.slice(i, theme.indexOf('\n  },', i)).includes('matiere:'), n + ' a changé de matière'); }
  assert.ok(!lire('src', 'themes-bleus.js').includes('matiere:'));
});

test('D4a — « Verre des cartes » ne s’affiche que pour un thème en verre, aux deux formats', () => {
  const p = lire('src', 'views', 'parametres.jsx');
  // Paramètres ne charge PAS le moteur des thèmes (il poserait ses classes avant l'heure) : la fiche du thème le dit.
  assert.ok(!/from '\.\.\/theme\.js'/.test(p), 'Paramètres importe le moteur des thèmes');
  assert.ok(p.includes("const themeEnVerre = haTheme === 'FOLLOW' || !(PRESET_META().find(x => x.id === (loggiaTheme || '')) || {}).opaque;"));
  assert.ok(p.includes("{themeEnVerre && (\n            <OptRow ici title={tr('Verre')} desc={descVerre}>"), 'à l’ordinateur');
  assert.ok(p.includes("{themeEnVerre && <ChoixTel titre={tr('Verre des cartes')} desc={descVerre} value={verre}"), 'au téléphone');
  // Les deux vérités d'accord : une fiche `opaque` ⇔ un thème dont une variante dit `matiere: 'opaque'`.
  const fiches = [...p.matchAll(/\{ id: '([a-z]*)', name: [^\n]*?(opaque: true)? \},/g)].filter(m => m[1]);
  // ASSERTION MODIFIÉE (19/11) : quatre thèmes retirés, il reste 14 fiches (sans compter Loggia).
  assert.ok(fiches.length >= 14, 'les fiches des thèmes ne se lisent plus : ' + fiches.length);
  for (const [, id, opaque] of fiches) {
    const i = theme.indexOf('\n  ' + id + ': {');
    const dit = i >= 0 && theme.slice(i, theme.indexOf('\n  },', i)).includes("matiere: 'opaque'");
    assert.equal(!!opaque, dit, id + ' : la fiche des Paramètres et le thème ne disent pas la même matière');
  }
});
