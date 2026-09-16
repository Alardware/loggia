// L'Accueil du 15/09 : Securite en tete, « En ce moment » sur le cote, et
// deux onglets sur mobile — rien d'invente, et les anciens accueils migrent.

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
const home = bloc('function Dashboard(', NL + 'function ');

test('les sections : Securite en tete de la colonne, En ce moment en tete du rail, et les anciens noms migrent', () => {
  // « A surveiller » (v3.29, ADR 0028) precede Securite : la carte n'existe que quand il y a des points.
  assert.ok(src.includes("const ACC_MAIN = ['attention', 'securite', 'favoris', 'scenes', 'pieces', 'cameras'];"), 'la colonne principale');
  assert.ok(src.includes("const ACC_RAIL = ['moment', 'rappels', 'calendrier', 'agenda'];"), 'le rail');
  assert.ok(src.includes("const ACC_RENOMME = { etats: 'moment' };"), 'En cours devient En ce moment');
  assert.ok(!src.includes("'heros'") && !src.includes('function HeroSlider(') && !src.includes('heroIds'), 'la glissiere du heros a disparu');
  const o = bloc('  const ordreDe = (zone) => {', NL + '  };');
  assert.ok(o.includes('.map(s => ACC_RENOMME[s] || s)'), 'un ordre enregistre est traduit');
  assert.ok(o.includes("const tete = ['attention', 'securite'].filter(s => manquants.indexOf(s) >= 0);") && o.includes("return [...tete, ...sauve, ...manquants.filter(s => tete.indexOf(s) < 0)];"), '« A surveiller » puis Securite passent en tete d’un accueil deja range');
  assert.ok(home.includes('const cache = (grille.caches || []).map(s => ACC_RENOMME[s] || s).indexOf(id) >= 0;'), 'un masquage enregistre suit le nouveau nom');
});

test('la carte Securite : les boutons d’armement d’aujourd’hui, la serrure, les ouvrants — ou rien', () => {
  assert.ok(home.includes('{alarmRailId && <RailArm id={alarmRailId} hass={dashHass} />}'), 'le systeme de boutons actuel (retour user : on le garde)');
  assert.ok(home.includes('{serrureId && <RailSerrure id={serrureId} hass={dashHass} />}'), 'la serrure');
  assert.ok(home.includes('const tuilesSec = tuilesSecurite(comptesSec);') && home.includes("onClick={() => onNav && onNav('securite')}"), 'la ligne d’etat (portes, fenetres, mouvement, cameras), vers la vue Securite');
  assert.ok(home.includes('const carteSecurite = (alarmRailId || serrureId || tuilesSec.length) ? ('), 'sans panneau, serrure ni capteur : pas de carte');
  assert.ok(home.includes('securite: carteSecurite,'), 'une section comme les autres');
  assert.ok(!home.includes('Désactivé') && !home.includes('Partiel'), 'pas le selecteur de la maquette');
});

test('En ce moment : une ligne par chose qui tourne, avec son geste, et rien d’invente', () => {
  assert.ok(home.includes('const np = mpRead(S0, id); if (!np.playing) return;') && home.includes("commande(id, 'media_player', 'media_play_pause')"), 'un lecteur en lecture, et sa pause');
  assert.ok(home.includes('const test = APPAREIL_ACTIF[dom]; if (!test || lampes.has(id) || !test(e.state)) return;'), 'un appareil en marche : la regle de la banniere');
  assert.ok(home.includes("commande(id, 'vacuum', 'return_to_base')") && home.includes("commande(id, 'lawn_mower', 'dock')") && home.includes("commande(id, dom, 'turn_off')"), 'dock et arret : les gestes qui existent');
  assert.ok(home.includes('if (mLv && mLv.active && (!a || hasEnt(notifIds().dishwasher)))'), 'le lave-vaisselle seulement en cours');
  assert.ok(home.includes("['heating', 'cooling'].indexOf((S0[z.haid].attributes || {}).hvac_action) >= 0"), 'les zones qui chauffent vraiment');
  assert.ok(home.includes("const entre = typeof pos === 'number' && pos > 0 && pos < 100;") && home.includes("commande(c.haid, 'cover', 'stop_cover')"), 'un volet entre deux ou en mouvement, et son stop');
  assert.ok(home.includes('const nEnCours = momentRows.length;') && home.includes('nEnCours > 8'), 'compte reel, huit lignes au plus');
  assert.ok(home.includes("railPanel(tr('En ce moment'),") && home.includes("tr('RIEN EN COURS')") && home.includes('moment: railMoment,'), 'le panneau du rail, meme vide');
  assert.ok(!home.includes("tr('Mode volets')") && !home.includes("railRow('we'") && !home.includes("railRow('lu'"), 'plus de lignes de robots ni de mode volets dans le rail');
  const l = bloc('function LigneMoment(', NL + '}');
  assert.ok(l.includes('e.stopPropagation(); onAction();') && l.includes('<Fi i="angle-right" size={10} color="var(--o-text3)" />'), 'le geste a droite, sinon le chevron');
});

test('deux pages sur mobile : glissees au doigt, deux points, retenues, coupees en edition', () => {
  const o = bloc('function OngletsAccueil(', NL + '}');
  assert.ok(!o.includes('role="tablist"') && o.includes('aria-label={lbl} aria-pressed={on}') && o.includes('width: on ? 18 : 6'), 'pas de barre d’onglets (retour user) : deux points, comme sous l’ancienne glissiere');
  assert.ok(o.includes("sessionStorage.getItem(ONGLET_CLE) === 'moment' ? 1 : 0") && src.includes("const ONGLET_CLE = 'loggia-accueil-onglet';"), 'retenu pour la session');
  assert.ok(o.includes("if (edit || e.pointerType === 'mouse' || defileHorizontal(e.target, e.currentTarget)) return;"), 'le geste ne vaut qu’au doigt, jamais en edition, jamais depuis une rangee qui defile');
  const h = bloc('function defileHorizontal(', NL + '}');
  assert.ok(h.includes("(st.overflowX === 'auto' || st.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 1") && h.includes('n !== racine'), 'une rangee qui defile vraiment, jusqu’a la racine du glissement');
  assert.ok(o.includes('g.pris = Math.abs(ddx) > Math.abs(ddy) * 2;') && o.includes('if (g.dx < -40 && onglet === 0) va(1);') && o.includes('g.dx = (onglet === 0 && ddx > 0) || (onglet === 1 && ddx < 0) ? ddx / 4 : ddx;'), 'franchement horizontal, 40 px');
  assert.ok(o.includes('onPointerCancel={annule}') && o.includes('const annule = () => { geste.current = null; setDx(0); };'), 'un pointercancel ne change pas d’onglet');
  assert.ok(o.includes('{onglet === 0 ? maison : moment}'), 'un seul panneau dans le flux');
  assert.ok(home.includes('if (!wide) return <OngletsAccueil maison={renduMain} moment={renduRail} edit={editMode} />;'), 'le mobile et la tablette passent par les deux pages');
  assert.ok(home.includes("gridTemplateColumns: wideXL ? '1fr 330px' : '1fr 276px'"), 'le PC garde ses deux colonnes');
});

test('l’accueil surveille ce qu’En ce moment montre et commande', () => {
  const k = bloc('  const accueilKeys = [', '];');
  ['media_player.', 'climate.', 'cover.', 'vacuum.', 'fan.', 'humidifier.', 'valve.'].forEach(d => assert.ok(k.includes("'" + d + "'"), d));
});

test('les mots de l’accueil ont leur traduction', () => {
  ['Portes et fenêtres', '{n} ouvrants ouverts sur {m}', '{n} ouvrant ouvert sur {m}', 'Tout est fermé', 'Activation…', 'Fermer la vanne', '{n} zones chauffent', '{n} zone chauffe',
    '{p} % — ni ouvert ni fermé', 'Lecteurs, appareils, chauffage et volets', '{n} EN COURS', '1 EN COURS', 'RIEN EN COURS', 'Rien ne tourne pour le moment.', '{n} autres', 'Tout est dans Objets', '{n} en cours']
    .forEach(k => assert.ok(en.includes("  '" + k + "':"), k + ' manque dans en.js'));
});
