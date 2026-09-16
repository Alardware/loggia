// La vue Securite parle comme l'Accueil (16/09, ADR 0033, etape 7) : l'etat
// en une seconde, la meme rangee de tuiles, « A surveiller », un ouvrant par
// carte illustree — et la carte Securite de l'Accueil mene a la vue d'un tap.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resumeSecurite, comptesSecurite } from '../src/attention.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };
const b = (id, dc, state) => ({ state, attributes: { device_class: dc, friendly_name: id } });

test('la sous-ligne de la securite : securise, sinon ce qui ne l’est pas — la meme phrase partout', () => {
  assert.equal(resumeSecurite({ ok: true }), 'Tout est sécurisé');
  assert.equal(resumeSecurite({ ok: false, portes: { total: 2, ouverts: 1 }, fenetres: { total: 3, ouverts: 1 } }), '2 ouvrants ouverts', 'portes et fenetres se comptent ensemble');
  assert.equal(resumeSecurite({ ok: false, portes: { total: 2, ouverts: 1 } }), '1 ouvrant ouvert');
  assert.equal(resumeSecurite({ ok: false, portes: { total: 2, ouverts: 0 }, cameras: { total: 2, enLigne: 1 } }), 'Caméra hors ligne', 'rien d’ouvert : c’est une camera');
  assert.equal(resumeSecurite(null), 'Caméra hors ligne');
  const S = { 'binary_sensor.porte': b('porte', 'door', 'on'), 'binary_sensor.fenetre': b('fenetre', 'window', 'off') };
  assert.equal(resumeSecurite(comptesSecurite(S, [{ nom: 'Jardin', online: false }])), '1 ouvrant ouvert', 'd’apres les comptes reels');
  assert.equal(resumeSecurite(comptesSecurite({ 'binary_sensor.fenetre': b('fenetre', 'window', 'off') }, [])), 'Tout est sécurisé');
});

test('la rangee de tuiles est UN composant, partage par l’Accueil et la vue', () => {
  const t = bloc('function TuilesSecurite(', NL + '}');
  assert.ok(t.includes('if (!tuiles || !tuiles.length) return null;') && t.includes("onClick={() => onTuile && onTuile(t)}") && t.includes('className="sec-tuile"'), 'le composant, avec ses classes du telephone');
  const home = bloc('function Dashboard(', NL + '}');
  assert.ok(home.includes("<TuilesSecurite tuiles={tuilesSec} onTuile={() => onNav && onNav('securite')} />") && home.includes('const sousSecurite = resumeSecurite(comptesSec);'), 'l’Accueil : vers la vue, la meme phrase');
  assert.ok(!home.includes('ouvertsSec'), 'plus de compte local des ouverts : la fonction pure le fait');
  const vue = bloc('function SecuriteContent(', NL + '}');
  assert.ok(vue.includes('<TuilesSecurite tuiles={tuilesSecVue} onTuile={(t) => defiler(t.cle)} />'), 'la vue : vers la section');
  assert.ok(vue.includes("const el = document.getElementById(cle === 'cameras' ? 'sec-cameras' : cle === 'mouvement' ? 'sec-journal' : 'sec-ouvrants');"), 'cameras, journal (le mouvement s’y lit), ouvrants');
  assert.ok(vue.includes('<div id="sec-ouvrants"') && vue.includes('<div id="sec-cameras"') && vue.includes('<div id="sec-journal">'), 'les ancres existent');
});

test('la carte Securite de l’Accueil mene a la vue d’un tap sur son en-tete', () => {
  const home = bloc('function Dashboard(', NL + '}');
  assert.ok(home.includes("<button type=\"button\" onClick={() => onNav && onNav('securite')} aria-label={tr('Ouvrir la vue Sécurité')}"), 'l’en-tete est un bouton');
  assert.ok(home.includes('{alarmRailId && <RailArm id={alarmRailId} hass={dashHass} />}') && home.includes('{serrureId && <RailSerrure id={serrureId} hass={dashHass} />}'), 'les boutons d’armement et la serrure restent, hors du bouton');
  assert.ok(en.includes("'Ouvrir la vue Sécurité':"), 'la traduction');
});

test('la vue : l’etat en une seconde, A surveiller, un ouvrant par carte illustree, les fiches', () => {
  assert.ok(src.includes('function SecuriteView({ hass, edit = false, onEnt, onNav = null }) {') && src.includes('<SecuriteContent hass={hass} edit={edit} onEnt={onEnt} onNav={onNav} />') && src.includes("onEnt={editMode && peutEditer ? () => setEntSheet(true) : null} onNav={setView} />"), 'la navigation arrive jusqu’a la vue');
  const vue = bloc('function SecuriteContent(', NL + '}');
  assert.ok(vue.includes("const camsInfoSec = (camsCfg || camList).map(c => ({ nom: c.name || c.label, online: S[c.haid] ? S[c.haid].state !== 'unavailable' : c.online !== false }));") && vue.includes("cfgVal('loggia_cameras', null)") && vue.includes('const comptesSecVue = comptesSecurite(S, camsInfoSec);') && vue.includes('const tuilesSecVue = tuilesSecurite(comptesSecVue);'), 'les comptes de l’Accueil, sur les cameras de la vue');
  assert.ok(vue.includes("{tr('Alarme')} {alarmWord} · {resumeSecurite(comptesSecVue)}") && vue.includes("color: comptesSecVue.ok ? 'var(--o-ok)' : 'var(--o-warn)'"), 'la sous-ligne : l’alarme et la securite, verte ou ambre');
  assert.ok(vue.includes('const pointsSec = pointsAttention({ S, cams: camsInfoSec });') && vue.includes("{pointsSec.length > 0 && <CarteAttention points={pointsSec} onNav={(v) => { if (v !== 'securite' && onNav) onNav(v); }} />}"), '« A surveiller » : seulement quand il y a un point, seulement la securite, jamais vers soi-meme');
  assert.ok(vue.includes("{[...ouvrantsDe(S)].sort((a, b) => (b.on ? 1 : 0) - (a.on ? 1 : 0)).map((o, i) => <Anim key={o.id} i={i}><div style={{ height: 184 }}><RoomGenericCard id={o.id} hass={hass} onOpen={dc.ouvrir} /></div></Anim>)}"), 'un ouvrant par carte des pieces (la porte dessinee), les ouverts d’abord');
  assert.ok(!vue.includes('<CvOuvrants hass={hass} />'), 'le resume de trois lignes a quitte la vue');
  assert.ok(vue.includes('{people.length > 0 && <Anim i={ouvrantsDe(S).length}><div style={{ height: 184 }}><CvPresence hass={hass} /></div></Anim>}'), 'la presence reste');
  assert.ok(vue.includes('const dc = useDomainCards(hass, { onNav });') && vue.includes('{dc.sheets}'), 'les fiches s’ouvrent');
  assert.ok(src.includes('function CvOuvrants({ hass }) {'), 'la carte du catalogue existe toujours');
});
