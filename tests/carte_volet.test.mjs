/* La carte d'un volet, sa compacte et l'en-tête d'Objets › Volets, rendus
 * (chantier Volets, § 3.1 à 3.4 ; ADR 0069).
 *
 * Sous `?cartevolet`, App.jsx exporte en plus la carte et la compacte — le
 * fichier n'est pas touché (le crochet de tests/lot16_fiches_panne.test.mjs) ;
 * l'en-tête se lit dans son module (src/entetevolets.jsx).
 * L'état des volets est posé dans le cache partagé, la course lancée dans le
 * magasin, l'horloge doublée. Ce qui est garanti ici :
 *  - la carte dit le chiffre, la phrase du § 4, le petit volet ; la surface
 *    annonce la position puis la phrase ; les boutons nomment le volet ;
 *  - ouvert : la plaque et le lavis violets ; fermé : la surface seule ;
 *    muet : « — », « Indisponible », le liseré de panne, tout inerte ;
 *  - pendant une course : « En fermeture », Stop allumé avec son mot ;
 *  - la compacte garde ses ▲ ▼ et prend la phrase ;
 *  - l'en-tête compte les VOLETS, ouvre, ferme, arrête ;
 *  - la fabrique : la carte et la fiche d'un volet, jamais d'un garage (V3). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
const NOMS = ['RoomVoletCard', 'CvCard', 'CvChip', 'RM_MILIEU'];
const EXPOSE = 'data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?cartevolet')) return next(url, ctx);",
  '  const r = await next(url.slice(0, -11), ctx);',
  "  return { ...r, source: String(r.source) + ';export { " + NOMS.join(', ') + " };' };",
  '}',
].join('\n'));
register('./jsx-hooks.mjs', import.meta.url);
register(EXPOSE);
const F = await import(new URL('../src/App.jsx?cartevolet', import.meta.url).href);
const C = await import('../src/voletcourse.js');
const E = await import('../src/voletsetat.js');
// L'en-tête d'Objets › Volets vit dans son module, chargé à la demande (la borne du démarrage).
const EnteteVolets = (await import(new URL('../src/entetevolets.jsx', import.meta.url).href)).default;
/* Les minuteries du magasin des courses, au repos : un rendu statique ne s'anime pas, et une
 * minuterie réelle garderait le processus du test en vie. */
const AU_REPOS = { repeter: () => 0, arreterMinuterie: () => {}, plusTard: () => 0, annuler: () => {} };
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const T = Date.parse('2026-10-12T15:00:00+02:00');
const ISO = new Date(T - 3600000).toISOString();
const st = (id, state, pos, o = {}) => ({ entity_id: id, state, attributes: { friendly_name: o.nom || 'Volet cuisine', device_class: 'shutter', supported_features: 15,
  ...(pos == null ? {} : { current_position: pos }), ...(o.attributes || {}) }, last_updated: ISO, last_changed: ISO });
const hassDe = (...sts) => ({ states: Object.fromEntries(sts.map(s => [s.entity_id, s])), callService: () => Promise.resolve() });
const vol = (o = {}) => ({ regle: 'comme', a_venir: [], protection: null, abri: false, attente: null, porte: null, orientation: null, manoeuvre: null, ...o });
const ETAT = { maintenant: '2026-10-12T15:00:00+02:00', soleil_jours: [{ date: '2026-10-12', lever: '2026-10-12T07:47:00+02:00', coucher: '2026-10-12T20:24:00+02:00' }],
  config: { planning: { actif: true, mode: 'auto', ouverture: { decalage: 30 }, fermeture: { decalage: 30 }, jours: [], volets: {} } },
  volets: {
    'cover.volet_cuisine': vol({ a_venir: [{ sens: 'fermeture', heure: '2026-10-12T20:54:00+02:00', source: 'coucher', decalage: 30 }, { sens: 'ouverture', heure: '2026-10-13T08:17:00+02:00', source: 'lever', decalage: 30 }] }),
  } };
const ID = 'cover.volet_cuisine';
const carte = (s) => renderToStaticMarkup(createElement(F.RoomVoletCard, { id: ID, hass: hassDe(s), onOpen: () => {} }));
const bouton = (html, nom) => (new RegExp('<button[^>]*aria-label="' + nom + '"[^>]*>').exec(html) || [''])[0];

test('ouvert à 60 % : le chiffre, la phrase du § 4, le petit volet ; la surface annonce la position puis la phrase', () => {
  C.reglerCourses({ horloge: () => T, ...AU_REPOS });
  E.reglerVoletsEtat({ hass: null });
  E.poserEtatVolets(ETAT);
  const html = carte(st(ID, 'open', 60));
  // ASSERTION MODIFIÉE (passe téléphone, tâche 2) : la carte est le conteneur de la grille commune (`o-gabarit`), et plus de sa propre requête.
  assert.ok(html.startsWith('<div class="o-rmcard o-gabarit" data-volet=""'), 'la carte de la maison, sa requête de conteneur');
  assert.ok(html.includes('aria-label="Volet cuisine, 60 %, Ferme à 20:54"'), 'la surface');
  assert.ok(html.includes('Ferme à 20:54'));
  // ASSERTION MODIFIÉE (passe téléphone, tâche 2) : le petit volet ne s'écrit que pour la carte large (`o-seul-large`).
  assert.ok(html.includes('class="o-volet-dessin o-seul-large"') && html.includes('height:40%'), 'le tablier couvre 40 %');
  /* ASSERTION MODIFIÉE (retours du 15/10) : « font-size:25px » s'écrivait en ligne ; la taille se lit maintenant dans la feuille — `--o-chiffre-taille`, 25 px par défaut, 20 px
   * sur une carte étroite —, pour que le pourcentage prenne la place et la taille de la température d'un radiateur sans une seconde écriture (la variante haute est partie).
   * ASSERTION MODIFIÉE (passe téléphone, tâche 2) : ce pourcentage est celui de la carte large (`o-seul-large`) ; la carte étroite écrit le sien en haut (`ChiffreHaut`). */
  assert.ok(/class="o-volet-chiffre o-seul-large"[^>]*><span[^>]*font-size:var\(--o-chiffre-taille, 25px\)[^>]*>60<\/span><span[^>]*>%<\/span>/.test(html), 'le chiffre en 25 px par défaut, « % » à part');
  assert.ok(html.includes('rgba(var(--o-purple-rgb),.16)') && html.includes('color:var(--o-purple)'), 'la plaque violette');
  assert.ok(html.includes('fi-rr-blinds-raised'), 'entrouvert : le glyphe du milieu');
  for (const nom of ['Ouvrir Volet cuisine', 'Stop Volet cuisine', 'Fermer Volet cuisine']) {
    const b = bouton(html, nom);
    assert.ok(b && !b.includes('disabled'), nom);
    assert.ok(b.includes('class="o-rmbtn"') && b.includes('position:relative'), nom + ' : positionné, il passe au-dessus de la surface');
  }
  assert.ok(!html.includes('role="slider"'), 'plus de glissière sur la carte');
});

test('fermé : la surface seule, Descendre inerte ; ouvert à 100 : Monter inerte', () => {
  const ferme = carte(st(ID, 'closed', 0));
  assert.ok(!ferme.includes('rgba(var(--o-purple-rgb),.16)'), 'la plaque grise');
  assert.ok(ferme.includes('Ouvre demain à 08:17'), 'la fermeture du soir d’un volet fermé se saute');
  assert.ok(bouton(ferme, 'Fermer Volet cuisine').includes('disabled'));
  assert.ok(!bouton(ferme, 'Ouvrir Volet cuisine').includes('disabled'));
  const ouvert = carte(st(ID, 'open', 100));
  assert.ok(bouton(ouvert, 'Ouvrir Volet cuisine').includes('disabled'));
  assert.ok(ouvert.includes('fi-rr-blinds-open'));
});

test('muet : « — », « Indisponible », le liseré de panne, trois boutons inertes', () => {
  const html = carte(st(ID, 'unavailable', null));
  // ASSERTION MODIFIÉE (passe téléphone, tâche 2) : la classe de la grille commune précède celle de la panne.
  assert.ok(html.startsWith('<div class="o-rmcard o-gabarit o-panne"'));
  assert.ok(html.includes('Indisponible') && html.includes('>—<'));
  for (const nom of ['Ouvrir Volet cuisine', 'Stop Volet cuisine', 'Fermer Volet cuisine']) assert.ok(bouton(html, nom).includes('disabled'), nom);
});

test('pendant une course : « En fermeture », Stop allumé avec son mot, le chiffre de la course', () => {
  let t = T;
  C.reglerCourses({ horloge: () => t, ...AU_REPOS });
  C.lancerCourse(ID, 0, st(ID, 'open', 60));
  t = T + 6000;                             // 60 → 0 en 12 s : à mi-course
  const html = carte(st(ID, 'open', 60));
  assert.ok(html.includes('En fermeture') && html.includes('color:var(--o-purple)'), 'la phrase de la course, en violet');
  const stop = bouton(html, 'Stop Volet cuisine');
  assert.ok(stop.includes('background:var(--o-accent-fond)') && stop.includes('color:#fff'), 'Stop allumé');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 2) : le mot ne s'écrit que pour la carte large ; l'étroite garde le carré.
  assert.ok(html.includes('class="o-volet-stop-mot o-seul-large">Stop<'), 'et son mot');
  assert.ok(html.includes('>30<') && html.includes('height:70%'), 'le chiffre et le tablier suivent la course');
  C.reglerCourses(AU_REPOS);
});

test('V3 : la fabrique donne la carte d’un VOLET ; le garage et le portail gardent la leur', () => {
  assert.ok(APP.includes("d === 'cover' ? (estVolet(S[k]) ? <RoomVoletCard id={id} hass={hass} onOpen={setCoverPop} titre={label} /> : <RoomCoverCard id={id} hass={hass} onOpen={setCoverPop} titre={label} />)"));
});

test('la compacte garde ses ▲ ▼ et prend la phrase de la carte', () => {
  C.reglerCourses({ horloge: () => T, ...AU_REPOS });
  const html = renderToStaticMarkup(createElement(F.CvCard, { id: ID, hass: hassDe(st(ID, 'open', 60)), onOpen: () => {}, dense: true }));
  assert.ok(html.includes('Ferme à 20:54'));
  assert.ok(html.includes('aria-label="Ouvrir Volet cuisine"') && html.includes('aria-label="Fermer Volet cuisine"'));
  assert.ok(html.includes('fi-rr-angle-up') && html.includes('fi-rr-angle-down'), 'ses flèches d’avant');
});

test('relecture du 13/10, point 6 — un cover qui n’est pas un volet (un groupe, un garage) suit V12 lui aussi : à 1 %, « Fermé » et éteint', () => {
  C.reglerCourses({ horloge: () => T, ...AU_REPOS });
  const groupe = st('cover.tous_les_volets', 'open', 1, { nom: 'Tous les volets', attributes: { device_class: undefined } });
  const a40 = { ...groupe, attributes: { ...groupe.attributes, current_position: 40 } };
  const tuile = (s, dense) => renderToStaticMarkup(createElement(F.CvCard, { id: s.entity_id, hass: hassDe(s), onOpen: () => {}, dense }));
  for (const dense of [true, false]) {
    const html = tuile(groupe, dense);
    assert.ok(html.includes('aria-label="Tous les volets, Fermé"'), (dense ? 'la compacte' : 'la carte') + ' dit « Fermé »');
    assert.ok(!html.includes('Ouvert'), (dense ? 'la compacte' : 'la carte') + ' ne dit jamais « Ouvert · 1% »');
  }
  assert.ok(tuile(a40, true).includes('aria-label="Tous les volets, Ouvert · 40%"'));
  // Une pastille de carte « chips » n'est vive qu'ouverte au sens de V12.
  const ETEINTE = 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))';
  const pastille = (s) => renderToStaticMarkup(createElement(F.CvChip, { id: s.entity_id, hass: hassDe(s) }));
  assert.ok(pastille(groupe).includes(ETEINTE), 'à 1 % : la pastille reste éteinte');
  assert.ok(!pastille(a40).includes(ETEINTE), 'à 40 % : vive');
});

test('à 320 px, la compacte d’un volet tient dans ses 88 px : ▲ ▼ passent à 32 px, l’icône reste', () => {
  /* Mesuré le 13/10 : à 320 px de fenêtre, la compacte fait 141 px de large, 113 de contenu (rembourrage et
   * liseré déduits) ; la pastille, ▲ et ▼ en demandaient 120 — ▼ passait à la ligne, la rangée montait à
   * 90 px et la phrase sortait de la carte. */
  const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const m = /@container \(width < (\d+)px\) \{ \.o-cvdense > \.o-cvrow \{ --o-mini-volet: (\d+)px; \} \}/.exec(CSS);
  assert.ok(m, 'la compacte étroite ne resserre plus ses ▲ ▼');
  const rangee = (b) => 26 + 9 + b + 9 + b;      // la pastille, l'écart, ▲, l'écart, ▼
  assert.equal(Number(m[1]), rangee(38), 'le seuil est la place qu’il faut aux ▲ ▼ de 38 px');
  assert.ok(rangee(Number(m[2])) <= 113 && Number(m[2]) >= 32, 'à 320 px, tout tient sur une ligne — jamais sous 32 px');
  const html = renderToStaticMarkup(createElement(F.CvCard, { id: ID, hass: hassDe(st(ID, 'open', 60)), onOpen: () => {}, dense: true }));
  assert.equal((html.match(/width:var\(--o-mini-volet, 38px\)/g) || []).length, 2, '▲ et ▼ prennent leur largeur de la feuille');
});

/* TITRE MODIFIÉ (relecture des tâches 6 à 12, point 8) : il promettait que l'en-tête ouvre, ferme et
 * arrête, et ne regardait que ses puces. Les ordres se COMPTENT à la fin du fichier
 * (`commanderTous`, `arreterTous`, et l'en-tête joué). */
test('l’en-tête d’Objets › Volets : le compte des volets ; les puces Tout ouvrir, Tout fermer, et Tout arrêter pendant une course', () => {
  let t = T;
  C.reglerCourses({ horloge: () => t, ...AU_REPOS });
  const S = [st('cover.volet_cuisine', 'open', 60), st('cover.volet_salon', 'open', 100, { nom: 'Volet salon' }), st('cover.volet_chambre', 'closed', 0, { nom: 'Volet chambre' })];
  const ids = S.map(s => s.entity_id);
  const repos = renderToStaticMarkup(createElement(EnteteVolets, { hass: hassDe(...S), titre: 'Volets', ids }));
  assert.ok(repos.includes('3 volets · 2 ouverts'));
  assert.ok(repos.includes('aria-label="Tout ouvrir"') && repos.includes('aria-label="Tout fermer"') && !repos.includes('Tout arrêter'));
  C.lancerCourse('cover.volet_salon', 0, S[1]);
  t = T + 2000;
  const course = renderToStaticMarkup(createElement(EnteteVolets, { hass: hassDe(...S), titre: 'Volets', ids }));
  /* ASSERTION MODIFIÉE (tâche 12 bis) : « · 1 en mouvement » vit dans son propre <span>, que le
   * téléphone tait (index.css) ; le texte, lui, ne change pas. */
  assert.ok(course.replace(/<[^>]+>/g, '').includes('3 volets · 2 ouverts · 1 en mouvement'));
  assert.ok(/aria-label="Tout arrêter"[^>]*background:var\(--o-accent-fond\)/.test(course));
  const fermes = renderToStaticMarkup(createElement(EnteteVolets, { hass: hassDe(st('cover.volet_chambre', 'closed', 0)), titre: 'Volets', ids: ['cover.volet_chambre'] }));
  assert.ok(fermes.includes('1 volet · tous fermés'));
  C.reglerCourses(AU_REPOS);
});

/* TITRE MODIFIÉ (relecture des tâches 6 à 12, point 8) : il promettait que l'en-tête ne commande que les
 * volets visibles, et ne lisait qu'une ligne d'App.jsx. Il en garde ce qu'il lit — la liste que reçoit
 * l'en-tête ; que l'en-tête ne commande QUE cette liste se joue à la fin du fichier. */
test('la liste de l’en-tête : les volets visibles sous le filtre (App.jsx) ; l’en-tête se charge à la demande', () => {
  assert.ok(APP.includes("const idsVolets = actuel === 'volets' ? visibles.filter(o => o.id && estVolet(S[o.id])).map(o => o.id) : [];"));
  assert.ok(APP.includes("const EnteteVolets = lazyRecharge(() => import('./entetevolets.jsx'));"), 'le démarrage n’a pas de place à lui donner');
});

test('V3 : la fiche d’un VOLET ; le garage et le portail gardent leur feuille', () => {
  assert.ok(APP.includes('{coverPop && (estVolet(S[coverPop]) ? <FicheVolet id={coverPop} hass={hass} onClose={() => setCoverPop(null)} />'));
  assert.ok(APP.includes(": <RoomCoverSheet id={coverPop} hass={hass} onClose={() => setCoverPop(null)} />)}"));
});

/* ════════════ Tâche 12 bis : les finitions des relectures (13/10) ════════════ */

const ENTETE = await import(new URL('../src/entetevolets.jsx', import.meta.url).href);
const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/* L'arbre qu'un composant RENVOIE, ses crochets joués par React (dans le rendu d'un composant qui
 * l'appelle) : ses gestionnaires se lisent, et se jouent. */
const capter = (Composant, props) => {
  let arbre = null;
  const Capte = (p) => (arbre = Composant(p));
  renderToStaticMarkup(createElement(Capte, props));
  return arbre;
};
function chercher(el, t, acc = []) {
  if (!el || typeof el !== 'object') return acc;
  if (Array.isArray(el)) { el.forEach(x => chercher(x, t, acc)); return acc; }
  if (t(el)) acc.push(el);
  if (el.props && typeof el.props.children !== 'function') chercher(el.props.children, t, acc);
  return acc;
}
const element = (arbre, nom) => chercher(arbre, el => el.type === 'button' && el.props['aria-label'] === nom)[0];
const evt = () => ({ preventDefault() {}, stopPropagation() {} });
// Une maison qui RELÈVE les ordres partis vers Home Assistant : `[service, entité]` (l'entité vient dans `target`).
const hassOrdres = (ordres, ...sts) => ({ states: Object.fromEntries(sts.map(s => [s.entity_id, s])),
  callService: (d, s, data, target) => { ordres.push([s, (target && target.entity_id) || (data && data.entity_id)]); return Promise.resolve(); } });

test('relecture des tâches 6 à 12, point 5 — la carte : Monter et Descendre restent focalisables (aria-disabled), l’appui inerte ne part pas', () => {
  C.reglerCourses({ horloge: () => T, ...AU_REPOS });
  E.reglerVoletsEtat({ hass: null });
  E.poserEtatVolets(ETAT);
  const ordres = [];
  const ouvert = capter(F.RoomVoletCard, { id: ID, hass: hassOrdres(ordres, st(ID, 'open', 100)), onOpen: () => {} });
  const monter = element(ouvert, 'Ouvrir Volet cuisine');
  assert.deepEqual([monter.props['aria-disabled'], monter.props.disabled], [true, undefined], 'jamais disabled : le focus tomberait sur la page à l’arrivée d’une course');
  monter.props.onClick(evt());
  assert.deepEqual(ordres, [], 'l’appui sur un bouton inerte ne part pas');
  element(ouvert, 'Fermer Volet cuisine').props.onClick(evt());
  assert.deepEqual(ordres, [['close_cover', ID]]);
  C.reglerCourses({ horloge: () => T, ...AU_REPOS });   // la course que cet ordre a lancée ne compte pas pour la suite
  const ferme = capter(F.RoomVoletCard, { id: ID, hass: hassOrdres(ordres, st(ID, 'closed', 0)), onOpen: () => {} });
  const descendre = element(ferme, 'Fermer Volet cuisine');
  assert.deepEqual([descendre.props['aria-disabled'], descendre.props.disabled], [true, undefined]);
  descendre.props.onClick(evt());
  assert.equal(ordres.length, 1);
  // La compacte n'a jamais eu de bouton inerte : ses ▲ ▼ partent toujours (§ 3.3).
  const compacte = capter(F.CvCard, { id: ID, hass: hassOrdres(ordres, st(ID, 'open', 100)), onOpen: () => {}, dense: true });
  assert.equal(element(compacte, 'Ouvrir Volet cuisine').props.disabled, undefined);
  C.reglerCourses(AU_REPOS);
});

test('relecture des tâches 6 à 12, point 5 — « Tout arrêter » qui disparaît rend le focus à « Tout ouvrir »', async () => {
  let t = T;
  C.reglerCourses({ horloge: () => t, ...AU_REPOS });
  const S = [st('cover.volet_cuisine', 'open', 60), st('cover.volet_salon', 'open', 100, { nom: 'Volet salon' })];
  C.lancerCourse('cover.volet_cuisine', 0, S[0]);
  t = T + 1000;
  const arbre = capter(EnteteVolets, { hass: hassDe(...S), titre: 'Volets', ids: S.map(s => s.entity_id) });
  const arret = element(arbre, 'Tout arrêter'), ouvrir = element(arbre, 'Tout ouvrir');
  const focus = [];
  const noeudOuvrir = { focus: () => focus.push('Tout ouvrir') }, noeudArret = { focus: () => {} }, corps = {};
  const poser = (ref, v) => { if (typeof ref === 'function') ref(v); else if (ref) ref.current = v; };
  try {
    // Les références posées, comme React le fait au montage ; le focus sur « Tout arrêter ».
    poser(ouvrir.ref, noeudOuvrir); poser(arret.ref, noeudArret);
    globalThis.document = { activeElement: noeudArret, body: corps };
    // La course finie, « Tout arrêter » se démonte : React détache sa référence, puis le retire.
    poser(arret.ref, null);
    globalThis.document.activeElement = corps;
    await Promise.resolve();
    assert.deepEqual(focus, ['Tout ouvrir'], 'le focus revient à « Tout ouvrir », pas à la page');
    // Le focus était ailleurs : on n'y touche pas.
    poser(arret.ref, noeudArret);
    globalThis.document.activeElement = noeudOuvrir;
    poser(arret.ref, null);
    await Promise.resolve();
    assert.deepEqual(focus, ['Tout ouvrir']);
  } finally {
    delete globalThis.document;
    C.reglerCourses(AU_REPOS);
  }
});

test('relecture des tâches 6 à 12, point 8 — Tout ouvrir, Tout fermer, Tout arrêter (`commanderTous`, `arreterTous`) : un ordre par volet VIVANT, compté — jamais un muet', () => {
  const vues = [{ id: 'a', st: st('a', 'open', 60), c: { enCourse: true } }, { id: 'b', st: st('b', 'unavailable', null), c: { enCourse: true } },
    { id: 'c', st: st('c', 'closed', 0), c: { enCourse: false } }, { id: 'd', st: st('d', 'open', 30), c: { enCourse: true } }];
  const ordres = [], courses = [], arrets = [];
  // `d` : le moteur d'actions refuse l'ordre (il rend null) — aucune course ne part pour lui.
  const commanderUn = (id, capacite) => { ordres.push([capacite, id]); return id === 'd' ? null : true; };
  assert.deepEqual(ENTETE.commanderTous(vues, 'close', 0, { commanderUn, lancer: (id, cible) => courses.push([id, cible]) }), ['a', 'c']);
  assert.deepEqual(ordres, [['close', 'a'], ['close', 'c'], ['close', 'd']], 'trois ordres : jamais le muet');
  assert.deepEqual(courses, [['a', 0], ['c', 0]], 'une course par ordre accepté');
  ordres.length = 0;
  assert.deepEqual(ENTETE.arreterTous(vues, { commanderUn, arreter: (id) => arrets.push(id) }), ['a']);
  assert.deepEqual(ordres, [['stop', 'a'], ['stop', 'd']], 'Stop aux seuls volets vivants qui bougent');
  assert.deepEqual(arrets, ['a']);
});

test('relecture des tâches 6 à 12, point 8 — l’en-tête joué ne commande QUE les volets de sa liste, et compte ses ordres', () => {
  let t = T;
  C.reglerCourses({ horloge: () => t, ...AU_REPOS });
  const S = [st('cover.volet_cuisine', 'open', 60), st('cover.volet_salon', 'open', 100, { nom: 'Volet salon' }),
    st('cover.volet_chambre', 'closed', 0, { nom: 'Volet chambre' }), st('cover.volet_bureau', 'unavailable', null, { nom: 'Volet bureau' })];
  const ordres = [];
  const ids = ['cover.volet_cuisine', 'cover.volet_salon', 'cover.volet_bureau'];     // la chambre n'est pas sous le filtre
  const repos = capter(EnteteVolets, { hass: hassOrdres(ordres, ...S), titre: 'Volets', ids });
  element(repos, 'Tout fermer').props.onClick(evt());
  assert.deepEqual(ordres, [['close_cover', 'cover.volet_cuisine'], ['close_cover', 'cover.volet_salon']], 'deux ordres : ni la chambre (hors liste), ni le bureau (muet)');
  element(repos, 'Tout ouvrir').props.onClick(evt());
  assert.equal(ordres.length, 4);
  // Pendant la course, « Tout arrêter » : Stop à ceux qui bougent.
  t = T + 1000;
  const course = capter(EnteteVolets, { hass: hassOrdres(ordres, ...S), titre: 'Volets', ids });
  element(course, 'Tout arrêter').props.onClick(evt());
  assert.deepEqual(ordres.slice(4), [['stop_cover', 'cover.volet_cuisine']], 'le salon, déjà ouvert, n’a pas bougé');
  C.reglerCourses(AU_REPOS);
});

test('relecture du 13/10 (tâche 9) — au téléphone, l’en-tête tait « · n en mouvement » : il garde UNE ligne, rien ne saute pendant une course', () => {
  let t = T;
  C.reglerCourses({ horloge: () => t, ...AU_REPOS });
  const S = [st('cover.volet_cuisine', 'open', 60), st('cover.volet_salon', 'open', 100, { nom: 'Volet salon' })];
  C.lancerCourse('cover.volet_salon', 0, S[1]);
  t = T + 2000;
  const html = renderToStaticMarkup(createElement(EnteteVolets, { hass: hassDe(...S), titre: 'Volets', ids: S.map(s => s.entity_id) }));
  assert.ok(html.includes('<span class="o-volets-mouvement"> · 1 en mouvement</span>'), 'le mouvement, dans son propre <span>');
  const TELEPHONE = '@media (max-width: 760px) {\n  .o-volets-mouvement { display: none; }\n  .o-volets-compte { flex: 1 1 0; min-width: 0; line-height: 13px; }\n}';
  assert.ok(CSS.includes(TELEPHONE), 'que le téléphone tait — chaque carte dit déjà « En fermeture » — ; le compte passe à la ligne dans sa colonne');
  assert.ok(html.includes('<span class="o-volets-compte" style="'), 'le compte a sa classe');
  C.reglerCourses(AU_REPOS);
});

/* ════════════ Retours du 15/10 : le pourcentage prend la place de la température d'un radiateur ════════════
 *
 * « pourquoi le % et en haut entre l'icone et le toggle, pour le volet de la chambre aussi alors que les radiateur lui c'est bien placé » : sur une carte étroite, le pourcentage
 * montait dans la ligne de la plaque. Il s'écrit maintenant UNE fois, dans la rangée du milieu — celle du radiateur (`RM_MILIEU`) —, et la feuille donne à la carte étroite la
 * disposition étroite du radiateur (la parité des règles est dans tests/chiffre_carte_etroite.test.mjs). */
test('15/10 : le pourcentage s’écrit UNE fois, dans la rangée du nom ; la ligne du haut ne porte que la plaque et le petit volet', () => {
  C.reglerCourses({ horloge: () => T, ...AU_REPOS });
  E.reglerVoletsEtat({ hass: null });
  E.poserEtatVolets(ETAT);
  const arbre = capter(F.RoomVoletCard, { id: ID, hass: hassDe(st(ID, 'open', 60)), onOpen: () => {} });
  const figures = chercher(arbre, el => el.type && el.type.name === 'ChiffreVolet');
  assert.deepEqual(figures.map(f => [f.props.haut, f.props.pos]), [[undefined, 60]], 'une seule fois, sans variante haute');
  const enfantsDe = (el) => [].concat(el.props.children).filter(x => x && typeof x === 'object');
  const racine = enfantsDe(arbre);
  // La ligne du haut : la plaque, le petit volet — rien d'autre.
  const entete = racine.find(x => x.props && x.props.style && x.props.style.justifyContent === 'space-between');
  /* ASSERTION MODIFIÉE (passe téléphone, tâche 2) : la ligne du haut porte aussi le pourcentage de la carte ÉTROITE (`ChiffreHaut`) ; la feuille ne
   * montre que lui sur une carte étroite, que le petit volet sur une carte large. */
  assert.deepEqual(enfantsDe(entete).map(e => e.props.className || (e.props.style && e.props.style.width === 38 ? 'plaque' : e.type.name)), ['plaque', 'o-volet-dessin o-seul-large', 'ChiffreHaut'], 'la plaque, le petit volet de la carte large, le pourcentage de la carte étroite');
  // La rangée du milieu : celle du radiateur ; le texte à gauche, le pourcentage à droite.
  const rangee = racine.find(x => enfantsDe(x).includes(figures[0]));
  assert.equal(rangee.props.style, F.RM_MILIEU, 'la rangée du radiateur, la même : un seul objet de style');
  const [texte, droite] = enfantsDe(rangee);
  assert.equal(droite, figures[0], 'le pourcentage est à droite du texte');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 2) : le texte ne s'efface plus dans la grille ; sur une carte étroite, le pourcentage du bas se tait et le texte prend toute la largeur.
  assert.deepEqual([texte.props.className, texte.props.style.minWidth], [undefined, 0], 'le texte, une colonne qui prend la place qui reste');
  const [nom, phrase] = enfantsDe(texte);
  assert.equal(nom.props.children, 'Volet cuisine');
  assert.equal(phrase.props.children, 'Ferme à 20:54');
  assert.equal(phrase.props.style['--o-n'], 'Ferme à 20:54'.length, 'la longueur de la phrase règle sa taille d’une carte étroite, de 12 à 10,5 px (index.css)');
  // Muet : « — », et la même place.
  const muet = capter(F.RoomVoletCard, { id: ID, hass: hassDe(st(ID, 'unavailable', null)), onOpen: () => {} });
  assert.equal(chercher(muet, el => el.type && el.type.name === 'ChiffreVolet').length, 1);
  // Rien de la variante haute ne reste, ni dans le code ni dans la feuille.
  for (const reste of ['o-volet-chiffre-haut', 'ChiffreVolet pos={pos} haut']) assert.ok(!APP.includes(reste) && !CSS.includes(reste), reste + ' est parti avec la variante haute');
  C.reglerCourses(AU_REPOS);
});

/* ════════════ Passe téléphone, tâche 2 : la carte étroite d'un volet, dans la grille commune (ADR 0202, T14) ════════════
 *
 * Sous 188 px de contenu, la feuille montre la grille commune (`o-gabarit`, index.css) : le pourcentage en haut à droite
 * (`ChiffreHaut`), le nom sur toute la largeur, la phrase dessous ; Monter, Stop et Descendre gardent leurs trois parts
 * égales de 44 px ; le petit volet et le mot « Stop » se taisent. La feuille, ses tailles et le budget de 150 px sont dans
 * tests/chiffre_carte_etroite.test.mjs ; ce qui se mesure (184 pile, rien qui déborde) se mesure dans la démo. */
test('passe téléphone, T14 : la carte étroite d’un volet — le pourcentage en haut, une fois ; le nom et la phrase de la grille commune ; les trois boutons de toujours', () => {
  C.reglerCourses({ horloge: () => T, ...AU_REPOS });
  E.reglerVoletsEtat({ hass: null });
  E.poserEtatVolets(ETAT);
  const arbre = capter(F.RoomVoletCard, { id: ID, hass: hassDe(st(ID, 'open', 60)), onOpen: () => {} });
  const haut = chercher(arbre, el => el.type && el.type.name === 'ChiffreHaut');
  assert.deepEqual(haut.map(h => [h.props.v, h.props.u, h.props.lu]), [[60, '%', undefined]], 'le pourcentage de la carte étroite, une fois, caché au lecteur : la surface le dit');
  const html = carte(st(ID, 'open', 60));
  assert.ok(/<span aria-hidden="true" class="o-gab-chiffre o-seul-etroit" style="[^"]*--o-em:1\.691"><span style="letter-spacing:-\.02em">60<\/span><span style="font-size:\.545em;font-weight:700;color:var\(--o-text2\)">%<\/span><\/span>/.test(html),
    'en haut à droite, sa largeur en em pour la feuille : « 60 % » vaut 2 × 0,6 + 0,9 × 0,545');
  assert.ok(html.includes('<div class="o-gab-nom" style="font-size:15px;font-weight:700;') && html.includes('<div class="o-gab-phrase" style="font-size:12px;font-weight:600;color:var(--o-text2);'), 'le nom et la phrase de la grille commune ; leur style de carte large ne bouge pas');
  // Muet : « — », sans unité.
  const muet = capter(F.RoomVoletCard, { id: ID, hass: hassDe(st(ID, 'unavailable', null)), onOpen: () => {} });
  assert.deepEqual(chercher(muet, el => el.type && el.type.name === 'ChiffreHaut').map(h => [h.props.v, h.props.u]), [['—', null]]);
  // Les trois boutons : les mêmes, trois parts égales de 44 px (`RM_BTN` : `flex: 1`), 8 px d'écart.
  assert.ok(APP.includes("const RM_VOLET_BTN = { ...RM_BTN, height: 44, padding: 0, borderRadius: 12, border: 'none', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 };"));
  assert.ok(/const RM_BTN = \{ position: 'relative', flex: 1,/.test(APP));
  assert.ok(APP.includes("<div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 14px)' }}>"), 'la rangée des trois boutons, collée au pied');
  C.reglerCourses(AU_REPOS);
});
