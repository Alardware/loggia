// Les cartes pieces disent leur etat (16/09, ADR 0029, etape 2 de la refonte)
// — et les deux retours du meme jour : « A surveiller » dans le rail, plus de
// point « appareils hors ligne ».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const attention = readFileSync(join(RACINE, 'src', 'attention.js'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

test('la carte piece : une ligne d’etat a priorite, dans ses deux variantes, sans toucher au gabarit', () => {
  assert.ok(src.includes("import { ambiancePiece, ambiancesParPiece } from './ambiance.js';"), 'le module pur');
  const c = bloc('function PieceCard(', NL + '}');
  assert.ok(c.includes('idx = 0, ambiance = null })'), 'la carte recoit l’ambiance de sa piece');
  const calcul = "const amb = lights ? ambiancePiece({ lumieres: n, ...(ambiance || {}), co2: p.live && p.live.co2 }) : null;";
  assert.equal(c.split(calcul).length - 1, 2, 'compacte et standard calculent la meme ligne (lumieres de la carte + ambiance + CO2 de la piece)');
  assert.ok(c.includes("const etat = amb ? amb.texte : '—';") && c.includes("color: amb ? amb.couleur : 'var(--o-text3)'"), 'compacte : le texte et sa couleur');
  assert.ok(c.includes("{amb && amb.icone ? <Fi i={amb.icone} size={11} style={{ marginRight: 4 }} /> : null}{etat}"), 'compacte : le triangle devant un probleme');
  assert.ok(c.includes("{amb ? <span style={{ color: amb.couleur }}>{amb.icone ? <Fi i={amb.icone} size={11} style={{ marginRight: 4 }} /> : null}<FlipText text={amb.texte} /></span> : <Skel w={92} h={12} />}"), 'standard : le texte anime, colore, l’humidite a cote');
  assert.ok(!c.includes("tr('{n} lampes allumées'"), 'le compteur seul n’existe plus : il vit dans la ligne d’activite');
  assert.ok(c.includes('minHeight: 49') && c.includes('aria-checked={on}'), 'en-tete reserve et interrupteur inchanges');
});

test('l’Accueil range ce que chaque piece a de vivant, par zone puis par nom', () => {
  const d = bloc('function Dashboard(', NL + '}');
  assert.ok(d.includes("const ambiances = ambiancesParPiece(etatsAcc, (a && a.index && a.index.areaNameOf) || null, rmNorm);"), 'une passe sur les etats, normalisee comme les lumieres');
  assert.ok(d.includes("return (zone && zone.name && ambiances[rmNorm(zone.name)]) || ambiances[rmNorm(nom)] || null;"), 'la zone de la piece d’abord, son nom sinon');
  assert.ok(d.includes("clim={roomClimInfo(p.name)} ambiance={ambianceDe(p.name)} onOpen="), 'chaque carte recoit la sienne');
});

test('« A surveiller » vit dans le rail, et plus de point « appareils hors ligne »', () => {
  assert.ok(src.includes("const ACC_RAIL = ['attention', 'moment', 'rappels', 'calendrier', 'agenda'];") && src.includes("const ACC_MAIN = ['securite', 'favoris', 'scenes', 'pieces', 'cameras'];"), 'dans le rail, en tete');
  const r = bloc('          const secsRail = {', NL + '          };');
  assert.ok(r.includes('attention: points.length ? <CarteAttention points={points} onNav={onNav} /> : null,'), 'rien quand tout va bien');
  assert.ok(src.includes("const tete = (zone === 'main' ? ['securite'] : ['attention']).filter(s => manquants.indexOf(s) >= 0);"), 'en tete des rails deja ranges');
  assert.ok(!attention.includes("'appareils'") && !attention.includes("'simultane'") && !attention.includes('resumeDomaines'), 'le diagnostic ne remonte plus les appareils tombes ni les chutes groupees');
  assert.ok(attention.includes("i.kind === 'integration'") && attention.includes("i.kind === 'passerelle'"), 'integration muette et passerelle hors service restent');
  assert.ok(!en.includes("'{n} appareils hors ligne'") && !en.includes("'{n} entités tombées ensemble'"), 'leurs mots ont quitte en.js');
});

test('la demo montre une piece a probleme et une piece active ; les mots ont leur traduction', () => {
  assert.ok(demo.includes("'binary_sensor.fenetre_chambre': s('on', { friendly_name: 'Fenêtre chambre', device_class: 'window' })"), 'la fenetre de la chambre est ouverte');
  assert.ok(demo.includes("salon: ['light.salon', 'media_player.salon',"), 'l’enceinte du salon est dans sa zone');
  for (const k of ['Fenêtre ouverte', '{n} fenêtres ouvertes', 'Porte ouverte', '{n} portes ouvertes', '{n} lumières', '{n} lumière', 'TV', 'Chauffe', 'Rafraîchit', 'Tout est éteint']) {
    assert.ok(en.includes("'" + k + "':"), k + ' manque a en.js');
  }
});
