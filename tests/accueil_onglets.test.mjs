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
  assert.ok(src.includes("const ACC_MAIN = ['favoris', 'scenes', 'pieces', 'cameras'];"), 'la colonne principale');
  // « A surveiller » (ADR 0028) ouvre le rail depuis le 16/09 (retour user) : la carte n'existe que quand il y a des points.
  assert.ok(src.includes("const ACC_RAIL = ['attention', 'heure', 'meteo', 'co2', 'moment', 'rappels', 'agenda'];"), 'le rail');
  assert.ok(src.includes("const ACC_RENOMME = { etats: 'moment' };"), 'En cours devient En ce moment');
  assert.ok(!src.includes("'heros'") && !src.includes('function HeroSlider(') && !src.includes('heroIds'), 'la glissiere du heros a disparu');
  const o = bloc('  const ordreDe = (zone) => {', NL + '  };');
  assert.ok(o.includes('.map(s => ACC_RENOMME[s] || s)'), 'un ordre enregistre est traduit');
  assert.ok(o.includes("const tete = (zone === 'main' ? [] : ['attention', 'meteo']).filter(s => manquants.indexOf(s) >= 0);") && o.includes("return [...tete, ...sauve, ...manquants.filter(s => tete.indexOf(s) < 0)];"), 'Securite en tete de la colonne, « A surveiller » en tete du rail, sur un accueil deja range');
  assert.ok(home.includes('(grille.caches || []).map(s => ACC_RENOMME[s] || s).indexOf(id) >= 0);'), 'un masquage enregistre suit le nouveau nom (un widget en option, lui, se lit dans `ajoutees` — ADR 0041)');
});

test('plus de carte Securite sur l’Accueil : la banniere mene a la vue (ADR 0035)', () => {
  assert.ok(!home.includes('<RailArm') && !home.includes('<RailSerrure') && !home.includes('carteSecurite'), 'la carte, ses boutons et la serrure ont disparu');
  assert.ok(home.includes('key="al"') && home.includes("al: () => onNav && onNav('securite'),"), 'la tuile Alarme, d’un tap vers la vue');
  assert.ok(!home.includes('Désactivé') && !home.includes('Partiel'), 'pas le selecteur de la maquette');
});

test('En ce moment : une ligne par chose qui tourne, avec son geste, et rien d’invente', () => {
  // ASSERTION MODIFIÉE (chantier Médias, tâche 9 ; M13, M14, M16) : un lecteur se lit avec son jumeau (`lireLecteur`), et « Mettre en pause » envoie `media_pause` à l'entité qui commande — jamais `media_play_pause`.
  assert.ok(home.includes('const l = lireLecteur(S0, m); if (l.indispo || !l.playing) return;') && home.includes("commande(l.ctl, 'media_player', 'media_pause')") && !home.includes("'media_play_pause'"), 'un lecteur en lecture, et sa pause — explicite');
  assert.ok(home.includes("if (dom !== 'vacuum' && dom !== 'lawn_mower') return;") && home.includes('const test = APPAREIL_ACTIF[dom]; if (!test || !test(e.state)) return;'), 'un appareil en marche : la regle de la banniere');
  assert.ok(home.includes("commande(id, 'vacuum', 'return_to_base')") && home.includes("commande(id, 'lawn_mower', 'dock')"), 'dock et arret : les gestes qui existent');
  assert.ok(home.includes('if (mLv && mLv.active && (!a || aEnt(notifIds().dishwasher)))'), 'le lave-vaisselle seulement en cours');
  /* ASSERTION MODIFIÉE (tâche 12 du chantier Chauffage — la même que dans
   * tests/accueil_essentiel.test.mjs) : « les zones qui chauffent vraiment »
   * se comptent par LA règle des cartes (`zonesQuiChauffent` : un module à
   * plus de 10 W, un thermostat qui chauffe — jamais le froid d'un
   * climatiseur), sans les chauffages au planning allumé. L'ancienne
   * condition comptait le chaud ET le froid des seuls `climate`. */
  assert.ok(home.includes('const chauffe = zonesQuiChauffent(S0, etatCh);') && !home.includes("['heating', 'cooling']"), 'les zones qui chauffent vraiment');
  /* ASSERTION MODIFIÉE (19/10) : le mouvement se lit aussi dans la course jouée, et Stop — s'il le sait (`gestesCover`) — fige
   * la course là où elle est (`ordreEtArret`), qu'un refus de Home Assistant oublie. */
  assert.ok(home.includes('if (!sens) return;') && home.includes('ordreEtArret(c.haid, e, envoyerGeste(dashHass, c.haid, stop))'), 'un volet en mouvement, et son stop');
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
  assert.ok(home.includes('if (!wide) return <OngletsAccueil maison={renduMain} moment={renduRail} edit={editMode} demande={pageDemandee} onDemande={() => setPageDemandee(null)} />;'), 'le mobile et la tablette passent par les deux pages (et la banniere peut demander la seconde)');
  assert.ok(home.includes("gridTemplateColumns: wideXL ? '1fr 330px' : '1fr 276px'"), 'le PC garde ses deux colonnes');
});

test('l’accueil surveille ce qu’En ce moment montre et commande', () => {
  const k = bloc('  const accueilKeys = [', '];');
  ['media_player.', 'climate.', 'cover.', 'vacuum.', 'fan.', 'humidifier.', 'valve.'].forEach(d => assert.ok(k.includes("'" + d + "'"), d));
});
