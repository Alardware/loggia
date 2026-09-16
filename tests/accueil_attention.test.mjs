// L'Accueil montre ce qui merite l'attention (16/09, ADR 0028, etape 1 de la
// refonte) : la carte Securite dit tout en une seconde, « A surveiller »
// n'existe que quand il le faut, et la banniere en porte la couleur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

test('« A surveiller » est une section du rail, la premiere, et n’existe que quand il y a des points — meme en edition', () => {
  // Dans le rail, avec En ce moment et Rappels (retour user du 16/09) : sur
  // telephone c'est la seconde page, la banniere garde le compte des points.
  assert.ok(src.includes("const ACC_RAIL = ['attention', 'moment', 'rappels', 'calendrier', 'agenda'];"), 'la section, en tete du rail');
  assert.ok(src.includes("const ACC_MAIN = ['securite', 'favoris', 'scenes', 'pieces', 'cameras'];"), 'plus dans la colonne');
  assert.ok(src.includes("const ACC_NOMS = () => ({ attention: tr('À surveiller'), securite: tr('Sécurité'),"), 'son nom en edition');
  assert.ok(src.includes('attention: points.length ? <CarteAttention points={points} onNav={onNav} /> : null,'), 'rien quand tout va bien');
  const c = bloc('function CarteAttention(', NL + '}');
  assert.ok(c.includes('const visibles = points.slice(0, 6);') && c.includes("{tr('{n} autres', { n: reste })}"), 'six lignes, puis « n autres »');
  assert.ok(c.includes('<LigneMoment key={p.cle} icone={p.icone} rgb={c.rgb} nom={p.titre} sous={p.sous} onOpen={p.vue && onNav ? () => onNav(p.vue) : null} />'), 'une ligne par point, vers la vue qui permet d’agir');
  assert.ok(c.includes("{resumeAttention(points)}") && c.includes("<Fi i={niveau === 'danger' ? 'triangle-warning' : 'exclamation'}"), 'le resume et l’icone du pire niveau');
});

test('la banniere porte la couleur du pire point et dit « Tout va bien » sinon', () => {
  assert.ok(src.includes("const couleurAcc = points.length ? couleurNiveau(niveauMax(points)).col : 'var(--o-ok)';"), 'la couleur du point');
  assert.ok(src.includes("{[points.length ? resumeAttention(points) : tr('Tout va bien'), ...faits.txt].join(' · ')}"), 'le resume devant les faits');
  assert.ok(src.includes("background: couleurAcc, boxShadow: '0 0 8px ' + couleurAcc, animation: 'pulse 2.4s infinite'"), 'la pastille suit');
});

test('les points viennent des etats, des cameras, du CO2 des pieces, du diagnostic en direct et du serveur', () => {
  const d = bloc('function Dashboard(', NL + '}');
  assert.ok(d.includes("const veillesEtat = useEtatServeur(dashHass, 'loggia/veilles/etat', 30000, '').etat;") && d.includes("const fenetresEtat = useEtatServeur(dashHass, 'loggia/fenetres/etat', 30000, '').etat;"), 'les veilles et les fenetres du serveur, toutes les 30 s');
  assert.ok(d.includes('const comptesSec = comptesSecurite(etatsAcc, camsInfo);') && d.includes('const points = pointsAttention({'), 'comptes et points');
  assert.ok(d.includes("pieces: (a && a.rooms) ? a.rooms.map(r => ({ nom: r.name, co2: r.co2, haid: r.co2Id || null })) : [],") && d.includes('sante, veilles: veillesEtat, fenetres: fenetresEtat,') && d.includes('plantes: plantsCfg().map(p => p.base).filter(Boolean),'), 'le CO2 des pieces (et son capteur, pour le dedoublonnage), le diagnostic, les plantes epargnees');
  // Le diagnostic est recalcule en direct : celui de la decouverte est un
  // instantane du demarrage, une passerelle revenue y resterait hors service.
  assert.ok(src.includes("() => (view === 'accueil' && discovery.devices && discovery.index) ? healthReport(discovery.devices, { states: (hass && hass.states) || {}, meta: discovery.index.entityMeta }) : null,"), 'health.js en direct, sur l’Accueil seulement');
  assert.ok(src.includes('<Dashboard editMode={editMode} sante={santeAccueil}'), 'passe a l’Accueil');
});

test('la carte Securite : une sous-ligne verte ou ambre, la ligne d’etat, les boutons d’armement gardes', () => {
  const home = bloc('function Dashboard(', NL + '}');
  assert.ok(home.includes("const sousSecurite = comptesSec.ok ? tr('Tout est sécurisé')"), '« Tout est securise » quand rien n’est ouvert et que les cameras repondent');
  assert.ok(home.includes("color: comptesSec.ok ? 'var(--o-ok)' : 'var(--o-warn)'"), 'verte ou ambre');
  assert.ok(home.includes('<div className="grid-sec-etat" style={{ display: \'grid\', gridTemplateColumns: \'repeat(\' + tuilesSec.length + \', minmax(0, 1fr))\''), 'une tuile par famille presente');
  assert.ok(home.includes("<Fi i={t.icone} size={14} />") && home.includes('{t.valeur} <span className="sec-lib" style={{ fontSize: 11, fontWeight: 600, color: \'var(--o-text2)\' }}>{t.libelle}</span>'), 'icone, valeur, libelle');
  assert.ok(home.includes('{alarmRailId && <RailArm id={alarmRailId} hass={dashHass} />}') && home.includes('{serrureId && <RailSerrure id={serrureId} hass={dashHass} />}'), 'les boutons d’aujourd’hui et la serrure restent');
  assert.ok(!src.includes('ouvrantsRow'), 'la ligne « Tout est ferme » a disparu : les tuiles la remplacent');
  // Retour user du 16/09 : « sur mobile cette partie revient a la ligne » — une
  // seule rangee au telephone, l'icone au-dessus, le libelle peut se replier.
  assert.ok(!css.includes('.grid-sec-etat { grid-template-columns: 1fr 1fr !important; }'), 'plus de deux colonnes forcees sur telephone');
  assert.ok(home.includes('<button key={t.cle} type="button" className="sec-tuile"') && home.includes('<span className="sec-ico" style={{ ...RM_ICO(fond, col), width: 30, height: 30, borderRadius: 10 }}>') && home.includes('<span className="sec-nom" style={{ display: \'block\', fontSize: 11') && home.includes('<span className="sec-val" style={{ display: \'block\', fontSize: 13'), 'les tuiles ont des classes pour le telephone');
  assert.ok(css.includes('.grid-sec-etat > .sec-tuile { flex-direction: column !important; align-items: flex-start !important; gap: 6px !important; padding: 8px !important; }') && css.includes('.sec-tuile .sec-val { font-size: 12px !important; white-space: normal !important; }') && css.includes('.sec-tuile .sec-ico { width: 26px !important; height: 26px !important; }'), 'une rangee au telephone : icone au-dessus, libelle repliable');
});

test('l’accueil surveille ce que la carte Securite et « A surveiller » lisent', () => {
  const k = bloc('const bannerKeys = () => {', NL + '};');
  assert.ok(k.includes("dom === 'camera' || dom === 'alarm_control_panel'"), 'cameras et panneaux');
  assert.ok(k.includes('OUVRANT_DCS.indexOf(dc) >= 0 || CLASSES_MOUVEMENT.indexOf(dc) >= 0 || CLASSES_SURETE.indexOf(dc) >= 0'), 'ouvrants, mouvement, surete — par device_class');
  assert.ok(src.includes("import { comptesSecurite, tuilesSecurite, pointsAttention, niveauMax, resumeAttention, couleurNiveau, CLASSES_MOUVEMENT, CLASSES_SURETE } from './attention.js';"), 'une seule source pour les classes');
});

test('la demo a de quoi montrer la carte, et les mots ont leur traduction', () => {
  assert.ok(demo.includes("['chambre', 'Chambre', 19.6, 49, 1280],"), 'une chambre chargee en CO2');
  assert.ok(demo.includes("{ name: 'Jardin', online: false }"), 'une camera hors ligne');
  for (const k of ['À surveiller', 'Tout va bien', 'Tout est sécurisé', 'Caméra hors ligne', 'Portes', 'Fenêtres', '{n} points à surveiller', 'CO₂ élevé', 'Ouvert, alarme armée']) {
    assert.ok(en.includes("'" + k + "':") || en.includes('"' + k + '":'), k + ' manque a en.js');
  }
});
