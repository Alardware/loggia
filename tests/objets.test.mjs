// La vue Objets : une seule vue, filtree, aux cartes de la piece — et ce qui
// range chaque appareil sous ses filtres, sans React (src/objets.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filtresObjet, objetActif, statsObjets, pucesObjets, trierObjets, OBJ_ORDRE, DOMAINES_IOT, domaineEdition, identifiantEdition, joursDeReserve, verdictsPlante } from '../src/objets.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

test('chaque domaine trouve son filtre ; une prise declaree lumiere est une lumiere', () => {
  const f = (o) => filtresObjet(o);
  assert.deepEqual(f({ domaine: 'light' }), ['lumieres']);
  assert.deepEqual(f({ domaine: 'switch', estLumiere: true }), ['lumieres']);
  assert.deepEqual(f({ domaine: 'switch' }), ['prises'], '« les prises n’ont rien a faire dans iot […] une prise c’est une prise »');
  assert.deepEqual(f({ domaine: 'input_boolean' }), ['prises']);
  assert.deepEqual(f({ domaine: 'cover' }), ['volets']);
  assert.deepEqual(f({ domaine: 'climate' }), ['chauffage']);
  assert.deepEqual(f({ domaine: 'switch', type: 'zone' }), ['chauffage'], 'une zone fil pilote est du chauffage, pas une prise');
  assert.deepEqual(f({ domaine: 'media_player' }), ['multimedia']);
  assert.deepEqual(f({ domaine: 'binary_sensor' }), ['capteurs']);
  assert.deepEqual(f({ domaine: 'binary_sensor', classe: 'motion' }), ['capteurs'], 'un detecteur de mouvement est un capteur comme les autres : « capteur peut surement en recevoir plus »');
  assert.deepEqual(f({ domaine: 'binary_sensor', classe: 'door' }), ['capteurs'], 'une porte reste un capteur');
  assert.deepEqual(f({ domaine: 'sensor' }), ['capteurs']);
  assert.deepEqual(f({ domaine: 'camera' }), [], '« deja camera on peut l’enlever » : une camera ne vit plus que sous Tous');
  assert.deepEqual(f({ domaine: 'lock' }), [], 'une serrure ne vit que sous Tous : pas de puce Securite, la maquette n’en a pas');
  assert.deepEqual(f({ domaine: 'vacuum' }), ['iot']);
  ['fan', 'humidifier', 'valve'].forEach(d => assert.deepEqual(f({ domaine: d }), ['iot'], d + ' : un appareil qui travaille seul'));
  assert.deepEqual(f({ domaine: 'feeder', type: 'feeder' }), ['iot'], '« iot correspond aux appareils, robot, distributeur »');
  assert.deepEqual(f({ domaine: 'lawn_mower' }), ['iot'], 'le robot du jardin est un robot');
  assert.deepEqual(f({ domaine: 'plant', type: 'plant' }), ['capteurs'], 'une plante est un bouquet de capteurs');
  assert.deepEqual(DOMAINES_IOT, ['vacuum', 'lawn_mower', 'feeder', 'fan', 'humidifier', 'valve'], 'aucune prise parmi les appareils');
  assert.deepEqual(f({ domaine: 'script' }), [], 'un domaine inconnu ne vit que sous Tous');
});

test('l’epingle s’ajoute ; etre dehors ne range nulle part : la puce Jardin est partie', () => {
  // « je vois qu'il y a toujours jardin aussi, pourtant il y a un robot dedans
  // et une prise » (17/09) : ils ont deja leur famille.
  assert.deepEqual(filtresObjet({ domaine: 'light', dehors: true }), ['lumieres']);
  assert.deepEqual(filtresObjet({ domaine: 'lawn_mower', dehors: true }), ['iot'], 'le robot');
  assert.deepEqual(filtresObjet({ domaine: 'switch', dehors: true }), ['prises'], 'la prise');
  assert.deepEqual(filtresObjet({ domaine: 'camera', dehors: true }), []);
  assert.deepEqual(filtresObjet({ domaine: 'cover', epingle: true }), ['volets', 'favoris']);
  assert.equal(filtresObjet({ domaine: 'light', epingle: true })[0], 'lumieres', 'le principal reste premier');
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
  { cle: 'light.b', nom: 'Applique', piece: 'Terrasse', filtres: ['lumieres', 'favoris'], actif: false, absent: true },
  { cle: 'media_player.a', nom: 'Enceinte', piece: 'Cuisine', filtres: ['multimedia'], actif: true, absent: false },
  { cle: 'obj:feeder', nom: 'Distributeur', piece: null, filtres: ['iot'], actif: false, absent: false },
];

test('les chiffres de tete : appareils, pieces distinctes, actifs, absents', () => {
  assert.deepEqual(statsObjets(MAISON), { appareils: 5, pieces: 3, actifs: 2, absentes: 1 });
  assert.deepEqual(statsObjets([]), { appareils: 0, pieces: 0, actifs: 0, absentes: 0 });
});

test('les puces : Tous toujours, Favoris s’il y a une epingle, puis dans l’ordre, avec leur compte', () => {
  assert.deepEqual(pucesObjets(MAISON), [
    { id: 'tous', n: 5 }, { id: 'favoris', n: 1 }, { id: 'lumieres', n: 2 }, { id: 'volets', n: 1 },
    { id: 'multimedia', n: 1 }, { id: 'iot', n: 1 },
  ]);
  assert.deepEqual(pucesObjets([]), [{ id: 'tous', n: 0 }]);
  assert.deepEqual(OBJ_ORDRE, ['lumieres', 'volets', 'chauffage', 'prises', 'multimedia', 'iot', 'capteurs'], 'sept familles de nature, aucune de lieu ; ce que l’on commande d’abord, ce qui mesure ensuite');
  // Aucune famille orpheline : tout ce que `filtresObjet` sait rendre a sa puce.
  const rendus = new Set();
  ['light', 'switch', 'input_boolean', 'cover', 'climate', 'water_heater', 'media_player', 'binary_sensor', 'sensor', 'camera', 'lock', 'vacuum', 'fan', 'humidifier', 'valve', 'lawn_mower', 'siren']
    .forEach(d => filtresObjet({ domaine: d }).forEach(x => rendus.add(x)));
  [...rendus].forEach(x => assert.ok(OBJ_ORDRE.indexOf(x) >= 0, x + ' n’a pas de puce'));
  assert.deepEqual([...rendus].sort(), OBJ_ORDRE.slice().sort(), 'et aucune puce sans appareil possible');
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
  assert.ok(src.includes('view === \'lumieres\' ? <ObjetsView hass={hass} onNav={setView} filtre="lumieres" edit={editMode && peutEditer} onEnt={editMode && peutEditer ? () => setEntSheet(true) : null} />'), 'lumieres → Objets');
  assert.ok(src.includes('view === \'climat\' ? <ObjetsView hass={hass} onNav={setView} filtre="chauffage" edit={editMode && peutEditer} onEnt={editMode && peutEditer ? () => setEntSheet(true) : null} />'), 'climat → Objets');
  assert.ok(src.includes('view === \'medias\' ? <ObjetsView hass={hass} onNav={setView} filtre="multimedia" edit={editMode && peutEditer} onEnt={editMode && peutEditer ? () => setEntSheet(true) : null} />'), 'medias → Objets');
  ['LumieresView', 'ClimatView', 'MediasView', 'LumieresContent', 'ClimatContent', 'MediasContent'].forEach(n =>
    assert.ok(!src.includes('function ' + n + '('), n + ' devrait avoir disparu'));
  assert.ok(src.includes('function VoletsView('), 'la vue Volets, elle, reste');
});

test('la vue Objets dessine les cartes de la piece, une par appareil, derriere des puces a l’arrondi 9', () => {
  const d = src.indexOf('function ObjetsView(');
  const vue = src.slice(d, src.indexOf(String.fromCharCode(10) + '}', d));
  assert.ok(vue.includes('objetsDeLaMaison(hass, ajoutes)') && vue.includes('return compacte ? dc.compact(cle, ed.labelOf(o.cle) || null) : dc.card(cle, ed.labelOf(o.cle) || null);'), 'les cartes de la piece');
  assert.ok(vue.includes('dc.card(null, nomDe(o), o.zone)'), 'une zone fil pilote a sa carte');
  assert.ok(vue.includes('borderRadius: 9') && !vue.includes('borderRadius: 999'), 'des puces, pas des pilules');
  assert.ok(vue.includes(`className="o-favrow o-objfiltres" style={{ display: 'flex', gap: 8, overflowX: 'auto', flexWrap: 'nowrap' }}`), 'une seule ligne, pas de retour a la ligne ; elle defile si elle deborde');
  assert.ok(vue.includes(`flexShrink: 0, whiteSpace: 'nowrap', padding: '8px 13px'`), 'une puce ne se casse ni ne se tasse');
  assert.ok(vue.includes('{dc.sheets}'), 'les fiches montent');
  assert.ok(vue.includes("useLayoutEditor(OBJ_LAYOUT_KEY, 'objets', derived)"), 'l’editeur d’agencement est de retour (mode edition)');
  assert.ok(vue.includes('<EditableCard key={o.cle} ed={ed} id={o.cle} nom={nomDe(o)} onEdit={setCardEdit} hass={hass} />'), 'en edition, la carte d’edition');
  assert.ok(vue.includes('<CarteAjout onClick={() => setAddSheet(true)} />') && vue.includes('<BandeauEdition ed={ed} onAjouter={() => setAddSheet(true)} onEnt={onEnt} />'), 'la case d’ajout et le bandeau');
  const f = src.indexOf('const OBJ_FILTRES = () => [');
  const filtres = src.slice(f, src.indexOf('];', f));
  const ids = [...filtres.matchAll(/id: '([a-z]+)'/g)].map(m => m[1]);
  assert.deepEqual(ids, ['tous', 'favoris', 'lumieres', 'volets', 'chauffage', 'prises', 'multimedia', 'iot', 'capteurs']);
  assert.ok(filtres.includes("{ id: 'prises', label: tr('Prises'), prise: true },"), 'la prise garde son icone de prise');
  assert.deepEqual(ids.slice(2), OBJ_ORDRE, 'les puces suivent l’ordre du module, une pour une');
  // Au telephone : l'icone seule, les puces se partagent la largeur — une ligne, sans defilement.
  assert.ok(vue.includes('<span className="o-objfiltre-mot">{f.label}</span>') && vue.includes('aria-label={f.label} title={f.label}'), 'le mot peut s’effacer : il reste lisible par un lecteur d’ecran et au survol');
  const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
  const tel = css.slice(css.indexOf('.o-objfiltres { gap: 6px'));
  assert.ok(css.includes('.o-objfiltres > .o-objfiltre { flex: 1 1 0 !important; min-width: 0;') && css.includes('.o-objfiltre-mot { display: none; }') && tel.indexOf('overflow-x: visible') > 0, 'la regle du telephone');
  assert.ok(css.lastIndexOf('@media (max-width: 560px)', css.indexOf('.o-objfiltres { gap: 6px')) > css.indexOf('.o-favrow::-webkit-scrollbar-track'), 'elle ne vaut qu’au telephone');
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

test('les jours de reserve : le bac divise par les repas du jour, sans repas on ne sait pas', () => {
  assert.equal(joursDeReserve(760, [{ g: 45 }, { g: 45 }]), 8, '760 g pour 90 g par jour : 8 jours pleins');
  assert.equal(joursDeReserve(89, [{ g: 45 }, { g: 45 }]), 0, 'moins d’un jour');
  assert.equal(joursDeReserve(760, []), null, 'sans repas, pas de division par zero');
  assert.equal(joursDeReserve(0, [{ g: 45 }]), null, 'bac vide : rien a compter');
  assert.equal(joursDeReserve(300, [{ g: 'x' }, { g: 50 }]), 6, 'un repas sans poids ne compte pas');
});

test('les verdicts d’une plante : des reperes generaux, mesure par mesure', () => {
  const v = verdictsPlante({ hum: 12, temp: 5, lux: 200, cond: 100 });
  assert.deepEqual([v.hum, v.temp, v.lux, v.cond], ['sec', 'froid', 'faible', 'peu']);
  assert.deepEqual(v.presse, ['arroser', 'lumiere', 'temperature'], 'ce qui presse, dans cet ordre');
  const ok = verdictsPlante({ hum: 40, temp: 21.4, lux: 1800, cond: 640 });
  assert.deepEqual([ok.hum, ok.temp, ok.lux, ok.cond, ok.presse], ['ok', 'ok', 'ok', 'ok', []]);
  const trop = verdictsPlante({ hum: 75, temp: 35, lux: 30000, cond: 2500 });
  assert.deepEqual([trop.hum, trop.temp, trop.lux, trop.cond], ['humide', 'chaud', 'plein', 'trop']);
  assert.deepEqual(trop.presse, ['temperature'], 'un sol tres humide ne presse pas, la chaleur si');
  const vide = verdictsPlante({});
  assert.deepEqual([vide.hum, vide.temp, vide.lux, vide.cond, vide.presse], [null, null, null, null, []], 'sans mesure, pas de verdict');
  assert.equal(verdictsPlante({ hum: 15 }).hum, 'ok', 'la borne est comprise');
  assert.equal(verdictsPlante({ hum: 70 }).hum, 'ok', 'la borne haute aussi : 62 % est un sol correct, pas trempe');
});

test('la fiche du distributeur et la fiche de la plante : le squelette commun, et rien d’invente', () => {
  const d = src.indexOf('function FicheDistributeur(');
  const fd = src.slice(d, src.indexOf(String.fromCharCode(10) + '}', d));
  assert.ok(fd.includes('<FicheEntete ') && fd.includes("<FicheRangee premiere titre={tr('Réservoir')}"), 'la fiche commune, le bac en premier');
  ['Dernier repas', 'Repas par jour', 'Taille de la portion', 'Distribuer une portion', 'Réservoir rempli'].forEach(k => assert.ok(fd.includes("tr('" + k + "')"), k));
  assert.ok(fd.includes("call('number', 'set_value', { entity_id: portion.id, value: nv })"), 'la portion est le nombre de l’appareil');
  assert.ok(!fd.includes('Seuil d’alerte') && !fd.includes('Rappel de remplissage') && !fd.includes('repas est sauté'), 'pas de bascule sans regle derriere');
  const p = src.indexOf('function FichePlante(');
  const fp = src.slice(p, src.indexOf(String.fromCharCode(10) + '}', p));
  assert.ok(fp.includes('verdictsPlante(pl)') && fp.includes("tr('Lumière reçue')") && fp.includes("tr('Pile du capteur')"), 'chaque mesure avec son mot');
  assert.ok(!fp.includes('Seuil d’alerte') && !fp.includes('Rappel d’arrosage') && !fp.includes('Marquer comme arrosé'), 'pas d’arrosage invente');
  assert.ok(!src.includes('function ObjSheet('), 'l’ancienne feuille generique a disparu');
});

test('les cartes du distributeur et de la plante : la maquette, au gabarit', () => {
  const f = src.indexOf('function RoomFeederCard(');
  const carte = src.slice(f, src.indexOf('function RoomPlantCard(', f));
  assert.ok(carte.includes("{tr('Distribuer')}") && carte.includes("{tr('Rempli')}"), 'Distribuer et Rempli au pied');
  assert.ok(carte.includes("RM_ICO('rgba(var(--o-orange-rgb),.16)', orange)"), 'la patte orange');
  assert.ok(!carte.includes("style={{ ...RM_BTN, background: 'var(--o-accent-fond)'"), 'plus le bouton plein d’avant');
  // Depuis le composeur (15/09), c'est la fabrique commune qui dessine ces cartes, pour toute vue.
  const v = src.indexOf('function useDomainCards(');
  const vue = src.slice(v, src.indexOf(String.fromCharCode(10) + '}', v));
  assert.ok(vue.includes('sub={d.sous}') && vue.includes('onRempli={d.onRempli}'), 'le bac et le dernier repas en sous-titre, Rempli branche');
  assert.ok(vue.includes('rgb={v.rgb}') && vue.includes('verdictCartePlante(pl)'), 'la plante prend la couleur de son verdict');
  assert.ok(vue.includes("String(croq.reservoir).indexOf('input_number.') === 0"), 'Rempli n’existe que si le bac est un input_number');
});

