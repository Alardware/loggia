/* ── Spotify dans Loggia (ADR 0344) ─────────────────────────────────────────
 *
 * Trois morceaux : la rangée des Médias (Objets › Multimédia), le panneau de
 * la fiche d'une Echo que Spotify Connect voit sous le même nom, et la feuille
 * « Ajouter par lien ». Ce qu'ils lisent est dans spotify.js (pur) ; le
 * lancement, au serveur (`loggia/spotify/jouer`, spotify.py) : l'enceinte,
 * puis la playlist.
 *
 * Les playlists du compte se lisent par le composant, que Spotify joue ou non
 * (ADR 0346), une fois par compte et pour dix minutes : la fiche d'une Echo,
 * rouverte, ne redemande rien. Celles
 * ajoutées par lien vivent dans la configuration de la MAISON
 * (`loggia_spotify`) — c'est le même compte pour tous — ; un administrateur
 * les ajoute, comme le reste de la maison. L'enceinte choisie se retient sur
 * cet écran.
 *
 * En mode édition, une pochette se COCHE au lieu de se lancer (ADR 0345) : celles
 * qu'on décoche disparaissent de la rangée et de la fiche des enceintes. Ce choix
 * est un rangement — il suit le PROFIL (`loggia_spotify_cachees`), et un compte
 * ordinaire le fait comme un administrateur.
 */
import { useState, useEffect, useLayoutEffect, useRef, useId } from 'react';
import { tr } from './i18n.js';
import { LOGGIA_INDEX, cfgVal, cfgSet, compteOrdinaire } from './state.js';
import { BottomSheet, TitreFeuille, ListeChoix, Fi, REDUCE_MOTION } from './ui.jsx';
import { LISERE } from './styles.js';
import { PANNEAU, TITRE, SOUS } from './fichekit.js';
import { texteRefus, raisonEchec } from './refus.js';
import { bordsDefilement } from './scenarios.js';
import { fxTap } from './chrome/entete.jsx';
import { comptesSpotify, lirePlaylists, rangeePlaylists, uriSpotify, playlistAjoutee, ajouterPlaylist, retirerPlaylist, enceintePour, enceinteParDefaut, playlistsMontrees, basculerCachee, cacherToutes } from './spotify.js';

const NOM = 'Spotify';
const EXEMPLE_LIEN = 'open.spotify.com/playlist/…';
const CLE_ENCEINTE = 'loggia-spotify-enceinte';
const CLE_CACHEES = 'loggia_spotify_cachees';
const FRAIS_MS = 10 * 60 * 1000;
/* Les playlists lues, par compte : `{ quand, liste }`. */
const LUES = new Map();
/* Une pochette sans image : deux teintes du thème, en alternance — rien d'écrit en dur. */
const TEINTES = [['var(--o-accent-rgb)', 'var(--o-piece-ambre-rgb)'], ['var(--o-piece-ambre-rgb)', 'var(--o-warn-rgb)'], ['var(--o-warn-rgb)', 'var(--o-accent-rgb)']];
const TITRE_SECTION = { margin: 0, marginRight: 'auto', fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' };
const LIEN_TETE = { display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 44, margin: '-10px 0', padding: '0 2px', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' };
const ALERTE = { fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)', marginTop: 10 };
const ETIQUETTE = { display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--o-text3)', margin: '16px 0 6px' };
const CHAMP = { width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 13px', borderRadius: 10, background: 'var(--o-s1)', border: LISERE, color: 'var(--o-text)', fontSize: 13, fontWeight: 600 };
const BOUTON = { display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '11px 18px', borderRadius: 14, border: 'none', font: 'inherit', fontSize: 13, fontWeight: 800, background: 'var(--o-accent-fond)', color: '#fff' };
const fleche = (active) => ({ width: 26, height: 26, borderRadius: 9, border: 'none', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text1)', cursor: active ? 'pointer' : 'default', opacity: active ? 1 : .35 });
const AIDE = { fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', margin: '-4px 0 12px' };
/* La coche d'une pochette en édition : pleine et bleue, la playlist s'affiche ; un rond vide sur un voile du fond, elle est cachée. */
const coche = (oui) => ({ position: 'absolute', left: 10, top: 10, width: 30, height: 30, borderRadius: '50%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
  ...(oui ? { background: 'var(--o-accent-fond)', color: '#fff' } : { background: 'color-mix(in srgb, var(--o-bg) 55%, transparent)', border: '2px solid var(--o-text)' }) });

function lireEnceinte() { try { return localStorage.getItem(CLE_ENCEINTE); } catch { return null; } }
function garderEnceinte(s) { try { localStorage.setItem(CLE_ENCEINTE, s); } catch { /* stockage refusé : le choix vaut pour cette visite */ } }

/* Le compte, ses enceintes, ses playlists et celles de la maison. */
function useSpotify(hass) {
  const etats = (hass && hass.states) || {};
  const compte = comptesSpotify(etats, LOGGIA_INDEX)[0] || null;
  const a = (compte && etats[compte] && etats[compte].attributes) || {};
  const sources = Array.isArray(a.source_list) ? a.source_list.filter(s => typeof s === 'string' && s) : [];
  const [, setLu] = useState(0);
  const [erreur, setErreur] = useState('');
  const hassRef = useRef(hass);
  useEffect(() => { hassRef.current = hass; });
  useEffect(() => {
    const h = hassRef.current;
    if (!compte || !h || typeof h.callWS !== 'function') return undefined;
    const deja = LUES.get(compte);
    if (deja && Date.now() - deja.quand < FRAIS_MS) return undefined;
    let vivant = true;
    (async () => {
      try {
        // Par le composant, que Spotify joue ou non (ADR 0346) : à l'arrêt, Home Assistant refuse de parcourir le lecteur.
        LUES.set(compte, { quand: Date.now(), liste: await lirePlaylists(h, compte) });
        if (vivant) { setErreur(''); setLu(n => n + 1); }
      } catch {
        if (vivant) setErreur(tr('Spotify ne répond pas.'));
      }
    })();
    return () => { vivant = false; };
  }, [compte]);
  const lues = compte && LUES.get(compte) ? LUES.get(compte).liste : null;
  const cfg = cfgVal('loggia_spotify', null);
  const ajoutees = cfg && Array.isArray(cfg.ajoutees) ? cfg.ajoutees : [];
  const playlists = rangeePlaylists(lues || [], ajoutees);
  // Celles que CE profil a décochées en édition (ADR 0345).
  const cachees = cfgVal(CLE_CACHEES, null);
  return {
    compte, sources, actuelle: typeof a.source === 'string' ? a.source : null,
    playlists, montrees: playlistsMontrees(playlists, cachees), cachees: Array.isArray(cachees) ? cachees : [],
    lu: lues !== null, erreur, ajoutees,
    jouer: (p, sortie) => hassRef.current.callWS({ type: 'loggia/spotify/jouer', entity_id: compte, uri: p.i, ...(sortie ? { sortie } : {}) }),
  };
}

/* Un lancement à la fois ; « Lancée » quatre secondes, ou le refus en une phrase. */
function useLancer(jouer) {
  const [enVol, setEnVol] = useState(null);
  const [lancee, setLancee] = useState(null);
  const [erreur, setErreur] = useState('');
  const minuterie = useRef(null);
  const lancer = async (p, enceinte) => {
    if (enVol) return;
    setEnVol(p.i); setErreur(''); setLancee(null);
    try {
      await jouer(p, enceinte);
      setLancee(p.i);
      clearTimeout(minuterie.current);
      minuterie.current = setTimeout(() => setLancee(null), 4000);
    } catch (e) {
      setErreur(texteRefus(e) || tr('Spotify ne répond pas.'));
    } finally {
      setEnVol(null);
    }
  };
  return { enVol, lancee, erreur, lancer };
}

/* Les flèches d'une rangée qui déborde, à la souris seulement (`o-qscenes-fleche`, cachées au doigt), actives du côté où il
 * reste quelque chose — comme celles des scénarios de l'Accueil. */
function useBords(rangee, n) {
  const [bords, setBords] = useState({ avant: false, apres: false });
  useLayoutEffect(() => {
    const el = rangee.current;
    if (!el) return undefined;
    const mesurer = () => setBords(b => { const x = bordsDefilement(el.scrollLeft, el.scrollWidth, el.clientWidth); return x.avant === b.avant && x.apres === b.apres ? b : x; });
    mesurer();
    el.addEventListener('scroll', mesurer, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(mesurer) : null;
    if (ro) ro.observe(el);
    return () => { el.removeEventListener('scroll', mesurer); if (ro) ro.disconnect(); };
  }, [rangee, n]);
  return bords;
}

function Fleches({ rangee, bords }) {
  if (!bords.avant && !bords.apres) return null;
  const glisser = (sens) => {
    const el = rangee.current;
    if (!el) return;
    const depart = el.scrollLeft, pas = sens * el.clientWidth * 0.85;
    el.scrollBy({ left: pas, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
    // Un moteur qui n'anime pas (onglet masqué, vue embarquée) laisserait la rangée sur place : on y va d'un coup, comme les scénarios.
    setTimeout(() => { if (rangee.current === el && Math.abs(el.scrollLeft - depart) < 2) el.scrollBy({ left: pas, behavior: 'auto' }); }, 350);
  };
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <button type="button" className="o-qscenes-fleche" onClick={() => glisser(-1)} disabled={!bords.avant} aria-label={tr('Playlists précédentes')} title={tr('Playlists précédentes')} style={fleche(bords.avant)}><Fi i="angle-small-left" size={13} /></button>
      <button type="button" className="o-qscenes-fleche" onClick={() => glisser(1)} disabled={!bords.apres} aria-label={tr('Playlists suivantes')} title={tr('Playlists suivantes')} style={fleche(bords.apres)}><Fi i="angle-small-right" size={13} /></button>
    </span>
  );
}

/* Une pochette : l'image de Spotify, ou deux teintes du thème ; le rond de lecture, la coche une fois lancée. En édition
 * (`choix`), elle se coche au lieu de se lancer : bleue, elle s'affiche ; vide et grisée, elle est cachée (ADR 0345). */
function TuilePlaylist({ p, n, taille, compacte = false, sous = null, enVol, lancee, onJouer, choix = null }) {
  const [t1, t2] = TEINTES[n % TEINTES.length];
  const cachee = !!choix && !choix.montree;
  return (
    <button type="button" className="o-spotify-tuile" onClick={onJouer} disabled={enVol} aria-busy={enVol || undefined} aria-pressed={choix ? choix.montree : undefined} aria-label={choix ? tr('Afficher {x}', { x: p.t }) : tr('Lancer {x}', { x: p.t })} title={p.t}
      style={{ flex: '0 0 auto', width: taille, display: 'flex', flexDirection: 'column', gap: compacte ? 7 : 8, padding: 0, border: 'none', background: 'none', cursor: enVol ? 'progress' : 'pointer', textAlign: 'left', color: 'var(--o-text)', font: 'inherit', opacity: enVol ? .65 : 1, transition: 'opacity .2s' }}>
      <span aria-hidden="true" style={{ position: 'relative', display: 'block', width: taille, height: taille }}>
        <span style={{ position: 'relative', width: taille, height: taille, opacity: cachee ? .38 : 1, filter: cachee ? 'grayscale(1)' : 'none', transition: 'opacity .2s, filter .2s', boxSizing: 'border-box', borderRadius: compacte ? 14 : 16, border: LISERE, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: p.v ? 'var(--o-s2)' : `linear-gradient(140deg, rgba(${t1},.95), rgba(${t2},.45))` }}>
          {p.v ? <img src={p.v} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Fi i="music-alt" size={compacte ? 24 : 32} />}
          {!choix && <span style={{ position: 'absolute', right: compacte ? 7 : 10, bottom: compacte ? 7 : 10, width: compacte ? 28 : 36, height: compacte ? 28 : 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-accent-fond)', color: '#fff' }}><Fi i={lancee ? 'check' : 'play'} size={compacte ? 11 : 13} /></span>}
        </span>
        {choix && <span style={coche(choix.montree)}>{choix.montree && <Fi i="check" size={13} />}</span>}
      </span>
      <span style={{ fontSize: compacte ? 12 : 13, fontWeight: 700, color: cachee ? 'var(--o-text3)' : undefined, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.t}</span>
      {sous && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text2)', marginTop: -4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cachee ? tr('Cachée') : lancee ? tr('Lancée') : sous}</span>}
    </button>
  );
}

/* La feuille « Ajouter par lien » : le lien copié dans l'appli, un nom ; et celles déjà ajoutées, qu'on retire d'un appui. */
function FeuilleAjoutSpotify({ ajoutees, onClose, onGarde }) {
  const idLien = useId();
  const idNom = useId();
  const [lien, setLien] = useState('');
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState('');
  const [enVol, setEnVol] = useState(false);
  const entree = playlistAjoutee(lien, nom);
  const lienFaux = !!lien.trim() && !uriSpotify(lien);
  const garder = async (liste) => {
    setEnVol(true); setErreur('');
    try { await cfgSet({ loggia_spotify: { ajoutees: liste } }); onGarde(); return true; }
    catch (e) { setErreur(raisonEchec(e)); return false; }
    finally { setEnVol(false); }
  };
  const valider = async (close) => { if (!entree || enVol) return; if (await garder(ajouterPlaylist(ajoutees, entree))) close(); };
  const pret = !!entree && !enVol;
  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <div style={{ padding: '0 0 8px' }}>
          <TitreFeuille style={{ fontSize: 15, fontWeight: 800 }}>{tr('Ajouter une playlist Spotify')}</TitreFeuille>
          <label htmlFor={idLien} style={ETIQUETTE}>{tr('Lien Spotify')}</label>
          <input id={idLien} aria-label={tr('Lien Spotify')} value={lien} onChange={(e) => setLien(e.target.value)} placeholder={EXEMPLE_LIEN} inputMode="url" autoComplete="off" spellCheck={false} aria-invalid={lienFaux || undefined} style={CHAMP} autoFocus />
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, marginTop: 6, color: lienFaux ? 'var(--o-bad)' : 'var(--o-text3)' }}>{lienFaux ? tr('Ce lien n’est pas une playlist Spotify.') : tr('Collez le lien copié dans l’appli Spotify : Partager, puis Copier le lien.')}</span>
          <label htmlFor={idNom} style={ETIQUETTE}>{tr('Nom de la playlist')}</label>
          <input id={idNom} aria-label={tr('Nom de la playlist')} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={80} onKeyDown={(e) => { if (e.key === 'Enter') valider(close); }} style={CHAMP} />
          {erreur && <div role="alert" style={ALERTE}>{erreur}</div>}
          <div style={{ display: 'flex', marginTop: 18 }}>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => valider(close)} disabled={!pret} style={{ ...BOUTON, opacity: pret ? 1 : .45, cursor: pret ? 'pointer' : 'default' }}>{tr('Ajouter')}</button>
          </div>
          {ajoutees.length > 0 && (
            <>
              <span style={ETIQUETTE}>{tr('Playlists ajoutées')}</span>
              {ajoutees.map(p => (
                <div key={p.i} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, borderTop: LISERE }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.t}</span>
                  <button type="button" onClick={() => garder(retirerPlaylist(ajoutees, p.i))} disabled={enVol} aria-label={tr('Retirer {x}', { x: p.t })} title={tr('Retirer {x}', { x: p.t })}
                    style={{ width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 12, background: 'none', color: 'var(--o-text2)', cursor: 'pointer' }}><Fi i="cross-small" size={16} /></button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

/* La rangée des Médias : le titre, « Écouter sur », « Ajouter par lien » ; puis les pochettes. Rien sans compte Spotify.
 * En édition : toutes les pochettes, chacune avec sa coche, et « Tout montrer » ou « Tout cacher » (ADR 0345). */
export default function RangeeSpotify({ hass, edit = false }) {
  const sp = useSpotify(hass);
  const { enVol, lancee, erreur, lancer } = useLancer(sp.jouer);
  const [retenue, setRetenue] = useState(lireEnceinte);
  const [ajout, setAjout] = useState(false);
  const [, revoir] = useState(0);
  const rangee = useRef(null);
  const liste = edit ? sp.playlists : sp.montrees;
  const bords = useBords(rangee, liste.length);
  if (!sp.compte) return null;
  const enceinte = enceinteParDefaut(retenue, sp.actuelle, sp.sources);
  const choisir = (s) => { setRetenue(s); garderEnceinte(s); };
  const admin = !compteOrdinaire(hass);
  // La coche est un rangement : un compte ordinaire range ses playlists comme un administrateur.
  const cachees = new Set(sp.cachees);
  const nCachees = sp.playlists.filter(p => cachees.has(p.i)).length;
  const garderCachees = (v) => { cfgSet({ [CLE_CACHEES]: v }); revoir(x => x + 1); };
  return (
    <section className="o-spotify" aria-label={NOM} style={{ marginBottom: 28 }}>
      <div className="o-spotify-tete">
        <h2 style={TITRE_SECTION}>{NOM}</h2>
        {!edit && sp.sources.length > 0 && (
          <span className="o-spotify-sortie" style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)' }}>
            {tr('Écouter sur')}
            <ListeChoix label={tr('Écouter sur')} value={enceinte} options={sp.sources.map(s => ({ id: s, label: s }))} onChange={choisir} />
          </span>
        )}
        {admin && <button type="button" className="o-spotify-ajout" onClick={() => setAjout(true)} style={LIEN_TETE}><Fi i="plus" size={12} />{tr('Ajouter par lien')}</button>}
        {edit && sp.playlists.length > 0 && <button type="button" className="o-spotify-tout" onClick={() => garderCachees(nCachees ? null : cacherToutes(sp.playlists))} style={LIEN_TETE}><Fi i={nCachees ? 'eye' : 'eye-crossed'} size={12} />{nCachees ? tr('Tout montrer') : tr('Tout cacher')}</button>}
        <Fleches rangee={rangee} bords={bords} />
      </div>
      {edit && sp.playlists.length > 0 && <div style={AIDE}>{tr('Cochez les playlists à afficher, ici et dans la fiche des enceintes.')} {tr('À l’écran : {n} sur {total}.', { n: sp.playlists.length - nCachees, total: sp.playlists.length })}</div>}
      {(erreur || sp.erreur) && <div role="alert" style={{ ...ALERTE, marginTop: 0, marginBottom: 10 }}>{erreur || sp.erreur}</div>}
      {sp.lu && !sp.playlists.length && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Aucune playlist dans votre compte Spotify.')}</div>}
      {!edit && sp.playlists.length > 0 && !sp.montrees.length && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Toutes vos playlists sont cachées : en mode édition, cochez celles à afficher.')}</div>}
      {liste.length > 0 && (
        <div ref={rangee} className="o-spotify-rangee">
          {liste.map(p => (
            <TuilePlaylist key={p.i} p={p} n={sp.playlists.indexOf(p)} taille={150} sous={p.d ? tr('Dans votre bibliothèque') : tr('Ajoutée par lien')} choix={edit ? { montree: !cachees.has(p.i) } : null}
              enVol={enVol === p.i} lancee={lancee === p.i} onJouer={(e) => { fxTap(e); if (edit) garderCachees(basculerCachee(sp.cachees, p.i)); else lancer(p, enceinte); }} />
          ))}
        </div>
      )}
      {ajout && <FeuilleAjoutSpotify ajoutees={sp.ajoutees} onClose={() => setAjout(false)} onGarde={() => revoir(x => x + 1)} />}
    </section>
  );
}

/* Le panneau de la fiche d'une Echo : seulement quand Spotify Connect la voit sous l'un de ses noms — la playlist part sur
 * ELLE, quel que soit le choix de la rangée des Médias. Seulement celles que le profil n'a pas décochées (ADR 0345). */
export function PanneauSpotify({ hass, noms }) {
  const sp = useSpotify(hass);
  const { enVol, lancee, erreur, lancer } = useLancer(sp.jouer);
  const rangee = useRef(null);
  const bords = useBords(rangee, sp.montrees.length);
  const enceinte = sp.compte ? enceintePour(noms, sp.sources) : null;
  if (!enceinte || !sp.montrees.length) return null;
  return (
    <div data-panneau="spotify" style={{ ...PANNEAU, padding: '14px 18px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ ...TITRE, marginRight: 'auto' }}>{NOM}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{tr('Sur cette enceinte')}</span>
        <Fleches rangee={rangee} bords={bords} />
      </div>
      <span style={SOUS}>{tr('Une pochette, et la playlist part ici.')}</span>
      <div ref={rangee} className="o-spotify-rangee" style={{ marginTop: 12 }}>
        {sp.montrees.map(p => (
          <TuilePlaylist key={p.i} p={p} n={sp.playlists.indexOf(p)} taille={96} compacte enVol={enVol === p.i} lancee={lancee === p.i} onJouer={(e) => { fxTap(e); lancer(p, enceinte); }} />
        ))}
      </div>
      {erreur && <div role="alert" style={ALERTE}>{erreur}</div>}
    </div>
  );
}
