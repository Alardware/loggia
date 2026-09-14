// La vue Objets : une seule vue, filtree, aux cartes de la piece — et ce qui
// range chaque appareil sous ses filtres, sans React (src/objets.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filtresObjet, objetActif, statsObjets, pucesObjets, trierObjets, OBJ_ORDRE, domaineEdition, identifiantEdition } from '../src/objets.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

test('chaque domaine trouve son filtre ; une prise declaree lumiere est une lumiere', () => {
  const f = (o) => filtresObjet(o);
  assert.deepEqual(f({ domaine: 'light' }), ['lumieres']);
  assert.deepEqual(f({ domaine: 'switch', estLumiere: true }), ['lumieres']);
  assert.deepEqual(f({ domaine: 'switch' }), ['prises']);
  assert.deepEqual(f({ domaine: 'cover' }), ['volets']);
  assert.deepEqual(f({ domaine: 'climate' }), ['chauffage']);
  assert.deepEqual(f({ domaine: 'switch', type: 'zone' }), ['chauffage'], 'une zone fil pilote est du chauffage, pas une prise');
  assert.deepEqual(f({ domaine: 'media_player' }), ['multimedia']);
  assert.deepEqual(f({ domaine: 'binary_sensor' }), ['capteurs']);
  assert.deepEqual(f({ domaine: 'binary_sensor', classe: 'motion' }), ['presence'], 'un detecteur de mouvement est une presence');
  assert.deepEqual(f({ domaine: 'binary_sensor', classe: 'door' }), ['capteurs'], 'une porte reste un capteur');
  assert.deepEqual(f({ domaine: 'sensor' }), ['capteurs']);
  assert.deepEqual(f({ domaine: 'camera' }), ['cameras']);
  assert.deepEqual(f({ domaine: 'lock' }), [], 'une serrure ne vit que sous Tous : pas de puce Securite, la maquette n’en a pas');
  assert.deepEqual(f({ domaine: 'vacuum' }), ['menager']);
  assert.deepEqual(f({ domaine: 'feeder', type: 'feeder' }), ['menager']);
  assert.deepEqual(f({ domaine: 'lawn_mower' }), ['jardin']);
  assert.deepEqual(f({ domaine: 'plant', type: 'plant' }), ['plantes']);
  assert.deepEqual(f({ domaine: 'script' }), [], 'un domaine inconnu ne vit que sous Tous');
});

test('dehors et epingle s’ajoutent : une applique exterieure est aussi du jardin', () => {
  assert.deepEqual(filtresObjet({ domaine: 'light', dehors: true }), ['lumieres', 'jardin']);
  assert.deepEqual(filtresObjet({ domaine: 'lawn_mower', dehors: true }), ['jardin'], 'pas deux fois jardin');
  assert.deepEqual(filtresObjet({ domaine: 'cover', epingle: true }), ['volets', 'favoris']);
  assert.equal(filtresObjet({ domaine: 'light', dehors: true, epingle: true })[0], 'lumieres', 'le principal reste premier');
});

test('actif : ce qui fait quelque chose, pas ce qui existe', () => {
  const a = (domaine, etat, attributs) => objetActif({ domaine, etat, attributs });
  assert.equal(a('light', 'on'), true);
  assert.equal(a('light', 'off'), false);
  assert.equal(a('media_player', 'playing'), true);
  assert.equal(a('media_player', 'paused'), false);
  assert.equal(a('climate', 'heat', { hvac_action: 'heating' }), true);
  assert.equal(a('climate', 'heat', { hvac_action: 'idle' }), false, 'au repos : pas actif');
  assert.equal(a('climate', 'heat'), true, 'sans action connue, le mode fait foi');
  assert.equal(a('climate', 'off'), false);
  assert.equal(a('cover', 'open', { current_position: 40 }), true);
  assert.equal(a('cover', 'closed', { current_position: 0 }), false);
  assert.equal(a('cover', 'open'), true);
  assert.equal(a('vacuum', 'cleaning'), true);
  assert.equal(a('vacuum', 'docked'), false);
  assert.equal(a('lawn_mower', 'mowing'), true);
  assert.equal(a('lock', 'unlocked'), false, 'une serrure ne « fait » rien');
  assert.equal(a('camera', 'streaming'), false);
  assert.equal(a('binary_sensor', 'on'), true, 'un capteur qui detecte est actif');
  assert.equal(a('switch', 'unavailable'), false);
  assert.equal(a('climate', 'unavailable'), false, 'indisponible n’est pas « pas off »');
});

const MAISON = [
  { cle: 'light.a', nom: 'Plafonnier', piece: 'Salon', filtres: ['lumieres'], actif: true, absent: false },
  // « Baie » passe avant « Plafonnier » par le nom : seul l'ordre des filtres le range apres.
  { cle: 'cover.a', nom: 'Baie', piece: 'Salon', filtres: ['volets'], actif: false, absent: false },
  { cle: 'light.b', nom: 'Applique', piece: 'Terrasse', filtres: ['lumieres', 'jardin', 'favoris'], actif: false, absent: true },
  { cle: 'media_player.a', nom: 'Enceinte', piece: 'Cuisine', filtres: ['multimedia'], actif: true, absent: false },
  { cle: 'obj:feeder', nom: 'Distributeur', piece: null, filtres: ['menager'], actif: false, absent: false },
];

test('les chiffres de tete : appareils, pieces distinctes, actifs, absents', () => {
  assert.deepEqual(statsObjets(MAISON), { appareils: 5, pieces: 3, actifs: 2, absentes: 1 });
  assert.deepEqual(statsObjets([]), { appareils: 0, pieces: 0, actifs: 0, absentes: 0 });
});

test('les puces : Tous toujours, Favoris s’il y a une epingle, puis dans l’ordre, avec leur compte', () => {
  assert.deepEqual(pucesObjets(MAISON), [
    { id: 'tous', n: 5 }, { id: 'favoris', n: 1 }, { id: 'lumieres', n: 2 }, { id: 'volets', n: 1 },
    { id: 'multimedia', n: 1 }, { id: 'menager', n: 1 }, { id: 'jardin', n: 1 },
  ]);
  assert.deepEqual(pucesObjets([]), [{ id: 'tous', n: 0 }]);
  assert.deepEqual(OBJ_ORDRE.slice(0, 3), ['lumieres', 'volets', 'chauffage']);
});

test('la grille : piece par piece dans l’ordre de la maison, puis filtre, puis nom — sans piece en dernier', () => {
  const cles = trierObjets(MAISON, ['Cuisine', 'Salon']).map(o => o.cle);
  assert.deepEqual(cles, ['media_player.a', 'light.a', 'cover.a', 'light.b', 'obj:feeder']);
  assert.equal(trierObjets(MAISON).map(o => o.cle).at(-1), 'obj:feeder', 'sans ordre connu, le sans-piece ferme quand meme');
  assert.equal(trierObjets(MAISON).length, 5, 'une copie, rien de perdu');
  const avant = MAISON.map(o => o.cle);
  trierObjets(MAISON, ['Cuisine', 'Salon']);
  assert.deepEqual(MAISON.map(o => o.cle), avant, 'l’entree n’est pas triee sur place');
});

test('les vues Lumieres, Climat et Medias sont remplacees : leurs routes menent a Objets, filtre pose', () => {
  assert.ok(src.includes('view === \'lumieres\' ? <ObjetsView hass={hass} onNav={setView} filtre="lumieres" edit={editMode && peutEditer} />'), 'lumieres → Objets');
  assert.ok(src.includes('view === \'climat\' ? <ObjetsView hass={hass} onNav={setView} filtre="chauffage" edit={editMode && peutEditer} />'), 'climat → Objets');
  assert.ok(src.includes('view === \'medias\' ? <ObjetsView hass={hass} onNav={setView} filtre="multimedia" edit={editMode && peutEditer} />'), 'medias → Objets');
  ['LumieresView', 'ClimatView', 'MediasView', 'LumieresContent', 'ClimatContent', 'MediasContent'].forEach(n =>
    assert.ok(!src.includes('function ' + n + '('), n + ' devrait avoir disparu'));
  assert.ok(src.includes('function VoletsView('), 'la vue Volets, elle, reste');
});

test('la vue Objets dessine les cartes de la piece, une par appareil, derriere des puces a l’arrondi 9', () => {
  const d = src.indexOf('function ObjetsView(');
  const vue = src.slice(d, src.indexOf(String.fromCharCode(10) + '}', d));
  assert.ok(vue.includes('objetsDeLaMaison(hass, ajoutes)') && vue.includes('return dc.card(o.id, ed.labelOf(o.cle) || null);'), 'les cartes de la piece');
  assert.ok(vue.includes('dc.card(null, nomDe(o), o.zone)'), 'une zone fil pilote a sa carte');
  assert.ok(vue.includes('borderRadius: 9') && !vue.includes('borderRadius: 999'), 'des puces, pas des pilules');
  assert.ok(vue.includes(`className="o-favrow" style={{ display: 'flex', gap: 8, overflowX: 'auto', flexWrap: 'nowrap' }}`), 'une seule ligne qui defile, pas de retour a la ligne');
  assert.ok(vue.includes(`flexShrink: 0, whiteSpace: 'nowrap', padding: '8px 13px'`), 'une puce ne se casse ni ne se tasse');
  assert.ok(vue.includes('{dc.sheets}'), 'les fiches montent');
  assert.ok(vue.includes("useLayoutEditor(OBJ_LAYOUT_KEY, 'objets', derived)"), 'l’editeur d’agencement est de retour (mode edition)');
  assert.ok(vue.includes('<EditableCard key={o.cle} ed={ed} id={o.cle} nom={nomDe(o)} onEdit={setCardEdit} hass={hass} />'), 'en edition, la carte d’edition');
  assert.ok(vue.includes('<CarteAjout onClick={() => setAddSheet(true)} />') && vue.includes('<BandeauEdition ed={ed} onAjouter={() => setAddSheet(true)} />'), 'la case d’ajout et le bandeau');
  const f = src.indexOf('const OBJ_FILTRES = () => [');
  const filtres = src.slice(f, src.indexOf('];', f));
  const ids = [...filtres.matchAll(/id: '([a-z]+)'/g)].map(m => m[1]);
  assert.deepEqual(ids, ['tous', 'favoris', 'lumieres', 'volets', 'chauffage', 'prises', 'multimedia', 'capteurs', 'cameras', 'presence', 'menager', 'jardin', 'plantes']);
  const m = src.indexOf('function objetsDeLaMaison(');
  const maison = src.slice(m, src.indexOf(String.fromCharCode(10) + '}', m));
  assert.ok(maison.includes('parAppareil') && maison.includes('ROOM_BIN_CLASSES') && maison.includes('ROOM_SENSOR_CLASSES'), 'les memes regles que la piece : une carte par appareil, capteurs choisis');
  assert.ok(maison.includes('m.hidden || m.disabled || m.category'), 'ni cache, ni desactive, ni configuration');
});

test('le domaine d’edition : ce que Home Assistant donne, la prise-lumiere a part', () => {
  const d = (cle, o) => domaineEdition(cle, o);
  assert.equal(d('light.a'), 'lumiere');
  assert.equal(d('switch.a', { estLumiere: true }), 'lumiere');
  assert.equal(d('switch.a'), 'prise');
  assert.equal(d('cover.a'), 'volet');
  assert.equal(d('climate.a'), 'chauffage');
  assert.equal(d('zone:chambre'), 'chauffage');
  assert.equal(d('media_player.a'), 'multimedia');
  assert.equal(d('binary_sensor.a', { classe: 'occupancy' }), 'presence');
  assert.equal(d('binary_sensor.a', { classe: 'smoke' }), 'capteur');
  assert.equal(d('sensor.a'), 'capteur');
  assert.equal(d('camera.a'), 'camera');
  assert.equal(d('lock.a'), 'serrure');
  assert.equal(d('vacuum.a'), 'aspirateur');
  assert.equal(d('lawn_mower.a'), 'tondeuse');
  assert.equal(d('plant:basilic'), 'plante');
  assert.equal(d('obj:feeder'), 'animaux');
  assert.equal(d('sect:x'), 'titre');
  assert.equal(d('script.a'), 'carte');
});

test('l’identifiant d’edition : l’objet sans son domaine, la queue d’une cle', () => {
  assert.equal(identifiantEdition('light.plafonnier_salon'), 'plafonnier_salon');
  assert.equal(identifiantEdition('zone:chambre'), 'chambre');
  assert.equal(identifiantEdition('plant:basilic'), 'basilic');
  assert.equal(identifiantEdition('sect:k1'), 'k1');
});
