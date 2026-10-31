/* Les pièces d'une carte au gabarit : la bascule, la jauge, les chiffres, les ouvrants, les piles, le glyphe.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useRef, useEffect } from 'react';
import { kbSlider, Fi } from '../ui.jsx';
import { glyphePile } from '../piles.js';
import { motsSurete, couleurPile } from '../attention.js';
import { CARTE_MAISON, ICONE_CARTE, NOM_CARTE, SOUS_CARTE } from '../styles.js';
import { Ico } from '../icones.jsx';
import { tr, trSens } from '../i18n.js';
import { iconeChoisie } from '../app/noyau.jsx';

/* Cartes de la vue Pièce — style Loggia, format de la maquette : tuiles de même hauteur,
   une seule grille, actions au pied de carte. Autonomes : pilotent une entité par son id. */
// SANS BORDURE (retour 31/08, toutes les cartes) : l'ombre et le lavis suffisent.
// Le gabarit vit dans `styles.js` (plan M1) ; l'animation, elle, est propre
// aux cartes de l'Accueil, qui changent d'etat sous les yeux.
const RM_CARD = { ...CARTE_MAISON, transition: 'all .3s' };
const RM_ICO = (bg, col) => ({ ...ICONE_CARTE, background: bg, color: col });
// `position: relative` sur CHAQUE bouton, jamais sur sa rangée (relecture du
// lot 13) : peint après la surface d'une carte (`Surface`, ui.jsx), il reçoit
// son clic, et ce qui l'entoure — l'écart de 8 px, un coin arrondi, la
// consigne entre − et + — retombe sur elle : un appui y ouvre la fiche, comme
// quand la carte était un bouton. Sans décalage, rien ne bouge à l'œil.
const RM_BTN = { position: 'relative', flex: 1, padding: '9px 6px', borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 12, cursor: 'pointer' };
const RM_NAME = NOM_CARTE;
const RM_SUB = SOUS_CARTE;
/* La rangée du milieu d'une carte qui porte un chiffre — la température d'un
 * radiateur, le pourcentage d'une lumière ou d'un volet : le nom et la phrase à
 * gauche, le chiffre à droite, aligné sur leur bas. Le chiffre se place à la
 * première rangée, deuxième colonne. Sur une carte étroite, la grille commune
 * (`o-gabarit`, index.css ; passe téléphone) tait ce chiffre — elle l'écrit en
 * haut — et la colonne du nom et de la phrase prend toute la largeur. */
const RM_MILIEU = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'end', marginTop: 'var(--o-milieu-haut, 14px)' };

/* LA TOUCHE D'UN BOUTON N'EST PAS CELLE DE SA CARTE (audit du 03/10).
 *
 * Une carte qui s'ouvre est un bouton : Entrée et Espace ouvrent sa fiche.
 * Mais la touche d'un bouton INTÉRIEUR — « Fermer » d'un volet, « Pause »
 * d'un lecteur, − / + d'un thermostat, « Renvoyer au dock » — remonte
 * jusqu'à elle. Ces boutons n'arrêtaient que le CLIC : au clavier, la carte
 * prenait la touche, appelait `preventDefault` — le bouton ne s'activait
 * donc plus — et ouvrait la fiche. À la souris tout marchait ; au clavier,
 * l'appareil ne recevait rien.
 *
 * D'où `if (e.target !== e.currentTarget) return;` en tête du gestionnaire
 * de toute carte qui contient un contrôle : le motif du mode édition
 * (ADR 0068). Une carte sans contrôle intérieur n'en a pas besoin — la
 * touche ne peut venir que d'elle. tests/clavier.test.mjs refuse l'oubli. */

/* ── Les pieces d'une carte au gabarit ──────────────────────────────────────
 *
 * Bascule et glissiere vivaient en copie dans chaque carte. Les maquettes du
 * 14/09 les dessinent partout pareil : une bascule rose en haut a droite, une
 * glissiere fine dont le remplissage EST la valeur, un curseur court juste
 * apres, un point au bout du rail. Une seule ecriture, donc. */
const RM_ROSE = 'var(--o-rose)';
/* `inerte` : la bascule reste dessinée, s'efface et ne répond plus — celle
 * d'une prise muette (chantier Prises, § 3.1). Elle garde son arrêt de
 * propagation : un appui sur elle n'ouvre pas la fiche non plus. `className` :
 * l'écriture où elle vit, quand une carte n'en montre qu'une (`o-seul-large`,
 * passe téléphone). */
function RmBascule({ on, nom, onToggle, couleur = RM_ROSE, inerte = false, className = undefined }) {
  return (
    <span className={className} role="switch" aria-checked={!!on} aria-disabled={inerte || undefined} tabIndex={0} aria-label={(on ? tr('Éteindre') : tr('Allumer')) + ' ' + nom}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!inerte) onToggle(e); } }}
      onClick={(e) => { e.stopPropagation(); if (!inerte) onToggle(e); }}
      style={{ width: 46, height: 26, borderRadius: 14, background: on ? couleur : 'rgba(150,162,184,.2)', position: 'relative', cursor: inerte ? 'default' : 'pointer', opacity: inerte ? .4 : 1, flexShrink: 0, display: 'inline-block', transition: 'background .25s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,.35)', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)' }} />
    </span>
  );
}

/* ── Les pièces de la carte étroite (passe téléphone, ADR 0202 ; index.css, « une grille commune ») ── */

/* La largeur du chiffre du haut, en em de sa taille, mesurée dans la démo (Manrope, 15/10) : un chiffre
 * tabulaire en 800 fait 0,6 em, la virgule et le point 0,3, le tiret 0,76 ; l'unité, écrite à 0,545 em,
 * « % » 0,9, « W » 0,98, « k » 0,54 — toute autre lettre compte pour la plus large ; le « ° », à 0,6 em,
 * 0,45. La feuille en tire la taille qui tient entre la plaque et le bord (`--o-em`).
 * Les chiffres d'une MESURE (chantier Capteurs, tâche 4 bis ; mesurés le 16/10, arrondis au-dessus) : l'espace
 * fine des milliers 0,17 (« 1 659 »), l'espace insécable 0,2 ; les lettres de leurs unités — « ppm », « lx »,
 * « dB », « °C », « µg/m³ », « km/h » —, de 0,3 (« l ») à 0,92 (« m »). */
const EM_CHIFFRE = { ',': .3, '.': .3, '−': .52, '-': .4, '—': .76, '\u202f': .17, '\u00a0': .2, ' ': .2 };
const EM_UNITE = { '%': .9, W: .98, k: .54, p: .63, m: .92, l: .3, x: .57, d: .63, B: .64, C: .75, F: .53, '°': .46, 'µ': .64, g: .63, '/': .44, '³': .41, h: .63 };
function emChiffre(v, u = null, degre = false) {
  const chiffres = [...String(v)].reduce((s, c) => s + (/\d/.test(c) ? .6 : EM_CHIFFRE[c] || .98), 0);
  const unite = degre ? .6 * .45 : [...String(u || '')].reduce((s, c) => s + (EM_UNITE[c] || .98), 0) * .545;
  return Math.round((chiffres + unite) * 1000) / 1000;
}
/* Le CHIFFRE du haut d'une carte étroite (T6) : celui de la carte d'un capteur (`RoomGenericCard`) — 22 px /
 * 800, l'unité en 12 px / 700 au gris doux, 4 px sous le haut de la plaque ; le « ° » d'une température en
 * haut, à 60 % (`TemperaturePiece`). Sa taille vit dans la feuille (`o-gab-chiffre`) : une valeur longue
 * rétrécit jusqu'à 16 px, jamais coupée. Il ne paraît que sur la carte étroite ; la carte large garde le sien,
 * en bas. Caché au lecteur d'écran quand la surface le dit déjà (`lu` faux) ; lu tel quel pour la
 * température d'un chauffage, comme celle de la carte large. */
function ChiffreHaut({ v, u = null, degre = false, couleur = 'var(--o-text)', lu = false, haut = 4 }) {
  // `haut` : sa marge sous le haut de la plaque — 4 px, sauf quand un nom vit dessous (`ChiffreNommeHaut`, passe bis IoT du 18/10, point 16).
  return (
    <span aria-hidden={lu ? undefined : 'true'} className="o-gab-chiffre o-seul-etroit"
      style={{ display: 'flex', alignItems: degre ? 'flex-start' : 'baseline', gap: u ? 3 : 0, marginTop: haut, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: couleur, '--o-em': emChiffre(v, u, degre) }}>
      <span style={{ letterSpacing: '-.02em' }}>{v}</span>
      {degre ? <span style={{ fontSize: '.6em', marginTop: '.08em' }}>°</span> : u ? <span style={{ fontSize: '.545em', fontWeight: 700, color: 'var(--o-text2)' }}>{u}</span> : null}
    </span>
  );
}
/* La PLAQUE d'une lumière est son interrupteur, sur la carte étroite seulement (T1, T12) : un vrai bouton
 * (`role="switch"`, `aria-checked`), nommé comme la bascule — « Allumer Plafonnier Bureau » —, qui n'ouvre pas la
 * fiche (`stopPropagation`) et passe au-dessus de la surface (positionné). Le bouton natif répond à Entrée et à
 * Espace : pas de `onKeyDown`. Muette, elle reste dessinée et ne répond plus : `aria-disabled`, et non `disabled`,
 * qui ferait tomber le focus. Au toucher elle se laisse traverser (`pointerEvents: 'none'`) : le toucher descend à la
 * surface de la carte, qui ouvre la fiche — comme avant que la plaque ne soit un bouton (correction bis, point 3) ; au
 * clavier, Entrée et Espace ne commandent rien. Sa zone de toucher fait 44 × 44 (`o-gab-plaque`, index.css), sans
 * l'allongement de ± 12 px des interrupteurs au téléphone : avec 10 px d'air sous la plaque, il mordrait sur le nom.
 * Elle ne contient que son glyphe. */
function PlaqueBascule({ on, nom, fond, encre, inerte = false, onToggle, children }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-disabled={inerte || undefined} aria-label={(on ? tr('Éteindre') : tr('Allumer')) + ' ' + nom}
      className="o-gab-plaque o-seul-etroit" onClick={(e) => { e.stopPropagation(); if (!inerte) onToggle(e); }}
      style={{ ...RM_ICO(fond, encre), position: 'relative', border: 'none', padding: 0, cursor: inerte ? 'default' : 'pointer', pointerEvents: inerte ? 'none' : undefined }}>{children}</button>
  );
}

/* La place du curseur et du point, hors remplissage : a 100 % le remplissage
 * s'arrete avant eux, comme sur la maquette. */
const RM_JAUGE_RESERVE = 26;
/* Une LUMIÈRE (chantier Lumières, L7) y passe quatre réglages de plus ; sans
 * eux, la jauge d'un volet ou d'un volume ne change pas :
 *  - `min` : la jauge va de `min` à 100 — 1 pour une lampe, qui ne s'éteint
 *    plus par sa jauge mais par sa bascule ;
 *  - `eteinte` (vrai ou faux pour une lampe ; null ailleurs) : éteinte, pas de
 *    remplissage, et le repère en gris au dernier niveau (`v`) — sans niveau
 *    connu, pas de repère ; glisser l'allume à ce niveau. Le point de la fin ne
 *    paraît que sous 95 %, comme sur sa maquette ;
 *  - `zone` : la hauteur où le doigt prend la jauge, la piste au milieu — 44 px
 *    sur une carte, 52 dans la fiche ;
 *  - `piste` : son épaisseur, 24 px — 32 dans la fiche ; le repère et le point
 *    grandissent avec elle.
 * Le MODE ENFANT (chantier Mode enfant, E7, E15 ; § 6.1) y passe deux réglages de plus :
 *  - `plafond` : la borne haute (null : aucune). Sous 100, la zone du plafond à la fin de la piste est HACHURÉE (le motif de sa
 *    maquette, dans les jetons du thème), un trait de 2 px marque le plafond, et un cadenas se pose au milieu de la zone quand elle
 *    est assez large (le plafond à 80 % ou moins) ; `aria-valuemax` vaut le plafond ; ni le doigt ni le clavier ne le dépassent.
 *    La VALEUR, elle, se dessine telle qu'elle est lue — au-delà du plafond s'il le faut : la maison ramène, la carte ne ment pas ;
 *  - `pas` : le pas du geste (1 par défaut ; 5 dans la feuille des réglages, le volume maximum de 10 à 100 par 5).
 * Et le CHIFFRE qui l'accompagne (passe bis 2 du chantier Mode enfant, 17/10 : « quand je règle le volume, le pourcentage ne suit pas
 * comme sur la maquette ») suit le doigt :
 *  - `onGlisse` (null : rien) : appelée avec la valeur sous le doigt — bornée, au pas, jamais au-delà du plafond — chaque fois qu'elle
 *    CHANGE pendant le geste, puis avec `null` quand le doigt s'en va : relâché, APRÈS `onCommit` (le geste d'abord est déjà posé, le
 *    chiffre ne repasse jamais par l'ancienne valeur), ou annulé. Elle ne commande rien : l'ordre part une fois, par `onCommit`, au
 *    relâcher. L'appelant garde la valeur dans un état et dessine son chiffre dessus ; la barre, elle, reste peinte à la main. */
function RmJauge({ v, couleur, grade = null, actif = true, label = '', onCommit, onGlisse = null, rafale = false, marge = 8, etat = null, min = 0, eteinte = null, zone = 0, piste = 24, plafond = null, pas = 1 }) {
  const val = v == null && eteinte != null ? null : Math.max(min, Math.min(100, Math.round(v || 0)));
  // La borne du geste : le plafond s'il y en a un, 100 sinon ; au pas demandé.
  const haut = plafond == null ? 100 : Math.max(min, Math.min(100, Math.round(plafond)));
  const borner = (x) => Math.max(min, Math.min(haut, Math.round(x / pas) * pas));
  const largeur = (x) => `calc((100% - ${RM_JAUGE_RESERVE}px) * ${x / 100})`;
  const gauche = (x) => `calc((100% - ${RM_JAUGE_RESERVE}px) * ${x / 100} + 6px)`;
  const grand = piste > 24;
  /* Le geste en cours (passe bis 3 du 17/10, point 1) : de quoi l'ARRÊTER, sans ordre. Une barre qui s'en va sous le doigt (une Echo
   * devenue indisponible : la carte retire son pied) ne reçoit jamais le relâcher — il tombe sur un élément détaché —, et `onGlisse(null)`
   * ne partait pas : la carte gardait « Volume 80 % » d'une Echo revenue à 35 %, et « Muet » ne pouvait plus reparaître. Démontée, la
   * barre lâche le doigt ; devenue inerte (une lampe qui tombe en panne), aussi, et elle reprend le dessin de MAINTENANT — le relâcher
   * qui suivra ne commande rien. */
  const enCours = useRef(null);
  useEffect(() => () => { if (enCours.current) enCours.current(null); }, []);
  useEffect(() => { if (!actif && enCours.current) enCours.current({ val, eteinte }); });
  // Peinture DOM directe pendant le geste, commit au relacher — le rendu React
  // ne suit pas un doigt a 60 images par seconde.
  const glisse = (e) => {
    if (!actif) return;
    e.stopPropagation(); e.preventDefault();
    const el = e.currentTarget, fill = el.querySelector('[data-fill]'), kn = el.querySelector('[data-knob]'), r = el.getBoundingClientRect();
    const calc = (x) => borner((x - r.left) / Math.max(1, r.width - RM_JAUGE_RESERVE) * 100);
    let n = calc(e.clientX), dit;
    // Le chiffre de l'appelant suit le doigt (`onGlisse`) : une fois par valeur (`dit`), et `n` est déjà borné au plafond.
    const paint = () => { if (fill) { fill.style.transition = 'none'; fill.style.width = largeur(n); } if (kn) { kn.style.transition = 'none'; kn.style.left = gauche(n); kn.style.opacity = '1'; } if (onGlisse && n !== dit) { dit = n; onGlisse(n); } };
    paint(); el.classList.add('o-sliding'); try { el.setPointerCapture(e.pointerId); } catch {}
    el.onpointermove = (ev) => { n = calc(ev.clientX); paint(); };
    const end = () => { enCours.current = null; el.classList.remove('o-sliding'); el.onpointermove = null; el.onpointerup = null; el.onpointercancel = null; if (fill) fill.style.transition = ''; if (kn) kn.style.transition = ''; };
    // Relâché : l'ordre d'abord, puis le doigt s'en va (`onGlisse(null)`) — le chiffre garde la valeur posée, sans repasser par l'ancienne.
    el.onpointerup = () => { end(); try { onCommit(n); } finally { if (onGlisse) onGlisse(null); } };
    // Arrêté sans ordre (`pointercancel`, la barre démontée ou inerte) : le dessin `vu` revient (null : démontée, plus rien à peindre), le doigt s'en va.
    const arreter = (vu) => {
      end();
      if (vu && fill) fill.style.width = vu.eteinte || vu.val == null ? '0px' : largeur(vu.val);
      if (vu && kn) { kn.style.left = gauche(vu.val == null ? min : vu.val); kn.style.opacity = vu.val == null ? '0' : '1'; }
      if (onGlisse) onGlisse(null);
    };
    el.onpointercancel = () => arreter({ val, eteinte });
    enCours.current = arreter;
  };
  /* Éteinte, la barre le dit au lecteur d'écran : « Éteinte · 80 % » (le dernier niveau connu), « Éteinte » sans lui — ni « 80 % »
   * seul, qui l'annoncerait allumée, ni un curseur sans valeur (ARIA 1.2 : `aria-valuenow`, le minimum faute de mieux). `etat` : ce
   * que l'appelant veut dire avec la valeur — « Muet » pour un volume coupé (la carte l'écrit, la barre le dit aussi). */
  /* `rafale` (les lumières, audit du 19/10, B11) : une flèche tenue ne commande plus à chaque répétition — la barre et le
   * chiffre (`onGlisse`) suivent la touche, et UN ordre part au relâcher (`kbSlider`, `differe`), le doigt s'en va après. */
  const peindre = (el, n) => {
    const fill = el && el.querySelector ? el.querySelector('[data-fill]') : null, kn = el && el.querySelector ? el.querySelector('[data-knob]') : null;
    if (fill) fill.style.width = eteinte && n == null ? '0px' : largeur(n);
    if (kn) { kn.style.left = gauche(n); kn.style.opacity = '1'; }
  };
  const clavier = rafale ? { differe: true, apercu: (n, el) => { peindre(el, n); if (onGlisse) onGlisse(n); } } : {};
  const commettre = rafale ? (n) => { try { onCommit(n); } finally { if (onGlisse) onGlisse(null); } } : onCommit;
  const kb = actif ? kbSlider(label, val, commettre, { min, max: haut, ...(pas !== 1 ? { step: pas } : {}), etat: etat || (eteinte ? tr('Éteinte') : null), ...clavier }) : {};
  const dessin = (
    <>
      <span data-fill style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: eteinte || val == null ? 0 : largeur(val), borderRadius: piste / 2, background: grade || couleur, transition: 'width .3s' }} />
      <span data-knob style={{ position: 'absolute', top: grand ? 7 : 5, bottom: grand ? 7 : 5, width: grand ? 4 : 3, borderRadius: 2, background: eteinte ? 'var(--o-text3)' : couleur, left: gauche(val == null ? min : val), opacity: val == null ? 0 : undefined, transition: 'left .3s' }} />
      {(eteinte == null || val == null || val < 95) && <span aria-hidden="true" style={{ position: 'absolute', right: 6, top: (piste - (grand ? 5 : 4)) / 2, width: grand ? 5 : 4, height: grand ? 5 : 4, borderRadius: '50%', background: 'var(--o-text3)', opacity: .6 }} />}
      {/* Le plafond du mode enfant (§ 6.1) : la zone hachurée jusqu'à la fin (le motif vit dans la feuille, `o-jauge-plafond` — passe bis du
        * 17/10, point 14 : la place du boot), son cadenas quand elle est assez large, le trait de 2 px. */}
      {haut < 100 && (<>
        <span aria-hidden="true" data-plafond className="o-jauge-plafond" style={{ position: 'absolute', top: 0, bottom: 0, left: gauche(haut), right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {haut <= 80 && <Fi i="lock" size={10} color="var(--o-text2)" />}
        </span>
        <span aria-hidden="true" data-trait style={{ position: 'absolute', top: 0, bottom: 0, width: 2, left: gauche(haut), background: 'var(--o-text3)' }} />
      </>)}
    </>
  );
  /* 24 px de haut, comme la glissiere d'avant la refonte (retour user du
   * 14/09 : « elargis un petit peu la barre ») — le dessin, lui, reste. */
  const pisteStyle = { position: 'relative', display: 'block', height: piste, borderRadius: piste / 2, background: 'var(--o-s1)', overflow: 'hidden', opacity: actif ? 1 : .4 };
  /* `pan-y`, jamais `none` (revue du 14/10, R1) : avec `none`, le doigt posé sur la barre pour FAIRE DÉFILER la page ne la
   * faisait pas défiler, et au relâcher l'ordre partait — une lampe éteinte s'allumait. Avec `pan-y`, un geste vertical est
   * celui de la page : le navigateur l'annule (`pointercancel`, géré plus haut : le dessin d'avant revient, aucun ordre ne part)
   * et seul un geste horizontal pilote la barre. Pour tous ses emplois : lumière, volet, volume. */
  const geste = { cursor: actif ? 'ew-resize' : 'default', touchAction: 'pan-y', marginTop: marge };
  /* Inactive, la jauge n'est qu'un dessin : la regle voit alors un clic
   * sans clavier, mais ce clic ne sert qu'a ne pas ouvrir la fiche. */
  /* Active, le clavier arrive par `{...kb}` (rôle slider, flèches) : la règle
   * ne sait pas lire ce qu'un étalement apporte. */
  if (!zone) {
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- voir les deux commentaires ci-dessus */
    return <span {...kb} onClick={(e) => e.stopPropagation()} onPointerDown={glisse} style={{ ...pisteStyle, ...geste }}>{dessin}</span>;
  }
  return (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- voir les deux commentaires ci-dessus */
    <span {...kb} onClick={(e) => e.stopPropagation()} onPointerDown={glisse} style={{ position: 'relative', display: 'flex', alignItems: 'center', height: zone, ...geste }}>
      <span style={{ ...pisteStyle, flex: 1 }}>{dessin}</span>
    </span>
  );
}

/* Ce qu'un capteur binaire dit, selon sa `device_class` — en mots, pas en
 * « on / off ». Le troisieme champ : ce qui est un DANGER quand c'est vrai.
 * Jamais « Tout va bien » (chantier Capteurs, C26 ; sa règle du 18/09) :
 * `safety` éteint dit « Normal », `problem` éteint « Aucun problème ».
 * Un capteur de froid dit ce qu'on RESSENT (`trSens`, audit du 03/10) : la
 * clé nue « Froid » est le mode d'une climatisation, « Kühlen » en allemand.
 * Un danger dit le mot de l'Accueil : LA table de sûreté (`motsSurete`, attention.js ; audit du 19/10, lot 4) — « Monoxyde détecté »
 * partout à l'écran, plus « CO détecté » ici et « Monoxyde détecté » là ; « Boîtier ouvert » pour un sabotage. */
const DANGER = (c) => tr(motsSurete(c)[1]);
const BIN_ETATS = () => ({
  smoke: [DANGER('smoke'), tr('Aucune fumée'), true], gas: [DANGER('gas'), tr('Pas de gaz'), true],
  carbon_monoxide: [DANGER('carbon_monoxide'), tr('Pas de monoxyde'), true], moisture: [DANGER('moisture'), tr('Aucune fuite'), true],
  safety: [tr('Danger'), tr('Normal'), true], problem: [tr('Problème'), tr('Aucun problème'), true],
  motion: [tr('Mouvement'), tr('Aucun mouvement'), false], occupancy: [tr('Occupé'), tr('Vide'), false], presence: [tr('Présent'), tr('Absent'), false],
  door: [tr('Ouverte'), tr('Fermée'), false], window: [tr('Ouverte'), tr('Fermée'), false], garage_door: [tr('Ouverte'), tr('Fermée'), false], opening: [tr('Ouvert'), tr('Fermé'), false],
  lock: [tr('Déverrouillé'), tr('Verrouillé'), false], connectivity: [tr('Connecté'), tr('Déconnecté'), false], battery: [tr('Pile faible'), tr('Pile en forme'), true],
  plug: [tr('Branché'), tr('Débranché'), false], power: [tr('Sous tension'), tr('Hors tension'), false], vibration: [tr('Vibration'), tr('Calme'), false], sound: [tr('Bruit'), tr('Silence'), false],
  light: [tr('Lumière'), tr('Sombre'), false], cold: [trSens('Froid · ressenti'), tr('Normal'), false], heat: [tr('Chaud'), tr('Normal'), true], tamper: [DANGER('tamper'), tr('Intact'), true],
});
/* La famille d'un capteur binaire, sous le nom de sa fiche : « Séjour · Porte » (chantier Capteurs, C26, § 5.2). */
const FAMILLES_BINAIRES = () => ({
  door: tr('Porte'), window: tr('Fenêtre'), garage_door: tr('Porte de garage'), opening: tr('Ouverture'), smoke: tr('Fumée'), carbon_monoxide: tr('Monoxyde de carbone'),
  gas: tr('Gaz'), moisture: tr("Fuite d'eau"), safety: tr('Sécurité'), motion: tr('Mouvement'), occupancy: tr('Présence'), presence: tr('Présence'), tamper: tr('Sabotage'), vibration: tr('Vibration'),
});

/* L'illustration d'un ouvrant, en filigrane de sa carte — posee comme celle
 * des plantes, en bas a droite, derriere le texte (retour user du 15/09 :
 * « l'illustration en arriere-plan qui m'indique visuellement si c'est ouvert
 * ou ferme ») : une fenetre a deux battants ou une porte, grise fermee,
 * ambre entrouverte avec le battant qui pivote. Trait fin, un voile leger sur
 * le battant, rien d'opaque ; le dessin ne prend pas le tap. */
function IlluOuvrant({ type, ouvert, taille = 0 }) {
  /* `taille` : le petit dessin de la plaque d'une rangée de la popup Ouvertures (chantier Capteurs, § 4.2) — 28 px de haut, à pleine
   * opacité, dans la plaque et non plus en filigrane. */
  const style = taille ? { display: 'block', height: taille, width: 'auto', color: ouvert ? 'var(--o-warn)' : 'var(--o-text3)' }
    : { position: 'absolute', right: 8, bottom: 8, height: 100, width: 'auto', color: ouvert ? 'var(--o-warn)' : 'var(--o-text3)', opacity: ouvert ? .6 : .28, pointerEvents: 'none' };
  const trait = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinejoin: 'round', strokeLinecap: 'round' };
  if (type === 'fenetre') {
    return (
      <svg aria-hidden="true" viewBox="0 0 64 80" style={style} {...trait}>
        <rect x="3" y="3" width="58" height="74" rx="3" />
        <line x1="32" y1="3" x2="32" y2="77" />
        {ouvert
          ? <><polygon points="6,6 28,16 28,64 6,74" fill="rgba(255,204,68,.14)" /><circle cx="24" cy="40" r="1.8" fill="currentColor" /></>
          : <><line x1="3" y1="40" x2="61" y2="40" /><circle cx="28" cy="40" r="1.8" fill="currentColor" /></>}
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 64 84" style={style} {...trait}>
      <rect x="10" y="3" width="44" height="78" rx="2" />
      {ouvert
        ? <><polygon points="14,8 50,2 50,82 14,76" fill="rgba(255,204,68,.14)" /><circle cx="44" cy="44" r="2" fill="currentColor" /></>
        : <circle cx="46" cy="44" r="2" fill="currentColor" />}
    </svg>
  );
}

/* Le repere pile d'un capteur, en haut a droite (retour user du 15/09 :
 * « c'est quoi ce petit carre partout ? pour les capteurs remplace-le par la
 * batterie ») : l'icone au niveau et le pourcentage, à la règle de la maison
 * (chantier Capteurs, C32 : `couleurPile` — l'ambre au seuil de la veille des
 * piles, le rouge au critique ; une pile à 45 % reste discrète). Sans capteur
 * de pile, rien du tout — plus de carre. */
function PileRepere({ n, onOuvrir = null }) {
  const ico = glyphePile(n);
  const col = couleurPile(n, 'var(--o-text3)');
  return (
    /* Positionné, il passe AU-DESSUS de la surface de la carte (relecture du
     * lot 13, 04/10) : dessous, c'est elle qui prenait le survol, et la bulle
     * « Pile 80 % » ne s'affichait plus. Son clic suit donc celui de la
     * surface — la fiche —, sans quoi le repère deviendrait un coin mort ; le
     * clavier, lui, passe déjà par elle. Ni `none` (la bulle se perdrait) ni
     * `auto` : en édition, l'inertie héritée de la grille le couvre aussi. */
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- le clavier ouvre la fiche par la surface */
    <span title={tr('Pile') + ' ' + n + ' %'} onClick={onOuvrir || undefined} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4, height: 26, fontSize: 11, fontWeight: 700, color: col, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      <Fi i={ico} size={13} />{n} %
    </span>
  );
}

/* La PILE en cinq barres, comme la capture du 19/09 : une barre par 20 % — au plus proche, jamais moins d'une —, dans LA couleur
 * d'une pile (`couleurPile`, ADR 0206 ; audit du 19/10) : ambre au seuil de la veille, rouge au critique, vert sinon. */
function JaugePile({ barres }) {
  return (
    <div className="o-jauge-pile" aria-hidden="true" style={{ marginTop: 12, marginRight: 5, position: 'relative', height: 20, display: 'flex', gap: 2, padding: 2, boxSizing: 'border-box', border: '1.5px solid var(--o-text3)', borderRadius: 6 }}>
      {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ flex: 1, borderRadius: 2, background: i < barres.n ? barres.c : 'var(--o-s1)' }} />)}
      <span style={{ position: 'absolute', right: -6, top: 5, width: 3, height: 7, borderRadius: '0 2px 2px 0', background: 'var(--o-text3)' }} />
    </div>
  );
}

/* Les autres appareils d'une piece — prise, capteur, serrure, camera,
 * ventilateur… — au GABARIT MAISON, comme les lampes et les volets : icone en
 * haut a gauche, bascule ou repere en haut a droite, nom SOUS l'icone, etat
 * ensuite. La rangee horizontale de `CvCard` reste aux autres vues. */
const ROOM_GENERIQUES = ['switch', 'input_boolean', 'fan', 'humidifier', 'siren', 'lock', 'camera', 'binary_sensor', 'sensor'];
/**
 * Le glyphe d'une carte : celui qu'on a CHOISI, sinon celui de la famille.
 *
 * Chaque famille dessinait le sien — une ampoule pour `RoomLightCard`, un volet
 * pour `RoomCoverCard`, une flamme pour le climat — sans jamais demander si
 * l'utilisateur en avait choisi un autre. Le choix se rangeait bien, et ne se
 * voyait nulle part : « si j'en choisis un, ça ne le change pas, l'ancien
 * reste » (27/09). Une carte passe donc par ici, et son dessin d'origine n'est
 * plus qu'un défaut.
 */
const GlypheCarte = ({ id, size = 19, anime = false, selon = null, children }) => {
  const mien = iconeChoisie(id);
  // `selon` : l'icône choisie suit l'état de l'appareil quand elle a des variantes (un volet roulant, 25/10).
  return mien ? <Ico name={selon ? selon(mien) : mien} size={size} anime={anime} /> : children;
};

export { RM_CARD, RM_ICO, RM_BTN, RM_NAME, RM_SUB, RM_MILIEU, RmBascule, EM_CHIFFRE, EM_UNITE, emChiffre, ChiffreHaut, PlaqueBascule, RmJauge, BIN_ETATS, FAMILLES_BINAIRES, IlluOuvrant, PileRepere, JaugePile, ROOM_GENERIQUES, GlypheCarte };
