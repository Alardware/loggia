// ─────────────────────────────────────────────────
// Ce qu'on voyait à l'écran (audit du 12/11, lot 1b).
//
// Des noms de cartes à quatre hauteurs différentes, des titres gris perdus sur
// un ciel de jour, des noms coupés sur le téléphone, trois tuiles d'énergie sur
// deux rangées, trois phrases qui tutoyaient, une mesure muette qui ne disait
// plus ce qu'elle mesurait, un point « À surveiller » qui clignotait, et trois
// détails : un « — » de trop dans les Scénarios et l'Énergie, un widget météo
// intitulé « Home ». Chaque cas reprend ce qu'on lisait.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// La langue AVANT l'import, comme les autres suites qui chargent src/.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { integrationsTombees, healthReport, MUETTE_DEPUIS_MS } = await import('../src/health.js');
const { nomVille, lieuMaison } = await import('../src/meteo.js');
const { barreMesure } = await import('../src/confort.js');
const { trN } = await import('../src/i18n.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const LANGUES = ['en', 'de', 'nl', 'it', 'es', 'pl'];
const catalogue = (l) => lire('src/langues/' + l + '.js');

// ── E13 : le nom de toutes les cartes d'appareil sous la plaque ──────────────

test('le gabarit porte la hauteur du nom : depuis le haut, 14 px sous la plaque, la colonne en haut', () => {
  const b = lire('src/cartes/briques.jsx');
  assert.ok(b.includes("const RM_SOUS_PLAQUE = 'var(--o-milieu-haut, 14px)';"), 'le nom ne part plus 14 px sous la plaque sur la carte large');
  assert.ok(b.includes("const RM_CARD_HAUT = { ...RM_CARD, justifyContent: 'flex-start' };"), 'une carte sans pied repose son nom au bas de la carte');
  assert.ok(b.includes("const RM_GAUCHE = { minWidth: 0, alignSelf: 'flex-start' };"), 'un chiffre plus haut que le nom pousse à nouveau le nom vers le bas');
  // La carte étroite garde ses 10 px.
  assert.ok(lire('src/index.css').includes('.o-gabarit > * { --o-milieu-haut: 10px;'), 'la carte étroite du téléphone a perdu ses 10 px sous la plaque');
});

test('aucune carte d’appareil ne pose plus son nom à 10 px de la plaque, ni au pied', () => {
  const cartes = ['src/cartes/robot.jsx', 'src/cartes/distributeur.jsx', 'src/carteeau.jsx', 'src/carteborne.jsx', 'src/cartetraceur.jsx', 'src/cartevanne.jsx', 'src/cartes/media.jsx'];
  for (const f of cartes) assert.ok(!lire(f).includes("var(--o-milieu-haut, 10px)"), f + ' pose encore son nom 10 px sous la plaque sur la carte large (65 px au lieu de 69)');
  for (const f of ['src/cartes/robot.jsx', 'src/cartes/distributeur.jsx', 'src/carteeau.jsx', 'src/carteborne.jsx', 'src/cartetraceur.jsx', 'src/cartes/prise.jsx', 'src/cartes/generique.jsx']) {
    assert.ok(lire(f).includes('...RM_CARD_HAUT, position: \'relative\''), f + ' range encore en `space-between` : sans pied, son nom tombe au bas de la carte (129 px)');
  }
  assert.ok(lire('src/cartevanne.jsx').includes("justifyContent: 'flex-start', position: 'relative',"), 'la vanne, sans pied, pose son nom au bas de la carte');
  assert.ok(lire('src/cartes/media.jsx').includes('<div style={{ marginTop: RM_SOUS_PLAQUE, minWidth: 0 }}>'), 'le nom d’un média tombe 4 px plus haut que celui d’une lumière');
});

test('un média en lecture garde son pied à la hauteur de ses voisines : la progression rend les 4 px du nom', () => {
  /* Mesuré dans la démo, carte de 184 px : la plaque 17 → 55, le nom 69 → 109, la barre 113 → 116, le pied 116 → 168. Avec 8 px
   * au-dessus de la barre, le pied finissait à 172 — 4 px sous celui d'un volet ou d'une lumière. */
  const m = lire('src/cartes/media.jsx');
  assert.ok(m.includes("data-progression=\"\" style={{ position: 'relative', height: 3, marginTop: 4, borderRadius: 2,"), 'la barre de progression repousse le pied d’un média 4 px sous celui de ses voisines');
  assert.ok(m.includes("<div className=\"o-seul-large\" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 8px)' }}>"), 'le pied d’un média ne tient plus ses 8 px');
});

test('la carte générique : le nom sous la plaque, la jauge et « Voir le flux » au pied, le dessin à sa place', () => {
  const g = lire('src/cartes/generique.jsx');
  assert.ok(g.includes("marginTop: RM_SOUS_PLAQUE, position: 'relative', pointerEvents: 'none' }}>"), 'le nom d’un interrupteur ou d’un détecteur n’est plus sous la plaque');
  assert.ok(g.includes("{barres && !mort && <div style={{ marginTop: 'auto', position: 'relative', pointerEvents: 'none' }}><JaugePile barres={barres} /></div>}"), 'la jauge d’une pile remonte sous le nom au lieu de rester au pied');
  assert.ok(g.includes("<div style={{ marginTop: 'auto' }}>\n          <button type=\"button\""), '« Voir le flux » remonte sous le nom au lieu de rester au pied');
  // ASSERTION MODIFIÉE (22/11, ADR 0388) : un ouvrant a sa tuile, chargée à la demande ; son dessin y reste en bas à droite.
  assert.ok(g.includes('<CarteOuvertureContent id={id} hass={hass} nom={nom} ico={ico} pile={pile} onOpen={onOpen} />')
    && lire('src/carteouverture.jsx').includes("<span className=\"o-ouv-dessin\" aria-hidden=\"true\" style={{ position: 'absolute', right: 14, bottom: 10, pointerEvents: 'none' }}>"), 'le dessin d’un ouvrant a disparu');
});

test('les mesures, plantes et groupes gardent la colonne du nom en haut ; la plante écrit son « % » en petit', () => {
  assert.ok(lire('src/cartes/mesure.jsx').includes("<div className=\"o-mesure-gauche\" style={{ flex: '1 1 0%', minWidth: 0, alignSelf: 'flex-start' }}>"), 'le nom des particules et des COV retombe à 72 px');
  for (const f of ['src/cartes/plante.jsx', 'src/cartes/groupe.jsx']) {
    assert.ok(lire(f).includes("<div style={{ flex: 1, minWidth: 0, alignSelf: 'flex-start' }}>"), f + ' : le chiffre et sa légende poussent le nom vers le bas');
  }
  assert.ok(lire('src/cartes/plante.jsx').includes("{v.sol == null ? v.chiffre : <>{nombre(v.sol, 0)}<span style={{ fontSize: 15 }}>%</span></>}"), 'la plante écrit son « % » à la taille du chiffre');
});

test('« Qualité de l’air » écrit son chiffre sur la ligne du nom, comme les autres mesures ; en haut sur le téléphone seulement', () => {
  const g = lire('src/cartes/generique.jsx');
  assert.ok(g.includes('? <ChiffreHaut v={mesure.v} u={mesure.u || null} />'), 'le chiffre d’une mesure générique n’est plus en haut sur la carte étroite (1c)');
  assert.ok(g.includes('{dom === \'sensor\' && mesure && !mort && <ChiffreMesure chiffre={mesure.v} unite={mesure.u} famille={null} />}'), 'la carte large écrit encore son chiffre seul en haut à droite');
  assert.ok(!g.includes('fontSize: 22, fontWeight: 800'), 'le chiffre de 22 px en haut de la carte large est revenu');
});

// ── E6 : les noms coupés de la carte étroite ─────────────────────────────────

test('sur la carte étroite seulement, un nom long passe sur deux lignes', () => {
  const g = lire('src/cartes/generique.jsx');
  assert.ok(g.includes("<div className={'o-rmcard o-gabarit' + (mort ? ' o-panne' : '')}") && g.includes('<div className="o-gab-nom" style={RM_NAME}>{nom}</div>'), '« Détecteur de monoxyde salon » finit encore en « … » au téléphone');
  const v = lire('src/cartes/volet.jsx');
  assert.ok(v.includes("<div className={'o-rmcard o-gabarit' + (mort ? ' o-panne' : '')} style={{ ...RM_CARD_HAUT,") && v.includes("<div className={gestes.placer ? undefined : 'o-gab-nom'} style={RM_NAME}>{nom}</div>"), '« Porte de garage motorisée » finit encore en « … » au téléphone');
  // La règle vit dans la requête de la carte étroite : le PC et la tablette ne changent pas.
  const css = lire('src/index.css');
  const i = css.indexOf('@container (width < 188px) {\n  .o-seul-large');
  assert.ok(i >= 0 && css.slice(i, css.indexOf('\n}', i)).includes('.o-gab-nom { font-size: 14px !important; font-weight: 600 !important; line-height: 16px; white-space: normal !important; overflow-wrap: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }'), 'les deux lignes du nom ne sont plus réservées à la carte étroite');
});

// ── E2 : les titres posés sur le ciel ────────────────────────────────────────

test('par tout ciel, un titre posé sur le ciel prend l’encre et le halo du thème', () => {
  const hote = lire('src/wx3d.jsx');
  assert.ok(hote.includes("l.classList.toggle('o-ciel-titre', (r.top + r.bottom) / 2 < lim)"), 'les titres posés sur un ciel de jour ne sont plus repérés');
  assert.ok(hote.includes("if (sombre) lignes().forEach((l) => { const r = l.getBoundingClientRect(); l.classList.toggle('o-sur-ciel', (r.top + r.bottom) / 2 < lim); });"), '`o-sur-ciel` ne dit plus « sur un ciel sombre »');
  const css = lire('src/index.css');
  const d = css.indexOf('.o-ciel-titre { --o-ciel-encre');
  assert.ok(d >= 0, 'les titres posés sur le ciel n’ont plus d’encre à eux');
  const bloc = css.slice(d, css.indexOf('/*', d));
  assert.ok(bloc.includes('.o-ciel-titre { --o-ciel-encre: var(--o-text); --o-ciel-encre2: var(--o-text1); --o-ciel-halo: var(--o-bg); }'), 'l’encre et le halo ne viennent plus du thème');
  assert.ok(bloc.includes('html.loggia-light main:has(.o-wx3d-sombre) .o-ciel-titre { --o-ciel-encre: var(--o-bg); --o-ciel-encre2: var(--o-bg); --o-ciel-halo: var(--o-text); }'), 'en thème clair sous un ciel sombre, le titre reste foncé');
  assert.ok(bloc.includes('.o-ciel-titre > h2 { color: var(--o-ciel-encre) !important; text-shadow: 0 1px 2px var(--o-ciel-halo), 0 0 10px var(--o-ciel-halo); }'), 'le titre reste gris, sans ombre, sur le ciel');
  assert.ok(bloc.includes('.o-ciel-titre > div > button:not([data-drag-ui])') && bloc.includes('.o-ciel-titre > span,'), '« 9 scénarios › », les flèches ou « Épinglez… » restent gris sur le ciel');
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(bloc), 'une couleur écrite en dur dans l’encre du ciel');
});

// ── E7 : les tuiles de l'Énergie au téléphone ────────────────────────────────

test('au téléphone, les tuiles de l’Énergie tiennent sur une ligne, aux libellés courts', () => {
  const e = lire('src/views/energie.jsx');
  assert.ok(e.includes("caption: etroit ? tr('Bas-carbone') : tr('Électricité bas-carbone')") && e.includes("caption: etroit ? tr('Carbone') : tr('Intensité carbone')"), '« ÉLECTRICITÉ BAS-C… » : le libellé long revient au téléphone');
  assert.ok(e.includes("{mesures.length > 0 && etroit && (\n        <div className={mesures.length > 3 ? 'o-favrow' : undefined} style={{ display: 'flex', gap: 8, overflowX: mesures.length > 3 ? 'auto' : 'visible'"), 'les tuiles du téléphone repassent sur deux rangées');
  assert.ok(e.includes("style={mesures.length > 3 ? { flex: '0 0 auto', minWidth: 104 } : { flex: '1 1 0%' }} />)}"), 'plus de trois tuiles passent à la ligne au lieu de défiler');
  assert.ok(lire('src/ui.jsx').includes('export function MetricTile({ caption, value, unit, icon, tone = \'var(--o-text)\', pct = null, style, serre = false })'), 'la tuile n’a plus d’écriture serrée');
  for (const l of LANGUES) {
    const c = catalogue(l);
    assert.ok(/\n  'Bas-carbone': '[^']+',\n  'Carbone': '[^']+',\n/.test(c), l + ' : « Bas-carbone » ou « Carbone » sans traduction');
  }
});

// ── E22 : le vouvoiement ─────────────────────────────────────────────────────

test('les trois phrases qui tutoyaient vouvoient, leur traduction gardée', () => {
  const avant = ['ne modifie rien ici', 'pointe le capteur d’usure', 'sois prudent'];
  for (const f of ['src/views/parametres.jsx', 'src/views/veilles.jsx', 'src/vues/piece.jsx']) {
    for (const a of avant) assert.ok(!lire(f).includes(a), f + ' tutoie encore : « ' + a + ' »');
  }
  const cles = {
    'Réglages de sûreté indisponibles pour le moment — rien n’a été chargé, ne modifiez rien ici avant de réessayer.': 'src/views/parametres.jsx',
    'Aucun capteur désigné : pointez le capteur d’usure d’un filtre, d’une brosse, ou le niveau d’un réservoir — le plus souvent un pourcentage restant.': 'src/views/veilles.jsx',
    'Vent fort ({v} {u}), soyez prudent': 'src/vues/piece.jsx',
  };
  for (const [cle, f] of Object.entries(cles)) {
    assert.ok(lire(f).includes("tr('" + cle + "'"), f + ' n’appelle plus la phrase au vouvoiement');
    for (const l of LANGUES) {
      const c = catalogue(l);
      assert.ok(c.includes("\n  '" + cle + "': "), l + ' : la clé au vouvoiement manque — la phrase reste en français');
      for (const a of avant) assert.ok(!c.includes(a), l + ' garde une clé qui tutoie : « ' + a + ' »');
    }
  }
  // La valeur polonaise, relue par un contributeur, n'a pas bougé : seule la clé change.
  assert.ok(catalogue('pl').includes("  'Vent fort ({v} {u}), soyez prudent': 'Silny wiatr ({v} {u}) — uważaj',"), 'la valeur polonaise a été réécrite');
});

// ── E23 : une mesure muette dit ce qu'elle mesure ; l'échelle, ses milliers ──

test('une mesure indisponible garde le libellé de sa mesure', () => {
  const m = lire('src/cartes/mesure.jsx');
  assert.ok(m.includes("libelle: (nomDitFamille(nom, famille) ? '' : famille) || (label && !famille ? cvName(st, id) : ''),"), 'la carte muette ne sait plus ce qu’elle mesure');
  assert.ok(m.includes("{v.chiffre == null && v.libelle && <span aria-hidden=\"true\" className=\"o-seul-large\""), 'la carte large muette n’écrit que le nom de la pièce et « Indisponible »');
  assert.ok(m.includes("{v.chiffre == null && v.libelle && <span aria-hidden=\"true\" className=\"o-gab-etiquette o-seul-etroit\""), 'la carte étroite muette ne dit pas ce qu’elle mesure');
  assert.ok(m.includes("label={nomCarte(v.nom, valeur ? (famille ? famille + ' ' + valeur : valeur) : v.libelle, v.phrase)} />}"), 'le lecteur d’écran n’entend pas ce que mesure la carte muette');
});

test('l’échelle d’un monoxyde en µg/m³ sépare ses milliers', () => {
  /* Un garde, pas une correction : relue dans la démo, l'échelle écrivait déjà « 10 310 » et « 40 096 » — avec une espace fine
   * (U+202F), peu visible à 10,5 px, qu'on avait prise pour une absence. Rien n'a changé dans confort.js. */
  const b = barreMesure('co', 5, 'µg/m³');
  const t = b.reperes.map(r => r.t);
  assert.ok(t.length === 2 && t.every(x => /^\d{2}\D\d{3}$/.test(x)), 'l’échelle écrit « ' + t.join(' · ') + ' » sans séparateur de milliers');
});

// ── X10 : une intégration qui se tait cinq minutes ───────────────────────────

const META = new Map([
  ['sensor.a', { platform: 'nuage' }], ['sensor.b', { platform: 'nuage' }], ['media_player.c', { platform: 'nuage' }],
  ['sensor.t1', { platform: 'template' }], ['sensor.t2', { platform: 'template' }], ['sensor.t3', { platform: 'template' }],
]);
const MAINTENANT = Date.parse('2026-11-12T10:00:00Z');
const muet = (minutes) => ({ state: 'unavailable', last_changed: new Date(MAINTENANT - minutes * 60000).toISOString() });

test('une intégration muette depuis moins de cinq minutes n’est pas encore un point', () => {
  assert.equal(MUETTE_DEPUIS_MS, 5 * 60000, 'le seuil n’est plus de cinq minutes');
  const S = { 'sensor.a': muet(2), 'sensor.b': muet(4), 'media_player.c': muet(1) };
  assert.deepEqual(integrationsTombees(S, META, 3, MAINTENANT), [], '« ne répond plus » paraît au premier hoquet de l’intégration');
  assert.equal(integrationsTombees({ 'sensor.a': muet(9), 'sensor.b': muet(4), 'media_player.c': muet(8) }, META, 3, MAINTENANT).length, 0, 'le point paraît alors qu’une entité ne se tait que depuis quatre minutes');
  const tombee = integrationsTombees({ 'sensor.a': muet(9), 'sensor.b': muet(6), 'media_player.c': muet(5) }, META, 3, MAINTENANT);
  assert.equal(tombee.length, 1, 'une intégration muette depuis cinq minutes n’est plus dite');
  assert.equal(tombee[0].scope, 'nuage');
  // Le rapport passe l'horloge.
  const r = healthReport(new Map(), { states: { 'sensor.a': muet(1), 'sensor.b': muet(1), 'media_player.c': muet(1) }, meta: META, maintenant: MAINTENANT });
  assert.equal(r.incidents.filter(i => i.kind === 'integration').length, 0, 'le rapport ignore l’horloge qu’on lui passe');
});

test('une plateforme calculée n’est jamais dite « ne répond plus »', () => {
  const S = { 'sensor.t1': muet(30), 'sensor.t2': muet(30), 'sensor.t3': muet(30) };
  assert.deepEqual(integrationsTombees(S, META, 3, MAINTENANT), [], 'des modèles (`template`) muets font un point : la panne vient de ce qu’ils lisent');
});

// ── X11 : trois détails ──────────────────────────────────────────────────────

test('rien encore lancé : « 9 scénarios », sans « dernier lancement — »', () => {
  const s = lire('src/vues/scenarios.jsx');
  assert.ok(s.includes(": libelleDernier(dernier, Date.now(), locale()) === '—' ? trN(liste.length, '{n} scénario', '{n} scénarios')"), 'la vue écrit « 9 scénarios · dernier lancement — »');
  assert.equal(trN(9, '{n} scénario', '{n} scénarios'), '9 scénarios');
});

test('Postes de consommation : sans énergie du jour, pas de « — » en troisième ligne', () => {
  const e = lire('src/views/energie.jsx');
  assert.ok(e.includes("{kwh != null && <div style={{ position: 'relative', marginTop: 3,") && !e.includes("tr('{n} kWh jour', { n: dec(kwh, 2) }) : '—'"), 'la carte d’un poste écrit encore « — » sous sa puissance');
});

test('le widget météo ne s’intitule plus « Home »', () => {
  assert.equal(nomVille('Home'), null, '« Home », le nom par défaut, sert de titre');
  assert.equal(nomVille('Maison'), null, '« Maison », le nom par défaut, sert de titre');
  assert.equal(nomVille('Villa Rose', 'Villa Rose'), null, 'le nom de la zone maison sert de titre');
  assert.equal(nomVille('Météo-France forecast for city Sainte-Solange', 'Home'), 'Sainte-Solange', 'une ville se perd');
  assert.equal(lieuMaison({ config: { location_name: 'Villa Rose' } }), 'Villa Rose');
  assert.equal(lieuMaison(null), null);
  for (const f of ['src/cartemeteo.jsx', 'src/fichemeteo.jsx']) {
    assert.ok(lire(f).includes("const nom = nomVille(a.friendly_name, lieuMaison(hass)) || tr('Météo');"), f + ' ne lit pas la zone maison');
  }
});
