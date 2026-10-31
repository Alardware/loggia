/* ── La fiche d'un lecteur (chantier Médias, § 6.5 à 6.10 ; M12, M18, M19 ; sa maquette « Cartes médias », cadres 1b à 1e) ──
 *
 * Une page, sans onglets : sa hauteur suit son contenu (la règle des popups) ;
 * ses panneaux (`--o-s3`, le liseré de la maison, 12 px entre eux), jamais une
 * boîte dans une boîte :
 *  - l'en-tête commun (`EnteteFiche`) : la plaque de 40 px (la pochette en
 *    lecture, sinon le glyphe de la carte), teintée comme celle de la carte ; le
 *    nom ; « {pièce} · {genre} » ; la bascule si elle sert (M10) — et si le mode
 *    enfant ne tient pas l'écran bloqué —, l'épingle, UNE croix ;
 *  - le panneau de ce qui joue (§ 6.6), teinté de la pochette en lecture ou en
 *    pause (0,22 → 0,06) : la pochette de 88 px, le titre, l'artiste, « En
 *    direct » et « En lecture · {source} » ou « En pause », la progression qui
 *    se glisse (le bit SEEK, au clavier aussi) et la rangée des commandes —
 *    chacune selon son bit (M11). « Rien en lecture » et sa phrase, ou « Éteinte »
 *    et la puce « Allumer ». Puis le volume : le muet, la barre de la maison
 *    (piste 32), « 30 % » ou « Muet ». Indisponible : le mot, la phrase, et plus
 *    aucune commande (M7) ;
 *  - le panneau d'une Echo (§ 6.7) : « Dire à Alexa / Annonce ». Les phrases
 *    gardées en puces (M19), le champ, l'étoile « Garder » ; l'annonce (M9) :
 *    « Sur » — toute la maison ou les Echo choisies —, le champ, quatre annonces
 *    toutes prêtes, et les cartes visées qui l'écrivent six secondes ;
 *  - le panneau d'une TV (§ 6.8) : Applications / Télécommande ; une appli est
 *    une puce de 56 px, son nom et, si Loggia connaît la marque, son logo — plus
 *    d'initiales (M18) ; le pavé rond, puis Retour · Accueil · Lecture · Veille ;
 *  - la bibliothèque (§ 6.9), pour un lecteur qui sait parcourir : les favoris
 *    gardés, « Parcourir la bibliothèque » (la seconde feuille, inchangée) ;
 *  - « L'appareil » (§ 6.10).
 * Ce qui part (M12, § 4) : le fond flouté de la pochette, l'accent tiré de la
 * pochette sur les boutons, les boutons « verre », `media_play_pause`, les
 * initiales des applis, « Parcourir » sur une Echo.
 *
 * Chargée à la demande (`FicheMedia`, App.jsx), elle n'importe jamais App.jsx :
 * la coquille lui passe la VUE du lecteur — celle de sa carte (`useVueLecteur` :
 * la lecture fusionnée du jumeau, les avances d'un geste, la teinte, la phrase,
 * les ordres explicites, le `hass` vivant) —, l'épingle, le glyphe de sa carte,
 * l'ouverture de la fiche universelle, et ses briques (`RmBascule`, `RmJauge`,
 * `Segment`, le dégradé du volume). Elle n'est PAS la feuille : la coquille
 * garde le `BottomSheet` et pose la frontière Suspense DEDANS, comme
 * `FicheLumiere` — un morceau qui ne se charge pas se dit dans la feuille, par
 * sa barrière (`Barriere`, ui.jsx), jamais à la place de la vue qui l'a ouverte.
 */
import { useState, useEffect, useRef, Suspense } from 'react';
import { tr, trSens, locale } from './i18n.js';
import { enPanne } from './outils.js';
import { Fi, kbSlider, BottomSheet } from './ui.jsx';
import { Ico } from './icones.jsx';
import { LOGGIA_INDEX, medPlayers, cfgVal, compteOrdinaire } from './state.js';
import { lazyRecharge } from './recharge.js';
import { useEtatEnfant, maisonAvecEnfant, profilEnfant, dureeTexte, poserEtatEnfant } from './enfantetat.js';
import { PinModal } from './pinmodal.jsx';
import { raisonEchec } from './refus.js';
import { annoncer, ANNONCE_MS } from './lecteuretat.js';
import { useOptimiste } from './optimiste.js';
import { appelPourJouer, phraseAlexa, TYPE_PHRASE } from './favlecture.js';
import { applisDe, appelPourLancer, appliCourante, telecommandeDe } from './applis.js';
import { integrationDe, telecommandePour, appelPourTouche } from './telecommande.js';
import { marqueDe } from './marques.js';
import NavigateurMedias, { favorisLecture, noterFavori, MEDIA_ICONES } from './navigateurmedias.jsx';
import { genreLecteur, glypheLecteur, posLecteur, fmtTemps, pourcentTexte, etatVolume, nomLecteur } from './lecteur.js';
import { EnteteFiche, PETITES_CAPITALES, filet } from './fichecommune.jsx';
import { LISERE } from './styles.js';
import { PANNEAU, RANGEE, TITRE, SOUS } from './fichekit.js';

/* La feuille « Réglages parent » du mode enfant (chantier Mode enfant, E19) : la seconde feuille de cette fiche, montée après son
 * contenu, chargée à l'ouverture seulement — le motif du plan du robot (ficherobot.jsx). Son contenu seul est à la demande
 * (ficheenfant.jsx) ; la coquille `FicheEnfant`, ci-dessous, vit ici. */
const ContenuEnfant = lazyRecharge(() => import('./ficheenfant.jsx'));
/* La coquille de la feuille « Réglages parent » (passe bis du 17/10, point 10), sur le modèle de `FicheMedia` (App.jsx) : elle garde le
 * `BottomSheet`, et la frontière Suspense est DEDANS, avec un repli qui tient la hauteur d'une fiche — la feuille s'ouvre pendant le
 * chargement, et un morceau qui ne se charge pas se dit dans SA feuille, par sa barrière (`Barriere`, ui.jsx), jamais dans celle du
 * lecteur. Avant, le `Suspense` était HORS du `BottomSheet`, qui vivait dans le morceau : rien ne s'affichait pendant le chargement,
 * et un morceau manquant tombait dans la barrière de la fiche du lecteur. */
function FicheEnfant({ onClose, ...props }) {
  return (
    <BottomSheet onClose={onClose}>
      {() => (
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <ContenuEnfant {...props} />
        </Suspense>
      )}
    </BottomSheet>
  );
}

const EN_BOUTON = { background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--o-text)', textAlign: 'left' };
const NOTE = { fontSize: 11.5, fontWeight: 700, color: 'var(--o-text3)' };
const GRAND = { fontSize: 24, fontWeight: 800, lineHeight: 1.15 };
/* Une puce de sa maquette (`ChipButton`) : le gris doux, sans bordure ; choisie, le bleu plein et le blanc (la règle des puces) ;
 * inerte à .4 — mais rien d'inerte ne se dessine ici : ce qu'un lecteur ne sait pas n'a pas de puce (M11). */
const PUCE = (choisie = false, peut = true) => ({ border: 'none', fontFamily: 'inherit', fontWeight: 700, cursor: peut ? 'pointer' : 'default', opacity: peut ? 1 : .4,
  display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', minWidth: 0,
  background: choisie ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: choisie ? '#fff' : 'var(--o-text1)' });
// Une puce ronde ou carrée d'une commande : 44, 52 ou 68 px (la lecture, un disque).
const RONDE = (taille, choisie = false, peut = true) => ({ ...PUCE(choisie, peut), position: 'relative', width: taille, height: taille, flexShrink: 0, padding: 0, borderRadius: taille > 60 ? '50%' : 14 });
// Une puce de 44 px qui porte un mot : les phrases, les favoris, « Allumer », « Parcourir la bibliothèque ».
const LARGE = (choisie = false, peut = true) => ({ ...PUCE(choisie, peut), height: 44, padding: '0 12px', borderRadius: 12, gap: 7, fontSize: 12.5, whiteSpace: 'nowrap' });
const ELLIPSE = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
/* Une puce de 44 px qui porte une PHRASE sur deux colonnes (les phrases gardées, les annonces prêtes, les favoris) : à 390 px, « On part
 * dans 5 minutes », « Musique pour dormir », « Wir fahren in 5 Minuten », « Wychodzimy za 5 minut » finissaient en « … » dans 149 px.
 * Elle grandit à deux lignes s'il le faut, jamais moins de 44 px ; un mot seul trop long se coupe en dernier recours (passe bis, 17/10). */
const SOUPLE = { height: 'auto', minHeight: 44, padding: '5px 10px', whiteSpace: 'normal', lineHeight: '16px' };
const DEUX_LIGNES = { minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflowWrap: 'anywhere', textAlign: 'center' };
// Le champ de sa maquette (`Field`, 46 px) : le gris doux, le liseré, l'encre de la maison.
const CHAMP = { flex: 1, minWidth: 0, height: 46, padding: '0 12px', borderRadius: 12, background: 'var(--o-s1)', border: LISERE, color: 'var(--o-text)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, boxSizing: 'border-box' };
const DEUX_COLONNES = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 };
const QUATRE_COLONNES = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 };

/* Le dessin d'une touche. Une flèche, un rond, un mot — jamais une icône
 * inventée : ce que la télécommande sait faire vient de sa table. */
const DESSIN_TOUCHE = {
  haut: 'angle-small-up', bas: 'angle-small-down', gauche: 'angle-small-left', droite: 'angle-small-right',
  retour: 'arrow-left', accueil: 'home', lecture: 'play-pause',
};
const NOMS_TOUCHES = () => ({
  haut: tr('Haut'), bas: tr('Bas'), gauche: tr('Gauche'), droite: tr('Droite'), ok: tr('OK'),
  retour: tr('Retour'), accueil: tr('Accueil'), lecture: tr('Lecture ou pause'),
});

/* Un composant encore monté ? Un service qui répond après la fermeture de la feuille ne doit plus rien poser. */
function useVivant() {
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  return vivant;
}

/* Un ordre « en vol » (M13) : une seule phrase à la fois. `envoyer(f)` lance `f` — qui rend ce que `callService` rend — et
 * retient `enVol` jusqu'à sa réponse, quelle qu'elle soit ; un second appui n'envoie rien. */
function useEnVol() {
  const [enVol, setEnVol] = useState(false);
  // La référence tranche dans le même tic (deux appuis avant un rendu) ; l'état, lui, redessine les puces.
  const vol = useRef(false);
  const vivant = useVivant();
  const envoyer = (f) => {
    if (vol.current) return false;
    vol.current = true; setEnVol(true);
    // L'ordre part tout de suite ; sa réponse — ou son refus, ou rien (un `callService` qui ne rend pas de promesse) — libère.
    let reponse = null;
    try { reponse = f(); } catch { reponse = null; }
    Promise.resolve(reponse).catch(() => {}).then(() => { vol.current = false; if (vivant.current) setEnVol(false); });
    return true;
  };
  return [enVol, envoyer];
}

/* Glisser sur une barre : le remplissage suit le doigt sans rendu React, et l'ordre part au relâcher (la règle de `RmJauge`).
 * `pan-y`, jamais `none` (revue du 14/10, R1) : un doigt posé pour FAIRE DÉFILER la feuille la fait défiler, le navigateur annule
 * le geste (`pointercancel`) et le dessin d'avant revient — rien ne part. */
const glisser = (pct, onCommit) => (e) => {
  e.preventDefault(); e.stopPropagation();
  const el = e.currentTarget, fill = el.querySelector('[data-fill]'), r = el.getBoundingClientRect();
  const calc = (x) => Math.max(0, Math.min(100, (x - r.left) / Math.max(1, r.width) * 100));
  let n = calc(e.clientX);
  const peindre = (v) => { if (fill) { fill.style.transition = 'none'; fill.style.width = v + '%'; } };
  peindre(n);
  try { el.setPointerCapture(e.pointerId); } catch { /* un doigt déjà parti */ }
  el.onpointermove = (ev) => { n = calc(ev.clientX); peindre(n); };
  const fin = () => { el.onpointermove = null; el.onpointerup = null; el.onpointercancel = null; if (fill) fill.style.transition = ''; };
  el.onpointerup = () => { fin(); onCommit(n); };
  el.onpointercancel = () => { fin(); peindre(pct); };
};

/* ── Le panneau de ce qui joue (§ 6.6) ──────────────────────────────────────── */

/* La progression : 6 px, le temps écoulé et la durée ; glissable si le lecteur sait chercher (le bit SEEK), au clavier aussi
 * (`kbSlider` : ← → par 5 %, Début / Fin), la valeur lue en temps. La position avance d'elle-même en lecture — un tic par seconde —
 * et le geste se voit tout de suite : 3 s d'avance (`useOptimiste`), jetée dès que le lecteur publie une nouvelle position. */
function Progression({ v, maintenant }) {
  const l = v.l;
  const [, tic] = useState(0);
  const vivante = v.playing && !!l.dur && maintenant == null;
  useEffect(() => {
    if (!vivante) return undefined;
    const iv = setInterval(() => tic(n => n + 1), 1000);
    return () => clearInterval(iv);
  }, [vivante]);
  const [avance, poserAvance] = useOptimiste(String(l.pos) + '|' + String(l.posAt), 3000);
  const t = maintenant != null ? maintenant : Date.now();
  const pos = avance != null ? avance : posLecteur(l, t);
  const pct = l.dur && pos != null ? Math.min(100, Math.max(0, pos / l.dur * 100)) : 0;
  const chercher = (p) => { const s = p / 100 * l.dur; poserAvance(s); v.chercher(s); };
  const peut = !!v.cmd.chercher;
  const piste = (
    <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--o-s1)', overflow: 'hidden' }}>
      <span data-fill="" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct + '%', borderRadius: 3, background: 'var(--o-text1)', transition: 'width .5s linear' }} />
    </div>
  );
  const boite = { marginTop: 18, padding: '6px 0', touchAction: 'pan-y' };
  return (
    <>
      {peut ? (
        /* Le rôle slider et le clavier arrivent par `kbSlider` (flèches, Début, Fin) : la règle ne sait pas lire ce qu'un étalement apporte. */
        /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- voir ci-dessus */
        <div {...kbSlider(tr('Position dans le morceau'), pct, chercher)} aria-valuetext={fmtTemps(pos)} onPointerDown={glisser(pct, chercher)} onClick={(e) => e.stopPropagation()}
          style={{ ...boite, cursor: 'ew-resize' }}>{piste}</div>
      ) : <div aria-hidden="true" style={boite}>{piste}</div>}
      <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', ...NOTE, fontVariantNumeric: 'tabular-nums' }}>
        <span>{fmtTemps(pos)}</span><span>{fmtTemps(l.dur)}</span>
      </div>
    </>
  );
}

/* La rangée des commandes, centrée : aléatoire (44) · précédent (52) · lecture ou pause (68, en accent) · suivant (52) · répéter (44),
 * chacune selon son bit (M11) ; la choisie (aléatoire actif, répéter all ou one — « 1 » en exposant) en bleu plein. Les services
 * sont explicites (M13) : `media_pause` si le lecteur joue, `media_play` sinon ; jamais `media_play_pause`. */
function Commandes({ v }) {
  const l = v.l, c = v.cmd;
  const repete = l.repeat && l.repeat !== 'off';
  const suivantRepeter = () => { const o = ['off', 'all', 'one']; return o[(o.indexOf(l.repeat) + 1) % 3]; };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16 }}>
      {c.aleatoire && (
        <button type="button" aria-pressed={!!l.shuffle} aria-label={tr('Aléatoire')} title={tr('Aléatoire')} onClick={() => v.aleatoire(!l.shuffle)} style={RONDE(44, !!l.shuffle)}>
          <Fi i="shuffle" size={14} />
        </button>
      )}
      {c.precedent && (
        <button type="button" aria-label={tr('Piste précédente')} title={tr('Piste précédente')} onClick={() => v.precedent()} style={RONDE(52)}>
          <Fi i="step-backward" size={15} />
        </button>
      )}
      {c.lecture && (
        <button type="button" aria-label={v.playing ? tr('Pause') : tr('Lire')} title={v.playing ? tr('Pause') : tr('Lire')} onClick={() => v.lecture()} style={RONDE(68, true)}>
          <Fi i={v.playing ? 'pause' : 'play'} size={20} />
        </button>
      )}
      {c.suivant && (
        <button type="button" aria-label={tr('Piste suivante')} title={tr('Piste suivante')} onClick={() => v.suivant()} style={RONDE(52)}>
          <Fi i="step-forward" size={15} />
        </button>
      )}
      {c.repeter && (
        <button type="button" aria-pressed={!!repete} aria-label={tr('Répéter')} title={tr('Répéter')} onClick={() => v.repeter(suivantRepeter())} style={RONDE(44, !!repete)}>
          <Fi i="arrows-repeat" size={14} />
          {l.repeat === 'one' && <span aria-hidden="true" style={{ position: 'absolute', top: 5, right: 9, fontSize: 9.5, fontWeight: 800, lineHeight: 1 }}>1</span>}
        </button>
      )}
    </div>
  );
}

/* Ce qui joue : la pochette de 88 px (rayon 16 ; sans image, le glyphe sur la teinte), le titre, l'artiste ou l'album, puis
 * « En direct » (un flux sans durée qui n'est pas une application) et « En lecture · {source} » (`app_name` : M10) ou « En pause ». */
function CeQuiJoue({ v, maintenant }) {
  const l = v.l;
  const [artErr, setArtErr] = useState(null);
  const art = l.art && l.art !== artErr ? l.art : null;
  const titre = l.title || l.channel || l.serie || l.app || '';
  const episode = l.saison != null && l.episode != null ? 'S' + l.saison + ' E' + l.episode : l.episode != null ? 'E' + l.episode : null;
  const dessous = [l.serie && l.title !== l.serie ? l.title : null, episode, l.artist, l.album].filter(Boolean).join(' · ');
  // Une TV dans une application, sans titre : ce n'est pas un direct ; une radio, un flux sans durée, l'est.
  const appli = !l.title && !l.channel && !!l.app;
  const direct = !l.dur && !appli;
  const etat = v.playing ? (l.app && !appli ? tr('En lecture · {source}', { source: l.app }) : tr('En lecture')) : tr('En pause');
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span aria-hidden="true" style={{ width: 88, height: 88, borderRadius: 16, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgb(' + v.teinte + ')', color: '#fff' }}>
          {art
            /* `onError` n'est pas une interaction : c'est le repli quand la pochette ne charge pas. La règle vise les clics posés sur un élément inerte. */
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            ? <img src={art} alt="" onError={() => setArtErr(l.art)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <Fi i={appli ? 'apps' : 'music-note'} size={28} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.2, ...ELLIPSE }}>{titre}</div>
          {dessous && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: 3, ...ELLIPSE }}>{dessous}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, ...NOTE }}>
            {direct && <span style={{ padding: '3px 8px', borderRadius: 999, background: 'rgba(var(--o-bad-rgb),.16)', color: 'var(--o-bad)', fontWeight: 800 }}>{tr('En direct')}</span>}
            <span style={ELLIPSE}>{etat}</span>
          </div>
        </div>
      </div>
      {!!l.dur && <Progression v={v} maintenant={maintenant} />}
      <Commandes v={v} />
    </>
  );
}

/* ── Le panneau d'une Echo (§ 6.7) : « Dire à Alexa » ──────────────────────────
 *
 * La phrase est CELLE DE L'UTILISATEUR, dans sa langue et avec ses mots : c'est son Alexa qui l'écoute. Rien n'est traduit, complété
 * ni proposé d'office. Elle part chez la jumelle HACS (`cible`), la seule qui sache l'exécuter (`play_media`, `custom`) ; les
 * phrases gardées (M19) sont des puces, choisies le temps d'une avance ; l'étoile garde celle du champ. Une seule en vol (M13). */
function DireAAlexa({ id, cible, hass, onGarder }) {
  const [texte, setTexte] = useState('');
  const [envoyee, setEnvoyee] = useState(null);
  const [enVol, envoyer] = useEnVol();
  const vivant = useVivant();
  const minuteur = useRef(0);
  useEffect(() => () => clearTimeout(minuteur.current), []);
  const phrases = favorisLecture(id).filter(f => f.c === TYPE_PHRASE);
  const phrase = phraseAlexa(texte);
  const dire = (p) => {
    const appel = appelPourJouer(p, cible);
    if (!appel || !hass || !hass.callService) return;
    if (!envoyer(() => hass.callService(appel.domaine, appel.service, appel.data))) return;
    setEnvoyee(p.t); setTexte('');
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => { if (vivant.current) setEnvoyee(null); }, 6000);
  };
  const garder = () => { if (!phrase) return; noterFavori(id, phrase); setTexte(''); if (onGarder) onGarder(); };
  return (
    <div>
      <div style={{ ...NOTE, marginTop: 2 }}>{tr('Ce qui suit « Alexa », en un geste')}</div>
      {phrases.length > 0 && (
        <div style={{ ...DEUX_COLONNES, marginTop: 10 }}>
          {phrases.map(f => (
            <button key={f.i} type="button" aria-pressed={envoyee === f.t} aria-disabled={enVol || undefined} title={f.t} onClick={() => dire(f)} style={{ ...LARGE(envoyee === f.t, !enVol), ...SOUPLE }}>
              <Fi i="star" size={11} style={{ color: envoyee === f.t ? '#fff' : 'var(--o-gold)', flexShrink: 0 }} /><span style={DEUX_LIGNES}>{f.t}</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <input value={texte} onChange={(e) => setTexte(e.target.value)} spellCheck={false} aria-label={tr('Dire à Alexa')}
          onKeyDown={(e) => { if (e.key === 'Enter' && phrase) dire(phrase); }} placeholder={tr('Autre chose : mets du jazz')} style={CHAMP} />
        <button type="button" onClick={garder} aria-disabled={phrase ? undefined : true} title={tr('Garder')} aria-label={tr('Garder')} style={{ ...RONDE(46, false, !!phrase), color: 'var(--o-gold)' }}>
          <Ico name="star" size={15} />
        </button>
        <button type="button" onClick={() => { if (phrase) dire(phrase); }} aria-disabled={phrase && !enVol ? undefined : true} title={tr('Envoyer à Alexa')} aria-label={tr('Envoyer à Alexa')} style={RONDE(46, true, !!phrase && !enVol)}>
          <Fi i="paper-plane" size={15} />
        </button>
      </div>
      {envoyee && <div role="status" style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-ok)', marginTop: 10, overflowWrap: 'anywhere' }}>{tr('Envoyé à Alexa : « {phrase} »', { phrase: envoyee })}</div>}
    </div>
  );
}

/* ── L'annonce (§ 6.7, M9) ─────────────────────────────────────────────────────
 *
 * Home Assistant ne raconte pas une annonce : l'onglet qui l'envoie la note (`annoncer`, lecteuretat.js) et les cartes visées
 * l'écrivent six secondes. « Sur » : « Toute la maison » (choisie par défaut), puis chaque groupe d'enceintes, puis chaque Echo qui
 * sait annoncer — plusieurs se choisissent. « Toute la maison » passe par la `notify` du groupe quand il en existe UN (`groupe`,
 * resolve.js) ; sans groupe, ou avec plusieurs (lequel serait toute la maison ?), par chaque Echo l'une après l'autre — chaque
 * groupe reste proposé en puce. Le service (§ 7.2) : `notify.send_message` sur l'entité « Annoncer » de l'officielle, sinon
 * `notify.alexa_media` (`data.type: announce`) sur la jumelle HACS — si elle RÉPOND : une jumelle indisponible ne reçoit rien —, les
 * cibles d'un même service partent en un appel. Une seule annonce en vol (M13). Les quatre annonces toutes prêtes sont traduites :
 * elles sont dites dans la langue de la maison. */
const ANNONCES_PRETES = () => [tr('À table !'), tr('On part dans 5 minutes'), tr('Au lit, les enfants'), tr('Je rentre bientôt')];
/* Par où un lecteur annonce : la `notify` « Annoncer » de l'officielle, sinon le service de HACS sur sa jumelle — vivante. */
const voieAnnonce = (S, p) => (p.annonce ? { officielle: p.annonce } : p.annonceHacs && !enPanne(p.annonceHacs, S[p.annonceHacs]) ? { jumelle: p.annonceHacs } : null);
function Annonce({ hass }) {
  const [texte, setTexte] = useState('');
  // Les cibles choisies (leurs `haid`) ; vide : toute la maison.
  const [choisies, setChoisies] = useState([]);
  const [dite, setDite] = useState(null);
  const [enVol, envoyer] = useEnVol();
  const vivant = useVivant();
  const minuteur = useRef(0);
  useEffect(() => () => clearTimeout(minuteur.current), []);
  const S = (hass && hass.states) || {};
  const lecteurs = medPlayers().filter(p => p.alexa && voieAnnonce(S, p));
  const groupes = lecteurs.filter(p => p.groupe);
  const echos = lecteurs.filter(p => !p.groupe);
  // UN groupe est toute la maison ; aucun, ou plusieurs : chaque Echo, l'une après l'autre.
  const groupe = groupes.length === 1 ? groupes[0] : null;
  const cibles = [...groupes, ...echos];
  const toute = !choisies.length;
  const choisie = (p) => choisies.indexOf(p.haid) >= 0;
  const basculer = (haid) => setChoisies(c => (c.indexOf(haid) >= 0 ? c.filter(x => x !== haid) : [...c, haid]));
  const dire = (brut) => {
    const t = String(brut == null ? '' : brut).trim();
    if (!t || !hass || !hass.callService) return;
    const vises = toute ? (groupe ? [groupe] : echos) : cibles.filter(choisie);
    if (!vises.length) return;
    const voies = vises.map(p => voieAnnonce(S, p)).filter(Boolean);
    const officielles = voies.map(v => v.officielle).filter(Boolean);
    const jumelles = voies.map(v => v.jumelle).filter(Boolean);
    const une = (l) => (l.length === 1 ? l[0] : l);
    const parti = envoyer(() => Promise.all([
      officielles.length ? hass.callService('notify', 'send_message', { entity_id: une(officielles), message: t }) : null,
      jumelles.length ? hass.callService('notify', 'alexa_media', { message: t, target: une(jumelles), data: { type: 'announce' } }) : null,
    ]));
    if (!parti) return;
    // Les cartes visées l'écrivent six secondes : toute la maison, c'est chaque Echo — et le groupe qui l'a dite, qui a sa carte.
    annoncer((toute ? [...echos, ...(groupe ? [groupe] : [])] : vises).map(p => p.haid), t);
    setTexte('');
    setDite({ texte: t, ou: toute ? null : vises.map(p => nomLecteur(S, p)).join(', ') });
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => { if (vivant.current) setDite(null); }, ANNONCE_MS);
  };
  const pret = !!texte.trim() && !enVol;
  return (
    <div>
      <div style={{ ...PETITES_CAPITALES, marginTop: 2 }}>{tr('Sur')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <button type="button" aria-pressed={toute} onClick={() => setChoisies([])} style={LARGE(toute)}>{tr('Toute la maison')}</button>
        {cibles.map(p => (
          <button key={p.haid} type="button" aria-pressed={choisie(p)} onClick={() => basculer(p.haid)} style={LARGE(choisie(p))}><span style={ELLIPSE}>{nomLecteur(S, p)}</span></button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
        <input value={texte} onChange={(e) => setTexte(e.target.value)} spellCheck={false} aria-label={tr('Annonce')}
          onKeyDown={(e) => { if (e.key === 'Enter' && pret) dire(texte); }} placeholder={tr('Votre annonce : je rentre à la maison')} style={CHAMP} />
        <button type="button" onClick={() => { if (pret) dire(texte); }} aria-disabled={pret ? undefined : true} title={tr('Annoncer')} aria-label={tr('Annoncer')} style={RONDE(46, true, pret)}>
          <Fi i="megaphone" size={15} />
        </button>
      </div>
      <div style={{ ...DEUX_COLONNES, marginTop: 10 }}>
        {ANNONCES_PRETES().map(a => (
          <button key={a} type="button" aria-disabled={enVol || undefined} title={a} onClick={() => { if (!enVol) dire(a); }} style={{ ...LARGE(false, !enVol), ...SOUPLE }}><span style={DEUX_LIGNES}>{a}</span></button>
        ))}
      </div>
      {dite && (
        <div role="status" style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-ok)', marginTop: 10, overflowWrap: 'anywhere' }}>
          {dite.ou ? tr('Annoncé sur {ou} : « {phrase} »', { ou: dite.ou, phrase: dite.texte }) : tr('Annoncé sur toute la maison : « {phrase} »', { phrase: dite.texte })}
        </div>
      )}
    </div>
  );
}

/* Le panneau d'une Echo (§ 6.7) : un `Segment` « Dire à Alexa / Annonce » quand les deux existent — « Dire à Alexa » si la jumelle
 * HACS existe, « Annonce » si une `notify` « Annoncer » ou la jumelle existe. Il s'ouvre sur « Dire à Alexa ». */
function PanneauEcho({ id, v, cibleHacs, peutAnnoncer, Segment, onGarder }) {
  const [onglet, setOnglet] = useState('alexa');
  const vue = cibleHacs && peutAnnoncer ? onglet : (cibleHacs ? 'alexa' : 'annonce');
  return (
    <div style={{ ...PANNEAU, padding: '16px 18px' }}>
      {cibleHacs && peutAnnoncer && (
        <div style={{ marginBottom: 14 }}>
          <Segment grandir value={onglet} onChange={setOnglet} label={tr('Dire à Alexa ou annoncer')}
            options={[{ id: 'alexa', label: tr('Dire à Alexa') }, { id: 'annonce', label: tr('Annonce') }]} />
        </div>
      )}
      {vue === 'alexa' && <DireAAlexa id={id} cible={cibleHacs} hass={v.hass} onGarder={onGarder} />}
      {vue === 'annonce' && <Annonce hass={v.hass} />}
    </div>
  );
}

/* ── Le panneau d'une TV (§ 6.8) : Applications / Télécommande ───────────────── *
 * Tout ce qui décide vit dans `applis.js` et `telecommande.js`, purs et testés : par où lancer, sur quelle entité, et quoi
 * souligner. Ici on ne fait que montrer. Les DERNIÈRES lancées passent devant — la grille tient huit puces, une télévision en
 * propose parfois trente ; le reste attend derrière « Toutes les applis · {n} ». Ce classement est une commodité de celui qui
 * regarde : il reste dans son navigateur, et son absence ne casse rien. */
const CLE_APPLIS = 'loggia_appsrecentes';
const APPLIS_EN_TETE = 8;
function applisRecentes(cle) {
  try {
    const t = JSON.parse(localStorage.getItem(CLE_APPLIS) || '{}');
    const v = t && typeof t === 'object' ? t[cle] : null;
    return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, APPLIS_EN_TETE) : [];
  } catch { return []; }
}
function noterAppli(cle, nom) {
  try {
    const t = JSON.parse(localStorage.getItem(CLE_APPLIS) || '{}');
    const table = (t && typeof t === 'object' && !Array.isArray(t)) ? t : {};
    table[cle] = [nom, ...applisRecentes(cle).filter(x => x !== nom)].slice(0, APPLIS_EN_TETE);
    localStorage.setItem(CLE_APPLIS, JSON.stringify(table));
    return table[cle];
  } catch { return applisRecentes(cle); }
}

function PanneauTv({ id, v, choix, tele, integration, Segment, enfant = false, bloque = null, reprise = null }) {
  const S = (v.hass && v.hass.states) || {};
  const [recentes, setRecentes] = useState(() => applisRecentes(id));
  /* Ce qu'on vient de lancer, et ce que l'appareil annonçait à ce moment-là : `appliCourante` s'en sert pour départager. */
  const [lancee, setLancee] = useState(null);
  const [tout, setTout] = useState(false);
  const [onglet, setOnglet] = useState('applis');
  // Un appareil qui n'a QUE l'un des deux n'a pas besoin d'un segment ; sans applications, il s'ouvre sur la télécommande.
  const vue = (!choix && tele) ? 'tele' : (!tele ? 'applis' : onglet);
  const appeler = (appel) => { if (appel && v.hass && v.hass.callService) v.hass.callService(appel.domaine, appel.service, appel.data); };
  // Lancer une appli allume la TV (`appelPourLancer` : `select_source`, ou `remote.turn_on` avec son activité).
  const lancer = (nom) => { appeler(appelPourLancer(choix, nom)); setLancee({ nom, avant: choix.courante }); setRecentes(noterAppli(id, nom)); };
  const toucher = (geste) => appeler(appelPourTouche(integration, geste, { telecommande: telecommandeDe(id, S, LOGGIA_INDEX), lecteur: id }));

  // Les dernières lancées d'abord, puis le reste dans l'ordre de l'appareil.
  const vues = new Set();
  const ordre = [];
  if (choix) {
    for (const n of recentes) if (choix.liste.indexOf(n) >= 0 && !vues.has(n)) { vues.add(n); ordre.push(n); }
    for (const n of choix.liste) if (!vues.has(n)) { vues.add(n); ordre.push(n); }
  }
  const devant = ordre.slice(0, APPLIS_EN_TETE);
  const reste = ordre.slice(APPLIS_EN_TETE);
  const enCours = appliCourante(choix, lancee);
  /* Une appli : une puce de 56 px, son nom et, seulement si Loggia connaît la marque (`marqueDe`), son logo ; sinon le nom seul —
   * plus d'initiales (M18) : un nom inconnu ne reçoit pas un logo approchant. La lancée est en bleu plein. */
  const puceAppli = (nom) => {
    const on = !!enCours && nom === enCours;
    const logo = marqueDe(nom);
    return (
      <button key={nom} type="button" onClick={() => lancer(nom)} aria-pressed={on} title={nom}
        style={{ ...PUCE(on), height: 56, flexDirection: 'column', gap: 5, padding: '0 6px', borderRadius: 12, fontSize: 11.5 }}>
        {logo && <Ico name={logo} size={18} />}
        <span style={{ ...ELLIPSE, maxWidth: '100%' }}>{nom}</span>
      </button>
    );
  };
  const noms = NOMS_TOUCHES();
  const sait = (g) => !!tele && tele.gestes.indexOf(g) >= 0;
  const fleche = (g, pos) => (sait(g) ? (
    <button key={g} type="button" onClick={() => toucher(g)} aria-label={noms[g]} title={noms[g]}
      style={{ position: 'absolute', ...pos, width: 44, height: 44, padding: 0, border: 'none', borderRadius: '50%', background: 'none', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Fi i={DESSIN_TOUCHE[g]} size={18} />
    </button>
  ) : null);
  // Retour · Accueil · Lecture — chacun s'il existe pour cette intégration (`TOUCHES_TV`) — puis Veille : `turn_off` ou `turn_on`
  // selon l'état connu (`v.marche`), jamais un basculement ; seulement si le lecteur a les deux bits (M10).
  const touche = (g, dessin, mot, action) => (
    <button key={g} type="button" onClick={action} title={mot} style={{ ...PUCE(), height: 60, flexDirection: 'column', gap: 5, padding: '0 4px', borderRadius: 12, fontSize: 11.5 }}>
      <Fi i={dessin} size={15} /><span style={{ ...ELLIPSE, maxWidth: '100%' }}>{mot}</span>
    </button>
  );
  /* Bloquée par le mode enfant (E16 ; passe bis du 17/10, point 2) : lancer une appli allume la TV, une touche la réveille — des boutons
   * tendus que la maison déferait vingt secondes plus tard. Ni applis ni télécommande : une ligne dit quand elles reviennent, et où les
   * applis se verrouillent vraiment (§ 4). */
  if (bloque) {
    return (
      <div data-panneau="tv" style={{ ...PANNEAU, padding: '16px 18px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{tr('Applications')}</div>
        <div data-revient-applis="" style={{ ...NOTE, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6, lineHeight: 1.45 }}>{tr('Les applications reviennent à {h} : le mode enfant tient l’écran.', { h: reprise || '—' })}</div>
        <div style={{ ...NOTE, fontWeight: 600, color: 'var(--o-text2)', marginTop: 8, lineHeight: 1.45 }}>{tr('Les applications se verrouillent dans les Réglages de l’Apple TV (Restrictions), pas ici.')}</div>
      </div>
    );
  }
  return (
    <div style={{ ...PANNEAU, padding: '16px 18px' }}>
      {choix && tele && (
        <Segment grandir value={onglet} onChange={setOnglet} label={tr('Applications ou télécommande')}
          options={[{ id: 'applis', label: tr('Applications') }, { id: 'tele', label: tr('Télécommande') }]} />
      )}
      {vue === 'applis' && choix && (
        <>
          {/* Quatre colonnes ; trois sous 400 px (`o-puces-applis`, index.css) : « Crunchyroll » finissait en « … » dans 71 px. */}
          <div className="o-puces-applis" style={{ ...QUATRE_COLONNES, marginTop: choix && tele ? 14 : 0 }}>{devant.map(puceAppli)}</div>
          {reste.length > 0 && (
            <>
              <button type="button" onClick={() => setTout(x => !x)} aria-expanded={tout}
                style={{ ...EN_BOUTON, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', marginTop: 12, padding: '10px 2px 0', border: 'none', borderTop: filet(1), fontSize: 12.5, fontWeight: 700, color: 'var(--o-text2)' }}>
                <span>{tr('Toutes les applis · {n}', { n: ordre.length })}</span>
                <span style={{ display: 'inline-flex', color: 'var(--o-text3)', transition: 'transform .18s', transform: tout ? 'rotate(180deg)' : 'none' }}><Fi i="angle-small-down" size={16} /></span>
              </button>
              {tout && <div className="o-puces-applis" style={{ ...QUATRE_COLONNES, marginTop: 10 }}>{reste.map(puceAppli)}</div>}
            </>
          )}
          {/* Sous un profil du mode enfant (chantier Mode enfant, § 4) : Loggia ne verrouille aucune appli — une serrure qui ne ferme pas est
            * pire que pas de serrure (ADR 0045) —, et le dit : les vraies sont les Restrictions de tvOS. */}
          {enfant && <div style={{ ...NOTE, fontWeight: 600, color: 'var(--o-text2)', marginTop: 12, lineHeight: 1.45 }}>{tr('Les applications se verrouillent dans les Réglages de l’Apple TV (Restrictions), pas ici.')}</div>}
        </>
      )}
      {/* Le pavé (sa maquette, 1e) : un disque, les flèches posées dessus sans cadre, et l'anneau du OK au milieu. Ce que cette
        * télécommande ignore ne s'affiche pas : Samsung ne recule pas d'une piste, Roku n'a pas de menu, Apple TV n'a pas d'info. */}
      {vue === 'tele' && tele && (
        <>
          <div style={{ position: 'relative', width: 208, height: 208, margin: (choix ? 18 : 0) + 'px auto 0', borderRadius: '50%', background: 'var(--o-s2)', border: LISERE, boxSizing: 'border-box' }}>
            {fleche('haut', { top: 6, left: 'calc(50% - 22px)' })}
            {fleche('bas', { bottom: 6, left: 'calc(50% - 22px)' })}
            {fleche('gauche', { left: 6, top: 'calc(50% - 22px)' })}
            {fleche('droite', { right: 6, top: 'calc(50% - 22px)' })}
            {sait('ok') && (
              <button type="button" onClick={() => toucher('ok')} aria-label={noms.ok}
                style={{ position: 'absolute', left: 'calc(50% - 38px)', top: 'calc(50% - 38px)', width: 76, height: 76, borderRadius: '50%', border: LISERE, background: 'var(--o-s1)', color: 'var(--o-text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 800 }}>{noms.ok}</button>
            )}
          </div>
          <div style={{ ...QUATRE_COLONNES, marginTop: 16 }}>
            {['retour', 'accueil', 'lecture'].filter(sait).map(g => touche(g, DESSIN_TOUCHE[g], g === 'lecture' ? tr('Lecture') : noms[g], () => toucher(g)))}
            {v.cmd.marche && touche('veille', 'power', tr('Veille'), () => v.marche(!v.on))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── La bibliothèque (§ 6.9) ──────────────────────────────────────────────────
 *
 * Pour un lecteur qui sait parcourir (le bit BROWSE_MEDIA, M11 — « Parcourir » quitte donc les Echo) : les favoris gardés du
 * navigateur, en puces de 44 px (la vignette de 24 px quand il en a une, le nom), et « Parcourir la bibliothèque », qui ouvre la
 * seconde feuille — inchangée, où l'étoile garde un média (M19). Un média gardé se rejoue sur place, sur l'entité de la carte. */
function Bibliotheque({ id, hass, favoris, onParcourir }) {
  const jouer = (f) => {
    const appel = appelPourJouer(f, id);
    if (appel && hass && hass.callService) hass.callService(appel.domaine, appel.service, appel.data);
  };
  return (
    <div style={{ ...PANNEAU, padding: '16px 18px' }}>
      <div style={PETITES_CAPITALES}>{tr('Bibliothèque')}</div>
      {favoris.length > 0 && (
        <div style={{ ...DEUX_COLONNES, marginTop: 10 }}>
          {favoris.map(f => (
            <button key={f.c + f.i} type="button" onClick={() => jouer(f)} title={f.t} style={{ ...LARGE(), ...SOUPLE, justifyContent: 'flex-start' }}>
              {f.v
                ? <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, backgroundImage: 'url("' + f.v + '")', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                : <Fi i={MEDIA_ICONES[f.c] || 'list'} size={13} style={{ flexShrink: 0 }} />}
              <span style={{ ...DEUX_LIGNES, textAlign: 'left' }}>{f.t}</span>
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={onParcourir} style={{ ...LARGE(), width: '100%', marginTop: 10 }}>
        <Fi i="folder" size={13} /><span>{tr('Parcourir la bibliothèque')}</span>
      </button>
    </div>
  );
}

/* ── Le mode enfant dans la popup (chantier Mode enfant, E18, E20, E23 ; § 6.3 ; sa maquette, cadres 2b et 2c) ──────────────────
 *
 * UN panneau nouveau, « Mode enfant », entre ce qui joue et le panneau du genre — quand le profil du lecteur AGIT ou que ses limites
 * sont levées (un profil désactivé n'a qu'une rangée, § 6.3) : le bandeau des limites levées ; sur un écran à budget, le temps qui
 * reste en grand, la barre, l'utilisé sur le total ; bloqué — le temps écoulé, le coucher —, la plaque de 48, la phrase, la demande
 * de l'enfant (E13 : une à la fois, sa réponse se lit) ou les deux sons pour dormir d'une Echo (E10, si sa jumelle HACS existe) ; les
 * rangées « Coucher » et « Annonces de la maison » (E23, la sœur « Annonces ») ; la rangée « Réglages parent » — « Code à 4 chiffres »,
 * « Ouvrir » pour un administrateur. La vue enfant est la vue de TOUS : ce que la popup montre ne dépend pas de qui regarde ; le
 * code sépare les réglages, pas l'affichage. Un module qui n'a pas démarré le dit ici, pas une pastille muette (§ 8). */
/* La zone de Home Assistant d'un lecteur — l'identifiant du profil (E6) : celle de la grille, par l'entité ou sa jumelle. */
const zoneIdDe = (...ids) => {
  for (const id of ids) {
    const z = id ? ((LOGGIA_INDEX && LOGGIA_INDEX.areaList) || []).find(a => (a.entities || []).indexOf(id) >= 0) : null;
    if (z && z.id) return z.id;
  }
  return null;
};
const heureDe = (ts) => new Date(Number(ts) * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
function PanneauEnfant({ v, etat, profil, cfgProfil, admin, onReglages, onDemander, onDormir, enVol = false }) {
  const e = v.enfant;
  const S = (v.hass && v.hass.states) || {};
  const leve = !!e.leve_jusqua;
  const bloque = v.bloque;
  const budget = v.budget;
  const appareils = (profil && Array.isArray(profil.appareils)) ? profil.appareils : [];
  const jumeau = v.lecteur ? v.lecteur.ma : null;
  const mien = appareils.find(a => [a.entite, a.hacs].some(x => x && (x === v.id || x === jumeau))) || null;
  const ecran = !!(mien && mien.ecran);
  const sonsPossibles = !!(mien && mien.hacs) && !!(profil && profil.dormir !== false);
  const h = e.reprise || '—';
  // Le jour de la maison (celui du serveur) dit quelles heures valent : la semaine, ou le week-end.
  const dt = etat && etat.maintenant ? new Date(Number(etat.maintenant) * 1000) : new Date();
  const jour = dt.getDay();
  const heures = cfgProfil && cfgProfil.heures ? cfgProfil.heures[jour === 0 || jour === 6 ? 'weekend' : 'semaine'] : null;
  const fin = Array.isArray(heures) ? heures[1] : null;
  const annonces = mien && mien.annonces ? S[mien.annonces] : null;
  // Le son choisi, le temps que le titre joue (E10).
  const [son, setSon] = useState(null);
  const phrase = bloque === 'temps' ? tr('Les {t} d’écran du jour sont utilisées. {appareil} revient demain à {h}.', { t: dureeTexte(budget ? budget.total_s / 60 : 0), appareil: v.nom, h })
    : bloque === 'coucher' && ecran ? tr('{appareil} revient demain à {h}.', { appareil: v.nom, h })
      : bloque === 'coucher' && (!profil || profil.dormir !== false) ? tr('Les sons pour dormir restent, à {m} max. Le reste revient à {h}.', { m: pourcentTexte(v.plafond != null ? v.plafond : (cfgProfil ? cfgProfil.coucher_max : 20)), h })
        : bloque === 'coucher' ? tr('L’Echo revient demain à {h}. Les annonces de la maison passent toujours.', { h }) : null;
  const demande = e.demande;
  const rangee = (titre, valeur, i) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '11px 0', borderTop: filet(i) }}>
      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{titre}</span><span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{valeur}</span>
    </div>
  );
  return (
    <div data-panneau="enfant" style={{ ...PANNEAU, padding: '16px 18px' }}>
      {etat && etat.demarre === false && <div role="status" style={{ ...NOTE, fontSize: 12.5, color: 'var(--o-bad)', marginBottom: 12 }}>{tr('Le mode enfant n’a pas démarré')}</div>}
      {leve && (
        <div data-bandeau="" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(var(--o-accent-rgb),.12)', color: 'var(--o-accent-soft)', fontSize: 12.5, fontWeight: 700, marginBottom: 14 }}>
          <Fi i="unlock" size={13} /><span>{tr('Limites levées jusqu’à {h}', { h: heureDe(e.leve_jusqua) })}</span>
        </div>
      )}
      {/* Un écran à budget, dans ses heures : le temps qui reste, en grand (§ 6.3). */}
      {ecran && !bloque && budget && (
        <div>
          <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{dureeTexte((budget.reste_s || 0) / 60)}</div>
          <div style={{ fontSize: 14, fontWeight: 800, marginTop: 6 }}>{budget.bonus_min > 0 ? tr('restantes, dont {n} min accordées par vous', { n: budget.bonus_min }) : tr('restantes aujourd’hui')}</div>
          <div aria-hidden="true" style={{ position: 'relative', height: 8, marginTop: 12, borderRadius: 4, background: 'var(--o-s1)', overflow: 'hidden' }}>
            <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.min(100, Math.round(budget.utilise_s / Math.max(1, budget.total_s) * 100)) + '%', borderRadius: 4, background: 'var(--o-accent)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, ...NOTE, marginTop: 6 }}>
            <span>{tr('{t} utilisées', { t: dureeTexte(budget.utilise_s / 60) })}</span><span>{tr('sur {t}', { t: dureeTexte(budget.total_s / 60) })}</span>
          </div>
        </div>
      )}
      {/* Bloqué : le temps écoulé (le sablier) ou le coucher (la lune), la phrase, puis la demande ou les sons pour dormir. */}
      {bloque && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text2)' }}>
            <Fi i={bloque === 'coucher' ? 'moon' : 'hourglass-end'} size={22} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{bloque === 'coucher' ? tr('C’est l’heure de dormir') : tr('C’est fini pour aujourd’hui')}</div>
            {phrase && <div style={{ ...NOTE, fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 4, lineHeight: 1.45 }}>{phrase}</div>}
            {bloque === 'temps' && ecran && (demande && !demande.reponse
              ? <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--o-accent-soft)', marginTop: 10 }}>{tr('Demande envoyée · en attente de réponse')}</div>
              : demande && demande.reponse === 'refusee'
                ? <div style={{ ...NOTE, fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>{tr('Demande refusée · demain dès {h}', { h })}</div>
                : (
                  <button type="button" onClick={onDemander} aria-disabled={enVol || undefined} style={{ ...LARGE(true, !enVol), width: '100%', marginTop: 12 }}>
                    <Fi i="paper-plane" size={13} /><span>{tr('Demander 15 min de plus')}</span>
                  </button>
                ))}
            {bloque === 'coucher' && !ecran && sonsPossibles && (
              <>
                <div style={{ ...DEUX_COLONNES, marginTop: 12 }}>
                  {[['wind', tr('Bruit blanc')], ['music-note', tr('Musique pour dormir')]].map(([ico, mot], i) => (
                    <button key={ico} type="button" onClick={() => { setSon(i); onDormir(i); }} aria-pressed={son === i && v.playing} aria-disabled={enVol || undefined} style={{ ...LARGE(son === i && v.playing, !enVol), ...SOUPLE }}>
                      <Fi i={ico} size={13} style={{ flexShrink: 0 }} /><span style={DEUX_LIGNES}>{mot}</span>
                    </button>
                  ))}
                </div>
                {/* La limite honnête (§ 9 ; ADR 0212 ; passe bis du 17/10, point 2) : ce que la maison ne sait pas distinguer, elle le dit SOUS
                  * les puces, avec les mots de la conception. */}
                <div data-limite-dormir="" style={{ ...NOTE, fontWeight: 600, color: 'var(--o-text2)', marginTop: 10, lineHeight: 1.45 }}>{tr('Un son lancé à la voix est mis en pause 20 secondes après : la maison ne distingue pas une berceuse d’autre chose. Les sons pour dormir passent par ces puces, ou le parent lève les limites.')}</div>
              </>
            )}
          </div>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        {rangee(trSens('Coucher · au lit'), bloque === 'coucher' ? tr('Jusqu’à {h}', { h }) : (fin ? tr('À {h}', { h: fin }) : '—'), 0)}
        {annonces && rangee(tr('Annonces de la maison'), annonces.state === 'on' ? tr('Reçues') : tr('Coupées'), 1)}
      </div>
      <button type="button" onClick={onReglages} style={{ ...EN_BOUTON, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', padding: '12px 0 0', border: 'none', borderTop: filet(1) }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Fi i="lock" size={13} color="var(--o-text3)" /><span style={{ fontSize: 13.5, fontWeight: 700 }}>{tr('Réglages parent')}</span></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: 'var(--o-text2)' }}>{admin ? tr('Ouvrir') : tr('Code à 4 chiffres')}<Fi i="angle-small-right" size={16} color="var(--o-text3)" /></span>
      </button>
    </div>
  );
}

/**
 * Le contenu de la feuille d'un lecteur. `vue` : celle de sa carte (`useVueLecteur`, App.jsx) ; `briques` : `RmBascule`,
 * `RmJauge`, `Segment` et `gradeVolume` d'App.jsx ; `glyphe` : le glyphe de sa carte (l'icône choisie devant) ; `epingle` : son
 * épingle ; `onFiche(id)` ouvre la fiche universelle de l'appareil ; `maintenant` sert aux tests (la progression ne tourne pas).
 */
export default function FicheMediaContent({ id, vue: v, briques, glyphe = null, epingle = null, onFiche = null, maintenant = null }) {
  const { RmBascule, RmJauge, Segment, gradeVolume } = briques;
  const [parcourir, setParcourir] = useState(false);
  // Bloqué pendant qu'on parcourt (passe bis 3 du 17/10, point 2) : le navigateur se ferme — chacun de ses médias part en `play_media`.
  if (parcourir && v.bloque) setParcourir(false);
  // Ce que l'étoile vient d'écrire : les puces se redessinent dessus.
  const [, revoir] = useState(0);
  const l = v.l, c = v.cmd, lecteur = v.lecteur || {};
  const S = (v.hass && v.hass.states) || {};
  const vivante = !v.indispo;
  const joue = vivante && v.on && (v.playing || v.paused);
  const art = joue && l.art ? l.art : null;
  // Ce que l'appareil sait d'autre : ses applications, sa télécommande (une TV), la jumelle HACS qui exécute une phrase (une Echo).
  const choix = vivante ? applisDe(id, S, LOGGIA_INDEX) : null;
  const integration = integrationDe(id, LOGGIA_INDEX);
  const tele = vivante ? telecommandePour(integration, telecommandeDe(id, S, LOGGIA_INDEX)) : null;
  /* La jumelle HACS qui exécute une phrase, si elle RÉPOND : indisponible (sa session expirée, le cas fréquent), Home Assistant lui
   * garde ses bits, mais `play_media` partirait dans le vide — pas de « Dire à Alexa », et l'annonce ne la vise pas (passe bis, 17/10). */
  const cibleHacs = vivante && lecteur.alexa && lecteur.annonceHacs && !enPanne(lecteur.annonceHacs, S[lecteur.annonceHacs]) ? lecteur.annonceHacs : null;
  const peutAnnoncer = vivante && !!lecteur.alexa && !!(lecteur.annonce || cibleHacs);
  const favoris = favorisLecture(id);
  /* Le mode enfant (chantier Mode enfant, E18 à E21) : l'état du module, relu toutes les 15 s fiche ouverte — si la maison a un profil ;
   * le profil de ce lecteur et sa configuration ; le compte (un administrateur n'a rien à prouver, E2 B) ; la feuille des réglages et
   * le pavé du code qui l'ouvre ; une seule commande de la popup en vol. */
  const enfantPossible = maisonAvecEnfant() || !!v.enfant;
  const { etat: etatEnfant } = useEtatEnfant(enfantPossible, { rapide: true });
  const profilEtat = v.enfant ? profilEnfant(etatEnfant, v.enfant.profil) : null;
  const cfgEnfant = cfgVal('loggia_enfant', null);
  const cfgProfil = v.enfant && cfgEnfant && cfgEnfant.profils && typeof cfgEnfant.profils === 'object' ? cfgEnfant.profils[v.enfant.profil] || null : null;
  // Un lecteur sans profil se règle sur sa zone (E20) ; sans zone, il n'a pas de profil à lui : il s'ajoute à un autre, depuis sa feuille.
  const identProfil = v.enfant ? v.enfant.profil : zoneIdDe(id, lecteur.ma);
  const admin = !compteOrdinaire(v.hass);
  const [reglages, setReglages] = useState(false);
  const [pave, setPave] = useState(false);
  const [verifie, setVerifie] = useState(false);
  const [enVolEnfant, envoyerEnfant] = useEnVol();
  const [erreurEnfant, setErreurEnfant] = useState('');
  const ouvrirReglages = () => { if (admin || verifie) setReglages(true); else setPave(true); };
  // Les gestes de la chambre (`demander`, `dormir`) : l'état rendu remplace celui des cartes ; un refus se dit, nommé (refus.js).
  const commandeEnfant = (msg) => {
    if (!v.hass || typeof v.hass.callWS !== 'function') return;
    setErreurEnfant('');
    envoyerEnfant(() => Promise.resolve(v.hass.callWS(msg)).then((r) => { if (r && r.lecteurs) poserEtatEnfant(r); }, (e) => setErreurEnfant(raisonEchec(e, 'loggia_enfant'))));
  };
  const profilAgit = !!(v.enfant && (v.enfant.actif || v.enfant.leve_jusqua));
  // Au coucher, les sons coupés : le volume part de la popup (la maquette) ; ce qui joue reste.
  const volumeParti = v.bloque === 'coucher' && !!profilEtat && profilEtat.dormir === false;
  const ligneVolume = !v.enfant ? null
    : !v.enfant.actif ? tr('Mode enfant désactivé : volume libre')
      : v.enfant.leve_jusqua ? tr('Limites levées : volume libre')
        : v.plafond == null ? null
          : v.bute ? tr('Limité à {m} par le mode enfant', { m: pourcentTexte(v.plafond) })
            : v.bloque === 'coucher' ? tr('Le volume s’arrête à {m} au coucher', { m: pourcentTexte(v.plafond) }) : tr('Le volume s’arrête à {m}', { m: pourcentTexte(v.plafond) });
  // La plaque de l'en-tête, teintée comme celle de la carte : la pochette en lecture ou en pause, sinon le glyphe de la carte.
  const plaque = {
    fond: joue ? 'rgba(' + v.teinte + ',.16)' : 'var(--o-s1)',
    encre: !vivante || !v.on ? 'var(--o-text3)' : 'var(--o-text1)',
    glyphe: art ? <img src={art} alt="" style={{ width: 40, height: 40, borderRadius: 12, objectFit: 'cover', display: 'block' }} /> : (glyphe || <Fi i={glypheLecteur(l)} size={18} />),
  };
  /* « Rien en lecture » : la phrase qui dit quoi faire, selon ce que ce lecteur sait — rien d'autre sinon. Bloqué par le mode enfant
   * (passe bis 3 du 17/10, point 2), ni applis ni bibliothèque ne s'offrent : la phrase ne montre pas du doigt ce qui n'est pas là. */
  const conseil = cibleHacs ? tr('Touchez une phrase ci-dessous, ou dites-la à Alexa.')
    : v.bloque ? null
      : choix ? tr('Lancez une appli ci-dessous.')
        : c.parcourir ? tr('Parcourez la bibliothèque ci-dessous.') : null;
  const fondHaut = joue ? 'linear-gradient(180deg, rgba(' + v.teinte + ',.22), rgba(' + v.teinte + ',.06))' : 'var(--o-s3)';
  /* La seconde ligne de l'en-tête (E18 ; passe bis du 17/10, point 13 — la maquette, cadres 2b et 2c) : sous un profil qui agit,
   * « Mode enfant · profil de Lino », ou « Limites levées jusqu'à 18:10 » quand elles le sont ; le panneau garde le détail. Sinon,
   * « {pièce} · {genre} ». */
  const sousNom = profilAgit
    ? (v.enfant.leve_jusqua ? tr('Limites levées jusqu’à {h}', { h: heureDe(v.enfant.leve_jusqua) }) : tr('Mode enfant · profil de {nom}', { nom: v.enfant.nom || v.piece || v.nom }))
    : [v.piece, genreLecteur(l, lecteur.modele || null)].filter(Boolean).join(' · ');
  return (
    <>
      <div className="rb-fiche" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* La bascule de l'en-tête (M10) ne s'offre pas à un écran BLOQUÉ par le mode enfant (passe bis 2 du 17/10) : allumé par elle, l'écran
          * serait rééteint vingt secondes plus tard — la maison ne tend pas un bouton qu'elle défait. Le corps dit « Revient à {h} », inerte. */}
        <EnteteFiche nom={v.nom} plaque={plaque} sousNom={sousNom}
          epingle={<>{vivante && c.marche && !v.bloque && RmBascule && <RmBascule on={v.on} nom={v.nom} onToggle={() => v.marche(!v.on)} />}{epingle}</>} />

        {/* Le panneau de ce qui joue. Indisponible, il porte le liseré qui respire, le mot et la phrase, et plus aucune commande (M7). */}
        <div className={vivante ? undefined : 'o-panne'} data-panneau="lecture" style={{ ...PANNEAU, padding: 18, background: fondHaut }}>
          {!vivante && (
            <>
              <div style={{ ...GRAND, color: 'var(--o-bad)' }}>{tr('Indisponible')}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6 }}>{v.phrase.texte}</div>
            </>
          )}
          {vivante && !v.on && (
            /* Bloquée par le mode enfant (E16 ; passe bis du 17/10, point 2) : la popup fait comme la carte étroite — ni « Allumer » ni « lancez
             * une appli », la maison déferait le `turn_on` vingt secondes plus tard ; à leur place, ce que dit la carte, inerte, SOUS la phrase
             * qui dit pourquoi (en colonne : à 320 px, la phrase à côté de la puce tombait sur neuf lignes). Rien d'inerte dessiné en bouton. */
            <div style={v.bloque ? { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 } : { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...GRAND, color: 'var(--o-text2)' }}>{tr('Éteinte')}</div>
                {v.bloque ? <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6, lineHeight: 1.45 }}>{tr('Rallumé, l’écran s’éteindrait 20 secondes plus tard : le mode enfant le tient jusqu’à {h}.', { h: v.reprise || '—' })}</div>
                  : choix && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6 }}>{tr('Ou lancez une appli : elle allume la TV.')}</div>}
              </div>
              {v.bloque ? (
                <span data-revient="" style={{ ...LARGE(), padding: '0 14px', gap: 8, flexShrink: 0, cursor: 'default', color: 'var(--o-text2)' }}>
                  <Fi i={v.bloque === 'coucher' ? 'moon' : 'hourglass-end'} size={13} /><span>{tr('Revient à {h}', { h: v.reprise || '—' })}</span>
                </span>
              ) : c.marche && (
                <button type="button" onClick={() => v.marche(true)} title={tr('Allumer')} style={{ ...LARGE(true), padding: '0 16px', gap: 8, flexShrink: 0 }}>
                  <Fi i="power" size={13} /><span>{tr('Allumer')}</span>
                </button>
              )}
            </div>
          )}
          {vivante && v.on && !joue && (
            <>
              <div style={GRAND}>{tr('Rien en lecture')}</div>
              {conseil && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6, lineHeight: 1.45 }}>{conseil}</div>}
            </>
          )}
          {joue && <CeQuiJoue v={v} maintenant={maintenant} />}
          {/* Le volume (allumée, `volume_level` connu) : la puce du muet, la barre de la maison, « 30 % » ou « Muet ». Sous un profil du
            * mode enfant (E15, E18) : la barre porte le plafond (hachurée), et la ligne dessous dit ce que la maison en fait. */}
          {vivante && v.on && v.vol != null && RmJauge && !volumeParti && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
                {c.muet && (
                  <button type="button" aria-pressed={v.muted} aria-label={v.muted ? tr('Rétablir le son') : tr('Couper le son')} title={v.muted ? tr('Rétablir le son') : tr('Couper le son')} onClick={() => v.muet(!v.muted)} style={RONDE(44, v.muted)}>
                    <Fi i={v.muted ? 'volume-mute' : 'volume'} size={14} />
                  </button>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* `etatVolume` : « Muet », « max 40 % » sous un plafond, pour le lecteur d'écran (passe bis du 17/10, point 9). */}
                  <RmJauge v={v.vol} couleur={v.muted ? 'var(--o-text3)' : 'var(--o-accent)'} grade={v.muted ? 'transparent' : gradeVolume} eteinte={false} zone={44} piste={32} marge={0} plafond={v.plafond}
                    etat={etatVolume(v.muted, v.plafond)} label={tr('Volume') + ' ' + v.nom} onCommit={v.volume} onGlisse={v.suivre} />
                </div>
                <span style={{ width: 48, flexShrink: 0, textAlign: 'right', fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{v.muted ? tr('Muet') : pourcentTexte(v.vol)}</span>
              </div>
              {ligneVolume && <div data-plafond-ligne="" style={{ fontSize: 12, fontWeight: 700, color: v.bute ? 'var(--o-accent-soft)' : 'var(--o-text2)', marginTop: 8 }}>{ligneVolume}</div>}
            </>
          )}
        </div>

        {/* Le mode enfant (E18) : son panneau quand le profil agit ou que ses limites sont levées ; sinon, un lecteur qui a une zone porte
          * la rangée « Mode enfant · Désactivé », qui ouvre la feuille des réglages (E20) — le pavé d'abord pour un compte ordinaire. */}
        {profilAgit && (
          <PanneauEnfant v={v} etat={etatEnfant} profil={profilEtat} cfgProfil={cfgProfil} admin={admin} enVol={enVolEnfant} onReglages={ouvrirReglages}
            onDemander={() => commandeEnfant({ type: 'loggia/enfant/demander', profil: v.enfant.profil })} onDormir={(son) => commandeEnfant({ type: 'loggia/enfant/dormir', profil: v.enfant.profil, son })} />
        )}
        {erreurEnfant && <div role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)' }}>{erreurEnfant}</div>}
        {!profilAgit && identProfil && vivante && (
          <button type="button" onClick={ouvrirReglages} style={{ ...PANNEAU, ...RANGEE, ...EN_BOUTON }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('Mode enfant')}</span><span style={SOUS}>{tr('Désactivé')}</span></span>
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </button>
        )}

        {(cibleHacs || peutAnnoncer) && <PanneauEcho id={id} v={v} cibleHacs={cibleHacs} peutAnnoncer={peutAnnoncer} Segment={Segment} onGarder={() => revoir(n => n + 1)} />}
        {(choix || tele) && <PanneauTv id={id} v={v} choix={choix} tele={tele} integration={integration} Segment={Segment} enfant={!!v.enfant} bloque={v.bloque} reprise={v.reprise} />}
        {/* La bibliothèque ne s'offre pas à un écran BLOQUÉ (passe bis 3 du 17/10, point 2), comme ses applis et sa télécommande : un favori et
          * « Parcourir la bibliothèque » mènent à `play_media`, qui réveille l'Apple TV — la maison la rééteindrait vingt secondes plus tard.
          * Le panneau du mode enfant dit déjà pourquoi, et quand l'écran revient. */}
        {vivante && c.parcourir && !v.bloque && <Bibliotheque id={id} hass={v.hass} favoris={favoris.filter(f => f.c !== TYPE_PHRASE)} onParcourir={() => setParcourir(true)} />}

        {onFiche && (
          <button type="button" onClick={() => onFiche(id)} style={{ ...PANNEAU, ...RANGEE, ...EN_BOUTON }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('L’appareil')}</span><span style={SOUS}>{tr('L’épingle, les commandes et toutes ses entités')}</span></span>
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </button>
        )}
      </div>
      {/* Monté APRÈS le contenu : la feuille du navigateur se pose dans <body> (le portail de `BottomSheet`) à la suite de celle du
        * lecteur — plus loin dans le DOM, donc au-dessus, sans z-index à inventer. Fermée, les favoris se relisent (l'étoile). */}
      {parcourir && <NavigateurMedias id={id} hass={v.hass} onClose={() => setParcourir(false)} />}
      {/* Le mode enfant (E19) : le pavé du code — avec son pourquoi —, puis la feuille des réglages, montée après le contenu comme le
        * navigateur ; un laissez-passer expiré (`code_admin_requis`) la ferme et rouvre le pavé. */}
      {pave && <PinModal hass={v.hass} sousTitre={tr('Requis pour les réglages du mode enfant')} onClose={() => setPave(false)} onSuccess={() => { setPave(false); setVerifie(true); setReglages(true); }} />}
      {reglages && identProfil && (
        <FicheEnfant hass={v.hass} ident={identProfil} nom={profilEtat ? profilEtat.nom : (cfgProfil ? cfgProfil.nom : (v.piece || v.nom))} piece={v.piece} zone={identProfil}
          etat={etatEnfant} config={cfgEnfant} lecteurs={medPlayers()} briques={briques} admin={admin}
          onClose={() => setReglages(false)} onCode={() => { setReglages(false); setVerifie(false); setPave(true); }} />
      )}
    </>
  );
}
