/* La carte d'un groupe de capteurs, de la vigilance et des piles.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useRef, useEffect } from 'react';
import { LOGGIA_INDEX, enHaids } from '../state.js';
// Toutes les batteries de la maison (chantier G3, ADR 0302) : la clé seule, sinon ses parts.
import { idsDe } from '../energieparts.js';
import { LAVIS } from '../theme.js';
import { Surface, nomCarte, Fi } from '../ui.jsx';
import { pilesDeLaMaison as pilesCarte, vuePiles } from '../piles.js';
import { membresGroupes, nomsMembres, vuePresence, vueSecurite, vueOuvertures } from '../groupes.js';
import { vueVigilance } from '../vigilance.js';
import { useDerniersEvenements } from '../historique.jsx';
import { seuilsPile, reglerSeuilPile } from '../attention.js';
import { useJournee, depuisQuand } from '../journeelue.js';
import { LISERE, petitesCapitales } from '../styles.js';
import { reduireDerniers } from '../evenement.js';
import { tr } from '../i18n.js';
import { ctxCapteurs, lavisCarte, SURF_CARTE, useHass, NOMS_GROUPES } from '../app/noyau.jsx';
import { heureDe } from '../appareils/fiches.jsx';
import { RM_NAME, RM_CARD, RM_ICO, ChiffreHaut, RM_SUB } from './briques.jsx';
import { emPhrase, hassQuiConnait } from './mesure.jsx';

/* ── La carte d'un GROUPE (chantier Capteurs, étape 2 ; § 3 ; C20 à C24) ─────────────────────────────
 *
 * Une carte pour Ouvertures, Sécurité et Présence, aux tailles de la maison, dans `RM_CARD`, avec la `Surface` qui ouvre sa
 * popup — pas un bouton (ADR 0074) ; la surface dit ce qu'elle affiche : « Ouvertures, 1 ouverte sur 4, Baie vitrée · 22:25 ».
 *  - La carte LARGE (184) : la plaque de la maison (38 px) — au calme `--o-s1` et `--o-text1`, en alerte la couleur de
 *    l'alerte à 0,16 et son encre, au mouvement l'accent ; 14 px plus bas, le nom (15 / 700, deux lignes au plus) et la
 *    phrase (12 ; neutre, ambre ou rouge) ; au pied, UNE rangée de puces (6 × 10 px, rayon 10, `--o-s1`, 11,5 / 700) — ce qui
 *    ne tient pas devient « +{k} », estimé sur la plus étroite des cartes larges (188 px), comme la phrase (`emPhrase`).
 *    Le lavis, seulement en alerte : l'ambre à 0,08, le rouge à 0,16. Budget : 38 + 14 + 2 × 18 + 16 + 10 + 26 = 140 px.
 *  - La carte ÉTROITE (sous 188 px de contenu, la grille commune, ADR 0202) : la plaque, le nom en 14 px sur deux lignes, la
 *    phrase sur une ligne, de 12 à 10,5 px — pas de puces (la maquette « Moyennes » n'en montre pas).
 *  - La COMPACTE (88) : la plaque de 34, le nom, la phrase sur une ligne, et le chiffre à droite s'il y en a un.
 * Elle s'abonne à SES membres (`useHass`), jamais au domaine entier (la leçon des prises).
 */
// Les membres des groupes, lus une fois par relevé de la maison et par index (`groupes.js`).
let MEMBRES_LUS = null;
function membresDeLaMaison(S) {
  if (!MEMBRES_LUS || MEMBRES_LUS.S !== S || MEMBRES_LUS.ix !== LOGGIA_INDEX) MEMBRES_LUS = { S, ix: LOGGIA_INDEX, m: membresGroupes(S || {}, ctxCapteurs()) };
  return MEMBRES_LUS.m;
}
/* Les piles de la carte Piles (chantier Capteurs, C32, § 8), lues une fois par relevé et par index (piles.js) ; la batterie de la
 * maison — le rôle `batSoc` d'Énergie — reste à Énergie. */
let PILES_LUES = null;
function pilesDeLaMaisonCarte(S) {
  if (!PILES_LUES || PILES_LUES.S !== S || PILES_LUES.ix !== LOGGIA_INDEX) PILES_LUES = { S, ix: LOGGIA_INDEX, p: pilesCarte(S || {}, ctxCapteurs(), { exclure: idsDe(enHaids(), 'batSoc') }) };
  return PILES_LUES.p;
}
/* Le seuil de la veille des piles (§ 19.8), lu avec les veilles du serveur (`loggia/veilles/etat`, toutes les 30 s) et retenu pour
 * toute la règle (attention.js). UNE lecture, à la racine (`App`, passe bis du 17/10) : réglé depuis la carte Piles, la section et
 * la popup, l'Accueil — « En ce moment », les points d'attention, `deriveNotifs` — jugeait au défaut tant qu'on n'avait pas ouvert
 * Objets › Capteurs, et chaque montage remettait le seuil au défaut le temps que la veille réponde. Sans serveur — la démo —, le défaut. */
function useSeuilPile(hass) {
  /* Le seuil seul en état, pas la réponse : la racine ne se redessine que s'il CHANGE. Avec `useEtatServeur`, chaque relevé (un
   * objet neuf toutes les 30 s) redessinait toute l'application (relecture de la passe bis du 17/10). */
  const [seuil, setSeuil] = useState(() => seuilsPile().alerte);
  const hRef = useRef(null);
  const courant = hass && typeof hass.callWS === 'function' ? hass : null;
  /* Sans tableau : à chaque rendu, avant l'effet de sondage déclaré plus bas (le motif de `useEtatServeur`). */
  useEffect(() => { hRef.current = courant; });
  const connecte = !!courant;
  useEffect(() => {
    if (!connecte) return undefined;
    let vivant = true;
    const lire = () => {
      const h = hRef.current;
      if (!h) return;
      h.callWS({ type: 'loggia/veilles/etat' })
        .then(r => { if (vivant) setSeuil(reglerSeuilPile(r).alerte); })
        .catch(() => {});   // une veille muette garde le dernier seuil connu (attention.js)
    };
    lire();
    const t = setInterval(lire, 30000);
    return () => { vivant = false; clearInterval(t); };
  }, [connecte]);
  return seuil;
}
// Les tons d'une carte de groupe : l'encre, son compagnon pour la plaque et le lavis, et l'intensité du lavis.
const TONS_GROUPE = { warn: ['var(--o-warn)', 'var(--o-warn-rgb)', .08], warn2: ['var(--o-warn2)', 'var(--o-warn2-rgb)', .1], bad: ['var(--o-bad)', 'var(--o-bad-rgb)', .16] };
const NOM_GROUPE = { ...RM_NAME, fontSize: 15, lineHeight: '18px', whiteSpace: 'normal', overflowWrap: 'normal', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 };
const PUCE_GROUPE = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 10, background: 'var(--o-s1)', fontSize: 11.5, fontWeight: 700, lineHeight: '14px', whiteSpace: 'nowrap', flexShrink: 0 };
/* Combien de puces tiennent sur une rangée de 188 px, la plus étroite des cartes larges (la grille d'Objets en donne 192 à 1 280 px,
 * 232 à 1 440 ; mesuré le 17/10), « +{k} » compris : une puce fait ses 20 px de rembourrage, 16 de glyphe et d'écart, et son texte en
 * 11,5 px gras (`emPhrase`, 4 % de plus — mesurée au canevas sur Manrope 700, l'estimation est PESSIMISTE de 5 % : ce qu'elle dit
 * tenir tient). `n` : une au moins ; `suite` : « +{k} » après elles, seulement s'il tient AVEC elles. Partager la rangée avec la seule
 * puce qui tenait la coupait en « … » (« Contact porte entrée · 9 % » à 1 280 px ; passe bis du 17/10, point 8) : la puce entière vaut
 * mieux que le compte — la phrase le dit déjà, et la popup dit le reste. */
function pucesQuiTiennent(puces) {
  const largeur = (t, glyphe) => 20 + (glyphe ? 16 : 0) + Math.ceil(emPhrase(t) * 11.5 * 1.04);
  let w = 0, k = 0;
  for (; k < puces.length; k++) {
    const reste = puces.length - k - 1;
    if (w + (k ? 6 : 0) + largeur(puces[k].t, true) + (reste ? 6 + largeur('+' + reste, false) : 0) > 188) break;
    w += (k ? 6 : 0) + largeur(puces[k].t, true);
  }
  return { n: Math.max(1, k), suite: k > 0 && k < puces.length };
}
/* La carte, d'après la vue de son groupe (`groupes.js`) : `{ glyphe, phrase, ton, puces, chiffre, legende }`. */
function CarteGroupe({ v, nom, groupe, onOpen = null, chip = false }) {
  const ton = v.ton ? TONS_GROUPE[v.ton] : null;
  const encre = ton ? ton[0] : 'var(--o-text2)';
  // Au calme, la plaque de la maison ; en alerte, la couleur de l'alerte ; pendant un mouvement, l'accent (Présence, C24).
  const plaque = ton ? ['rgba(' + ton[1] + ',.16)', ton[0]] : v.accent ? ['rgba(var(--o-accent-rgb),.16)', 'var(--o-accent-soft)'] : ['var(--o-s1)', 'var(--o-text1)'];
  const lavis = ton && ton[2] && LAVIS ? lavisCarte(ton[1], ton[2], ton[2] / 4) : null;
  const dites = v.puces.filter(p => p.ton).map(p => p.t).join(', ');
  const surface = onOpen && <Surface onClick={onOpen} label={nomCarte(nom, v.phrase, dites || null)} />;
  if (chip) {
    return (
      /* La rangée de la compacte, comme celle d'une plante : les classes de la rangée, de la pastille et du texte de CvCard
       * lui restent réservées (tests/lot16_boutons_compacts, tests/cartes_compactes_gabarit). */
      <div className={'o-piece o-cvdense' + (v.muette ? ' o-panne' : '')} data-groupe={groupe} style={{ position: 'relative', background: lavis || SURF_CARTE, border: LISERE, borderRadius: 'var(--o-radius,18px)', padding: '12px 14px', boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', cursor: onOpen ? 'pointer' : 'default', transition: 'all .25s', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {surface}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: plaque[0], color: plaque[1] }}><Fi i={v.glyphe} size={15} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: encre, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.phrase}</div>
          </div>
          {v.chiffre && <span style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: encre }}>{v.chiffre}</span>}
        </div>
      </div>
    );
  }
  const { n, suite } = pucesQuiTiennent(v.puces);
  const reste = suite ? v.puces.length - n : 0;
  return (
    <div className={'o-rmcard o-gabarit' + (v.muette ? ' o-panne' : '')} data-groupe={groupe} style={{ ...RM_CARD, position: 'relative', justifyContent: 'flex-start', cursor: onOpen ? 'pointer' : 'default', ...(lavis ? { background: lavis } : null), border: LISERE }}>
      {surface}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={RM_ICO(plaque[0], plaque[1])}><Fi i={v.glyphe} size={17} /></span>
        {v.chiffre && <ChiffreHaut v={v.chiffre} couleur={encre} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 'var(--o-milieu-haut, 14px)', position: 'relative', pointerEvents: 'none' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="o-gab-nom" style={NOM_GROUPE}>{nom}</div>
          {/* La phrase ; sur une carte étroite, sa forme courte s'il y en a une (« Séjour · 3 min ») — la feuille n'en montre qu'une. */}
          <div className={'o-gab-phrase' + (v.phraseCourte ? ' o-seul-large' : '')} style={{ ...RM_SUB, color: encre, '--o-n': Math.max(1, v.phrase.length) }}>{v.phrase}</div>
          {v.phraseCourte && <div aria-hidden="true" className="o-gab-phrase o-seul-etroit" style={{ ...RM_SUB, color: encre, '--o-n': Math.max(1, v.phraseCourte.length) }}>{v.phraseCourte}</div>}
        </div>
        {v.chiffre && (
          <span aria-hidden="true" className="o-seul-large" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1, flexShrink: 0 }}>
            <span style={{ fontSize: 25, fontWeight: 800, color: encre, fontVariantNumeric: 'tabular-nums' }}>{v.chiffre}</span>
            {v.legende && <span style={{ ...petitesCapitales(10), marginTop: 5, whiteSpace: 'nowrap' }}>{v.legende}</span>}
          </span>
        )}
      </div>
      {v.puces.length > 0 && (
        <div aria-hidden="true" className="o-seul-large" data-puces="" style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 10, overflow: 'hidden', position: 'relative', pointerEvents: 'none' }}>
          {v.puces.slice(0, n).map((p, k) => (
            <span key={k} style={{ ...PUCE_GROUPE, color: p.ton ? TONS_GROUPE[p.ton][0] : 'var(--o-text3)', ...(k === 0 ? { flexShrink: 1, minWidth: 0 } : null) }}>
              <Fi i={p.glyphe} size={11} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.t}</span>
            </span>
          ))}
          {reste > 0 && <span style={{ ...PUCE_GROUPE, color: 'var(--o-text2)' }}>{'+' + reste}</span>}
        </div>
      )}
    </div>
  );
}
/* La carte d'un groupe dans un `hass` VIVANT : ses membres, lus dans le relevé de la vue ; leurs états, dans le sien. Présence
 * lit aussi le JOURNAL de Home Assistant (`useDerniersEvenements`, 24 h), jamais `last_changed` (ADR 0031), et se relit à la
 * minute : « il y a 3 min » ne vieillit pas sur place. Ouvertures lit l'historique du JOUR de ses ouvertes, comme sa popup
 * (`useJournee`, `depuisQuand`) : sa puce disait « Baie · 23:48 », l'heure du redémarrage (audit du 19/10, lot 4) ; une ouverte
 * depuis hier tait son heure, et la lecture se refait quand une porte s'ouvre ou se ferme. */
/* La carte Vigilance météo (chantier Capteurs, étape 2 ; C28, § 19.5) : dans Dehors, sous son nom d'aujourd'hui, la carte des groupes
 * sans puces, avec la vue de vigilance.js — le niveau au calme, jamais « Tout va bien » ; l'ambre, l'orange ou le rouge en alerte ;
 * muette, le liseré qui respire. Elle garde sa clé d'entité : son agencement la range déjà. Elle s'abonne à son entité. */
function RoomVigilanceCard({ id, hass, onOpen = null, label = null, chip = false }) {
  const H = hassQuiConnait(useHass([id]), hass, id);
  const v = vueVigilance((H && H.states) || {}, id);
  return <CarteGroupe v={v} nom={label || tr('Vigilance météo')} groupe="vigilance" onOpen={onOpen ? () => onOpen(id) : null} chip={chip} />;
}
function RoomGroupeCard({ groupe, hass, onOpen = null, label = null, chip = false }) {
  const membres = membresDeLaMaison((hass && hass.states) || {})[groupe] || [];
  const H = hassQuiConnait(useHass(membres), hass, membres[0]);
  const S = (H && H.states) || {};
  const derniers = useDerniersEvenements(H, groupe === 'presence' ? membres : [], reduireDerniers);
  const [, setMinute] = useState(0);
  useEffect(() => { if (groupe !== 'presence') return undefined; const iv = setInterval(() => setMinute(x => x + 1), 60000); return () => clearInterval(iv); }, [groupe]);
  const ouvertes = groupe === 'ouvertures' ? membres.filter(id => S[id] && S[id].state === 'on') : [];
  const jour = useJournee(H, ouvertes);
  const lu = jour && jour !== 'erreur' ? jour : null;
  const depuis = (id) => depuisQuand(lu ? lu.etats[id] || null : null, lu && lu.debut, S[id]);
  const ctx = ctxCapteurs();
  const noms = nomsMembres(membres, S, ctx);
  const v = groupe === 'presence' ? vuePresence(membres, S, noms, derniers, Date.now(), ctx) : groupe === 'securite' ? vueSecurite(membres, S, noms) : vueOuvertures(membres, S, noms, heureDe, depuis);
  return <CarteGroupe v={v} nom={label || NOMS_GROUPES()[groupe]} groupe={groupe} onOpen={onOpen} chip={chip} />;
}
/* La carte PILES (chantier Capteurs, étape 3 ; C32, § 8, § 19.8) : les piles de la maison (piles.js) dans la carte des groupes — « {k} piles à
 * changer » au seuil de la veille, sinon les muettes, sinon « {n} piles · la plus basse à {p} % » ; le chiffre et « ≤ 15 % » seulement s'il y en
 * a à changer. Elle s'abonne à ses piles, jamais au domaine ; le seuil est celui que la racine a relu avec les veilles (`useSeuilPile`). */
function RoomPilesCard({ hass, onOpen = null, label = null, chip = false }) {
  const piles = pilesDeLaMaisonCarte((hass && hass.states) || {});
  const H = hassQuiConnait(useHass(piles.map(p => p.id)), hass, piles.length ? piles[0].id : null);
  const v = vuePiles(pilesCarte((H && H.states) || {}, ctxCapteurs(), { exclure: idsDe(enHaids(), 'batSoc') }));
  return <CarteGroupe v={v} nom={label || NOMS_GROUPES().piles} groupe="piles" onOpen={onOpen} chip={chip} />;
}

export { membresDeLaMaison, pilesDeLaMaisonCarte, useSeuilPile, NOM_GROUPE, pucesQuiTiennent, CarteGroupe, RoomVigilanceCard, RoomGroupeCard, RoomPilesCard };
