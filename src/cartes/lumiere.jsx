/* La carte d'une lumière.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useEffect } from 'react';
import { enPanne } from '../outils.js';
import { lav, LAVIS } from '../theme.js';
import { commanderService, commander } from '../actions.js';
import { cvName, Surface, nomCarte, Fi } from '../ui.jsx';
import { finMinuteur } from '../prisesetat.js';
import { luminosite, capacitesLumiere, teinteDeCarte, couleursLumiere, encreLumiere, lavisLumiere, phraseLumiere } from '../lumieres.js';
import { useEtatLumieres, useAvancesLumieres, useRelireMinuteurs, avanceDe, dernierDe } from '../lumieresetat.js';
import { useOptimistePartage, brutPartage, oublierPartage, poserPartage } from '../optimiste.js';
import { LISERE } from '../styles.js';
import { tr } from '../i18n.js';
import { useHass, estClair, useFlash, lavisCarte, SURF_CARTE } from '../app/noyau.jsx';
import { RM_CARD, RM_ICO, GlypheCarte, PlaqueBascule, RmBascule, ChiffreHaut, RM_MILIEU, RM_NAME, RM_SUB, RmJauge } from './briques.jsx';
import { hassQuiConnait } from './mesure.jsx';

/* ── La carte d'une lumière (chantier Lumières, § 3.1, 3.2 ; L3 à L7, L11) ────
 *
 * La carte 1a de sa maquette, aux tailles de la maison (184, et 176 de large au
 * téléphone) : la plaque et la bascule en haut, seules ; le nom, la phrase d'état
 * (§ 4) et, allumée et variable, le pourcentage en grand à droite du nom ; la barre
 * au pied. Sur une carte étroite (le téléphone : passe téléphone, ADR 0202), le
 * modèle 1c de la grille commune : la plaque EST l'interrupteur (`PlaqueBascule`),
 * le pourcentage monte à droite, le nom passe sur toute la largeur et la phrase
 * s'écrit à l'encre de la lampe allumée.
 * Elle prend la couleur de la VRAIE lumière (L6, `teinteDeCarte`) — la plaque, le
 * lavis, d'autant plus fort qu'elle éclaire, et la barre ; éteinte, elle se
 * tait : le gris, et le repère de la barre au dernier niveau que garde le
 * carnet du serveur. Les gestes de Loggia restent (L3) : un appui ouvre la
 * fiche, la bascule allume ou éteint — `turn_on` / `turn_off` d'après l'état
 * affiché, jamais `toggle` (la leçon des prises, F5) —, on glisse sur la barre ;
 * glisser sur une lampe éteinte l'allume à ce niveau. Un switch déclaré lumière
 * garde sa place, sans barre, en or (L11).
 */

/* Ce que la carte et la compacte d'une lumière lisent : la lampe dans un `hass`
 * VIVANT — elle s'abonne à SA lampe (la leçon des prises, A2 : la vue qui la
 * porte ne surveille pas toujours `light.`, et un geste se relit dans ce
 * relevé-là) ; le carnet du serveur (le dernier niveau) et le minuteur
 * (lumieresetat.js) ; le geste d'abord — la variante PARTAGÉE d'optimiste.js
 * (`useOptimistePartage`, audit du 19/10, B2 : la carte et la fiche, ouvertes
 * ensemble, tiennent la MÊME avance, par lampe ; 6 s pour la marche, 4 s pour
 * la luminosité — l'écho Zigbee rejoue l'ancienne valeur ; et l'état réel ne
 * répond qu'en ATTEIGNANT ce qu'on a demandé, `cible` (B3) : l'écho d'un ordre
 * plus ancien, les paliers d'un fondu ne la lèvent pas) ; l'avance de « Tout
 * éteindre ». `actif` faux : rien ne s'abonne, et rien ne se rend. */
const CLE_LUMIERE = (id) => 'lumiere:' + id, CLE_LUMINOSITE = (id) => 'lumiere:bri:' + id, CLE_DOIGT = (id) => 'lumiere:doigt:' + id;
function useVueLumiere(hass, id, label = null, actif = true) {
  const vivant = useHass(actif ? [id] : []);
  // Le relevé vivant s'il connaît la lampe ; sinon la maison qu'on lui passe — celle, fictive, de la Bibliothèque (correction bis du chantier Capteurs, point 7).
  const H = hassQuiConnait(vivant, hass, id);
  const S = (H && H.states) || {};
  const st = S[id] || null;
  const a = (st && st.attributes) || {};
  const { etat, minuteurs } = useEtatLumieres(actif);
  useAvancesLumieres();
  // La lampe a changé d'état (son `last_changed` RÉEL) : le serveur a pu annuler son minuteur — les minuteurs se relisent (B10).
  useRelireMinuteurs(actif && st ? st.last_changed : null);
  const lue = luminosite(a);
  const ov = useOptimistePartage(actif ? CLE_LUMIERE(id) : null, { reel: st ? st.state : undefined, change: st ? st.last_changed : null });
  const ovBri = useOptimistePartage(actif ? CLE_LUMINOSITE(id) : null, { reel: lue, change: st ? st.last_updated : null });
  /* La luminosité SOUS LE DOIGT (passe bis 3 du 17/10, point 3 : sa demande pour le volume — « quand je règle le volume, le pourcentage
   * ne suit pas comme sur la maquette » — vaut pour la luminosité) : tant que la barre est tenue (`RmJauge`, `onGlisse`), le chiffre de
   * la carte large, celui de la carte étroite et le grand pourcentage de la fiche suivent le doigt — le doigt posé sur la barre de la
   * fiche se voit sur la carte derrière (B2 : la même clé). L'ordre (`turn_on`, `brightness_pct`) ne part qu'au relâcher (`regler`), et
   * le geste d'abord (`ovBri`, 4 s) prend le relais : le chiffre ne repasse pas par l'ancienne valeur. Une lampe éteinte (L7) montre son
   * chiffre dès le glisser ; rien ne part avant le relâcher. Un doigt qui ne se relève jamais (la barre démontée sans le dire) : 60 s. */
  const glisse = useOptimistePartage(actif ? CLE_DOIGT(id) : null);
  const suivre = (v) => { if (v == null) { const e = brutPartage(CLE_DOIGT(id)); if (e) oublierPartage(CLE_DOIGT(id), e.id); } else poserPartage(CLE_DOIGT(id), v, { filet: 60000 }); };
  // Muette : la règle de toutes les cartes (`enPanne`, 05/10) — absente, `unavailable` ou `unknown`.
  const muette = enPanne(id, st);
  // Muette, plus de doigt sur sa barre (la garde du lecteur, passe bis 3, point 1) : la valeur glissée s'oublie, même si la barre n'a pas pu le dire.
  useEffect(() => { if (actif && muette && glisse != null) suivre(null); });
  if (!actif) return null;
  const maintenant = Date.now();
  const nom = label || cvName(st, id);
  const doigt = muette ? null : glisse;
  // Le geste d'abord : la marche posée pour la carte ET la fiche (B2), que seul l'état demandé lève (B3).
  const poser = (allumer) => poserPartage(CLE_LUMIERE(id), !!allumer, { reel: st ? st.state : undefined, change: st ? st.last_changed : null, cible: allumer ? 'on' : 'off' });
  const poserBri = (pct) => poserPartage(CLE_LUMINOSITE(id), pct, { reel: lue, change: st ? st.last_updated : null, filet: 4000, cible: pct });
  // Le geste de la carte d'abord, puis celui de l'en-tête (« Tout éteindre ») ; « depuis » prend l'heure du geste (§ 4).
  const voulu = ov != null ? ov : muette ? null : avanceDe(id, st, maintenant);
  const enAvance = !muette && voulu != null && voulu !== (st.state === 'on');
  const vu = enAvance ? { ...st, state: voulu ? 'on' : 'off', last_changed: new Date(maintenant).toISOString() } : st;
  const on = !muette && vu.state === 'on';
  const cap = capacitesLumiere(id, a);
  const dernier = dernierDe(etat, id);
  // La teinte qui peint la plaque et le lavis : la vraie ; en thème clair, un blanc plafonné à 4 000 K — le blanc froid d'une carte claire ne s'y voyait pas (R7).
  const teinte = on ? teinteDeCarte(a, dernier, estClair()) : null;
  const couleurs = couleursLumiere(teinte);
  /* Sous le doigt, la valeur du geste — éteinte comprise ; sinon le geste d'abord, puis ce que dit la lampe ; allumée sans
   * `brightness`, le dernier niveau que le carnet garde — celui de son dernier allumage avec un niveau, le serveur le tient à
   * jour —, sinon RIEN : plus de « 100 % » inventé (audit du 19/10, B12 — la fiche dit « Allumée », la carte tait son chiffre). */
  const bri = !cap.variable ? null : doigt != null ? doigt : ovBri != null ? ovBri : !on ? null : lue != null ? lue : dernier && dernier.bri ? dernier.bri : null;
  /* L'encre de la plaque et du repère, et le dégradé de la barre (lumieres.js) : la teinte vraie rendue lisible sur le
   * fond VRAI de la glyphe — la plaque (0,22) posée sur le lavis de la carte, au plus 0,22 en haut, fois le réglage « Teinte »
   * du thème (`lav`) —, tirée du blanc de 4 000 K au plus froid ; en thème clair, la barre se peint de cette encre. */
  const { encre, degrade } = encreLumiere(on ? a : null, on ? dernier : null, { clair: estClair(), lavis: lav(lavisLumiere(100).haut) });
  return {
    // `dernierMode` : le mode que le carnet garde (`color_temp`, `xy`…) — la fiche d'une lampe éteinte s'ouvre dessus (B13).
    nom, muette, on, variable: cap.variable, bri, dernier: dernier ? dernier.bri : null, dernierMode: dernier ? dernier.mode : null, couleurs, encre, degrade,
    phrase: phraseLumiere({ st: vu, fin: finMinuteur(minuteurs, id), maintenant }),
    commander: (allumer) => { poser(allumer); commanderService(H, id, id.indexOf('light.') === 0 ? 'light' : 'homeassistant', allumer ? 'turn_on' : 'turn_off', { entity_id: id }); },
    regler: (pct) => { poserBri(pct); poser(true); commander(H, id, 'set_brightness', pct); },
    // La luminosité sous le doigt (`RmJauge`, `onGlisse`) : la valeur du geste, `null` quand le doigt s'en va ; `glisse` la dit (null hors geste).
    glisse: doigt, suivre,
    // Pour la fiche (§ 3.6, 3.7) : le `hass` vivant, les attributs, l'heure de l'état montré, et le geste d'abord d'un blanc ou d'une couleur.
    hass: H, attributs: a, depuis: vu ? vu.last_changed : null, avancer: poser,
  };
}

/* Le pourcentage : « 45 » en 25 px / 800 et « % » en 15, à droite du nom ET de
 * la phrase, posé en bas comme le pourcentage d'un volet et la température
 * d'une clim (retour du 14/10 : « par rapport aux autres cartes il doit être
 * plus bas »). Une fois (L5) : la phrase ne le redit pas, la surface le dit au
 * lecteur d'écran.
 * Sur une carte large, il s'écrit à la première rangée, deuxième colonne de la grille
 * du milieu (`RM_MILIEU`) — la place de la température d'un radiateur (retour du
 * 15/10 : « pourquoi le % et en haut entre l'icone et le toggle […] alors que les
 * radiateur lui c'est bien placé ») ; sa taille et son écart se lisent dans la feuille
 * (`--o-chiffre-taille`, `--o-chiffre-ecart`), la valeur large pour repli — 25 px sur
 * une carte large, 21 sur une carte moyenne. Une carte étroite l'écrit en haut
 * (`ChiffreHaut`, passe téléphone), et la feuille n'en montre qu'un (`o-seul-large`). */
function ChiffreLumiere({ bri }) {
  return (
    <span aria-hidden="true" className="o-lumiere-chiffre o-seul-large"
      style={{ gridColumn: 2, gridRow: 1, marginLeft: 'var(--o-chiffre-ecart, 10px)', display: 'flex', alignItems: 'baseline', gap: 3, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap', color: 'var(--o-text)' }}>
      <span style={{ fontSize: 'var(--o-chiffre-taille, 25px)', letterSpacing: '-.02em' }}>{bri}</span>
      <span style={{ fontSize: 'calc(var(--o-chiffre-taille, 25px) * .6)' }}>%</span>
    </span>
  );
}

function RoomLightCard({ id, hass, onOpen, label = null }) {
  const v = useVueLumiere(hass, id, label);
  const [flashRef, flash] = useFlash();
  const c = v.couleurs;
  const lavis = lavisLumiere(v.bri);
  // Le chiffre : allumée et variable — ou sous le doigt, une lampe éteinte comprise (passe bis 3, point 3) : il suit dès le glisser, rien ne part avant le relâcher.
  const chiffre = (v.on || v.glisse != null) && v.bri != null;
  // La plaque : la teinte de la lampe allumée, le gris lisible éteinte, le gris éteint muette — la même sur les deux écritures.
  const fond = v.on ? 'rgba(' + c.rgb + ',.22)' : 'var(--o-s1)';
  const encre = v.on ? v.encre : v.muette ? 'var(--o-text3)' : 'var(--o-text2)';
  // Allumer ou éteindre, d'après l'état AFFICHÉ — `turn_on` / `turn_off`, jamais `toggle` (`v.commander`) ; le halo du geste d'abord.
  const basculer = () => { flash(c.col); v.commander(!v.on); };
  return (
    /* La lampe n'est pas un `button` (lot 13 de l'audit du 03/10, ADR 0074) : la
     * bascule et la barre ne sont dans aucun bouton. Le geste « ouvrir » passe par
     * la SURFACE, nommée de ce que la carte affiche : « Ampoule Chambre, 45 %,
     * S'éteint à 21:10 ». Les classes restent : la CSS, l'enfoncement au doigt et
     * le retour haptique lisent `.o-light-card`. */
    <div ref={flashRef} className={'o-light-card o-rmcard o-gabarit' + (v.muette ? ' o-panne' : '')} data-lumiere=""
      style={{ ...RM_CARD, position: 'relative', textAlign: 'left', lineHeight: 'normal', width: '100%', cursor: onOpen ? 'pointer' : 'default', overflow: 'hidden',
        // Le nom reste sous la plaque, la barre seule descend au pied : une lampe sans barre ne pose pas son nom en bas.
        justifyContent: 'flex-start',
        // Le lavis est une COUCHE posée sur la surface (retour user 29/08) ; il monte avec la luminosité (L6).
        background: v.on && LAVIS ? lavisCarte(c.rgb, lavis.haut, lavis.bas) : SURF_CARTE,
        border: LISERE }}>
      {onOpen && <Surface onClick={() => onOpen(id)} label={nomCarte(v.nom, chiffre ? v.bri + ' %' : null, v.phrase.texte)} />}
      {/* La ligne du haut. Carte LARGE : la plaque à gauche, la bascule à droite, rien d'autre — le pourcentage a sa place plus bas, à côté
        * du nom (retour du 15/10). Carte ÉTROITE (passe téléphone, T12) : la plaque EST l'interrupteur, et le pourcentage monte à droite. La
        * feuille ne montre qu'une écriture. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
        <span className="o-seul-large" style={RM_ICO(fond, encre)}>
          <GlypheCarte id={id} size={17}><Fi i="bulb" size={17} /></GlypheCarte></span>
        <PlaqueBascule on={v.on} nom={v.nom} fond={fond} encre={encre} inerte={v.muette} onToggle={basculer}>
          <GlypheCarte id={id} size={17}><Fi i="bulb" size={17} /></GlypheCarte></PlaqueBascule>
        <RmBascule className="o-seul-large" on={v.on} nom={v.nom} onToggle={basculer} inerte={v.muette} />
        {chiffre && <ChiffreHaut v={v.bri} u="%" />}
      </div>
      {/* La rangée du radiateur (`RM_MILIEU`) : le nom et la phrase à gauche, le pourcentage d'une carte large à droite, aligné sur leur bas.
        * Sur une carte étroite il se tait : le nom et la phrase prennent toute la largeur (`o-gab-nom`, `o-gab-phrase`) — la longueur de la
        * phrase (`--o-n`) règle sa taille, de 12 à 10,5 px, et une lampe allumée l'écrit à son encre (T8, `--o-encre`), gardée lisible
        * comme du texte sur son lavis. */}
      <div style={RM_MILIEU}>
        <div style={{ minWidth: 0 }}>
          <div className="o-gab-nom" style={{ ...RM_NAME, fontSize: 15 }}>{v.nom}</div>
          <div className="o-gab-phrase" data-encre={v.on && !v.phrase.panne ? '' : undefined}
            style={{ ...RM_SUB, color: v.phrase.panne ? 'var(--o-bad)' : 'var(--o-text2)', '--o-n': Math.max(1, v.phrase.texte.length), '--o-encre': v.on ? v.encre : undefined }}>{v.phrase.texte}</div>
        </div>
        {chiffre && <ChiffreLumiere bri={v.bri} />}
      </div>
      {/* La barre, variable seulement, collée au pied : de 1 à 100 %, la teinte allumée, le repère gris éteinte (L7). */}
      {v.variable && (
        <div style={{ marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 14px)' }}>
          <RmJauge v={v.on ? v.bri : v.dernier} couleur={v.encre} grade={v.degrade} actif={!v.muette} min={1} eteinte={!v.on} zone={44} marge={0}
            label={tr('Luminosité') + ' ' + v.nom} onCommit={v.regler} onGlisse={v.suivre} rafale />
        </div>
      )}
    </div>
  );
}

export { useVueLumiere, RoomLightCard };
