/* Lot 13 de l'audit du 03/10 : la structure des cartes, hors des cartes
 * d'App.jsx.
 *
 * Deux défauts, mesurés par axe-core dans la démo :
 *   - un élément interactif qui en contient un autre (`nested-interactive`) :
 *     la veille était un `role="button"` qui portait les boutons des scènes,
 *     et un rôle bouton rend sa descendance présentationnelle ;
 *   - un nom accessible qui REMPLACE ce qui s'affiche (WCAG 2.5.3) : la météo
 *     « Ouvrir Maison », la barre de confort « Historique du confort », les
 *     jours de l'agenda « dimanche 4 octobre » sous « dim 4 », le champ de
 *     recherche de l'en-tête, un passage planifié du robot.
 *
 * Le rendu (tests/rendu.mjs) pour ce qui s'exporte ; le texte du source pour
 * le reste. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composant, rendre } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

/* Les éléments interactifs d'un HTML statique qui en contiennent un autre —
 * ce que `nested-interactive` relève. React écrit un HTML bien formé (les
 * balises vides se ferment d'elles-mêmes, `>` s'échappe dans les attributs) :
 * une pile suffit. */
const VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ROLES = /\brole="(button|switch|slider|link|checkbox|radio|tab|menuitem|option|spinbutton|textbox|combobox)"/;
function imbriques(html) {
  const pile = [];
  const fautes = [];
  for (const [, ferme, nom, attrs, auto] of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    if (ferme) { pile.pop(); continue; }
    const actif = (/^(button|input|select|textarea)$/.test(nom) || (nom === 'a' && /\bhref=/.test(attrs))
      || ROLES.test(attrs) || /\btabindex="(?!-)/.test(attrs));
    if (actif && pile.some(Boolean)) fautes.push('<' + nom + attrs.slice(0, 90));
    if (!auto && !VIDES.has(nom)) pile.push(actif);
  }
  return fautes;
}

test('le lecteur des imbrications voit bien un bouton dans un bouton', () => {
  // Sans ce garde-fou, une expression cassée laisserait tout passer.
  assert.equal(imbriques('<div role="button" tabindex="0"><span>x</span><button type="button">y</button></div>').length, 1);
  assert.equal(imbriques('<div><button type="button"></button><span role="switch" tabindex="0"></span></div>').length, 0);
  assert.equal(imbriques('<button type="button"><svg><path d="M0"/></svg></button><input type="time"/><button>z</button>').length, 0);
});

test('la veille : plus un bouton qui englobe les scènes, un bouton de surface qui réveille', async () => {
  const AmbientOverlay = await composant('ecranveille.jsx', 'AmbientOverlay');
  const html = rendre(AmbientOverlay, {
    wx: 'clouds', wxFx: false, weatherTemp: 12, weatherLabel: 'Nuageux', inTemp: 20.5, lightsOn: 2, notifs: [],
    ast: 'disarmed', scenes: [{ id: 'soir', nom: 'Soirée', icone: 'moon' }, { id: 'nuit', nom: 'Nuit' }], onScene: () => {},
  });
  assert.deepEqual(imbriques(html), [], 'un élément interactif en contient un autre : un lecteur d’écran ne voit plus les scènes');
  const racine = html.slice(0, html.indexOf('>') + 1);
  assert.ok(racine.startsWith('<div class="o-sombre"') && !racine.includes('role='), 'la racine est l’îlot sombre, sans rôle');
  assert.match(html, /<button type="button" class="o-surface" aria-label="Toucher pour réveiller"/, 'le geste « réveiller » a son bouton, nommé');
  const surface = html.match(/<button[^>]*class="o-surface"[^>]*>/)[0];
  assert.ok(!surface.includes('aria-haspopup'), 'réveiller n’ouvre pas de fiche');
  assert.ok(html.indexOf('class="o-surface"') < html.indexOf('Soirée'), 'la surface passe SOUS les scènes : premier enfant');
  assert.equal((html.match(/<button/g) || []).length, 3, 'la surface et les deux scènes');
});

test('la carte météo : nommée par ce qu’elle affiche, et elle dit qu’elle ouvre une fiche', async () => {
  const CarteMeteo = await composant('cartemeteo.jsx', 'CarteMeteo');
  const hass = { states: { 'weather.maison': { entity_id: 'weather.maison', state: 'cloudy', attributes: { friendly_name: 'Maison', temperature: 18 } } } };
  const html = rendre(CarteMeteo, { hass, onOpen: () => {} });
  const nom = (html.match(/^<div class="o-carte-meteo"[^>]*aria-label="([^"]*)"/) || [])[1];
  assert.ok(nom, 'la carte n’a plus de nom');
  assert.ok(!nom.startsWith('Ouvrir'), '« Ouvrir Maison » n’est écrit nulle part sur la carte');
  const [lieu, temperature, ciel] = nom.split(', ');
  assert.equal(lieu, 'Maison', 'le nom commence par le lieu affiché');
  assert.equal(temperature, '18°', 'puis la température affichée');
  assert.ok(ciel && html.includes('>' + ciel + '</div>'), 'puis le ciel, tel qu’il s’affiche');
  assert.match(html, /^<div class="o-carte-meteo" role="button" tabindex="0" aria-label="[^"]*" aria-haspopup="dialog"/);
  // Relecture du lot 13 : le rôle bouton tait le reste de la carte — il se lit
  // en description, et seulement ce qui se dessine.
  assert.ok(!html.includes('aria-describedby'), 'rien d’autre de dessiné : une référence vers un bloc absent ne décrit rien');
  const venteuse = rendre(CarteMeteo, { hass: { states: { 'weather.maison': { ...hass.states['weather.maison'], attributes: { friendly_name: 'Maison', temperature: 18, wind_speed: 14.6, wind_speed_unit: 'km/h' } } } }, onOpen: () => {} });
  const refs = (venteuse.match(/^<div class="o-carte-meteo"[^>]*aria-describedby="([^"]*)"/) || [])[1];
  assert.ok(refs, 'le vent affiché n’est lu nulle part : le rôle bouton le tait');
  assert.equal(refs.split(' ').length, 1, 'seule la ligne du vent se dessine ici');
  const vent = venteuse.slice(venteuse.indexOf('id="' + refs + '"'));
  assert.ok(venteuse.includes('id="' + refs + '"') && vent.slice(0, vent.indexOf('</div>')).includes('15 km/h'), 'la description est la ligne du vent affichée');
  assert.deepEqual(imbriques(html), []);
});

test('la barre de confort : son nom est l’indice qu’elle affiche, ce qu’elle ouvre se décrit', async () => {
  const BarreConfort = await composant('barreconfort.jsx', 'BarreConfort');
  const confort = { indice: 64, verdict: { t: 'Correct', c: 'var(--o-warn)' }, mesures: [{ cle: 'hum', nom: 'Humidité', valeur: '58 %', icone: 'humidity', verdict: { t: 'Bon', c: 'var(--o-ok)' } }] };
  const html = rendre(BarreConfort, { confort, onOpen: () => {} });
  assert.match(html, /aria-label="Indice de confort, 64 \/ 100, Correct"/, 'le nom commence par le titre affiché, puis l’indice et son mot');
  assert.ok(html.includes('aria-haspopup="dialog"') && html.includes('title="Historique du confort"'), 'ce qu’elle ouvre, en infobulle');
  assert.ok(!html.includes('aria-label="Historique du confort"'));
  // Relecture du lot 13 : les mesures et leurs verdicts, que le rôle bouton
  // taisait, se lisent en description.
  const refs = (html.match(/aria-describedby="([^"]*)"/) || [])[1];
  assert.ok(refs && html.includes('<div class="o-confort-mesures" id="' + refs + '">'), 'les mesures affichées ne sont lues nulle part');
  assert.deepEqual(imbriques(html), []);
});

test('les jours de l’agenda : le nom commence par ce que le bouton affiche', async () => {
  const CarteAgenda = await composant('agendarail.jsx', 'CarteAgenda');
  const html = rendre(CarteAgenda, { evenements: [], onChoisirJour: () => {}, onOuvrir: () => {} });
  const jours = [...html.matchAll(/<button type="button" aria-pressed="(?:true|false)" aria-label="([^"]*)"[^>]*><span[^>]*>([^<]*)<\/span><span[^>]*>([^<]*)<\/span>/g)];
  assert.equal(jours.length, 7, 'la bande des sept jours n’est plus lue');
  for (const [, nom, jour, date] of jours) {
    assert.ok(nom.startsWith(jour + ' ' + date + ', '), `« ${nom} » ne commence pas par « ${jour} ${date} », ce que le bouton affiche`);
    assert.ok(nom.length > (jour + ' ' + date + ', ').length, 'la date en entier suit');
  }
  assert.deepEqual(imbriques(html), []);
});

test('le champ de recherche de l’en-tête : nommé par ce qu’il affiche', () => {
  const app = lire('src', 'App.jsx');
  const i = app.indexOf('<div className="o-hdr-search"');
  assert.ok(i > 0, 'le champ de recherche n’est plus lu');
  const balise = app.slice(i, app.indexOf('\n', i));
  assert.ok(!balise.includes('aria-label='), 'une étiquette fixe remplaçait « Rechercher une pièce, une scène… »');
  assert.ok(balise.includes("title={tr('Rechercher (Ctrl+K)')}"), 'le raccourci reste en infobulle, comme les boutons voisins');
  assert.ok(balise.includes('aria-haspopup="dialog"') && balise.includes("aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'}"));
  const corps = app.slice(i, app.indexOf('</div>', i));
  assert.ok(corps.includes("{tr('Rechercher une pièce, une scène…')}"), 'le texte affiché, qui fait le nom');
});

test('les cartes de pièce : l’anneau de focus de leur surface se trace en dedans', () => {
  const app = lire('src', 'App.jsx');
  const piece = app.slice(app.indexOf('function PieceCard('), app.indexOf('\n}\n', app.indexOf('function PieceCard(')));
  assert.equal(piece.split('<button type="button" className="o-surface" onClick={onOpen}').length - 1, 2, 'la compacte et la standard');
  assert.ok(lire('src', 'index.css').includes('.o-surface:focus-visible { outline-offset: -2px; }'));
  // La variante d'origine reste un bouton (aucune commande dedans), nommée
  // par ce qu'elle affiche.
  assert.ok(piece.includes('aria-label={nomCarte(p.name, statut, p.temp)}'));
  // Relecture du lot 13 : les deux tuiles RENDUES suivent la même règle —
  // « Salon, 20,4°, Tout est éteint » ; elles changent de vue, sans fiche.
  assert.equal(piece.split('aria-label={nomCarte(p.name, temp, amb && amb.texte)}').length - 1, 2, 'la chip et la compact : le nom, la température, l’état affichés');
  assert.ok(!piece.includes("tr('Ouvrir la pièce {piece}'") && !piece.includes('aria-haspopup='), '« Ouvrir la pièce Salon » taisait l’état ; une pièce n’ouvre pas de fiche');
});

test('un passage planifié du robot : nommé par son heure et ses zones, tels qu’affichés', () => {
  const robot = lire('src', 'ficherobot.jsx');
  assert.ok(!robot.includes("aria-label={tr('Modifier le passage') + ' ' + p.heure}"), '« Modifier le passage » n’est pas sur la carte');
  assert.ok(robot.includes('aria-label={nomCarte(p.heure, zonesTxt)} aria-haspopup="dialog"'));
  assert.ok(robot.includes('const zonesTxt = resumeZones(p, { domaine, aDesAires });') && robot.includes('{zonesTxt}</div>'), 'le nom lit le texte même de la carte');
});
