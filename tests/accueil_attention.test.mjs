// L'Accueil montre ce qui merite l'attention (16/09, ADR 0028, etape 1 de la
// refonte) : la carte Securite dit tout en une seconde, « A surveiller »
// n'existe que quand il le faut, et la banniere en porte la couleur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VUES_SORTIES } from './monolithe.mjs'; // App.jsx + les vues sorties du boot (ADR 0274)

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8') + VUES_SORTIES);
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

test('« A surveiller » est une section du rail, la premiere, et n’existe que quand il y a des points — meme en edition', () => {
  // Dans le rail, avec En ce moment et Rappels (retour user du 16/09) : sur
  // telephone c'est la seconde page, la banniere garde le compte des points.
  assert.ok(src.includes("const ACC_RAIL = ['attention', 'heure', 'meteo', 'co2', 'moment', 'rappels', 'agenda'];"), 'la section, en tete du rail');
  assert.ok(src.includes("const ACC_MAIN = ['favoris', 'scenes', 'pieces', 'cameras'];"), 'plus dans la colonne');
  assert.ok(src.includes("const ACC_NOMS = () => ({ attention: tr('À surveiller'), favoris: tr('Favoris'),"), 'son nom en edition');
  assert.ok(src.includes('attention: points.length ? <CarteAttention points={points} onNav={onNav} /> : null,'), 'rien quand tout va bien');
  const c = bloc('function CarteAttention(', NL + '}');
  assert.ok(c.includes('const visibles = points.slice(0, 6);') && c.includes("{tr('{n} autres', { n: reste })}"), 'six lignes, puis « n autres »');
  assert.ok(c.includes('<LigneMoment key={p.cle} icone={p.icone} rgb={c.rgb} nom={p.titre} sous={p.sous} onOpen={p.vue && onNav ? () => onNav(p.vue) : null} />'), 'une ligne par point, vers la vue qui permet d’agir');
  assert.ok(c.includes("{resumeAttention(points)}") && c.includes("<Fi i={niveau === 'danger' ? 'triangle-warning' : 'exclamation'}"), 'le resume et l’icone du pire niveau');
});

test('la banniere porte la couleur du pire point, et se tait quand il n’y en a pas', () => {
  assert.ok(src.includes("const couleurAcc = points.length ? couleurNiveau(niveauMax(points)).col : 'var(--o-ok)';"), 'la couleur du point');
  // Ticket #34, sa réponse « B » (18/10) : jamais de « Tout va bien » sous le
  // prénom, et rien quand la section « À surveiller » est masquée.
  assert.ok(src.includes("const attentionLigne = points.length > 0 && !sectionMasquee('attention');"), 'la ligne ne suit plus la section');
  assert.ok(src.includes("{[...(attentionLigne ? [resumeAttention(points)] : []), ...faits.txt].join(' · ')}"), 'le resume devant les faits');
  assert.ok(!src.includes("resumeAttention(points) : tr('Tout va bien')"), '« Tout va bien » revient sous le prénom');
  assert.ok(src.includes("role=\"status\">{attentionLigne ?"), 'le lecteur d’écran annonce une section masquée');
  assert.ok(src.includes("background: couleurAcc, boxShadow: '0 0 8px ' + couleurAcc, animation: animationNiveau(niveauMax(points))"), 'la pastille suit — et ne bat qu’en danger (v3.49.0)');
});

test('les points viennent des etats, des cameras, du CO2 des pieces, du diagnostic en direct et du serveur', () => {
  const d = bloc('function Dashboard(', NL + '}');
  assert.ok(d.includes("const veillesEtat = useEtatServeur(dashHass, 'loggia/veilles/etat', 30000, '').etat;") && d.includes("const fenetresEtat = useEtatServeur(dashHass, 'loggia/fenetres/etat', 30000, '').etat;"), 'les veilles et les fenetres du serveur, toutes les 30 s');
  assert.ok(d.includes('const points = pointsAttention({'), 'comptes et points');
  // ASSERTION MODIFIÉE (audit du 19/10, H7) : chaque pièce apporte aussi son seuil CO₂.
  assert.ok(d.includes("pieces: (a && a.rooms) ? a.rooms.map(r => ({ nom: r.name, co2: r.co2, haid: r.co2Id || null, seuil: r.co2Seuil })) : [],") && d.includes('sante, veilles: veillesEtat, fenetres: fenetresEtat,') && d.includes('plantes: plantsCfg().map(p => p.base).filter(Boolean),'), 'le CO2 des pieces (et son capteur, pour le dedoublonnage), le diagnostic, les plantes epargnees');
  // Le diagnostic est recalcule en direct : celui de la decouverte est un
  // instantane du demarrage, une passerelle revenue y resterait hors service.
  assert.ok(src.includes("() => (view === 'accueil' && discovery.devices && discovery.index) ? healthReport(discovery.devices, { states: (hass && hass.states) || {}, meta: discovery.index.entityMeta }) : null,"), 'health.js en direct, sur l’Accueil seulement');
  assert.ok(src.includes('<Dashboard editMode={editMode} sante={santeAccueil}'), 'passe a l’Accueil');
});

test('la carte Securite : une sous-ligne verte ou ambre, la ligne d’etat, les boutons d’armement gardes', () => {
  const home = bloc('function Dashboard(', NL + '}');
  assert.ok(!home.includes('sousSecurite') && src.includes('resumeSecurite(comptesSecVue)'), '« Tout est securise » : la phrase vit dans la vue Securite (ADR 0035)');
  assert.ok(src.includes("color: comptesSecVue.ok ? 'var(--o-ok)' : 'var(--o-warn)'"), 'verte ou ambre — dans la vue');
  // Depuis l'ADR 0033, la rangee est un composant partage avec la vue Securite.
  const tuilesBloc = bloc('function TuilesSecurite(', NL + '}');
  assert.ok(tuilesBloc.includes('<div className="grid-sec-etat" style={{ display: \'grid\', gridTemplateColumns: \'repeat(\' + tuiles.length + \', minmax(0, 1fr))\'') && src.includes('<TuilesSecurite tuiles={tuilesSecVue} onTuile={(t) => defiler(t.cle)} />'), 'une tuile par famille presente');
  assert.ok(tuilesBloc.includes("<Fi i={t.icone} size={14} />") && tuilesBloc.includes('{t.valeur} <span className="sec-lib" style={{ fontSize: 11, fontWeight: 600, color: \'var(--o-text2)\' }}>{t.libelle}</span>'), 'icone, valeur, libelle');
  assert.ok(!home.includes('<RailArm') && !home.includes('<RailSerrure'), 'les boutons d’armement et la serrure ont quitte l’Accueil (ADR 0035)');
  assert.ok(!src.includes('ouvrantsRow'), 'la ligne « Tout est ferme » a disparu : les tuiles la remplacent');
  // Retour user du 16/09 : « sur mobile cette partie revient a la ligne » — une
  // seule rangee au telephone, l'icone au-dessus, le libelle peut se replier.
  assert.ok(!css.includes('.grid-sec-etat { grid-template-columns: 1fr 1fr !important; }'), 'plus de deux colonnes forcees sur telephone');
  assert.ok(tuilesBloc.includes('<button key={t.cle} type="button" className="sec-tuile"') && tuilesBloc.includes('<span className="sec-ico" style={{ ...RM_ICO(fond, col), width: 30, height: 30, borderRadius: 10 }}>') && tuilesBloc.includes('<span className="sec-nom" style={{ display: \'block\', fontSize: 11') && tuilesBloc.includes('<span className="sec-val" style={{ display: \'block\', fontSize: 13'), 'les tuiles ont des classes pour le telephone');
  assert.ok(css.includes('.grid-sec-etat > .sec-tuile { flex-direction: column !important; align-items: flex-start !important; gap: 6px !important; padding: 8px !important; }') && css.includes('.sec-tuile .sec-val { font-size: 12px !important; white-space: normal !important; }') && css.includes('.sec-tuile .sec-ico { width: 26px !important; height: 26px !important; }'), 'une rangee au telephone : icone au-dessus, libelle repliable');
});

test('l’accueil surveille ce que la carte Securite et « A surveiller » lisent', () => {
  const k = bloc('const bannerKeys = () => {', NL + '};');
  assert.ok(k.includes("dom === 'camera' || dom === 'alarm_control_panel'"), 'cameras et panneaux');
  assert.ok(k.includes('OUVRANT_DCS.indexOf(dc) >= 0 || CLASSES_MOUVEMENT.indexOf(dc) >= 0 || CLASSES_SURETE.indexOf(dc) >= 0'), 'ouvrants, mouvement, surete — par device_class');
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 11 ; C32) : la couleur d'une pile et le seuil de la veille viennent de la même source.
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 12 ; ADR 0022) : et la règle du `moisture` calculé.
  // ASSERTION MODIFIÉE (relecture de la passe bis du 17/10) : la racine part du seuil en vigueur (`seuilsPile`) avant le premier relevé.
  // ASSERTION MODIFIÉE (audit des capteurs du 19/10, lot 4) : et les mots d'un danger — `motsSurete`, la table que deriveNotifs ne recopie plus.
  // ASSERTION MODIFIÉE (ADR 0274) : la vue Sécurité, sortie du boot, importe elle-même ce qu'elle seule utilise.
  assert.ok(src.includes("import { comptesSecurite, tuilesSecurite, resumeSecurite, messageAlarme, estSirene, pointsAttention } from '../attention.js';") && src.includes("import { tuileAlarme, estSirene, ICONES_ARMEMENT, pointsAttention, niveauMax, resumeAttention, couleurNiveau, niveauPile, couleurPile, reglerSeuilPile, seuilsPile, fuiteCalculee, animationNiveau, CLASSES_MOUVEMENT, CLASSES_SURETE, CLASSES_OUVRANT, motsSurete } from './attention.js';"), 'une seule source pour les classes');
  // ASSERTION AJOUTÉE (audit du 19/10, point 14) : les ouvrants aussi — `OUVRANT_DCS` n'est plus une copie.
  assert.ok(src.includes('const OUVRANT_DCS = CLASSES_OUVRANT;'), 'les ouvrants viennent de la table');
});

test('la demo a de quoi montrer la carte, et les mots ont leur traduction', () => {
  // ASSERTION MODIFIÉE (chantier Capteurs, tâche 3) : la chambre de sa maquette « Cartes capteurs », 1 659 ppm — au palier « Confiné », toujours au-dessus des 1 400 ppm d'« À surveiller ».
  assert.ok(demo.includes("['chambre', 'Chambre', 19.6, 49, 1659],"), 'une chambre au-dessus de 1 400 ppm en CO2 (captures du 19/09)');
  /* Le nom est celui d'un LIEU : la demo le traduit (23/09), la table est
   * donc devenue une fonction. Ce qui compte ici reste la camera eteinte. */
  assert.ok(demo.includes("{ name: lieu('Jardin'), online: false }"), 'une camera hors ligne');
});
