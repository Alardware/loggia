/* ── La fiche d'une lumière (chantier Lumières, § 3.5 à 3.10 ; sa maquette
 * « Cartes lumières », cadres 1b à 1e ; L7 à L10) ───────────────────────────
 *
 * Une feuille SANS onglets : sa hauteur suit son contenu (la règle des popups),
 * elle défile au-delà ; ses panneaux, côte à côte, 12 px entre eux.
 *  - Le panneau du haut : le grand pourcentage (allumée et variable), sinon le
 *    mot — « Allumée », « Éteinte », « Indisponible » ; la phrase longue ; la
 *    bascule ; la barre de 1 à 100 % (variable et vivante seulement : muette,
 *    elle n'est pas dessinée), « 1 % » et « 100 % » dessous. Glisser sur une
 *    lampe éteinte l'allume (L7).
 *  - Couleur (une lampe qui a des blancs ou des couleurs) : les puces Blancs /
 *    Couleurs, ouvertes sur le mode du moment — éteinte, sur celui que le carnet
 *    connaît (B13) ; le curseur du blanc et les quatre blancs nommés, ou le
 *    curseur de teinte et les six couleurs (L9) — et la puce « Blanc » d'un
 *    ruban `hs + white` (B6). Choisir allume la lampe ; un curseur commande au
 *    relâcher. Sous 20 % de saturation, la lampe est « Blanc » et aucune
 *    couleur n'est cerclée (B1).
 *  - Les rangées : Effet (les effets que l'ampoule publie, nommés comme son
 *    intégration les nomme ; B4), Minuteur (celui des prises, tel quel),
 *    L'appareil.
 *  - Aujourd'hui : la durée allumée depuis minuit, les quatre dernières lignes
 *    du journal, et qui (la règle des prises, commune : `journalDuJour`).
 * Ce qui part (L10) : « Dernier changement », les huit pastilles, les quatre
 * blancs nommés d'avant, la rangée « +30 min ».
 *
 * Chargée à la demande (`FicheLumiere`, App.jsx), elle n'importe jamais
 * App.jsx : la coquille lui passe la VUE de la lampe — celle de sa carte
 * (`useVueLumiere` : le geste d'abord, la teinte, la phrase, les ordres, le
 * `hass` vivant) —, sa pièce, l'épingle, le glyphe de sa carte, la bascule et
 * la barre de la maison (`RmBascule`, `RmJauge`), et l'ouverture de la fiche
 * universelle de l'appareil. Ce qui se calcule vit dans lumieresfiche.js (la
 * fiche seule) et lumieres.js (avec la carte).
 */
import { useState, useRef, useEffect } from 'react';
import { tr, locale } from './i18n.js';
import { Fi, kbSlider, ListeChoix } from './ui.jsx';
import { commander, commanderService, peut } from './actions.js';
import { texteRefus } from './refus.js';
import { dureePrise } from './prises.js';
import { finMinuteur, poserMinuteurs, useHorloge } from './prisesetat.js';
import { DUREES_MINUTEUR, AJOUTS_MINUTEUR, journalDuJour, PASTILLES_QUI, VEILLE_MS, personnesDe, motQui } from './prisesfiche.js';
import { minuitLocal } from './jourstat.js';
import { capacitesLumiere, rgbDuBlanc, rgbDeLaTeinte, MODES_COULEUR } from './lumieres.js';
import { useEtatLumieres } from './lumieresetat.js';
import { BLANCS_NOMMES, COULEURS_NOMMEES, ecartTeintes, reglageLumiere, bornesBlanc, blancBorne, degradeBlanc, degradeTeinte, encreBlancs, typeLumiere, phraseFiche,
  phraseMinuteur, minutesAllumee, texteDuree, fonduDe, effetsLumiere, niveauBlanc } from './lumieresfiche.js';
import { EnteteFiche, PETITES_CAPITALES, filet } from './fichecommune.jsx';
import { PANNEAU, RANGEE, EN_BOUTON, TITRE, SOUS, ALERTE } from './fichekit.js';

const PETIT = { fontSize: 11, fontWeight: 700, color: 'var(--o-text3)' };
// Une puce de sa maquette (`ChipButton`) : 40 px de haut, le gris doux, sans bordure ; inerte à .4 ; choisie, le bleu plein et le blanc.
const PUCE = (peut = true, choisie = false) => ({ height: 40, padding: '0 8px', borderRadius: 10, border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
  minWidth: 0, whiteSpace: 'nowrap', opacity: peut ? 1 : 0.4, cursor: peut ? 'pointer' : 'default',
  background: choisie ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: choisie ? '#fff' : 'var(--o-text1)' });

function useVivant() {
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  return vivant;
}

/* Un curseur peint (§ 3.7) : une piste de 12 px peinte — la couleur de chaque
 * température, ou l'arc-en-ciel —, et un repère blanc cerclé à la valeur ; sans
 * valeur (la lampe n'est pas dans ce mode, ou éteinte), pas de repère. Au doigt,
 * le repère suit sans rendu React, et l'ordre part au relâcher, comme la barre ;
 * `touch-action: pan-y` (revue du 14/10, R1) : un doigt posé pour FAIRE DÉFILER la fiche ne la
 * faisait pas défiler, et réglait la lampe au relâcher — un geste vertical est celui de la page,
 * le navigateur l'annule (`pointercancel`) et rien ne part ;
 * au clavier, les flèches (`kbSlider`, différé : une flèche tenue déplace le repère et UN ordre part au relâcher, B11). Pour le lecteur d'écran il porte toujours
 * une valeur (`aria-valuenow`, le minimum faute de mieux) ; `etat` — « Éteinte » —
 * dit ce que le minimum ne dit pas : la lampe n'est pas réglée là. */
function CurseurPeint({ label, min, max, pas, valeur, piste, unite, etat = null, onCommit }) {
  const pos = (x) => ((Math.max(min, Math.min(max, x)) - min) / (max - min)) * 100 + '%';
  const glisse = (e) => {
    e.preventDefault();
    const el = e.currentTarget, rep = el.querySelector('[data-repere]'), r = el.getBoundingClientRect();
    const calc = (x) => Math.max(min, Math.min(max, Math.round((min + Math.max(0, Math.min(1, (x - r.left) / Math.max(1, r.width))) * (max - min)) / pas) * pas));
    let n = calc(e.clientX);
    const peindre = () => { if (rep) { rep.style.left = pos(n); rep.style.opacity = '1'; } };
    peindre();
    try { el.setPointerCapture(e.pointerId); } catch { /* un doigt déjà parti */ }
    el.onpointermove = (ev) => { n = calc(ev.clientX); peindre(); };
    const fin = () => { el.onpointermove = null; el.onpointerup = null; el.onpointercancel = null; };
    el.onpointerup = () => { fin(); onCommit(n); };
    el.onpointercancel = () => { fin(); if (rep) { rep.style.left = pos(valeur == null ? min : valeur); rep.style.opacity = valeur == null ? '0' : '1'; } };
  };
  return (
    <span {...kbSlider(label, valeur, onCommit, { min, max, step: pas, unit: unite, etat, differe: true,
      apercu: (n, el) => { const rep = el && el.querySelector ? el.querySelector('[data-repere]') : null; if (rep) { rep.style.left = pos(n); rep.style.opacity = '1'; } } })} onPointerDown={glisse}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 28, margin: '0 9px', cursor: 'ew-resize', touchAction: 'pan-y' }}>
      <span style={{ flex: 1, height: 12, borderRadius: 6, background: piste, margin: '0 -9px' }} />
      <span data-repere="" aria-hidden="true" style={{ position: 'absolute', top: 5, left: pos(valeur == null ? min : valeur), width: 18, height: 18, marginLeft: -9, borderRadius: '50%', boxSizing: 'border-box',
        background: '#fff', border: '2px solid var(--o-text)', opacity: valeur == null ? 0 : 1, pointerEvents: 'none' }} />
    </span>
  );
}

/* Ce que « Aujourd'hui » lit (§ 3.9, § 8 ; le contrat du plan 1) :
 *  - le carnet des lumières du serveur (`loggia/lumieres/journal`) : depuis la
 *    veille à 00:00, précédé de la dernière note d'avant — l'état de la lampe à
 *    l'ouverture de la fenêtre —, avec le niveau, les réglages et qui. Un serveur
 *    d'avant ce chantier ne le connaît pas : le logbook de Home Assistant, depuis
 *    la veille (`VEILLE_MS`), sans niveaux ni réglages — l'écran marche quand même.
 *    Le logbook encore quand le carnet ne dit rien (`[]`) : le premier jour, il ne
 *    sait pas ce qui s'est passé avant son installation.
 *    Un compte qui n'a pas le droit de lire la lampe (`unauthorized`) : on ne
 *    contourne pas le refus, le journal dit qu'il n'a pas pu être lu ;
 *  - le journal de Loggia qui nomme la lampe (`loggia/volets/manoeuvres`), depuis
 *    la veille aussi : la ligne d'une veilleuse éteinte juste avant minuit couvre
 *    encore son fondu ;
 *  - le fondu de la veilleuse (`loggia/nuit/etat`), en minutes.
 * À l'ouverture, puis toutes les minutes, et quand l'état RÉEL de la lampe change
 * — jamais sur le geste d'abord — : tout de suite si elle s'allume ou s'éteint
 * (`etat`), et au plus toutes les `RELECTURE_MS` sur un réglage (`cle`, son
 * `last_updated` : les paliers d'un fondu de cinq minutes relisaient trois appels
 * à chaque rapport de Zigbee2MQTT — audit du 19/10, B9 ; un palier arrivé pendant
 * la garde se relit à sa fin, le réglage stabilisé). Rend `{ evenements, lignes,
 * fondu }` — null tant que rien n'est lu ; `evenements` vaut null quand ni le
 * carnet ni le logbook n'ont pu être lus. */
const RELECTURE_MS = 10000;
function useJournalLumiere(hass, id, minuit, etat, cle) {
  const [lu, setLu] = useState(null);
  const source = useRef(hass);
  source.current = hass;
  // `relire(tout)` de la lecture en cours : tout de suite (`tout` : l'état a changé), ou au plus toutes les RELECTURE_MS.
  const relecture = useRef(null);
  useEffect(() => {
    let vivant = true;
    const garde = { chaude: 0, attente: false };
    const lire = () => {
      const h = source.current;
      if (!h || typeof h.callWS !== 'function') { setLu({ evenements: null, lignes: [], fondu: 0 }); return; }
      // La garde : une relecture demandée par un réglage attend la fin de celle-ci.
      clearTimeout(garde.chaude);
      garde.chaude = setTimeout(() => { garde.chaude = 0; if (garde.attente && vivant) { garde.attente = false; lire(); } }, RELECTURE_MS);
      // `new Promise` : un `callWS` qui lève avant de répondre est un échec comme un autre.
      const appeler = (msg) => new Promise((ok) => ok(h.callWS(msg)));
      const depuis = minuit - VEILLE_MS;
      const logbook = () => appeler({ type: 'logbook/get_events', start_time: new Date(depuis).toISOString(), entity_ids: [id] }).then(r => (Array.isArray(r) ? r : null), () => null);
      Promise.all([
        appeler({ type: 'loggia/lumieres/journal', entity_id: id })
          .then(r => (!r || !Array.isArray(r.evenements) ? null : r.evenements.length ? r.evenements : logbook().then(l => l || [])),
            (x) => (x && x.code === 'unauthorized' ? null : logbook())),
        appeler({ type: 'loggia/volets/manoeuvres', entity_id: id, depuis: Math.floor(depuis / 1000) }).then(r => (r && Array.isArray(r.lignes) ? r.lignes : []), () => []),
        appeler({ type: 'loggia/nuit/etat' }).then(fonduDe, () => 0),
      ]).then(([evenements, lignes, fondu]) => { if (vivant) setLu({ evenements, lignes, fondu }); });
    };
    relecture.current = (tout) => { if (tout || !garde.chaude) lire(); else garde.attente = true; };
    lire();
    const t = setInterval(lire, 60000);
    return () => { vivant = false; clearInterval(t); clearTimeout(garde.chaude); relecture.current = null; };
  }, [id, minuit]);
  // L'état réel a bougé : relire — une autre lampe ou un autre jour relancent déjà la lecture au-dessus.
  const vu = useRef({ id, minuit, etat, cle });
  useEffect(() => {
    const d = vu.current;
    vu.current = { id, minuit, etat, cle };
    if (d.id !== id || d.minuit !== minuit || (d.etat === etat && d.cle === cle)) return;
    if (relecture.current) relecture.current(d.etat !== etat);
  }, [id, minuit, etat, cle]);
  return lu;
}

/* Aujourd'hui (§ 3.9) : le titre en petites capitales et, à droite, la durée
 * allumée depuis minuit ; les quatre lignes les plus récentes — l'heure sur 52 px
 * en 13 / 800, quoi en 13 / 700, une note en 11,5, et qui, une pastille au glyphe
 * du § 8. La règle est celle des prises (`journalDuJour`, vocabulaire « lumière »),
 * et la mise en page aussi : sur une feuille étroite, la pastille passe sous le
 * texte (les classes du journal des prises, index.css). `etat` : l'état que la
 * fiche montre (`{ on, depuis }`), pour la durée d'une lampe sans note ; `personnes` : qui est derrière un compte (B5, la
 * pastille dit son nom). « Rien depuis minuit. » ;
 * un journal qu'on n'a pas pu lire le dit, après les lignes de Loggia s'il y en a. */
export function Aujourdhui({ lu, minuit, maintenant, etat = null, personnes = null }) {
  const illisible = !!lu && lu.evenements == null;
  const lignes = lu ? journalDuJour({ evenements: lu.evenements || [], lignes: lu.lignes, minuit, vocabulaire: 'lumiere', fondu: lu.fondu, personnes }).slice(0, 4) : null;
  const qui = PASTILLES_QUI();
  const heure = (x) => new Date(x).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const note = (texte) => <div style={{ ...SOUS, marginTop: 10 }}>{texte}</div>;
  return (
    <div className="o-prise-journal" style={{ ...PANNEAU, padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ ...PETITES_CAPITALES, flex: 1 }}>{tr('Aujourd’hui')}</span>
        {lu && !illisible && <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--o-text2)' }}>{texteDuree(minutesAllumee(lu.evenements, minuit, maintenant, etat))}</span>}
      </div>
      {lignes == null ? note(tr('Chargement…'))
        : !lignes.length ? note(illisible ? tr('Le journal n’a pas pu être lu.') : tr('Rien depuis minuit.'))
          : (<>
            {lignes.map((l, i) => (
              <div key={l.t + '-' + i} className="o-prise-journal-ligne" style={{ padding: '10px 0', borderTop: filet(i) }}>
                <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{heure(l.t)}</span>
                <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{l.quoi}</span>
                  {l.note && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)' }}>{l.note}</span>}</span>
                <span data-qui="" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, background: 'var(--o-s1)', fontSize: 11.5, fontWeight: 800 }}>
                  <Fi i={qui[l.qui][1]} size={11} />{motQui(l, qui)}</span>
              </div>))}
            {illisible && note(tr('Le journal n’a pas pu être lu.'))}
          </>)}
    </div>
  );
}

/**
 * `vue` : la vue de la lampe, celle de sa carte (`useVueLumiere`, App.jsx) ;
 * `piece` : le nom de sa pièce ; `epingle` : son épingle ; `glyphe` : le glyphe
 * de sa carte ; `bascule`, `jauge` : la bascule et la barre de la maison ;
 * `onFiche(id)` ouvre la fiche universelle de l'appareil ; `maintenant` sert aux tests.
 */
export default function FicheLumiereContent({ id, vue: v, piece = null, epingle = null, glyphe = null, bascule: Interrupteur, jauge: Jauge, onFiche = null, maintenant = null }) {
  const H = v.hass;
  const a = v.attributs || {};
  const t = maintenant == null ? Date.now() : Number(maintenant);
  // La fiche ouverte, le carnet et les minuteurs se relisent toutes les 15 s.
  const { minuteurs } = useEtatLumieres(true, { rapide: true });
  const vivant = useVivant();
  const [mode, setMode] = useState(null);
  const [errMinuteur, setErrMinuteur] = useState('');
  // Un appel du minuteur est parti : les puces attendent sa réponse — le serveur AJOUTE à ce qui reste (chantier Prises, B3).
  const [minuteurEnVol, setMinuteurEnVol] = useState(false);
  const volMinuteur = useRef(false);

  const cap = capacitesLumiere(id, a);
  const reglage = v.on ? reglageLumiere(a) : null;
  // Éteinte, le mode que le carnet garde d'elle (B13) : un blanc, ou une couleur — `white` compris, sa puce vit avec les couleurs.
  const modeCarnet = v.dernierMode === 'color_temp' ? 'blancs' : v.dernierMode === 'white' || MODES_COULEUR.includes(v.dernierMode) ? 'couleurs' : null;
  // Le mode montré : celui qu'on a choisi, sinon celui du moment, sinon celui du carnet, sinon les blancs s'il y en a.
  const blancs = cap.blancs && (!cap.couleurs || (mode || (reglage && reglage.mode) || modeCarnet || 'blancs') === 'blancs');
  const bornes = bornesBlanc(a);
  const encre = encreBlancs();
  /* Les effets (B4), à deux conditions (retouches du 19/10, R1, R2) : la lampe ANNONCE la fonction effet — `peut` lit la règle
   * même de `planAction` (le bit 4 de `supported_features`, `set_effect`), sans quoi l'ordre serait refusé et la rangée mentirait
   * —, et ÉTEINTE, aucun effet ne tourne : « Aucun » est sa valeur, quoi que l'intégration laisse dans `effect`. */
  const annonces = effetsLumiere(a);
  const publies = peut(H, id, 'set_effect') ? annonces : null;
  const effets = publies && !v.on ? { ...publies, courant: null } : publies;
  // Choisir un blanc, une couleur ou un effet allume la lampe : le geste d'abord (L9, B4).
  const blanc = (k) => { v.avancer(true); commander(H, id, 'set_color_temp', k); };
  const teinte = (h) => { v.avancer(true); commanderService(H, id, 'light', 'turn_on', { entity_id: id, hs_color: [h, 100] }); };
  // Le blanc du mode `white` (B6) : `light.turn_on` avec `white: <niveau>`, par le moteur (`set_white`, actions.js).
  const blancPur = () => { v.avancer(true); commander(H, id, 'set_white', niveauBlanc(a, v.dernier)); };
  /* `ListeChoix` rappelle `onChange` même sur la valeur déjà choisie (ui.jsx, `choisir`) : la fiche, elle, n'envoie rien pour
   * rien — ni l'effet déjà en cours, ni « Aucun » quand aucun ne tourne. Éteinte, « Aucun » est la valeur : il ne l'allume jamais ;
   * un effet, lui, l'allume (R2). */
  const effet = (nom) => {
    if (!effets || nom === (effets.courant || effets.aucun || '')) return;
    v.avancer(true); commander(H, id, 'set_effect', nom);
  };
  // En mode `white` : « Blanc » sans teinte ; un pastel garde sa teinte (B1) — ni l'un ni l'autre ne cercle une couleur.
  const enBlancPur = !!reglage && reglage.blanc && reglage.teinte == null;

  const minuteur = (msg) => {
    if (volMinuteur.current || !H || typeof H.callWS !== 'function') return;
    volMinuteur.current = true;
    setMinuteurEnVol(true);
    setErrMinuteur('');
    // Que la réponse soit bonne, refusée ou perdue, les puces reprennent la main.
    const fini = () => { volMinuteur.current = false; if (vivant.current) setMinuteurEnVol(false); };
    // `new Promise` : un `callWS` qui lève avant de répondre est un échec comme un autre.
    new Promise((ok) => ok(H.callWS(msg))).then((r) => { if (r && r.minuteurs) poserMinuteurs(r); },
      // Un refus nommé du serveur (`minuteur_deja_eteint`, audit du 19/10) se dit en clair ; le reste, la phrase générale.
      (x) => { if (vivant.current) setErrMinuteur(x && x.code === 'unauthorized' ? tr('Ce compte ne pilote pas cet appareil.') : texteRefus(x) || tr('Le minuteur n’a pas pu être enregistré.')); })
      .then(fini, fini);
  };

  // La plaque, comme celle de la carte : la teinte de la vraie lumière allumée, le gris éteinte, le gris éteint muette.
  const plaque = { icone: 'bulb', glyphe, fond: v.on ? 'rgba(' + v.couleurs.rgb + ',.22)' : 'var(--o-s1)', encre: v.on ? v.encre : v.muette ? 'var(--o-text3)' : 'var(--o-text2)' };
  /* Un mot en grand — « Éteinte », « Indisponible » — : 34 px, moins quand la place manque, d'après sa longueur et la
   * largeur du bloc (une requête de conteneur), comme la fiche des prises : « Niedostępny » ne passe pas sous la bascule. */
  const motGrand = (mot, couleur) => <span style={{ fontSize: 'clamp(20px, calc(100cqi / (0.64 * ' + Math.max(1, mot.length) + ')), 34px)', fontWeight: 800, color: couleur }}>{mot}</span>;
  /* Sous le doigt (passe bis 3 du 17/10, point 3), le grand pourcentage suit la barre (`v.glisse`, `v.bri`) — une lampe éteinte comprise :
   * il paraît dès le glisser, et rien ne part avant le relâcher. */
  const grand = v.muette ? motGrand(tr('Indisponible'), 'var(--o-bad)')
    : !v.on && v.glisse == null ? motGrand(tr('Éteinte'), 'var(--o-text2)')
      : v.bri == null ? motGrand(tr('Allumée'), 'var(--o-text)')
        : <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}><span style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1 }}>{v.bri}</span><span style={{ fontSize: 22, fontWeight: 800 }}>%</span></span>;
  const phrase = phraseFiche({ phrase: v.phrase.texte, on: v.on, muette: v.muette, depuis: v.depuis, dernier: v.dernier, reglage, effet: v.on && annonces ? annonces.courant : null, maintenant: t });
  // L'heure du moment : un minuteur échu, pas encore relu, n'est plus un minuteur — jamais « dans 0 min » (audit du 19/10).
  const fin = finMinuteur(minuteurs, id, t);
  // Le minuteur se décompte à la seconde (20/10) : la fiche bat tant qu'il tourne, jamais quand l'heure est fixée (les tests).
  useHorloge(maintenant == null && !!fin && v.on);
  const minuit = minuitLocal(t);
  /* Le journal se relit quand l'état RÉEL de la lampe change — son `last_updated` —, et chaque minute. Pas sur le geste d'abord
   * (`v.depuis`, `v.bri` : des valeurs optimistes) : la lecture partait alors AVANT que le serveur n'ait noté le réglage, rendait le
   * carnet d'avant, et « Réglée à 60 % » n'arrivait qu'à la minute suivante (revue du 14/10, R2). La lampe répond, son `last_updated`
   * bouge, la fiche relit — le carnet l'a noté. */
  const reel = H && H.states ? H.states[id] : null;
  const cleJournal = (reel && (reel.last_updated || reel.last_changed)) || '';
  const journal = useJournalLumiere(H, id, minuit, reel ? reel.state : '', cleJournal);
  // Qui est derrière un compte Home Assistant (B5) : les `person.*` du relevé.
  const personnes = personnesDe(H && H.states);
  return (
    <div className="rb-fiche" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <EnteteFiche nom={v.nom} epingle={epingle} plaque={plaque} sousNom={[piece, typeLumiere(cap)].filter(Boolean).join(' · ')} />

      {/* Muette, le panneau de l'appareil porte le liseré qui respire, et rien n'y commande plus (lot 16 de l'audit) :
        * ni bascule, ni barre, ni palette, ni minuteur. */}
      <div className={v.muette ? 'o-panne' : undefined} style={{ ...PANNEAU, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, containerType: 'inline-size' }}>
            <div style={{ lineHeight: 1.1 }}>{grand}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: v.phrase.panne ? 'var(--o-bad)' : 'var(--o-text2)', marginTop: 6 }}>{phrase}</div>
          </div>
          {Interrupteur && !v.muette && <Interrupteur on={v.on} nom={v.nom} onToggle={() => v.commander(!v.on)} />}
        </div>
        {/* La barre, variable et vivante seulement : de 1 à 100 %, la teinte allumée, le repère gris éteinte (L7) ; glisser l'allume.
          * Muette, elle n'est pas dessinée : un dessin qui ne répond pas laisse croire à une commande (le lot 16 de l'audit). */}
        {v.variable && !v.muette && Jauge && (
          <div style={{ marginTop: 14 }}>
            <Jauge v={v.on ? v.bri : v.dernier} couleur={v.encre} grade={v.degrade} actif={!v.muette} min={1} eteinte={!v.on} zone={52} piste={32} marge={0}
              label={tr('Luminosité') + ' ' + v.nom} onCommit={v.regler} onGlisse={v.suivre} rafale />
            <div aria-hidden="true" style={{ ...PETIT, display: 'flex', justifyContent: 'space-between', marginTop: 2 }}><span>{'1\u00a0%'}</span><span>{'100\u00a0%'}</span></div>
          </div>
        )}
      </div>

      {(cap.blancs || cap.couleurs) && !v.muette && (
        <div style={{ ...PANNEAU, padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ ...PETITES_CAPITALES, flex: 1 }}>{tr('Couleur')}</span>
            {reglage && <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--o-text2)' }}>{reglage.etiquette}</span>}
          </div>
          {cap.blancs && cap.couleurs && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, marginTop: 12 }}>
              <button type="button" aria-pressed={blancs} onClick={() => setMode('blancs')} style={PUCE(true, blancs)}>{tr('Blancs')}</button>
              <button type="button" aria-pressed={!blancs} onClick={() => setMode('couleurs')} style={PUCE(true, !blancs)}>{tr('Couleurs')}</button>
            </div>
          )}
          {/* Les deux palettes partagent la même case : la fiche garde la hauteur de la plus grande d'un mode à
            * l'autre, sans hauteur fixe (retour du 19/09 : deux lampes, deux hauteurs de fiche). */}
          <div style={{ display: 'grid' }}>
          {cap.blancs && (<div className="o-lumiere-blancs" aria-hidden={!blancs} style={{ gridArea: '1 / 1', visibility: blancs ? 'visible' : 'hidden' }}>
            <div style={{ marginTop: 14 }}>
              <CurseurPeint label={tr('Température du blanc')} min={bornes.min} max={bornes.max} pas={50} unite="K" piste={degradeBlanc(bornes)}
                valeur={reglage && reglage.mode === 'blancs' ? reglage.kelvin : null} etat={v.on ? null : tr('Éteinte')} onCommit={blanc} />
            </div>
            <div aria-hidden="true" style={{ ...PETIT, display: 'flex', justifyContent: 'space-between', marginTop: 2 }}><span>{tr('Plus chaud')}</span><span>{tr('Plus froid')}</span></div>
            <div className="o-lumiere-blancs-grille" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
              {BLANCS_NOMMES().map(([k, puce]) => {
                const kb = blancBorne(k, bornes);
                const choisi = !!reglage && reglage.mode === 'blancs' && Math.abs(reglage.kelvin - kb) < 150;
                return (
                  <button key={k} type="button" className="o-lumiere-blanc" aria-pressed={choisi} onClick={() => blanc(kb)}
                    style={{ height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, minWidth: 0, padding: '0 4px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'rgb(' + rgbDuBlanc(kb).join(',') + ')', color: encre,
                      outline: choisi ? '2px solid var(--o-text)' : 'none', outlineOffset: 2 }}>{puce}</button>
                );
              })}
            </div>
          </div>)}
          {cap.couleurs && (<div aria-hidden={blancs} style={{ gridArea: '1 / 1', visibility: blancs ? 'hidden' : 'visible' }}>
            {/* Le blanc d'un ruban `hs + white` (B6) : une fois en couleur, il ne savait plus revenir au blanc. */}
            {cap.blanc && (
              <button type="button" aria-pressed={enBlancPur} onClick={blancPur} style={{ ...PUCE(true, enBlancPur), width: '100%', marginTop: 12 }}>{tr('Blanc')}</button>
            )}
            <div style={{ marginTop: 14 }}>
              <CurseurPeint label={tr('Teinte')} min={0} max={360} pas={5} unite="°" piste={degradeTeinte()}
                valeur={reglage && reglage.mode === 'couleurs' ? Math.round(reglage.teinte) : null} etat={v.on ? null : tr('Éteinte')} onCommit={teinte} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
              {COULEURS_NOMMEES().map(([h, nom]) => {
                const choisie = !!reglage && reglage.mode === 'couleurs' && !reglage.blanc && reglage.teinte != null && ecartTeintes(reglage.teinte, h) < 8;
                return (
                  <button key={h} type="button" aria-label={nom} title={nom} aria-pressed={choisie} onClick={() => teinte(h)}
                    style={{ height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', padding: 0, minWidth: 0, background: 'rgb(' + rgbDeLaTeinte(h).join(',') + ')',
                      outline: choisie ? '2px solid var(--o-text)' : 'none', outlineOffset: 2 }} />
                );
              })}
            </div>
          </div>)}
          </div>
        </div>
      )}

      <div style={{ ...PANNEAU, overflow: 'hidden' }}>
        {/* Effet (B4) : les effets que l'ampoule publie (`effect_list`), nommés comme son intégration les nomme — jamais traduits —,
          * dans une liste de choix (la règle des menus) ; « Aucun » quand la liste nomme l'arrêt (`off`, `none`, `stop_effect`).
          * Choisir envoie `light.turn_on` avec `effect`, par le moteur (`set_effect`) : une lampe éteinte s'allume. Muette, rien. */}
        {effets && !v.muette && (
          <ListeChoix label={tr('Effet')} value={effets.courant || effets.aucun || ''} onChange={effet}
            nom={tr('{a} : {b}', { a: tr('Effet'), b: effets.courant || tr('Aucun') })}
            options={(effets.aucun ? [{ id: effets.aucun, label: tr('Aucun') }] : []).concat(effets.effets.map(e => ({ id: e, label: e })))}
            style={{ ...RANGEE, ...EN_BOUTON, width: '100%', borderRadius: 0 }}>
            {() => (<>
              <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('Effet')}</span><span style={{ ...SOUS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{effets.courant || tr('Aucun')}</span></span>
              <Fi i="angle-small-down" size={16} color="var(--o-text3)" />
            </>)}
          </ListeChoix>
        )}
        {!v.muette && (() => {
          /* Le minuteur de la fiche des prises, tel quel (§ 3.8) : il ne se montre qu'allumée — le serveur l'annule
           * quand elle s'éteint, le sondage ne le sait qu'au tour suivant ; éteinte, « Disponible une fois la lumière
           * allumée. », puces inertes ; muette, pas de rangée. Toutes les puces attendent la réponse d'un appel en vol. */
          const enMarche = fin && v.on;
          const libre = !minuteurEnVol;
          const inerte = (peut) => (peut ? undefined : true);
          return (
            // 18 px de chaque côté, comme le contenu des autres panneaux : avec le `RANGEE` des lignes à chevron (14 px à droite), les puces et « Annuler »
            // au bout finissaient 4 px plus à droite que tout le reste (revue du 14/10, R10).
            <div style={{ ...RANGEE, padding: '12px 18px', flexDirection: 'column', alignItems: 'stretch', borderTop: filet(effets ? 1 : 0) }}>
              <span><span style={TITRE}>{tr('Minuteur')}</span>
                <span style={SOUS}>{enMarche ? phraseMinuteur(fin, t) : v.on ? tr('Éteint la lumière au bout du temps choisi.') : tr('Disponible une fois la lumière allumée.')}</span></span>
              {enMarche ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  {AJOUTS_MINUTEUR.map(n => <button key={n} type="button" aria-disabled={inerte(libre)} onClick={() => { if (libre) minuteur({ type: 'loggia/minuteurs/poser', entity_id: id, minutes: n }); }} style={PUCE(libre)}>{'+' + dureePrise(n)}</button>)}
                  <button type="button" aria-disabled={inerte(libre)} onClick={() => { if (libre) minuteur({ type: 'loggia/minuteurs/annuler', entity_id: id }); }} style={{ ...PUCE(libre), marginLeft: 'auto' }}>{tr('Annuler')}</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                  {DUREES_MINUTEUR.map(n => <button key={n} type="button" aria-disabled={inerte(v.on && libre)} onClick={() => { if (v.on && libre) minuteur({ type: 'loggia/minuteurs/poser', entity_id: id, minutes: n }); }} style={PUCE(v.on && libre)}>{dureePrise(n)}</button>)}
                </div>
              )}
              {errMinuteur && <div role="alert" style={ALERTE}>{errMinuteur}</div>}
            </div>
          );
        })()}
        {onFiche && (
          <button type="button" onClick={() => onFiche(id)} style={{ ...RANGEE, ...EN_BOUTON, borderTop: filet(v.muette ? 0 : 1) }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('L’appareil')}</span><span style={SOUS}>{tr('L’épingle, les commandes et toutes ses entités')}</span></span>
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </button>
        )}
      </div>

      <Aujourdhui lu={journal} minuit={minuit} maintenant={t} etat={{ on: v.on, depuis: v.depuis }} personnes={personnes} />
    </div>
  );
}
