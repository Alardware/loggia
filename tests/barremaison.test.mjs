/* La barre « Maison » d'Objets › Chauffage (chantier Chauffage, plan 2,
 * tâche 11 ; spec § 9.1, choix 14, droits D8).
 *
 * Planning · Absence · Vacances · Été, sous le titre du filtre Chauffage, à
 * la norme de la barre des Scènes (ADR 0051, 59 px). On la REND (React côté
 * serveur, ADR 0069) sur un état du moteur fabriqué à la forme de
 * `loggia/chauffage/etat` ; un rendu statique ne clique pas : ses gestes se
 * JOUENT — le module compilé tel quel, ses crochets doublés (le modèle de
 * tests/fichechauffage.test.mjs et de tests/distributeur_finition.test.mjs).
 * Ce qui est tenu ici :
 *  - quatre puces dans l'ordre, la choisie en bleu plein, les Vacances qui
 *    disent leur fin ;
 *  - les droits : l'Été grisé pour un compte ordinaire, toute la barre close
 *    pour lui quand la maison EST en Été, et une phrase qui le dit ;
 *  - « … — aucun planning allumé » sous la barre ;
 *  - les gestes : le message envoyé, l'avance montrée puis retirée au refus,
 *    le refus dit ; Vacances avec et sans date, la feuille et son champ ;
 *  - la norme des barres, le téléphone (rien ne glisse, jamais un bouton en
 *    dernier), et sa place dans Objets — chargée à la demande.
 *
 * Fuseau de Paris et langue française fixés AVANT l'import : la date des
 * Vacances part à 00:00 de l'heure de l'écran, et les mots se lisent en
 * français.
 */
process.env.TZ = 'Europe/Paris';
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
register('./jsx-hooks.mjs', import.meta.url);
const M = await import(new URL('../src/barremaison.jsx', import.meta.url).href);
const Barre = M.default;
const { messageMaison, finDesVacances, lendemainDe } = M;
const { raisonEchec } = await import('../src/refus.js');
const { reglerChauffageEtat } = await import('../src/chauffageetat.js');

const lire = (chemin) => readFileSync(new URL('../' + chemin, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SOURCE = lire('src/barremaison.jsx');
const APP = MONOLITHE;
const CSS = lire('src/index.css');
const SCENES = lire('src/scenes.jsx');

/* L'état du moteur : un chauffage au planning, la maison dans `maison`. */
const etat = (maison = {}, o = {}) => ({
  chauffages: [{ cle: 'select.chambre', entite: 'select.chambre', planning: true }],
  maison: { mode: 'planning', vacances_fin: null, absence: 'eco', vacances: 'hors_gel', ...maison },
  simulation: false, maintenant: '2026-10-12T10:00:00+02:00', minute: [0, 600], plannings_allumes: true, journal: [], ...o,
});
const hass = (admin = true) => ({ states: {}, user: { is_admin: admin }, callWS: () => { throw new Error('rien ne doit partir'); } });
const rendre = (e = etat(), h = hass()) => renderToStaticMarkup(createElement(Barre, { hass: h, etat: e }));

/* Les puces, dans l'ordre : leur mot, choisie ou non, inerte ou non, leur titre, leur style. */
const puces = (html) => [...html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)].map(m => ({
  mot: m[2], on: /aria-pressed="true"/.test(m[1]), inerte: /\sdisabled=""/.test(m[1]),
  titre: (/\btitle="([^"]*)"/.exec(m[1]) || [])[1] || null, style: (/\bstyle="([^"]*)"/.exec(m[1]) || [])[1] || '',
}));
// Le texte d'un morceau de HTML, sans ses balises.
const texte = (html) => [...html.matchAll(/>([^<]*)</g)].map(m => m[1]).join(' ').replace(/\s+/g, ' ').trim();

/* Les balises enfants DIRECTES de l'élément qui commence à `debut`. */
function enfants(html, debut) {
  const re = /<(\/?)([a-z]+)\b[^>]*?(\/?)>/g;
  re.lastIndex = debut;
  re.exec(html);
  const out = [];
  let prof = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const [tout, ferme, nom, auto] = m;
    if (ferme) { if (prof === 0) break; prof -= 1; continue; }
    if (prof === 0) out.push(tout);
    if (!auto && nom !== 'input') prof += 1;
  }
  return out;
}

test('quatre puces dans l’ordre, la choisie en bleu plein, les autres sans teinte', () => {
  const html = rendre();
  const p = puces(html);
  assert.deepEqual(p.map(x => x.mot), ['Planning', 'Absence', 'Vacances', 'Été']);
  assert.deepEqual(p.map(x => x.on), [true, false, false, false], 'au Planning, la puce Planning');
  assert.deepEqual(p.map(x => x.inerte), [false, false, false, false], 'un administrateur a les quatre');
  for (const x of p) {
    assert.ok(x.style.includes(x.on ? 'background:var(--o-accent-fond);color:#fff' : 'background:transparent;color:var(--o-text2)'), x.mot + ' : ' + x.style);
    assert.ok(!/--o-(warn|warn2|cyan|purple|bad|cold)\b/.test(x.style), 'la couleur d’un mode n’est pas la teinte d’une puce');
  }
  // Le groupe se nomme par son libellé visible, « Maison ».
  const groupe = /<div class="o-qb" role="group" aria-labelledby="([^"]+)"/.exec(html);
  assert.ok(groupe, 'le groupe des modes n’est plus nommé');
  assert.ok(html.includes('<span id="' + groupe[1] + '" class="o-qb-lbl"') && html.includes('>Maison</span>'));
  // La maison ailleurs : sa puce, et elle seule.
  assert.deepEqual(puces(rendre(etat({ mode: 'absence' }))).map(x => x.on), [false, true, false, false]);
  assert.deepEqual(puces(rendre(etat({ mode: 'ete' }))).map(x => x.on), [false, false, false, true]);
  // Un état pas encore lu : le Planning, sans rien inventer d'autre.
  assert.deepEqual(puces(rendre(null)).map(x => x.on), [true, false, false, false]);
});

test('les Vacances choisies disent leur fin : « Vacances jusqu’au 20 oct. »', () => {
  const vac = puces(rendre(etat({ mode: 'vacances', vacances_fin: '2026-10-20T00:00:00+02:00' })));
  assert.deepEqual(vac.map(x => x.mot), ['Planning', 'Absence', 'Vacances jusqu’au 20 oct.', 'Été']);
  assert.equal(vac[2].on, true);
  // Sans date, jusqu'au retour au Planning : le mot seul.
  assert.equal(puces(rendre(etat({ mode: 'vacances', vacances_fin: null })))[2].mot, 'Vacances');
  // La date murale, comme « En ce moment » : la même aide (`regimeMaison`), pas une copie.
  assert.ok(SOURCE.includes("import { regimeMaison } from './chauffageecran.js';") && SOURCE.includes("{m === 'vacances' && on && lu === 'vacances' ? regime[2] : mot}"));
});

test('un compte ordinaire : l’Été grisé, avec sa raison — les trois autres lui restent', () => {
  const p = puces(rendre(etat(), hass(false)));
  assert.deepEqual(p.map(x => x.inerte), [false, false, false, true]);
  assert.equal(p[3].titre, 'Réservé aux administrateurs.');
  assert.ok(p[3].style.includes('opacity:0.4'), 'grisé');
  assert.deepEqual(p.slice(0, 3).map(x => x.titre), [null, null, null]);
  // Témoin : un administrateur n'a ni grisé ni titre.
  assert.deepEqual(puces(rendre(etat(), hass(true))).map(x => x.titre), [null, null, null, null]);
});

test('la maison en Été : toute la barre se ferme pour un compte ordinaire, et une phrase le dit', () => {
  /* Le serveur refuse à un compte ordinaire d'y entrer COMME d'en sortir
   * (`async_maison`, D8). La puce choisie reste pleine : elle dit le mode. */
  const html = rendre(etat({ mode: 'ete' }), hass(false));
  const p = puces(html);
  assert.deepEqual(p.map(x => x.inerte), [true, true, true, true]);
  assert.ok(p[3].on && p[3].style.includes('opacity:1'), 'la puce choisie reste lisible');
  assert.ok(p.slice(0, 3).every(x => x.style.includes('opacity:0.4')));
  assert.ok(texte(html).includes('La maison est en Été : seul un administrateur peut en sortir.'));
  // Un administrateur : rien de fermé, pas de phrase.
  const admin = rendre(etat({ mode: 'ete' }), hass(true));
  assert.deepEqual(puces(admin).map(x => x.inerte), [false, false, false, false]);
  assert.ok(!admin.includes('seul un administrateur'));
  // Hors de l'Été, un compte ordinaire ne lit pas cette phrase.
  assert.ok(!rendre(etat({ mode: 'absence' }), hass(false)).includes('seul un administrateur'));
});

test('la maison hors Planning sans aucun planning allumé : « … — aucun planning allumé », la phrase d’« En ce moment »', () => {
  const dit = (maison, allumes) => texte(rendre(etat(maison, { plannings_allumes: allumes })));
  assert.ok(dit({ mode: 'absence' }, false).includes('Absence — aucun planning allumé'));
  assert.ok(dit({ mode: 'ete' }, false).includes('Été — aucun planning allumé'));
  assert.ok(dit({ mode: 'vacances', vacances_fin: '2026-10-20T00:00:00+02:00' }, false).includes('Vacances jusqu’au 20 oct. — aucun planning allumé'));
  assert.ok(!dit({ mode: 'absence' }, true).includes('aucun planning allumé'), 'un planning tourne : rien à dire');
  assert.ok(!dit({ mode: 'planning' }, false).includes('aucun planning allumé'), 'au Planning, rien d’inhabituel');
  // La clé est celle d'« En ce moment » (chauffageecran.js), pas une seconde phrase.
  assert.ok(SOURCE.includes("tr('{mode} — aucun planning allumé', { mode: regime[2] })"));
  assert.ok(lire('src/chauffageecran.js').includes("tr('{mode} — aucun planning allumé', { mode: regime[2] })"));
});

test('la norme des barres : celle des Scènes, 59 px — et la barre ne finit pas par un bouton', () => {
  /* La barre des Scènes (ADR 0051) : 10 px de marge, un groupe de 37 px — un
   * contrôle de 27 px dans 5 px de marge —, 59 px en tout. Les deux styles
   * sont ceux de scenes.jsx, mot pour mot. */
  const BARRE = "{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,18px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }";
  const GROUPE = "{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }";
  assert.ok(SOURCE.includes('const BARRE = ' + BARRE + ';') && SCENES.includes('<div className="o-bar o-bar-scenes" style={' + BARRE + '}>'), 'la barre n’a plus le dessin de celle des Scènes');
  assert.ok(SOURCE.includes('const GROUPE = ' + GROUPE + ';') && SCENES.includes(' style={' + GROUPE + '}>'), 'le groupe n’a plus le dessin de celui des Scènes');
  const html = rendre();
  for (const x of puces(html)) assert.ok(x.style.startsWith('box-sizing:border-box;min-height:27px;padding:5px 10px;'), x.style);
  // Au téléphone, la règle commune des `.o-bar` rend le DERNIER BOUTON collant : la barre n'a qu'un enfant, le groupe.
  const debut = html.indexOf('<div class="o-bar o-bar-maison"');
  assert.ok(debut >= 0, 'la barre a perdu ses classes');
  const direct = enfants(html, debut);
  assert.equal(direct.length, 1, direct.join(' '));
  assert.ok(direct[0].startsWith('<div class="o-qb"'), direct[0]);
});

test('au téléphone : rien ne glisse — le libellé s’efface, les puces vont par paires ; ailleurs, rien ne change', () => {
  const DEBUT_MOBILE = '@media (max-width: 760px) {\n  .o-bar {';
  const MOBILE = CSS.slice(CSS.indexOf(DEBUT_MOBILE), CSS.indexOf('\n}\n', CSS.indexOf(DEBUT_MOBILE)));
  assert.ok(MOBILE.includes('.o-bar.o-bar-maison { flex-wrap: wrap !important; overflow: visible; padding: 10px !important; }'), 'la barre glisserait au téléphone');
  assert.ok(MOBILE.indexOf('.o-bar.o-bar-maison {') > MOBILE.indexOf('  .o-bar { flex-wrap: nowrap !important;'), 'l’exception doit suivre la règle commune des bandeaux');
  assert.ok(MOBILE.includes('.o-bar-maison > .o-qb { flex: 1 1 100%; padding: 4px 5px !important; }'));
  assert.ok(MOBILE.includes('.o-bar-maison .o-qb-lbl { display: none; }'), 'le libellé prendrait la place des puces');
  assert.ok(MOBILE.includes('.o-bar-maison .o-maison-puces { flex: 1 1 auto; flex-wrap: wrap; }'));
  assert.ok(MOBILE.includes('.o-bar-maison .o-maison-paire { flex: 1 1 auto; }') && MOBILE.includes('.o-bar-maison .o-maison-paire > button { flex: 1 1 auto; }'));
  assert.doesNotMatch(CSS.replace(MOBILE, ''), /\.o-bar-maison|\.o-maison-/, 'une règle de la barre touche l’ordinateur ou la tablette');
  // Deux paires de deux : passées à la ligne, deux et deux — jamais trois et une.
  const html = rendre();
  const paires = [...html.matchAll(/<div class="o-maison-paire"[^>]*>((?:<button\b[^>]*>[^<]*<\/button>)+)<\/div>/g)].map(m => puces(m[1]).map(x => x.mot));
  assert.deepEqual(paires, [['Planning', 'Absence'], ['Vacances', 'Été']]);
});

/* ════════════ Les gestes, joués ════════════ */

/* Le module compilé tel quel, chaque import pris dans son vrai module, sauf
 * ce que le test double — ses composants se JOUENT sans React. */
async function compilable(chemin) {
  const t = lire('src/' + chemin);
  const portee = {};
  for (const [, noms, spec] of t.matchAll(/^import \{([\s\S]*?)\} from '([^']+)';$/gm)) {
    const m = spec === 'react' ? await import('react') : await import(new URL('../src/' + spec.slice(2), import.meta.url).href);
    noms.split(',').map(x => x.trim()).filter(Boolean).forEach(n => { portee[n] = m[n]; });
  }
  const code = transformSync(t.replace(/^import [\s\S]*?';$/gm, '').replace(/^export (default )?(function|const) /gm, '$2 '),
    { loader: 'jsx', jsx: 'transform', jsxFactory: '__h', jsxFragment: '__Frag' }).code;
  return (doubles, rendu) => {
    const p = { ...portee, ...doubles };
    const noms = Object.keys(p);
    return new Function('__h', '__Frag', ...noms, code + '\nreturn ' + rendu + ';')(createElement, Fragment, ...noms.map(n => p[n]));
  };
}
const BARRE = await compilable('barremaison.jsx');

/* Les éléments de l'arbre qui répondent à `test` (sans déplier les composants). */
function chercher(el, t, acc = []) {
  if (!el || typeof el !== 'object') return acc;
  if (Array.isArray(el)) { el.forEach(x => chercher(x, t, acc)); return acc; }
  if (t(el)) acc.push(el);
  if (el.props && typeof el.props.children !== 'function') chercher(el.props.children, t, acc);
  return acc;
}
const attendre = () => new Promise(r => setTimeout(r, 0));
function FeuilleDouble() { return null; }

/**
 * La barre jouée : ses états (`valeurs`, dans l'ordre des `useState` — la
 * barre : l'erreur, la feuille ; puis la feuille des Vacances : le jour,
 * l'erreur, l'envoi), l'avance (`ov`) ; chaque écriture d'état est notée
 * `[rang, valeur]`, chaque avance posée aussi. `callWS` répond ce qu'on lui dit.
 */
function jouer({ e = etat(), admin = true, valeurs = [], ov = null, reponse = () => Promise.resolve(etat()) } = {}) {
  const ecrits = [], avances = [], messages = [];
  let rang = 0;
  const h = { states: {}, user: { is_admin: admin }, callWS: (m) => { messages.push(m); return reponse(m); } };
  const { BarreMaison } = BARRE({
    useId: () => ':r1:', useRef: (v) => ({ current: v }), useEffect: () => {},
    useState: (init) => {
      const k = rang++;
      const v = valeurs[k] !== undefined ? valeurs[k] : (typeof init === 'function' ? init() : init);
      return [v, (x) => ecrits.push([k, x])];
    },
    useOptimiste: () => [ov, (x) => avances.push(x)],
    BottomSheet: FeuilleDouble,
  }, '{ BarreMaison }');
  const arbre = BarreMaison({ hass: h, etat: e });
  const puce = (mot) => chercher(arbre, el => el.type === 'button' && el.props.children === mot)[0];
  return { arbre, puce, ecrits, avances, messages };
}

test('Planning, Absence, Été : le message part aussitôt, montré d’avance', async () => {
  reglerChauffageEtat({ hass: null });
  const j = jouer();
  j.puce('Absence').props.onClick();
  await attendre();
  assert.deepEqual(j.messages, [{ type: 'loggia/chauffage/maison', mode: 'absence', fin: null }]);
  assert.deepEqual(j.avances, ['absence'], 'montrée d’avance');
  assert.deepEqual(j.ecrits, [[0, '']], 'aucun refus à dire');
  const ete = jouer();
  ete.puce('Été').props.onClick();
  await attendre();
  assert.deepEqual(ete.messages, [{ type: 'loggia/chauffage/maison', mode: 'ete', fin: null }]);
  // La puce du mode en cours ne renvoie rien.
  const deja = jouer();
  deja.puce('Planning').props.onClick();
  await attendre();
  assert.deepEqual([deja.messages, deja.avances], [[], []]);
  reglerChauffageEtat({ hass: null });
});

test('un refus retire l’avance et se dit sous la barre (raisonEchec, role="alert")', async () => {
  const refus = Object.assign(new Error('reglages reserves aux administrateurs Home Assistant : maison.ete'), { code: 'not_admin' });
  const j = jouer({ reponse: () => Promise.reject(refus) });
  j.puce('Été').props.onClick();
  await attendre();
  assert.deepEqual(j.avances, ['ete', null], 'l’avance se retire au refus');
  assert.deepEqual(j.ecrits, [[0, ''], [0, raisonEchec(refus)]], 'le refus se dit, dans la langue de l’écran');
  // Une coupure, sans code : dite aussi, autrement.
  const coupure = jouer({ reponse: () => Promise.reject(new Error('Connection lost')) });
  coupure.puce('Absence').props.onClick();
  await attendre();
  assert.deepEqual(coupure.avances, ['absence', null]);
  assert.equal(coupure.ecrits.at(-1)[1], raisonEchec(new Error('Connection lost')));
  // Le refus s'affiche, à la place de la phrase d'un administrateur.
  const dit = jouer({ valeurs: ['Refusé.'] });
  const alerte = chercher(dit.arbre, el => el.props && el.props.role === 'alert');
  assert.equal(alerte.length, 1);
  assert.equal(alerte[0].props.children, 'Refusé.');
});

test('Vacances : une petite feuille — « Jusqu’au » facultatif, « Partir en vacances »', async () => {
  // La puce n'envoie rien : elle ouvre la feuille.
  const j = jouer();
  j.puce('Vacances').props.onClick();
  await attendre();
  assert.deepEqual([j.messages, j.avances, j.ecrits], [[], [], [[1, true]]]);
  // La feuille ouverte : son titre (la croix commune vient avec), et son contenu.
  const ouverte = jouer({ valeurs: ['', true] });
  const [feuille] = chercher(ouverte.arbre, el => el.type === FeuilleDouble);
  assert.ok(feuille, 'la feuille ne s’ouvre pas');
  assert.equal(feuille.props.title, 'Vacances');
  assert.ok(SOURCE.includes("<BottomSheet onClose={() => setFeuille(false)} title={tr('Vacances')}>"), 'la croix commune vient du titre de la feuille (tests/feuilles.test.mjs)');
  assert.equal(typeof feuille.props.children, 'function', 'la feuille donne au contenu de quoi se fermer');
});

/* Le contenu de la feuille des Vacances, joué : `jour` est la valeur du champ
 * — sans elle, celle que la feuille lit d'elle-même (la date déjà posée). */
function feuilleVacances({ jour, reponse = () => Promise.resolve(etat()), maison = {} } = {}) {
  const j = jouer({ valeurs: ['', true, jour], reponse, e: etat(maison) });
  const [feuille] = chercher(j.arbre, el => el.type === FeuilleDouble);
  let fermee = 0;
  const contenu = feuille.props.children(() => { fermee += 1; });
  const arbre = contenu.type(contenu.props);
  const bouton = chercher(arbre, el => el.type === 'button')[0];
  return { ...j, arbre, bouton, fermee: () => fermee };
}

test('Partir en vacances, avec une date : le jour seul, que le serveur fait minuit de la maison ; la feuille se ferme', async () => {
  const f = feuilleVacances({ jour: '2026-10-20' });
  f.bouton.props.onClick();
  await attendre();
  /* ASSERTION MODIFIÉE (relecture des tâches 11 et 12) : le JOUR part seul,
   * plus 00:00 de l'heure de l'écran en ISO — réglées depuis un autre fuseau,
   * les Vacances finissaient la veille (`_minuit_de_la_maison`, chauffage.py). */
  assert.deepEqual(f.messages, [{ type: 'loggia/chauffage/maison', mode: 'vacances', fin: '2026-10-20' }]);
  assert.deepEqual(f.avances, ['vacances']);
  assert.equal(f.fermee(), 1, 'partie, la demande ferme la feuille');
  // L'envoi se voit : le bouton attend la réponse, puis se libère.
  assert.deepEqual(f.ecrits.filter(([k]) => k === 4).map(([, v]) => v), [true, false]);
});

test('Partir en vacances, sans date : jusqu’au retour au Planning', async () => {
  const f = feuilleVacances({ jour: '' });
  f.bouton.props.onClick();
  await attendre();
  assert.deepEqual(f.messages, [{ type: 'loggia/chauffage/maison', mode: 'vacances', fin: null }]);
  assert.equal(f.fermee(), 1);
  // La phrase sous le champ dit ce qui arrive, avec ou sans date.
  assert.ok(texte(renderToStaticMarkup(f.arbre)).includes('Sans date, la maison reste en Vacances jusqu’à ce qu’on la remette au Planning.'));
  assert.ok(texte(renderToStaticMarkup(feuilleVacances({ jour: '2026-10-20' }).arbre)).includes('Le jour du retour, la maison repasse au Planning dès minuit.'));
});

test('Vacances refusées : l’avance se retire, la feuille reste ouverte et dit pourquoi', async () => {
  const refus = Object.assign(new Error('date illisible ou passee : maison.vacances_fin'), { code: 'chauffage_date_illisible' });
  const f = feuilleVacances({ jour: '2026-10-20', reponse: () => Promise.reject(refus) });
  f.bouton.props.onClick();
  await attendre();
  assert.deepEqual(f.avances, ['vacances', null]);
  assert.equal(f.fermee(), 0, 'la date se corrige sur place');
  assert.deepEqual(f.ecrits.filter(([k]) => k === 3).map(([, v]) => v), ['', raisonEchec(refus)]);
  assert.equal(raisonEchec(refus), 'Date de retour illisible ou déjà passée.');
  // Un jour qui ne se lit pas ne part pas : il se dit avant.
  const faux = feuilleVacances({ jour: '2026-02-31' });
  faux.bouton.props.onClick();
  await attendre();
  assert.deepEqual([faux.messages, faux.fermee()], [[], 0]);
  assert.deepEqual(faux.ecrits, [[3, 'Date de retour illisible ou déjà passée.']]);
});

/* Les attributs du champ <input> d'un morceau de HTML — React écrit sa valeur en dernier. */
const champDe = (html) => {
  const balise = /<input\b([^>]*?)\/?>/.exec(html);
  return balise ? Object.fromEntries([...balise[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]])) : null;
};

test('la feuille des Vacances : le champ date natif, son étiquette, le lendemain au plus tôt, la date déjà posée', () => {
  const html = renderToStaticMarkup(feuilleVacances().arbre);
  const champ = champDe(html);
  assert.ok(champ && champ.type === 'date', html.slice(0, 400));
  assert.ok(!champ.value, 'facultative : vide au départ');
  assert.ok(html.includes('<label id="' + champ['aria-labelledby'] + '" for="' + champ.id + '"'), 'l’étiquette nomme le champ');
  assert.ok(html.includes('>Jusqu’au</label>'));
  /* ASSERTION MODIFIÉE (relecture des tâches 11 et 12) : le plus tôt, le
   * lendemain de la MAISON — celui de `etat.maintenant`, lundi 12 octobre —,
   * plus celui du navigateur. */
  assert.equal(champ.min, '2026-10-13', 'aujourd’hui à 00:00 est déjà passé');
  assert.ok(html.includes('>Partir en vacances</button>'));
  assert.ok(html.startsWith('<div class="o-vacances"'), 'le calendrier natif suit le thème (index.css)');
  assert.ok(CSS.includes('.o-vacances { color-scheme: dark; }') && CSS.includes('html.loggia-light .o-vacances { color-scheme: light; }'));
  // Aucun <select> natif dans le code (les commentaires en parlent) ; un champ date, oui (comme le formulaire d'un événement).
  const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/<select[\s>]/.test(code) && code.includes('type="date"'));
  // Rouverte en Vacances, la feuille reprend la date posée, lue dans sa partie murale.
  const reprise = renderToStaticMarkup(feuilleVacances({ maison: { mode: 'vacances', vacances_fin: '2026-10-20T00:00:00+02:00' } }).arbre);
  assert.equal(champDe(reprise).value, '2026-10-20');
  // Hors des Vacances, une ancienne fin ne revient pas.
  assert.ok(!champDe(renderToStaticMarkup(feuilleVacances({ maison: { mode: 'absence', vacances_fin: '2026-10-20T00:00:00+02:00' } }).arbre)).value);
});

test('les messages et la date, en fonctions pures', () => {
  /* ASSERTIONS MODIFIÉES (relecture des tâches 11 et 12) : la fin des
   * Vacances est le jour seul — `finDesVacances` le valide et le rend tel
   * quel, plus 00:00 de l'écran en ISO ; `lendemainDe` est nouvelle. */
  assert.deepEqual(messageMaison('absence'), { type: 'loggia/chauffage/maison', mode: 'absence', fin: null });
  assert.deepEqual(messageMaison('ete', '2026-10-20'), { type: 'loggia/chauffage/maison', mode: 'ete', fin: null }, 'seules les Vacances ont une fin');
  assert.deepEqual(messageMaison('vacances', '2026-10-20'), { type: 'loggia/chauffage/maison', mode: 'vacances', fin: '2026-10-20' });
  assert.deepEqual(messageMaison('vacances'), { type: 'loggia/chauffage/maison', mode: 'vacances', fin: null });
  assert.equal(finDesVacances('2026-10-20'), '2026-10-20');
  assert.equal(finDesVacances('2026-12-24'), '2026-12-24');
  assert.equal(finDesVacances('2028-02-29'), '2028-02-29', 'une année bissextile');
  for (const illisible of ['', '2026-02-31', '2027-02-29', '2026-13-01', '20-10-2026', '2026-10-20T00:00', ' 2026-10-20', null, undefined, 42]) {
    assert.equal(finDesVacances(illisible), null, JSON.stringify(illisible));
  }
  // Le lendemain de la maison, lu dans la partie murale de « maintenant » — fin de mois, fin d'année, 29 février.
  assert.equal(lendemainDe('2026-10-12T10:00:00+02:00'), '2026-10-13');
  assert.equal(lendemainDe('2026-10-31T23:59:00+01:00'), '2026-11-01');
  assert.equal(lendemainDe('2026-12-31T08:00:00-05:00'), '2027-01-01');
  assert.equal(lendemainDe('2028-02-28T12:00:00+01:00'), '2028-02-29');
  // Sans « maintenant » lisible : le lendemain de l'écran.
  assert.equal(lendemainDe(null, new Date(2026, 9, 12, 23, 30).getTime()), '2026-10-13');
  assert.equal(lendemainDe('bientôt', new Date(2026, 11, 31, 9, 0).getTime()), '2027-01-01');
});

test('la date part SEULE : un navigateur à Athènes, une maison à Paris — le 20 reste le 20, validation après validation', async () => {
  /* Relecture des tâches 11 et 12 : à minuit de Paris, un navigateur à
   * Athènes envoyait 23:00 la veille — « jusqu’au 19 » — et chaque nouvelle
   * validation reculait d'un jour. Le jour part seul ; le serveur de la
   * maison en fait minuit à SON heure (`_minuit_de_la_maison`, tenu par
   * tests/python/test_chauffage.py) — doublé ici à l'identique, en +02:00. */
  const avant = process.env.TZ;
  process.env.TZ = 'Europe/Athens';
  try {
    assert.equal(new Date(2026, 9, 20).getTimezoneOffset(), -180, 'témoin : le navigateur est bien à Athènes');
    let maison = { mode: 'planning', vacances_fin: null };
    const serveurParis = (m) => {
      maison = { ...maison, mode: m.mode, vacances_fin: m.fin ? m.fin + 'T00:00:00+02:00' : null };
      return Promise.resolve(etat(maison));
    };
    // Lundi 23:30 à Paris, déjà mardi 00:30 à Athènes : le plus tôt reste mardi, le lendemain de la maison.
    const tard = { ...etat(), maintenant: '2026-10-12T23:30:00+02:00' };
    assert.equal(lendemainDe(tard.maintenant), '2026-10-13');
    for (const validation of [1, 2, 3]) {
      const f = feuilleVacances({ jour: validation === 1 ? '2026-10-20' : undefined, maison, reponse: serveurParis });
      if (validation > 1) assert.equal(champDe(renderToStaticMarkup(f.arbre)).value, '2026-10-20', 'rouverte, la feuille reprend le 20');
      f.bouton.props.onClick();
      await attendre();
      assert.deepEqual(f.messages, [{ type: 'loggia/chauffage/maison', mode: 'vacances', fin: '2026-10-20' }], 'validation ' + validation);
      assert.equal(puces(rendre(etat(maison)))[2].mot, 'Vacances jusqu’au 20 oct.', 'validation ' + validation);
    }
  } finally {
    process.env.TZ = avant;
  }
});

test('Objets › Chauffage : la barre sous le titre du filtre, au-dessus des cartes, chargée à la demande', () => {
  // Chargée à la demande, comme la fiche : ni l'Accueil ni une carte ne l'affichent.
  assert.ok(APP.includes("const BarreMaison = lazyRecharge(() => import('./barremaison.jsx'));"));
  assert.ok(!/import [^;]*from '\.\/barremaison\.jsx'/.test(APP), 'un import statique ramènerait la barre dans le démarrage');
  const i = APP.indexOf('\nfunction ObjetsView(');
  const vue = APP.slice(i, APP.indexOf('\n}\n', i));
  // L'état du moteur ne se lit que sous le filtre Chauffage.
  assert.ok(vue.includes("const { etat: etatCh } = useEtatChauffage(actuel === 'chauffage');"));
  /* ASSERTION MODIFIÉE (relecture finale du 12/10, point 7) : la barre paraissait dès que le
   * moteur connaissait un chauffage ; elle ne paraît plus que quand elle sert
   * (`barreMaisonUtile`, le test suivant). */
  assert.ok(vue.includes("const barreMaison = actuel === 'chauffage' && barreMaisonUtile(etatCh);"));
  const pose = '{barreMaison && <Suspense fallback={<div style={{ minHeight: 59 }} />}><BarreMaison hass={hass} etat={etatCh} /></Suspense>}';
  assert.ok(vue.includes(pose), 'son repli a la hauteur de la barre : rien ne saute');
  // Sa place : jamais avant le bandeau d'édition ; après le titre du filtre, avant la grille des cartes.
  const p = vue.indexOf(pose);
  assert.ok(vue.indexOf('<BandeauEdition') < p, 'avant le bandeau d’édition');
  assert.ok(vue.indexOf("trN(chauffent, '{n} chauffe', '{n} chauffent')") < p, 'avant le titre du filtre');
  assert.ok(p < vue.indexOf('ref={ed.gridRef}'), 'sous les cartes');
  assert.ok(!vue.includes('borderRadius: 999'), 'le corps d’ObjetsView n’a pas de pilule (tests/objets.test.mjs)');
});

test('la barre ne paraît que quand elle sert : un planning allumé, ou la maison hors Planning', async () => {
  /* Relecture finale du 12/10, point 7. Pour qui n'utilise aucun planning, les modes de la
   * maison ne font rien — sauf ramener au Planning une maison restée en Absence, en
   * Vacances ou en Été. `plannings_allumes` est compté par le serveur avant ses droits. */
  const { barreMaisonUtile } = await import('../src/chauffageecran.js');
  assert.equal(barreMaisonUtile(etat()), true, 'un planning allumé');
  assert.equal(barreMaisonUtile(etat({}, { plannings_allumes: false })), false, 'aucun planning, la maison au Planning : rien à choisir');
  for (const mode of ['absence', 'vacances', 'ete']) {
    assert.equal(barreMaisonUtile(etat({ mode }, { plannings_allumes: false })), true, mode + ' : de quoi la ramener au Planning');
  }
  assert.equal(barreMaisonUtile(etat({}, { chauffages: [] })), false, 'aucun chauffage connu');
  assert.equal(barreMaisonUtile(null), false, 'pas encore d’état');
  assert.equal(barreMaisonUtile(etat({ mode: null }, { plannings_allumes: false })), false, 'une maison illisible ne la fait pas paraître');
});
