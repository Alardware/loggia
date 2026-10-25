/* TEST AJOUTÉ (chantier IoT, tâche 7, 18/10 ; I14 ; § 7.4) — l'en-tête d'Objets › IoT.
 *
 * Le titre reste « IoT » ; à côté, le compte de sa maquette — « 3 appareils · 1 en marche » —, au pluriel de chaque langue ;
 * rien à droite. « En marche » compte ce qui travaille — un robot au travail, un ventilateur ou un humidificateur allumé, la
 * règle des chiffres d'Objets (`objetActif`) —, jamais une vanne ouverte ; le distributeur compte dans le total seulement. Un
 * module à part, chargé à la première ouverture du filtre, qui reçoit un `hass` VIVANT d'App.jsx (`EnteteIotVive`, abonné aux
 * entités visibles). On le REND (react-dom/server). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
register('./jsx-hooks.mjs', import.meta.url);
const E = await import(new URL('../src/enteteiot.jsx', import.meta.url).href);
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src/App.jsx'), CSS = lire('src/index.css');

const st = (id, state) => [id, { entity_id: id, state, attributes: {} }];
const S = Object.fromEntries([st('vacuum.aspirateur', 'cleaning'), st('lawn_mower.tondeuse', 'docked'), st('fan.salon', 'on'),
  st('humidifier.chambre', 'off'), st('valve.arrivee_eau', 'open'), st('fan.bureau', 'unavailable')]);
const O = (id, domaine = id.split('.')[0]) => ({ id, domaine });
const OBJETS = [O('vacuum.aspirateur'), O('lawn_mower.tondeuse'), { id: null, domaine: 'feeder' }, O('fan.salon'), O('humidifier.chambre'), O('valve.arrivee_eau'), O('fan.bureau')];
const html = (objets = OBJETS, etats = S) => renderToStaticMarkup(createElement(E.default, { hass: { states: etats }, titre: 'IoT', objets }));

test('I14 : le compte — tout ce que le filtre montre, et ce qui travaille ; jamais une vanne ouverte, jamais le distributeur', () => {
  assert.deepEqual(E.compteIot(OBJETS, S), { total: 7, enMarche: 2 }, 'l’aspirateur au travail et le ventilateur allumé ; la vanne ouverte n’est pas « en marche »');
  assert.deepEqual(E.compteIot(OBJETS, { ...S, 'humidifier.chambre': { state: 'on', attributes: {} } }), { total: 7, enMarche: 3 }, 'un humidificateur allumé travaille');
  assert.deepEqual(E.compteIot(OBJETS, { ...S, 'vacuum.aspirateur': { state: 'docked', attributes: {} } }), { total: 7, enMarche: 1 }, 'un robot sur sa base ne travaille pas');
  assert.deepEqual(E.compteIot([], S), { total: 0, enMarche: 0 });
});

/* TEST AJOUTÉ (passe bis du 18/10, point 9) : « en marche » est une liste FERMÉE — un robot au travail, un ventilateur ou un
 * humidificateur allumé. Le filtre IoT range aussi les interrupteurs qui ne mesurent pas et les `input_boolean` : allumés, ils ne
 * disent pas qu'un appareil tourne, et ne comptent que dans le total ; jamais une vanne ouverte. */
test('point 9 : « en marche » — une liste fermée ; des interrupteurs et des aides allumés n’y comptent pas', () => {
  const etats = { ...S, 'switch.mode_nuit': { state: 'on', attributes: {} }, 'input_boolean.vacances': { state: 'on', attributes: {} },
    'switch.relais_garage': { state: 'on', attributes: {} }, 'lawn_mower.tondeuse': { state: 'mowing', attributes: {} } };
  const objets = [...OBJETS, O('switch.mode_nuit'), O('input_boolean.vacances'), O('switch.relais_garage')];
  assert.deepEqual(E.compteIot(objets, etats), { total: 10, enMarche: 3 }, 'l’aspirateur, la tondeuse et le ventilateur — ni les interrupteurs, ni l’aide, ni la vanne');
  assert.ok(html(objets, etats).includes('>10 appareils · 3 en marche</span>'));
});

test('I14 : « 3 appareils · 1 en marche », « 1 appareil » — le titre en italique, le compte sur une ligne, rien à droite', () => {
  const h = html([O('vacuum.aspirateur'), O('lawn_mower.tondeuse'), { id: null, domaine: 'feeder' }]);
  assert.ok(h.includes('<h2') && h.includes('>IoT</h2>'), 'le titre du filtre reste « IoT »');
  assert.ok(h.includes('class="o-iot-compte"') && h.includes('>3 appareils · 1 en marche</span>'), h);
  assert.ok(!h.includes('<button'), 'rien à droite');
  assert.ok(html([O('lawn_mower.tondeuse')]).includes('>1 appareil</span>'), 'rien ne travaille : le total seul, pas « 0 en marche »');
  assert.ok(html().includes('>7 appareils · 2 en marche</span>'));
});

test('la rangée : la hauteur des autres en-têtes, le compte sur UNE ligne (index.css)', () => {
  assert.ok(CSS.includes('.o-iot-entete { display: flex; align-items: center; gap: 12px; min-height: 40px; }'));
  assert.ok(CSS.includes('.o-iot-entete > h2 { flex: none; }'));
  assert.ok(CSS.includes('.o-iot-compte { flex: 1 1 0; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }'));
});

test('App.jsx : le module à la demande, l’en-tête vivant abonné aux entités visibles, sous le filtre IoT avec son repli et sa barrière', () => {
  assert.ok(APP.includes("const EnteteIot = lazyRecharge(() => import('./enteteiot.jsx'));"), 'chargé à la demande');
  const i = APP.indexOf('\nfunction EnteteIotVive(');
  assert.ok(i > 0, 'l’en-tête vivant a disparu');
  const vive = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.ok(vive.includes('const vivant = useHass(objets.filter(o => o.id).map(o => o.id));'), 'abonné aux entités visibles');
  assert.ok(vive.includes('<EnteteIot hass={vivant || hass} titre={titre} objets={objets} />'));
  assert.ok(APP.includes("const objetsIot = actuel === 'iot' ? visibles.map(o => ({ id: o.id, domaine: o.domaine })) : [];"), 'les objets visibles sous le filtre');
  const j = APP.indexOf("        ) : actuel === 'iot' ? (");
  assert.ok(j > 0, 'l’en-tête n’est pas monté sous le filtre IoT');
  const branche = APP.slice(j, APP.indexOf("        ) : enSections ? (", j));
  assert.ok(branche.includes('<Barriere repli={<div className="o-iot-entete">') && branche.includes('<Suspense fallback={<div className="o-iot-entete">')
    && branche.includes('<EnteteIotVive hass={hass} titre={titreFiltre} objets={objetsIot} />'), 'la barrière locale, le repli aux mêmes classes, l’en-tête vivant');
  assert.ok(branche.includes("<span className=\"o-iot-compte\" aria-hidden=\"true\" style={{ fontSize: 12, fontWeight: 600 }}>{'\\u00a0'}</span>"), 'le compte vide du repli tient la hauteur : rien ne saute');
});
