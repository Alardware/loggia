// La banniere de l'Accueil (retour user du 15/09) : plus de vignette meteo,
// plus de vue Meteo, et les avatars sur la ligne du nom — jamais en dessous.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const ui = readFileSync(join(RACINE, 'src', 'ui.jsx'), 'utf8');
const views = readFileSync(join(RACINE, 'src', 'views.js'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const readme = readFileSync(join(RACINE, 'README.md'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

test('la vue Meteo a disparu : composant, chunk, route, navigation, disponibilite', () => {
  assert.ok(!src.includes('function MeteoView(') && !src.includes('MeteoContent') && !src.includes("views/meteo.jsx"), 'ni composant ni import paresseux');
  assert.ok(!existsSync(join(RACINE, 'src', 'views', 'meteo.jsx')), 'le fichier est supprime');
  assert.ok(!src.includes("view === 'meteo'") && !src.includes("'meteo', 'objets'") && !src.includes('onOpenMeteo'), 'ni route, ni BUILT, ni prop');
  assert.ok(!ui.includes("vid: 'meteo'"), 'plus dans la navigation');
  assert.ok(!views.includes("'meteo'") && !views.includes('out.meteo'), 'plus de disponibilite a calculer');
  assert.ok(!readme.includes('-meteo.webp') && !readme.includes('**La météo**'), 'le README ne la montre plus');
  ['pc', 'tablette', 'mobile'].forEach(f => assert.ok(!existsSync(join(RACINE, 'docs', 'captures', f + '-meteo.webp')), f + ' : capture retiree'));
});

test('l’entite meteo sert encore : fond de la banniere, veille, Exterieur, carte', () => {
  assert.ok(src.includes('<WeatherIco wx={wx} size={46} />') && src.includes('function OutdoorModal(') && src.includes("if (t === 'meteo') return <CvWeather id={id} hass={hass} />;"), 'la meteo vit ailleurs');
  assert.ok(src.includes("weatherEntity") && src.includes('haWeatherLabel(wEnt.state)'), 'l’entite est toujours lue');
});

test('la banniere : pas de vignette meteo, les avatars sur la ligne du nom', () => {
  const home = bloc('function Dashboard(', NL + 'function ');
  assert.ok(!home.includes('o-banner-wx') && !home.includes('extPiece') && !home.includes('<WxMini wx={wx} on={wxFx} />' + NL + '                <WeatherIco'), 'plus de vignette');
  assert.ok(home.includes('<div className="o-banner-row" style={{ position: \'relative\', display: \'flex\', flexDirection: \'column\', gap: 0, minWidth: 0 }}>'), 'la banniere est une colonne');
  const ligne = bloc('              <div className="o-greet-ligne"', '              {/* Le resume est un ITEM');
  assert.ok(ligne.includes('<span className="o-greet-name"') && ligne.includes('<div className="o-avatars" style={{ display: \'flex\', gap: 8, flexShrink: 0 }}>') && ligne.includes('{avatars.map((u, i) => {'), 'le nom et les avatars sur la meme ligne');
  assert.ok(ligne.includes("alignItems: 'center', justifyContent: 'space-between'"), 'alignes au centre, le nom a gauche, les avatars a droite');
  assert.ok(ligne.includes("whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</span>"), 'un nom long se coupe, il ne pousse pas les avatars');
  assert.ok(!css.includes('.o-banner-wx') && !css.includes('.o-banner-row { flex-wrap: wrap !important; }'), 'plus de media qui renvoie les avatars sous le texte');
});
