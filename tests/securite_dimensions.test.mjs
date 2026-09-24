// Vue Securite : l'alarme, la sirene et la presence aux dimensions des cartes
// standard (retour du 17/09 : « sur mobile et tablette ne respecte pas les
// dimension, trop large »). Mesure au navigateur : 176 × 184 au telephone,
// 387 × 184 sur tablette — les memes colonnes que les ouvrants.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

test('UNE grille pour toute la vue : celle des objets, 225 px et des rangees de 184 px', () => {
  const vue = bloc('function SecuriteContent(', NL + '}');
  assert.ok(vue.includes(`<div className="grid-objets" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(225px,1fr))', gridAutoRows: 'minmax(184px, auto)', gap: 16, alignItems: 'stretch' }}>`), 'la grille des cartes standard');
  assert.ok(!src.includes('grid-securite-cartes') && !css.includes('grid-securite-cartes') && !vue.includes('ouvrantsSeuls') && !vue.includes('minmax(250'), 'plus de grille a part pour l’alarme, la sirene et la presence');
  assert.ok(css.includes('.grid-objets, .grid-objplants { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }'), 'deux colonnes au telephone et sur tablette, comme partout');
});

test('l’alarme : le mot d’une chip ne se tronque jamais — il s’efface, d’apres la largeur DE LA CARTE', () => {
  const c = bloc('function CvAlarm(', NL + '}');
  assert.ok(c.includes(`<div className="o-piece o-carte-alarme" style={{ ...CV_CADRE, height: '100%', minHeight: 172, overflow: 'hidden' }}>`), 'la carte est un conteneur, au format standard');
  assert.ok(c.includes(`<div className="o-armchips" data-n={CHIPS.length} style={{ display: 'flex', gap: 8, margin: '7px 0 6px' }}>`), 'les chips disent combien elles sont');
  assert.ok(c.includes('aria-label={lbl} aria-pressed={actif} className="o-armchip" title={lbl}'), 'sans son mot, une chip garde son nom : lecteur d’ecran et infobulle');
  assert.ok(css.includes('.o-carte-alarme, .o-carte-presence { container-type: inline-size; }'));
  // ~84 px par chip (icone, mot, marges) et 8 px entre deux : le seuil suit le nombre de modes.
  for (let n = 2; n <= 6; n++) {
    const seuil = 84 * n + 8 * (n - 1);
    assert.ok(css.includes('@container (max-width: ' + seuil + 'px) { .o-armchips[data-n="' + n + '"] .o-armchip-txt { display: none; } }'), n + ' modes : le mot s’efface sous ' + seuil + ' px');
  }
  assert.ok(css.includes('.o-armchip-txt { display: none !important; }'), 'et toujours au telephone (ADR 0035)');
});

test('la presence : trois lignes dans 184 px, et le lieu qui s’efface quand la carte est etroite', () => {
  const c = bloc('function CvPresence(', NL + '}');
  /* La carte garde son cadre et son format. Ce qu'elle MET dedans a change le
   * 24/09 (ADR 0088) : au-dela de trois, on passe des lignes a une grille
   * d'avatars, et la carte s'ouvre. Ce qui se verifie ici reste la DIMENSION —
   * le contenu est l'affaire de `carte_presence.test.mjs`. */
  assert.ok(c.includes(`style={{ ...CV_CADRE, height: '100%', minHeight: 172, overflow: 'hidden', cursor: ouvrable ? 'pointer' : 'default' }}>`));
  assert.ok(c.includes('{liste.length <= 3 && liste.map((p) => (') && c.includes('<div style={{ marginTop: 8 }}>'), 'trois personnes en lignes tiennent dans le format standard (186 px mesures avec 10 px de marge)');
  assert.ok(c.includes(`<span className="o-presence-ou" style={{ fontWeight: 600, color: 'var(--o-text3)' }}> · {etat(p)}</span>`), 'le lieu a sa classe');
  // Au-dela de trois, c'est la grille qui doit tenir : huit cases au plus.
  assert.ok(c.includes('(liste.length > 8 ? liste.slice(0, 7) : liste).map('), 'jamais plus de huit cases dans les 184 px');
  assert.ok(css.includes('@container (max-width: 230px) { .o-presence-ou { display: none; } }'), 'a 176 px la pastille de couleur le dit deja');
});

test('la sirene : ce que l’entite expose tient sur UNE ligne — plus de tuiles qui portaient la carte a 223 px', () => {
  const c = bloc('function CvSirene(', NL + '}');
  assert.ok(c.includes("{!mort && tuiles.length > 0 && <div style={RM_SUB}>{tuiles.map(([l, v]) => l + ' ' + v).join(' · ')}</div>}"), 'sonneries et volume, a la suite de l’etat');
  assert.ok(!c.includes("gridTemplateColumns: 'repeat(' + tuiles.length") && !c.includes("textTransform: 'uppercase'"), 'plus de grille de tuiles dans la carte');
  assert.ok(c.includes("if (Array.isArray(a.available_tones) && a.available_tones.length) tuiles.push([tr('Sonneries'), String(a.available_tones.length)]);"), 'et toujours rien d’invente');
});
