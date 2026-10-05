// ─────────────────────────────────────────────────────────────────────────────
// Relecture du lot 15 de l'audit du 03/10 : une échéance PAR demande.
//
// Paramètres tenait toutes ses automatisations dans un seul `useOptimiste` :
// une table, un minuteur. Chaque bascule recopiait la table et relançait le
// minuteur — une automatisation que HA refusait de couper restait « coupée »
// tant qu'on basculait les autres (31 s pour six bascules, au lieu des 6 s
// que promet `optimiste.js`). Et deux appuis rapides sur la même ligne
// laissaient l'écho du premier la faire clignoter.
//
// `useDemandes` est un crochet : on le fait TOURNER avec une doublure minimale
// des crochets de React (comme `lot14_cameras`) et les minuteurs simulés de
// node:test. La doublure ne redessine que si un état a bougé : c'est ce qui
// prouve qu'une échéance redessine SEULE, sans que la maison bouge.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

/* La doublure, pour `optimiste.js` SEUL : ses crochets passent par
 * `globalThis.__crochetsDemandes`, que `monter` remplit. */
const DOUBLURE = 'data:text/javascript,' + encodeURIComponent([
  'const c = () => globalThis.__crochetsDemandes;',
  'export const useState = (i) => c().useState(i);',
  'export const useEffect = (f, d) => c().useEffect(f, d);',
  'export const useRef = (v) => c().useRef(v);',
  'export const useCallback = (f, d) => c().useCallback(f, d);',
].join('\n'));
register('data:text/javascript,' + encodeURIComponent([
  'export async function resolve(spec, ctx, next) {',
  "  if (spec === 'react' && ctx.parentURL && /\\/src\\/optimiste\\.js$/.test(ctx.parentURL)) return { url: " + JSON.stringify(DOUBLURE) + ', shortCircuit: true };',
  '  return next(spec, ctx);',
  '}',
].join('\n')));
const { useDemandes, enVol } = await import('../src/optimiste.js');

/** Monte `Comp` : rend, joue les effets dont les dépendances ont changé
 * (nettoyage d'abord), recommence tant qu'un état a bougé. Un état posé plus
 * tard — un appui, un minuteur — attend `suite()`, qui ne redessine QUE s'il
 * a bougé, comme un commit de React. */
function monter(Comp, props) {
  const cases = [];
  let curseur = 0, sale = false, aFaire = [], sortie = null;
  const memes = (a, b) => !!(a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i])));
  const crochets = {
    useState(init) {
      const k = curseur++;
      if (!cases[k]) {
        const c = { v: typeof init === 'function' ? init() : init };
        c.poser = (nv) => { const v = typeof nv === 'function' ? nv(c.v) : nv; if (!Object.is(v, c.v)) { c.v = v; sale = true; } };
        cases[k] = c;
      }
      return [cases[k].v, cases[k].poser];
    },
    useRef(init) { const k = curseur++; if (!cases[k]) cases[k] = { current: init }; return cases[k]; },
    useCallback(f, deps) { const k = curseur++; if (cases[k] && memes(cases[k].deps, deps)) return cases[k].f; cases[k] = { f, deps }; return f; },
    useEffect(f, deps) { const k = curseur++; if (cases[k] && memes(cases[k].deps, deps)) return; aFaire.push({ k, f, deps }); },
  };
  const rendre = () => {
    for (let tour = 0; tour < 20; tour += 1) {
      globalThis.__crochetsDemandes = crochets;
      sale = false; curseur = 0; aFaire = [];
      sortie = Comp(props);
      for (const { k, f, deps } of aFaire) {
        if (cases[k] && cases[k].nettoyer) cases[k].nettoyer();
        const r = f();
        cases[k] = { deps, nettoyer: typeof r === 'function' ? r : null };
      }
      if (!sale) return;
    }
    throw new Error('le rendu ne se stabilise pas');
  };
  rendre();
  return {
    get on() { return sortie.on; },
    basculer(id) { sortie.basculer(id); rendre(); },
    maison(id, state, t) { props = { etats: { ...props.etats, [id]: { state, last_changed: 't' + t } } }; rendre(); },
    suite() { if (!sale) return false; rendre(); return true; },
    demonter() { for (const c of cases) if (c && c.nettoyer) c.nettoyer(); },
  };
}

/** Ce que fait Paramètres : une ligne par automatisation, lue par `enVol`,
 * basculée par la demande que porte le crochet. */
function Lignes({ etats }) {
  const [ov, demander] = useDemandes();
  const on = {};
  for (const id of Object.keys(etats)) on[id] = enVol(ov, id, etats[id], etats[id].state === 'on');
  return { on, basculer: (id) => demander(id, !on[id], etats[id], etats[id].state === 'on') };
}

/** Une maison de lignes allumées, et une horloge qu'on avance à une date,
 * milliseconde par milliseconde : React redessine dès qu'un minuteur a posé
 * un état, et c'est ce rendu qui arme l'échéance suivante. Rend `true` si un
 * rendu a eu lieu en chemin. */
function maisonSimulee(t, ids) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const etats = {};
  for (const id of ids) etats[id] = { state: 'on', last_changed: 't0' };
  const h = monter(Lignes, { etats });
  let maintenant = 0;
  h.aller = (a) => {
    let rendu = false;
    while (maintenant < a) { t.mock.timers.tick(1); maintenant += 1; if (h.suite()) rendu = true; }
    return rendu;
  };
  return h;
}

test('un refus s’efface six secondes après SA demande, même si l’on bascule d’autres lignes', (t) => {
  const h = maisonSimulee(t, ['a', 'x0', 'x1', 'x2', 'x3', 'x4']);
  h.basculer('a'); // t = 0 : HA refuse, rien ne bouge
  assert.equal(h.on.a, false, 'la demande se montre tout de suite');
  for (let k = 0; k < 4; k += 1) {
    h.aller(1000 * (k + 1)); h.basculer('x' + k);
    h.aller(1000 * (k + 1) + 200); h.maison('x' + k, 'off', 1000 * (k + 1) + 200);
    assert.equal(h.on.a, false, 'A tient sa demande avant SES six secondes');
  }
  h.aller(5000); h.basculer('x4'); // refusée elle aussi
  assert.equal(h.aller(5999), false, 'rien ne redessine avant l’échéance');
  assert.equal(h.on.a, false);
  assert.equal(h.aller(6000), true, 'l’échéance de A ne redessine pas : la maison n’a pas bougé, rien d’autre ne le fera');
  assert.equal(h.on.a, true, 'un refus reste affiché tant qu’on bascule d’autres lignes');
  assert.equal(h.on.x4, false, 'l’échéance de A emporte la demande de x4, posée après elle');
  assert.equal(h.on.x3, false, 'x3, acceptée, reste coupée');
  h.aller(10999);
  assert.equal(h.on.x4, false);
  h.aller(11000);
  assert.equal(h.on.x4, true, 'x4 n’expire pas à SON tour');
  h.demonter();
});

test('deux appuis rapides sur la même ligne : l’écho du premier ne la fait pas clignoter', (t) => {
  const h = maisonSimulee(t, ['a']);
  const vu = [];
  const noter = () => vu.push(h.on.a ? 'ON' : 'off');
  noter();
  h.basculer('a'); noter(); // couper
  h.aller(150); h.basculer('a'); noter(); // rallumer avant la réponse
  h.aller(300); h.maison('a', 'off', 300); noter(); // l'écho du premier
  h.aller(450); h.maison('a', 'on', 450); noter(); // la réponse du second
  assert.deepEqual(vu, ['ON', 'off', 'ON', 'ON', 'ON'], 'la ligne clignote sur l’écho du premier appui');
  // Trois appuis, l'écho du premier arrivé entre le deuxième et le troisième.
  h.aller(10000);
  vu.length = 0;
  h.basculer('a'); noter();
  h.aller(10100); h.basculer('a'); noter();
  h.aller(10200); h.maison('a', 'off', 10200); noter();
  h.basculer('a'); noter();
  h.aller(10400); h.maison('a', 'on', 10400); noter(); // réponse du deuxième = écho pour le troisième
  h.aller(10500); h.maison('a', 'off', 10500); noter();
  assert.deepEqual(vu, ['off', 'ON', 'ON', 'off', 'off', 'off'], 'la réponse du deuxième appui reprend la main sur le troisième');
  h.demonter();
});

test('plusieurs lignes, réponse lente, état qui ne bouge pas : chacune lit SA réponse dans SES six secondes', (t) => {
  const h = maisonSimulee(t, ['a', 'b']);
  h.basculer('a');
  h.aller(50); h.basculer('b');
  h.aller(400); h.maison('a', 'off', 400);
  assert.deepEqual(h.on, { a: false, b: false }, 'la réponse de A jette la demande de B, encore en vol');
  h.aller(4000); h.maison('b', 'off', 4000); // lente, mais dans le délai
  assert.deepEqual(h.on, { a: false, b: false });
  // Plus lente que le filet : la maison reprend la main à l'échéance, puis la réponse arrive.
  h.basculer('a');
  assert.equal(h.on.a, true);
  h.aller(9999);
  assert.equal(h.on.a, true, 'l’échéance de B emporte la demande de A, posée après elle');
  assert.equal(h.aller(10000), true, 'l’échéance doit redessiner seule');
  assert.equal(h.on.a, false, 'passé six secondes, la ligne redit ce que la maison dit');
  h.aller(10500); h.maison('a', 'on', 10500);
  assert.equal(h.on.a, true);
  // Tout est échu : plus aucun minuteur, plus rien à redessiner.
  assert.equal(h.aller(30000), false, 'une table vide redessine encore');
  h.demonter();
});

test('une horloge qui recule ne fige pas une demande', (t) => {
  /* `at` est l'heure murale ; les minuteurs, eux, comptent le temps écoulé.
   * Une tablette qui se resynchronise d'une heure en arrière gardait la
   * demande d'avant le recul « dans le futur » : refusée, elle restait
   * affichée une heure. Les minuteurs simulés de node:test avancent avec
   * `Date` : l'heure murale est donc doublée à part. */
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let mur = 1_000_000_000;
  t.mock.method(Date, 'now', () => mur);
  const h = monter(Lignes, { etats: { a: { state: 'on', last_changed: 't0' }, b: { state: 'on', last_changed: 't0' } } });
  const aller = (ms) => { for (let i = 0; i < ms; i += 1) { t.mock.timers.tick(1); mur += 1; h.suite(); } };
  h.basculer('a'); // refusée
  aller(1000);
  mur -= 3_600_000; // la tablette recule d'une heure
  h.basculer('b'); // refusée aussi
  aller(5999);
  assert.deepEqual(h.on, { a: false, b: false });
  aller(1);
  assert.equal(h.on.b, true, 'B n’expire pas six secondes après SA demande');
  assert.equal(h.on.a, true, 'la demande d’avant le recul reste affichée une heure');
  h.demonter();
});
