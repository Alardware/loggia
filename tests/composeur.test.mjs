// Un seul composeur de cartes (15/09) : la fabrique rend toute cle partout,
// « Ajouter une carte » remplace « Ajouter une entite », et les cartes que
// Loggia compose se posent dans n'importe quelle vue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

test('la fabrique rend toute cle : entite, zone, distributeur, plante — et porte leurs fiches', () => {
  const dc = bloc('function useDomainCards(', NL + '}');
  assert.ok(dc.includes("if (zone || k.indexOf('zone:') === 0) {") && dc.includes("if (k === 'obj:feeder') {") && dc.includes("if (k.indexOf('plant:') === 0) {"), 'les trois cles composees');
  assert.ok(dc.includes("<RoomFeederCard chip={chip} mort={d.mort} nom={label || tr('Distributeur')}") && dc.includes('<RoomPlantCard chip={chip} mort={pl.mort} nom={label || pl.name}'), 'les cartes du distributeur et de la plante, compactes ou non');
  assert.ok(dc.includes('{feederPop && (() => { const d = distributeur(); return <FicheDistributeur') && dc.includes('{plantPop && <FichePlante pl={plantPop}'), 'leurs fiches voyagent avec la fabrique');
  assert.ok(dc.includes('setFeederPop(false); setPlantPop(null); };'), 'fermer les ferme aussi');
  assert.ok(dc.includes('const nom = (k) => nomDeCle(S, k);'), 'et elle sait nommer une cle');
  const n = bloc('function nomDeCle(', NL + '}');
  assert.ok(n.includes("if (s === 'obj:feeder') return tr('Distributeur');") && n.includes("if (s.indexOf('plant:') === 0)") && n.includes("if (s.indexOf('zone:') === 0)") && n.includes('return cvName(S && S[s], s);'), 'distributeur, plante, zone, sinon l’entite');
});

test('Objets ne compose plus rien : il demande ses cartes a la fabrique', () => {
  const v = bloc('function ObjetsView(', NL + '}');
  assert.ok(!v.includes('croqHaids()') && !v.includes('plantsCfg()') && !v.includes('setSheet(') && !v.includes('<FicheDistributeur') && !v.includes('<FichePlante'), 'plus de distributeur ni de plante calcules ici');
  assert.ok(v.includes("const cle = (o.type === 'feeder' || o.type === 'plant') ? o.cle : o.id;") && v.includes('return compacte ? dc.compact(cle, ed.labelOf(o.cle) || null) : dc.card(cle, ed.labelOf(o.cle) || null);'), 'la fabrique, pour tout');
});

test('le composeur : cartes de Loggia d’abord, appareils par piece, puces, recherche qui cherche tout', () => {
  assert.ok(!src.includes('function RoomAddSheet(') && !src.includes('<RoomAddSheet'), 'plus de feuille « Ajouter une entite »');
  const c = bloc('function ComposeurCartes(', NL + '}');
  assert.ok(c.includes("out.push({ cle: 'obj:feeder',") && c.includes("out.push({ cle: 'plant:' + p.base,") && c.includes("out.push({ cle: 'zone:' + z.id,") && c.includes('if (!composites) return [];'), 'distributeur, plantes, zones fil pilote — quand la vue les accepte');
  assert.ok(c.includes('climateZones(S).filter(z => !estClimate(z))'), 'un thermostat reste un appareil');
  assert.ok(c.includes('filtres: filtresObjet({ domaine: dom, estLumiere: cvEstLumiere(id), classe })') && c.includes('const puces = OBJ_FILTRES().filter('), 'les puces d’Objets, avec les memes regles');
  assert.ok(c.includes('const cherche = (...champs) =>') && c.includes('cherche(c.nom, c.sous, c.cle, c.piece)') && c.includes('cherche(a.id, a.nom, a.piece)'), 'nom, sous-titre, cle, piece, identifiant');
  assert.ok(c.includes("const cle = (g) => (piece && rmNorm(g) === rmNorm(piece)) ? '0' : g ? '1' + g.toLowerCase() : '2';"), 'la piece courante en tete, les sans-piece en dernier');
  assert.ok(c.includes('useState(() => (piece ? { [rmNorm(piece)]: true } : {}))') && c.includes('aria-expanded={ouvert}'), 'la piece courante ouverte, les autres repliees');
  assert.ok(c.includes("tr('CARTES DE LOGGIA')") && c.includes("tr('APPAREILS')") && c.includes("tr('SANS PIÈCE')") && c.includes("tr('AUCUN RÉSULTAT')"), 'les intertitres');
  const l = bloc('function LigneComposeur(', NL + '}');
  assert.ok(l.includes("<Fi i={on ? 'check' : 'plus'} size={11} />") && l.includes('role="checkbox" aria-checked={on}'), '« + » ou la coche, a droite');
});

test('les quatre vues passent par le composeur, et le vocabulaire dit « carte »', () => {
  assert.ok(src.includes('<ComposeurCartes piece={room} dc={dc} hass={hass} present={ents} onToggle={ed.toggle}'), 'la piece, avec ses cartes de Loggia');
  assert.ok(src.includes('<ComposeurCartes dc={dc} hass={hass} present={ed.ids} onToggle={ed.toggle}' + NL + "          domaines={[...OBJ_DOMAINES, 'input_boolean', 'number', 'select']}"), 'Objets');
  assert.ok(src.includes("entete={tr('Ajouter un volet')} composites={false}") && src.includes("entete={tr('Ajouter un poste')} domaines={['sensor']} composites={false}"), 'Volets et Energie, sans cartes composees');
  assert.ok(src.includes("{ajouterLabel || tr('Ajouter une carte')}") && src.includes("{label || tr('Ajouter une carte')}") && !src.includes("tr('Ajouter une entité')"), '« Ajouter une carte », partout');
});

test('les cles composees posees dans une piece sont surveillees', () => {
  const k = bloc('  const cvAggKeys = (x) => {', NL + '  };');
  assert.ok(k.includes("if (x === 'obj:feeder') return croqKeys();") && k.includes("x.indexOf('plant:') === 0) return plantKeys();") && k.includes("x.indexOf('zone:') === 0) return climateKeys();"), 'distributeur, plante, zone');
  assert.ok(src.includes('activeRoom ? [...roomKeys, ...(layoutOf(ROOM_LAYOUT_KEY, activeRoom).added || []).flatMap(cvAggKeys)]'), 'les ajouts de la piece courante');
});
