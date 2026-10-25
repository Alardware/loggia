/* Ce qu'est une lumière, sa teinte, sa phrase (chantier Lumières, § 4, § 5 ;
 * L5, L6, L11) : src/lumieres.js, pur.
 *
 * À l'heure de Paris, en français : la phrase dit l'heure du navigateur. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contraste, lireCouleur, composer } from '../src/contraste.js';
import { THEMES, fondGlyphe, fondRepere, fondPhrase, teinteDe } from './jetons_loggia.mjs';

process.env.TZ = 'Europe/Paris';
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const L = await import('../src/lumieres.js');

const T = Date.parse('2026-10-14T20:40:00+02:00');   // mercredi 14 octobre, 20:40 à la maison
const ETAT = (state, changement = '2026-10-14T18:05:00+02:00', attributes = {}) => ({ state, last_changed: changement, attributes });

test('L11 : une lumière de la maison est un light sans catégorie, ou un switch déclaré lumière', () => {
  assert.equal(L.estLumiere('light.bureau'), true);
  assert.equal(L.estLumiere('light.u6_lr_led', { categorie: 'config' }), false, 'la LED d’une borne Wi-Fi n’est pas une lumière de la maison');
  assert.equal(L.estLumiere('light.x', { categorie: 'diagnostic' }), false);
  assert.equal(L.estLumiere('switch.lumiere_exterieur', { switchsLumiere: ['switch.lumiere_exterieur'] }), true, 'un switch déclaré lumière garde sa place');
  assert.equal(L.estLumiere('switch.prise_nas', { switchsLumiere: ['switch.lumiere_exterieur'] }), false);
  assert.equal(L.estLumiere('fan.vmc'), false);
  assert.equal(L.estLumiere(null), false, 'rien ne casse sans identifiant');
});

/* ASSERTIONS MODIFIÉES (audit du 19/10, seconde tranche ; B6, B8) : une quatrième capacité, `blanc` (le mode `white`) ; une
 * `rgbww` sans `color_temp` a des blancs (Home Assistant convertit `color_temp_kelvin`) ; et `variable` dit la même chose que
 * `planAction` — un `brightness` sans mode qui varie n'en fait pas une lampe variable, l'ordre serait refusé. */
test('ce que la lampe sait faire : varier, des blancs, des couleurs, le blanc du mode `white` — un switch-lumière rien de tout cela', () => {
  const cap = (variable, blancs, couleurs, blanc = false) => ({ variable, blancs, couleurs, blanc });
  assert.deepEqual(L.capacitesLumiere('light.a', { supported_color_modes: ['brightness'] }), cap(true, false, false));
  assert.deepEqual(L.capacitesLumiere('light.a', { supported_color_modes: ['color_temp'] }), cap(true, true, false));
  assert.deepEqual(L.capacitesLumiere('light.a', { supported_color_modes: ['color_temp', 'xy'] }), cap(true, true, true));
  assert.deepEqual(L.capacitesLumiere('light.a', { supported_color_modes: ['onoff'] }), cap(false, false, false));
  assert.deepEqual(L.capacitesLumiere('switch.a', { supported_color_modes: ['brightness'] }), cap(false, false, false));
  assert.deepEqual(L.capacitesLumiere('light.a', null), cap(false, false, false));
  // B6 : un ruban `hs + white` revient au blanc ; une `rgbww` sans `color_temp` montre les blancs.
  assert.deepEqual(L.capacitesLumiere('light.a', { supported_color_modes: ['hs', 'white'] }), cap(true, false, true, true));
  assert.deepEqual(L.capacitesLumiere('light.a', { supported_color_modes: ['rgbww'] }), cap(true, true, true));
  // B8 : `planAction` refuse `set_brightness` à une lampe sans mode qui varie — pas de barre pour elle.
  assert.deepEqual(L.capacitesLumiere('light.a', { supported_color_modes: ['onoff'], brightness: 200 }), cap(false, false, false));
  assert.deepEqual(L.capacitesLumiere('light.a', { brightness: 200 }), cap(false, false, false));
  assert.deepEqual(L.capacitesLumiere('light.a', { supported_color_modes: ['white'] }), cap(true, false, false, true));
});

test('B7 : les anciens attributs en mireds — `color_temp`, `min_mireds`, `max_mireds` — se lisent en kelvins (K = 1 000 000 / mireds)', () => {
  assert.equal(L.kelvinDe({ color_temp_kelvin: 2700, color_temp: 500 }), 2700, 'les kelvins d’abord');
  assert.equal(L.kelvinDe({ color_temp: 370 }), 2703);
  assert.equal(L.kelvinDe({ color_temp: 0 }), null);
  assert.equal(L.kelvinDe({}), null);
  assert.deepEqual(L.teinteLumiere({ color_mode: 'color_temp', color_temp: 250 }), L.rgbDuBlanc(4000), 'un blanc en mireds prend sa couleur');
});

test('B1 : la saturation — sous 20 %, une lampe en mode couleur est blanche ; éteinte, sa plaque reprend sa VRAIE saturation', () => {
  assert.equal(L.SEUIL_BLANC, 20);
  assert.ok(L.estBlanche([30, 12]) && L.estBlanche([30, 19.9]) && !L.estBlanche([30, 20]) && !L.estBlanche([30, 100]));
  assert.ok(!L.estBlanche(null) && !L.estBlanche([30]), 'sans saturation lue : une couleur');
  assert.deepEqual(L.rgbDeHs(275, 100), [149, 0, 255], 'la conversion de Home Assistant (HSV, V = 1) : la couleur qu’elle avait allumée');
  assert.deepEqual(L.rgbDeHs(30, 12), [255, 240, 224], 'un pastel reste un pastel');
  assert.deepEqual(L.rgbDeHs(30, 0), [255, 255, 255]);
  assert.deepEqual(L.teinteLumiere(null, { mode: 'xy', hs: [30, 12] }), [255, 240, 224], 'éteinte, la plaque ne sature plus un pastel');
});

test('L6 : la couleur d’un blanc, la table de sa maquette, interpolée, bornée à ses bords', () => {
  assert.deepEqual(L.rgbDuBlanc(2200), [255, 147, 44]);
  assert.deepEqual(L.rgbDuBlanc(2700), [255, 169, 87]);
  assert.deepEqual(L.rgbDuBlanc(6500), [255, 249, 253]);
  assert.deepEqual(L.rgbDuBlanc(2450), [255, 158, 66], 'à mi-chemin de 2 200 et 2 700 K');
  assert.deepEqual(L.rgbDuBlanc(2000), [255, 147, 44], 'au-dessous, la valeur du bord');
  assert.deepEqual(L.rgbDuBlanc(6535), [255, 249, 253], 'au-dessus aussi');
});

test('L6 : la couleur d’une teinte, comme sa maquette la peint', () => {
  assert.deepEqual(L.rgbDeLaTeinte(275), [171, 81, 236], 'le violet de la veilleuse');
  assert.deepEqual(L.rgbDeLaTeinte(0), [236, 81, 81]);
  assert.deepEqual(L.rgbDeLaTeinte(360), L.rgbDeLaTeinte(0), 'le tour du cercle');
  assert.deepEqual(L.rgbDeLaTeinte(-85), L.rgbDeLaTeinte(275));
});

test('§ 5 : la teinte de la vraie lumière — un blanc par la table, une couleur par son rgb_color, sinon l’or', () => {
  assert.deepEqual(L.teinteLumiere({ color_mode: 'color_temp', color_temp_kelvin: 2700, rgb_color: [255, 167, 87] }), [255, 169, 87], 'le blanc se lit dans la table, pas dans le rgb_color que Home Assistant en tire');
  assert.deepEqual(L.teinteLumiere({ color_mode: 'xy', rgb_color: [149, 0, 255] }), [149, 0, 255]);
  assert.deepEqual(L.teinteLumiere({ color_mode: 'hs', rgb_color: [255.4, -3, 300] }), [255, 0, 255], 'bornée, arrondie');
  assert.equal(L.teinteLumiere({ color_mode: 'brightness', brightness: 200 }), null, 'un variateur : l’or');
  assert.equal(L.teinteLumiere({ color_mode: 'onoff' }), null, 'tout ou rien : l’or');
  assert.equal(L.teinteLumiere({ color_mode: 'white', brightness: 200 }), null, 'un blanc sans température : l’or');
  assert.equal(L.teinteLumiere({ color_mode: 'brightness' }, { mode: 'color_temp', kelvin: 2700 }), null, 'allumée, la mémoire ne compte pas');
  assert.equal(L.teinteLumiere({}), null, 'éteinte, sans mémoire : l’or');
  assert.deepEqual(L.teinteLumiere({}, { mode: 'color_temp', kelvin: 4000 }), [255, 209, 163], 'éteinte : la teinte qu’elle reprendra');
  // ASSERTION MODIFIÉE (seconde tranche, B1) : la vraie saturation, par la conversion de Home Assistant — plus la saturation 0,8 forcée des puces.
  assert.deepEqual(L.teinteLumiere(null, { mode: 'xy', hs: [275, 100] }), [149, 0, 255]);
});

test('L6 : les couleurs d’une lampe — le lavis, la couleur pleine, le dégradé de sa barre ; l’or en jetons', () => {
  assert.deepEqual(L.couleursLumiere(null), { rgb: 'var(--o-lampe-rgb)', col: 'var(--o-lampe)', degrade: 'linear-gradient(90deg,var(--o-lampe),var(--o-lampe-b))' });
  assert.deepEqual(L.couleursLumiere([255, 169, 87]), { rgb: '255,169,87', col: 'rgb(255,169,87)', degrade: 'linear-gradient(90deg,rgb(255,208,163),rgb(255,169,87))' });
  assert.deepEqual(L.lavisLumiere(100), { haut: 0.22, bas: 0.03 });
  assert.deepEqual(L.lavisLumiere(45), { haut: 0.143, bas: 0.03 });
  assert.deepEqual(L.lavisLumiere(null), { haut: 0.22, bas: 0.03 }, 'tout ou rien : comme à 100 %');
});

test('§ 4 : « depuis » — l’heure aujourd’hui, « hier » la veille, la date au-delà', () => {
  assert.equal(L.quandLumiere('2026-10-14T18:05:00+02:00', T), '18:05');
  assert.equal(L.quandLumiere('2026-10-13T23:50:00+02:00', T), 'hier');
  assert.equal(L.quandLumiere('2026-10-02T09:00:00+02:00', T), 'le 2 oct.');
  assert.equal(L.quandLumiere(null, T), null);
});

test('§ 4 : la phrase d’état, la première ligne qui s’applique', () => {
  const ph = (st, fin = null) => L.phraseLumiere({ st, fin, maintenant: T });
  assert.deepEqual(ph(ETAT('unavailable', '2026-10-14T14:20:00+02:00')), { texte: 'Indisponible depuis 14:20', panne: true, on: false });
  assert.deepEqual(ph(ETAT('unknown', '2026-10-14T14:20:00+02:00')), { texte: 'Indisponible depuis 14:20', panne: true, on: false }, 'un état inconnu ne se dit pas éteint');
  assert.deepEqual(ph(null), { texte: 'Indisponible', panne: true, on: false }, 'une entité absente');
  const fin = Date.parse('2026-10-14T21:10:00+02:00');
  assert.deepEqual(ph(ETAT('on'), fin), { texte: 'S’éteint à 21:10', panne: false, on: true });
  assert.deepEqual(ph(ETAT('on'), T - 1000), { texte: 'Allumée depuis 18:05', panne: false, on: true }, 'un minuteur passé ne dit plus rien');
  assert.deepEqual(ph(ETAT('on', '2026-10-13T22:00:00+02:00')), { texte: 'Allumée depuis hier', panne: false, on: true });
  assert.deepEqual(ph(ETAT('off'), fin), { texte: 'Éteinte', panne: false, on: false }, 'éteinte, le minuteur ne compte plus');
});

test('la luminosité en pourcent', () => {
  assert.equal(L.luminosite({ brightness: 255 }), 100);
  assert.equal(L.luminosite({ brightness: 115 }), 45);
  assert.equal(L.luminosite({ brightness: 1 }), 1, 'allumée, jamais 0 %');
  assert.equal(L.luminosite({}), null);
});

/* ── Passe de finition 9 bis A, point 1 : l'encre d'une ampoule blanche ───────────
 *
 * `lisibleSurLavis` assombrit en gardant la teinte ET la saturation. Un blanc froid
 * est légèrement rosé — à 100 % de saturation, en HSL — : assombri pour se lire sur
 * un lavis clair, il virait au rouge ou au magenta (#d81400 à 6 200 K, #d2008c à
 * 6 500 K). L'encre se tire donc du blanc de 4 000 K au plus froid, un crème qui
 * s'assombrit en brun ; et elle se lit contre le fond VRAI, celui de la teinte vraie :
 * la plaque (0,22) posée sur le lavis de la carte (0,22 en haut). */
const BLANC = (k) => ({ color_mode: 'color_temp', color_temp_kelvin: k });
const COULEUR = (rgb) => ({ color_mode: 'xy', rgb_color: rgb });
const CAS_ENCRE = [['2 200 K', BLANC(2200)], ['2 700 K', BLANC(2700)], ['4 000 K', BLANC(4000)], ['6 500 K', BLANC(6500)], ['rouge', COULEUR([255, 0, 0])], ['bleu', COULEUR([0, 0, 255])]];

test('9 bis A, point 1 : la base de l’encre — un blanc froid prend le blanc de 4 000 K, le reste ne bouge pas', () => {
  assert.deepEqual(L.teinteLumiere(BLANC(6500), null, 4000), [255, 209, 163], 'à 6 500 K : le blanc de 4 000 K');
  assert.deepEqual(L.teinteLumiere(BLANC(5000), null, 4000), [255, 209, 163]);
  assert.deepEqual(L.teinteLumiere(BLANC(4000), null, 4000), [255, 209, 163], 'à 4 000 K : lui-même');
  assert.deepEqual(L.teinteLumiere(BLANC(2700), null, 4000), [255, 169, 87], 'un blanc chaud : la teinte vraie');
  assert.deepEqual(L.teinteLumiere(BLANC(6500)), [255, 249, 253], 'sans plafond : la teinte vraie, comme avant');
  assert.deepEqual(L.teinteLumiere({}, { mode: 'color_temp', kelvin: 6500 }, 4000), [255, 209, 163], 'éteinte : le blanc qu’elle reprendra, plafonné de même');
  assert.deepEqual(L.teinteLumiere(COULEUR([0, 0, 255]), null, 4000), [0, 0, 255], 'une couleur n’est pas un blanc : elle ne bouge pas');
  assert.equal(L.teinteLumiere({ color_mode: 'brightness' }, null, 4000), null, 'un variateur : l’or, toujours');
});

test('9 bis A, point 1 : en thème clair, l’encre d’un blanc froid ne vire ni au rouge ni au magenta — un brun orangé', () => {
  for (const k of [4000, 4500, 5000, 6200, 6500, 6535]) {
    const { encre } = L.encreLumiere(BLANC(k), null, { clair: true });
    const h = teinteDe(lireCouleur(encre));
    assert.ok(h >= 20 && h <= 45, k + ' K : l’encre ' + encre + ' est à ' + h + '° — attendu un brun orangé (20 à 45°), pas le rouge ni le magenta des blancs rosés');
  }
  /* Sans le plafond, c'était le défaut mesuré : 6 500 K → #d2008c (320°). */
  assert.ok(teinteDe(lireCouleur(L.encreLumiere(BLANC(6500), null, { clair: false }).encre)) <= 45, 'en thème sombre aussi : un crème, pas un rose');
});

test('9 bis A, point 1 : la glyphe et le repère se lisent sur le VRAI fond — au moins 3:1, sombre et clair, de 2 200 à 6 500 K et pour une couleur saturée', () => {
  for (const [nomT, T] of Object.entries(THEMES)) {
    for (const [nom, a] of CAS_ENCRE) {
      /* ASSERTION MODIFIÉE (chantier Lumières, 11 bis, R7) : le fond de la glyphe est la teinte qui PEINT la carte (`teinteDeCarte`) — la teinte vraie, et en
       * thème clair un blanc plafonné à 4 000 K : un blanc froid, posé à .22 sur la carte claire, ne se voyait pas. Le test prenait toujours la teinte vraie. */
      const vrai = L.teinteDeCarte(a, null, T.clair);
      const encre = lireCouleur(L.encreLumiere(a, null, { clair: T.clair }).encre).slice(0, 3);
      const glyphe = contraste(encre, fondGlyphe(T, vrai)), repere = contraste(encre, fondRepere(T, vrai));
      /* 3:1 est le seuil d'une glyphe et d'un repère (WCAG 1.4.11) ; la garde vise 4,5:1 contre un fond un peu plus sombre que le vrai, et en tient 4,2 contre le
       * vrai (`SEUILS.surLavisVif`) : calculée à 0,22 seul, sans la plaque, elle laissait un rouge ou un bleu saturé à 3,4 – 3,8:1. */
      assert.ok(glyphe >= 4.2, nomT + ', ' + nom + ' : la glyphe à ' + glyphe.toFixed(2) + ':1 sur la plaque posée sur le lavis');
      assert.ok(repere >= 3, nomT + ', ' + nom + ' : le repère à ' + repere.toFixed(2) + ':1 sur la piste');
    }
  }
});

test('9 bis A, point 1 : la barre — la teinte vraie en thème sombre, l’encre gardée en thème clair ; l’or en jetons', () => {
  const vraie = L.teinteLumiere(BLANC(6500));
  assert.equal(L.encreLumiere(BLANC(6500), null, { clair: false }).degrade, L.couleursLumiere(vraie).degrade, 'sombre : le dégradé de la teinte vraie, comme avant');
  for (const [nom, a] of CAS_ENCRE) {
    const clair = L.encreLumiere(a, null, { clair: true });
    assert.equal(clair.degrade, L.couleursLumiere(lireCouleur(clair.encre).slice(0, 3)).degrade, nom + ' : peinte depuis l’encre gardée');
    // Le bout plein du remplissage est l'encre : il se voit sur la piste claire (la teinte vraie d'un blanc, à 1,1:1, ne s'y voyait pas).
    // ASSERTION MODIFIÉE (chantier Lumières, 11 bis, R7) : le fond du repère est peint de la teinte de la carte (`teinteDeCarte`, plafonnée à 4 000 K en thème clair), non de la teinte vraie.
    assert.ok(contraste(lireCouleur(clair.encre).slice(0, 3), fondRepere(THEMES.clair, L.teinteDeCarte(a, null, true))) >= 3, nom + ' : le remplissage se voit sur la piste');
  }
  assert.ok(contraste(L.teinteLumiere(BLANC(6500)), fondRepere(THEMES.clair, vraie)) < 1.5, 'le défaut mesuré : la teinte vraie d’un blanc froid, sur la piste claire, à ' + contraste(vraie, fondRepere(THEMES.clair, vraie)).toFixed(2) + ':1');
  assert.deepEqual(L.encreLumiere({ color_mode: 'brightness' }, null, { clair: true }), { encre: 'var(--o-lampe)', degrade: 'linear-gradient(90deg,var(--o-lampe),var(--o-lampe-b))' }, 'l’or est un jeton, déjà gardé par le thème');
  assert.deepEqual(L.encreLumiere(null, null, { clair: false }), { encre: 'var(--o-lampe)', degrade: 'linear-gradient(90deg,var(--o-lampe),var(--o-lampe-b))' }, 'éteinte, rien : l’or');
});

test('9 bis A, point 1 : un lavis plus dense (réglage « Pleine ») rend l’encre plus franche, jamais moins', () => {
  const T = THEMES.sombre, a = BLANC(2700);
  const douce = lireCouleur(L.encreLumiere(a, null, { clair: false, lavis: 0.22 }).encre).slice(0, 3);
  const pleine = lireCouleur(L.encreLumiere(a, null, { clair: false, lavis: 0.418 }).encre).slice(0, 3);
  const vrai = L.teinteLumiere(a);
  assert.ok(contraste(pleine, fondGlyphe(T, vrai, 0.418)) >= 3, 'tenue contre le lavis de « Pleine »');
  assert.ok(contraste(pleine, fondGlyphe(T, vrai, 0.418)) > contraste(douce, fondGlyphe(T, vrai, 0.418)), 'l’encre de « Douce » y serait moins lisible');
});

test('L11 : les compteurs comptent les lumières de la maison — pas la LED d’une borne Wi-Fi', () => {
  const S = { 'light.bureau': {}, 'light.led_borne': {}, 'switch.lumiere_exterieur': {}, 'switch.nas': {}, 'fan.vmc': {} };
  const meta = new Map([['light.led_borne', { category: 'config' }]]);
  assert.deepEqual(L.lumieresDe(S, { meta, switchsLumiere: ['switch.lumiere_exterieur'] }), ['light.bureau', 'switch.lumiere_exterieur'], 'un light sans catégorie, un switch déclaré — la règle d’Objets › Lumières');
  assert.deepEqual(L.lumieresDe(S), ['light.bureau', 'light.led_borne'], 'avant que l’index ne dise les catégories : tout light.*, aucun switch');
  assert.deepEqual(L.lumieresDe(S, { meta, ids: ['light.led_borne', 'light.bureau', 'switch.nas'] }), ['light.bureau'], 'parmi une liste donnée');
  assert.deepEqual(L.lumieresDe(null), [], 'rien ne casse sans relevé');
  assert.deepEqual(L.lumieresDe(S, { meta: {} }), ['light.bureau', 'light.led_borne'], 'une méta qui n’est pas une Map ne casse pas');
});

/* ── Passe de finition 11 bis, R7 : le thème clair et les blancs ─────────────────────────────────────
 *
 * En thème clair (`&mode=light`), la plaque (`rgba(teinte, .22)`) et le lavis (de .22 en haut à .03 en bas) d'une ampoule en BLANC FROID
 * étaient la teinte vraie — à 6 500 K, `[255, 249, 253]`, presque blanche — posée sur une carte presque blanche : lavis à 1,003:1,
 * plaque à 1,006:1. La carte d'une lampe allumée était « toute blanche » : on ne la voyait plus allumée. La teinte qui peint la plaque
 * et le lavis (`teinteDeCarte`) est donc, en thème clair, celle de l'encre : le blanc plafonné à 4 000 K, un crème orangé qui se voit.
 * Une couleur, l'or de la maison et le thème sombre ne bougent pas. */
test('11 bis, R7 : `teinteDeCarte` — la teinte vraie ; en thème clair un blanc plafonné à 4 000 K ; une couleur, l’or, l’éteinte et le thème sombre ne bougent pas', () => {
  // Thème sombre : la teinte vraie, comme avant — par défaut aussi.
  assert.deepEqual(L.teinteDeCarte(BLANC(6500), null, false), [255, 249, 253]);
  assert.deepEqual(L.teinteDeCarte(BLANC(6500)), [255, 249, 253], 'sans thème dit : le sombre, la teinte vraie');
  assert.deepEqual(L.teinteDeCarte(BLANC(2200), null, false), [255, 147, 44]);
  // Thème clair : le blanc de l'encre, `rgbDuBlanc(Math.min(k, 4000))`.
  for (const k of [2200, 2700, 3500, 4000, 4500, 5000, 6200, 6500, 6535]) {
    assert.deepEqual(L.teinteDeCarte(BLANC(k), null, true), L.rgbDuBlanc(Math.min(k, 4000)), k + ' K : le blanc de ' + Math.min(k, 4000) + ' K');
  }
  assert.deepEqual(L.teinteDeCarte(BLANC(6500), null, true), [255, 209, 163], 'à 6 500 K : le crème de 4 000 K, qui se voit');
  assert.deepEqual(L.teinteDeCarte(BLANC(2700), null, true), [255, 169, 87], 'un blanc chaud : la teinte vraie');
  // Ce qui ne bouge pas.
  assert.deepEqual(L.teinteDeCarte(COULEUR([0, 0, 255]), null, true), [0, 0, 255], 'une couleur n’est pas un blanc');
  assert.deepEqual(L.teinteDeCarte(COULEUR([255, 0, 0]), null, false), [255, 0, 0]);
  assert.equal(L.teinteDeCarte({ color_mode: 'brightness' }, null, true), null, 'un variateur : l’or, un jeton déjà gardé par le thème');
  assert.deepEqual(L.teinteDeCarte({}, { mode: 'color_temp', kelvin: 6500 }, true), [255, 209, 163], 'éteinte : le blanc qu’elle reprendra, plafonné de même');
  assert.deepEqual(L.teinteDeCarte({}, { mode: 'color_temp', kelvin: 6500 }, false), [255, 249, 253]);
  assert.equal(L.teinteDeCarte(null, null, true), null);
});

test('11 bis, R7 : en thème clair, la plaque et le lavis d’une ampoule froide se VOIENT sur la carte — autant que ceux d’un blanc de 4 000 K ; le blanc vrai ne s’y voyait pas', () => {
  const T = THEMES.clair;
  const neutre = T.haut;                               // le haut d'une carte éteinte
  const ecart = (teinte) => ({ lavis: contraste(composer(T.haut, [...teinte, 0.22]), neutre), plaque: contraste(fondGlyphe(T, teinte), neutre) });
  const plancher = ecart(L.rgbDuBlanc(4000));          // ce que le blanc de 4 000 K donne déjà : le lavis à 1,066:1, la plaque à 1,121:1
  for (const k of [4000, 4500, 5000, 6200, 6500, 6535]) {
    const e = ecart(L.teinteDeCarte(BLANC(k), null, true));
    assert.ok(e.lavis >= 1.05, k + ' K : le lavis se distingue de la carte (' + e.lavis.toFixed(3) + ':1)');
    assert.ok(e.plaque >= 1.1, k + ' K : la plaque se distingue de la carte (' + e.plaque.toFixed(3) + ':1)');
    assert.ok(e.lavis >= plancher.lavis - 1e-9 && e.plaque >= plancher.plaque - 1e-9, k + ' K : au moins le blanc de 4 000 K');
  }
  // Le défaut mesuré : la teinte vraie d'un blanc de 6 500 K, sur la carte claire — une carte toute blanche.
  const vrai = ecart(L.teinteLumiere(BLANC(6500)));
  assert.ok(vrai.lavis < 1.01 && vrai.plaque < 1.02, 'le blanc vrai : lavis ' + vrai.lavis.toFixed(3) + ':1, plaque ' + vrai.plaque.toFixed(3) + ':1 — on ne la voit pas allumée');
  // Et le sombre ne change pas : sa teinte vraie se voit sur une carte sombre.
  const sombre = THEMES.sombre;
  assert.ok(contraste(composer(sombre.haut, [...L.teinteDeCarte(BLANC(6500), null, false), 0.22]), sombre.haut) > 1.2, 'en thème sombre le blanc vrai éclaire la carte');
});

test('11 bis, R7 : la glyphe et le repère gardent leurs 3:1 contre le fond que la carte peint — à 2 200, 2 700, 4 000 et 6 500 K, thème clair et sombre (la glyphe à 4,2:1 au moins)', () => {
  for (const [nomT, T] of Object.entries(THEMES)) {
    for (const k of [2200, 2700, 4000, 6500]) {
      const a = BLANC(k);
      const peinte = L.teinteDeCarte(a, null, T.clair);
      const encre = lireCouleur(L.encreLumiere(a, null, { clair: T.clair }).encre).slice(0, 3);
      const glyphe = contraste(encre, fondGlyphe(T, peinte)), repere = contraste(encre, fondRepere(T, peinte));
      assert.ok(glyphe >= 4.2, nomT + ' ' + k + ' K : la glyphe à ' + glyphe.toFixed(2) + ':1');
      assert.ok(repere >= 3, nomT + ' ' + k + ' K : le repère à ' + repere.toFixed(2) + ':1');
    }
  }
});

/* ── Passe téléphone, tâche 3 : la phrase à l'encre (T8 ; ADR 0202) ─────────────────────────────────────────────
 *
 * Sur la carte étroite, une lampe allumée écrit sa phrase à son encre — l'« ambre » de 1c. L'encre a été calculée pour
 * une GLYPHE, sur la plaque posée sur le lavis (4,2:1 au moins contre le vrai fond) ; la phrase est du TEXTE de 10,5 à
 * 12 px, posé sur le lavis seul, sans plaque : il lui faut 4,5:1 (WCAG 1.4.3). Le lavis y est pris à son plus dense, en
 * haut de la carte (`fondPhrase`) — la phrase est plus bas, où il est plus léger —, et au pied, où il tombe à 0,03. */
test('T8 : la carte étroite écrit la phrase d’une lampe allumée à son encre — et cette encre se lit comme du TEXTE sur le lavis : 4,5:1 au moins, sombre et clair, de 2 200 à 6 500 K, une couleur saturée, le violet de la veilleuse', () => {
  // L'encre de la phrase est celle de la plaque, calculée ici (`encreLumiere`) — pas une teinte brute : la carte la passe à la feuille (`--o-encre`).
  const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(APP.includes("'--o-encre': v.on ? v.encre : undefined"), 'la phrase étroite d’une lampe allumée prend l’encre de la vue (`v.encre`)');
  for (const [nomT, T] of Object.entries(THEMES)) {
    for (const [nom, a] of [...CAS_ENCRE, ['violet', COULEUR([149, 0, 255])]]) {
      const peinte = L.teinteDeCarte(a, null, T.clair);
      const encre = lireCouleur(L.encreLumiere(a, null, { clair: T.clair }).encre).slice(0, 3);
      const haut = contraste(encre, fondPhrase(T, peinte)), bas = contraste(encre, composer(T.bas, [...peinte, 0.03]));
      assert.ok(haut >= 4.5, nomT + ', ' + nom + ' : la phrase à ' + haut.toFixed(2) + ':1 sur le lavis le plus dense');
      assert.ok(bas >= 4.5, nomT + ', ' + nom + ' : la phrase à ' + bas.toFixed(2) + ':1 au pied');
    }
  }
  // L'or de la maison (une lampe qui ne fait que varier, un switch-lumière) est un jeton : sur une carte teintée, sa variante « sur lavis », que la garde tient à 4,5:1.
  assert.equal(L.encreLumiere({ color_mode: 'brightness' }, null, { clair: false }).encre, 'var(--o-lampe)');
});
