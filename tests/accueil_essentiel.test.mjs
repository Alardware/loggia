// L'Accueil ne garde que l'essentiel (16/09, ADR 0035) : la tuile Alarme en
// tete de la banniere, plus de grand panneau, « En ce moment » sans prises,
// les modes en icones au telephone, la sirene reconnue meme en interrupteur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tuileAlarme, estSirene, ICONES_ARMEMENT } from '../src/attention.js';
import { MONOLITHE, VUES_SORTIES, DASHBOARD } from './monolithe.mjs'; // App.jsx + les vues sorties du boot (ADR 0274) ; DASHBOARD : l'Accueil en entier, ses hooks compris (ADR 0283)

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (MONOLITHE + VUES_SORTIES);
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };
const home = DASHBOARD;

test('la tuile Alarme : l’etat et le mode, l’icone du mode, la couleur — ou rien', () => {
  assert.deepEqual(tuileAlarme({ state: 'disarmed' }), { texte: 'Désarmée', icone: 'shield', couleur: 'var(--o-ok)', rgb: 'var(--o-ok-rgb)' });
  assert.deepEqual(tuileAlarme({ state: 'armed_night' }), { texte: 'Armée · Nuit', icone: 'moon', couleur: 'var(--o-purple)', rgb: 'var(--o-purple-rgb)' });
  assert.deepEqual(tuileAlarme({ state: 'armed_away' }), { texte: 'Armée · Absent', icone: 'plane-departure', couleur: 'var(--o-warn2)', rgb: 'var(--o-warn2-rgb)' });
  assert.deepEqual(tuileAlarme({ state: 'armed_home' }), { texte: 'Armée · Maison', icone: 'home', couleur: 'var(--o-accent-soft)', rgb: 'var(--o-accent-rgb)' });
  assert.deepEqual(tuileAlarme({ state: 'armed_vacation' }), { texte: 'Armée · Vacances', icone: 'umbrella-beach', couleur: 'var(--o-warn2)', rgb: 'var(--o-warn2-rgb)' });
  assert.deepEqual(tuileAlarme({ state: 'arming' }), { texte: 'Activation…', icone: 'shield', couleur: 'var(--o-warn)', rgb: 'var(--o-warn-rgb)' });
  assert.deepEqual(tuileAlarme({ state: 'pending' }).texte, 'Activation…');
  assert.deepEqual(tuileAlarme({ state: 'triggered' }), { texte: 'Déclenchée', icone: 'bell-ring', couleur: 'var(--o-bad)', rgb: 'var(--o-bad-rgb)' });
  assert.deepEqual(tuileAlarme({ state: 'armed_custom_bypass' }), { texte: 'Armée', icone: 'shield-check', couleur: 'var(--o-warn2)', rgb: 'var(--o-warn2-rgb)' }, 'un mode inconnu reste une alarme armee');
  assert.equal(tuileAlarme({ state: 'unavailable' }), null);
  assert.equal(tuileAlarme(null), null);
  assert.deepEqual(Object.keys(ICONES_ARMEMENT), ['alarm_disarm', 'alarm_arm_home', 'alarm_arm_away', 'alarm_arm_night', 'alarm_arm_vacation'], 'une icone par armement');
});

test('une sirene : le domaine siren, ou un interrupteur qui se nomme ainsi', () => {
  assert.equal(estSirene('siren.interieure', { attributes: {} }), true);
  assert.equal(estSirene('switch.sirene_interieure', { attributes: { friendly_name: 'Sirène intérieure' } }), true, 'par l’identifiant');
  assert.equal(estSirene('switch.zigbee_0x1234', { attributes: { friendly_name: 'Sirène du garage' } }), true, 'par le nom, accent compris');
  assert.equal(estSirene('input_boolean.siren_test', null), true);
  assert.equal(estSirene('switch.camera_entree_voyant', { attributes: { friendly_name: 'Caméra entrée Voyant' } }), false);
  assert.equal(estSirene('binary_sensor.sirene', { attributes: { friendly_name: 'Sirène' } }), false, 'un capteur n’est pas une sirene');
  assert.equal(estSirene(null, null), false);
});

test('la banniere : l’alarme d’abord, d’un tap vers la vue ; « en ce moment » compte l’essentiel', () => {
  const c = home.slice(home.indexOf('const cases = [];'), home.indexOf('if (!cases.length) return null;'));
  assert.ok(c.indexOf('key="al"') >= 0 && c.indexOf('key="al"') < c.indexOf('key="ex"'), 'l’alarme avant le reseau');
  assert.ok(c.includes('if (alarmeTuile) cases.push(') && c.includes('<Fi i={alarmeTuile.icone} color={alarmeTuile.couleur} size={17} />') && c.includes("{tr('ALARME')}"), 'la tuile, d’apres tuileAlarme');
  assert.ok(home.includes("al: () => onNav && onNav('securite'),") && home.includes("libelles = { al: tr('Voir la sécurité'),"), 'un tap mene a la vue Securite');
  assert.ok(home.includes('const alarmeTuile = tuileAlarme(alarmRailId && dashHass && dashHass.states ? dashHass.states[alarmRailId] : null);'), 'd’apres l’etat du panneau');
  assert.ok(c.includes('if (nEnCours > 0) cases.push(') && c.includes("{tr('EN CE MOMENT')}") && !c.includes('APPAREILS ACTIFS'), 'la tuile compte ce qui tourne vraiment, plus les prises');
  assert.ok(home.includes("if (al && S[al].state === 'triggered') alerte = true;") && !home.includes("tr('Alarme désarmée')"), 'la phrase des faits ne repete plus l’alarme');
});

test('plus de grand panneau Securite sur l’Accueil', () => {
  assert.ok(src.includes("const ACC_MAIN = ['favoris', 'scenes', 'pieces', 'cameras'];"), 'plus de section securite');
  assert.ok(src.includes("const ACC_NOMS = () => ({ attention: tr('À surveiller'), favoris: tr('Favoris'),"), 'ni son nom');
  assert.ok(src.includes("const tete = (zone === 'main' ? [] : ['attention', 'meteo']).filter(s => manquants.indexOf(s) >= 0);"), 'rien en tete de la colonne');
  assert.ok(!home.includes('carteSecurite') && !home.includes('<TuilesSecurite') && !home.includes('<RailArm') && !home.includes('<RailSerrure') && !home.includes('comptesSec'), 'la carte, ses tuiles, ses boutons et la glissiere ont quitte l’Accueil');
  assert.ok(!src.includes('function RailArm(') && !src.includes('function RailSerrure(') && !src.includes('function serrureRailId('), 'et leur code avec');
  assert.ok(src.includes('function TuilesSecurite('), 'la rangee de tuiles vit dans la vue Securite');
});

test('« En ce moment » : l’essentiel, calcule avant le rendu', () => {
  const m = home.slice(home.indexOf('const momentRows = [];'), home.indexOf('const nEnCours = momentRows.length;'));
  assert.ok(home.indexOf('const momentRows = [];') < home.indexOf(NL + '  return (' + NL), 'avant le return : la banniere lit le compte');
  assert.ok(m.includes("if (dom !== 'vacuum' && dom !== 'lawn_mower') return;"), 'les machines seulement — plus de prise, de ventilateur, de vanne');
  assert.ok(!m.includes('lampes') && !m.includes("commande(id, dom, 'turn_off')") && !m.includes('close_valve'), 'plus de geste generique');
  /* ASSERTION MODIFIÉE (tâche 12 du chantier Chauffage) : les zones qui
   * chauffent se comptent par LA règle des cartes (`zonesQuiChauffent` : un
   * module à plus de 10 W, un thermostat qui chauffe vraiment — plus le froid
   * d'un climatiseur), sans les chauffages au planning allumé, qui ont leurs
   * lignes (`lignesMoment`). La condition d'avant comptait le chaud ET le
   * froid des seuls `climate`. Relecture des tâches 11 et 12 : `{ admin }`,
   * la ligne d'un chauffage introuvable pour un administrateur seulement. */
  // ASSERTION MODIFIÉE (chantier Médias, tâche 9 ; M14, M16) : un lecteur se lit avec son jumeau (`lireLecteur`).
  assert.ok(m.includes('const l = lireLecteur(S0, m); if (l.indispo || !l.playing) return;') && m.includes('if (mLv && mLv.active && (!a || aEnt(notifIds().dishwasher)))')
    && m.includes('const chauffe = zonesQuiChauffent(S0, etatCh);') && m.includes('lignesMoment(etatCh, uniteTemp(null, dashHass), { admin: !ordinaire }).forEach(l => momentRows.push(<LigneMoment ')
    && !m.includes("['heating', 'cooling']"), 'lecture, lave-vaisselle, planning de chauffe, chauffage');
  /* ASSERTION MODIFIÉE (19/10) : un volet en mouvement, que Home Assistant le dise (`opening` / `closing`) ou que sa course se
   * JOUE à l'écran (`sensJoue`, voletcourse.js) — chez lui, Netatmo ne dit jamais `closing`. */
  assert.ok(m.includes("const sens = e.state === 'opening' ? 'ouverture' : e.state === 'closing' ? 'fermeture' : sensJoue[c.haid] || null;") && m.includes('if (!sens) return;') && !m.includes('ni ouvert ni fermé'), 'un volet en mouvement seulement');
  assert.ok(home.includes("railPanel(tr('En ce moment'), tr('Lecture, machines, chauffage, volets en mouvement'),"), 'le sous-titre dit ce qu’il montre');
});

test('les modes de l’alarme : l’icone, et le mot qui s’efface au telephone', () => {
  const c = bloc('function CvAlarm(', NL + '}');
  assert.ok(c.includes('<Fi i={ICONES_ARMEMENT[svc] || \'shield\'} size={13} />') && c.includes('<span className="o-armchip-txt">{lbl}</span>') && c.includes('aria-label={lbl} aria-pressed={actif} className="o-armchip"'), 'icone + mot, le mot lisible par les lecteurs d’ecran');
  assert.ok(c.includes("{(cpt && svcVise === svc) ? <span>{cpt.reste + ' s'}</span> :"), 'le decompte reste visible partout');
  assert.ok(css.includes('.o-armchip-txt { display: none !important; }'), 'au telephone, l’icone seule');
});

test('la sirene : reconnue meme en interrupteur, choisie si configuree, pilotee dans son domaine', () => {
  const vue = bloc('function SecuriteContent(', NL + '}');
  assert.ok(vue.includes("const sireneChoisie = loggiaEnt('sirene', null);") && vue.includes('...Object.keys(S).filter(id => id !== sireneChoisie && S[id] && estSirene(id, S[id]))'), 'le choix, puis la detection');
  const c = bloc('function CvSirene(', NL + '}');
  // La bascule passe par le domaine de l'entite ; le test sonore, lui, part
  // du composant (ADR 0065) : la duree n'est plus comptee dans l'onglet.
  assert.ok(c.includes("const dom = String(id).split('.')[0];") && c.includes('commanderService(hass, id, dom, svc,') && c.includes("hass.callWS({ type: 'loggia/sirene/tester', entity_id: id })") && !c.includes('SIRENE_DUREE'), 'un switch s’allume comme un switch ; les trois secondes sont tenues par Home Assistant');
  assert.ok(src.includes("securite: [...secBaseKeys(), 'camera.', 'siren.', 'switch.', ...secKeys,"), 'les interrupteurs sont relus sur la vue');
});

test('les pieces : cartes ou plan, et le plan dit franchement qu’il n’existe pas', () => {
  /* « Je voudrais ajouter plus tard le plan de la maison avec la possibilité
   * de switcher ; pour le moment ajoute le bouton, et à la place du plan mets
   * une phrase du genre "arrive prochainement" » (30/09).
   *
   * Le bouton est donc la, et la place du plan aussi — mais rien n'y est
   * dessine. Pas de faux plan, pas de capture grisee : la phrase. */
  assert.ok(home.includes("<Segment value={vuePieces} onChange={setVuePieces}"), 'le choix cartes / plan a disparu de l’en-tete des pieces');
  assert.ok(home.includes("options={[{ id: 'cartes', label: tr('Cartes'), ico: 'apps' }, { id: 'plan', label: tr('Plan'), ico: 'floor-plan' }]}"), 'les deux moities du choix, avec leur icone');
  /* L'Accueil ouvre sur les CARTES, et s'en souvient depuis le 01/10 : le
   * choix se range par type d'ecran, comme les cameras. Sans rien d'enregistre,
   * ce sont les cartes — c'est `vuePiecesDe` qui le garantit. */
  assert.ok(home.includes("const vuePieces = planActif ? vuePiecesDe(vuePiecesCfg, formatGrille) : 'cartes';"), 'l’Accueil ne lit plus le choix enregistre, ou ignore l’option du plan');
  /* L'option « Plan 3D de la maison » (20/10) : coupee dans Apparence →
   * Affichage, le bouton disparait et les pieces restent en cartes. */
  assert.ok(home.includes('{planActif && segmentPlan(serre)}')
    && src.includes("onNav={setView} planActif={look.plan !== false}"), 'le bouton Plan ne suit plus l’option');
  /* Au telephone, les etages et « Cartes / Plan » en icones seules tiennent
   * sur la ligne du titre (25/10) ; l'icone du plan est un plan au sol. */
  assert.ok(home.includes('compact={compact}') && src.includes('compact = false }) {') && src.includes('aria-label={compact ? o.label : undefined}'), 'le segment compact a disparu');
  assert.ok(readFileSync(join(RACINE, 'src', 'icones.jsx'), 'utf8').includes("'floor-plan':"), 'l’icone du plan au sol a disparu');
  const parametres = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
  assert.ok(parametres.includes("cb={() => onLook({ plan: look.plan === false })}"), 'l’option du plan a quitte Apparence → Affichage');
  assert.ok(home.includes("cfgSet({ loggia_vuepieces: n });"), 'le choix ne se garde plus');
  /* Le plan est arrive (chantier Plan 3D, 17/10) : a la place de la phrase,
   * le modele importe, charge seulement pour qui choisit « Plan ». Toucher une
   * piece ouvre la piece, comme sa carte ; un appareil, sa fiche. */
  assert.ok(src.includes("const PlanPieces = lazyRecharge(() => import('./planpieces.jsx'));"), 'le plan n’est plus charge a la demande');
  assert.ok(home.includes("vuePieces === 'plan' ? (") && home.includes('<PlanPieces hass={dashHass} pieces={piecesVues}'), 'le plan n’est plus a la place de la phrase');
  assert.ok(home.includes('onPiece={(n) => { if (onOpenRoom) onOpenRoom(n); }} onEntite={(id) => dc.ouvrir(id)}'), 'toucher le plan n’ouvre plus la piece ou la fiche');
  assert.ok(!home.includes("tr('Le plan de la maison arrive prochainement.')"), 'la phrase d’attente est revenue');
  // Et les deux mots ont leur traduction, sinon ils sortiraient en francais.
  ['Cartes', 'Plan'].forEach(k => assert.ok(en.includes("'" + k + "':"), k + ' n’est pas traduit'));
});
