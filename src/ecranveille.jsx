/* L'ecran de veille (sorti d'App.jsx le 23/09, plan M1).
 *
 * Troisieme etape du decoupage. C'est un ecran a lui tout seul : il recouvre
 * tout, ne lit que ce qu'on lui passe, et rend la main au premier toucher. Ses
 * cent-soixante-dix lignes vivaient au milieu du monolithe, entre une carte de
 * piece et la vue Objets.
 */
import { useState, useEffect } from 'react';
import { REDUCE_MOTION, Surface } from './ui.jsx';
import { Ico } from './icones.jsx';
import { WeatherIco, weatherEntity } from './wxutil.jsx';
import { tr, locale } from './i18n.js';
import { getHass, LOGGIA_INDEX, plateformeDe, voisinsDe, nomAppareilDe } from './state.js';
import { annoncerVeille } from './regard.js';
import { usePrevisions } from './cartemeteo.jsx';
import { typesPrevision, heuresMeteo } from './meteo.js';
import { pointsAttention, couleurNiveau } from './attention.js';
import { capteurVigilance } from './vigilance.js';
import { habillagePiece } from './app/pieces.jsx';
import { estDehors } from './app/noyau.jsx';
import { useWide } from './app/ecran.jsx';
import { lireNombre } from './cartes/mesure.jsx';

/* Toujours sombre, quel que soit le thème : c'est une veille. Le fond et
 * l'encre de la maquette du 01/11 ; ses gris sont des fractions de l'encre. */
const FOND = '#04070d';
const ENCRE = '#e6ecf7';
const encre = (a) => `rgba(230,236,247,${a})`;

/* Réveiller l'écran (lot 13 de l'audit du 03/10). Le minuteur de la veille vit
 * dans l'App : il se réarme à tout `pointerdown` de la fenêtre. La caméra de la
 * tablette passait déjà par là ; le bouton de surface aussi, car le clic d'un
 * lecteur d'écran ou de la touche Entrée n'émet aucun `pointerdown`. */
const reveiller = () => { try { window.dispatchEvent(new PointerEvent('pointerdown')); } catch { window.dispatchEvent(new Event('pointerdown')); } };

/* Mode ambiant : l'ecran de veille de la tablette murale. Apres un delai sans
 * toucher, le dashboard s'efface derriere l'essentiel — l'heure en grand, la
 * meteo animee, la temperature interieure, et seulement ce qui merite l'oeil
 * (lumieres allumees, alarme, alertes surete). Un toucher le retire, on
 * retrouve l'ecran ou on l'avait laisse : c'est le MEME dashboard qui se met
 * en veille, pas un second a entretenir. Toujours sombre, quel que soit le
 * theme : c'est une veille. Idee reprise des dashboards ambiants de Madelena. */
export function AmbientOverlay({ wx, wxFx, weatherTemp, weatherLabel, notifs, ast = null, rooms = [], hass: hassProp = null }) {
  // Tant que la veille recouvre l'écran, les fonds GPU (wx3d, ciel 3D) rendent
  // pour personne : la classe leur dit de souffler — batterie de la tablette.
  useEffect(() => {
    document.documentElement.classList.add('loggia-ambient-on');
    // Et le dire : les caméras suspendent leur direct (lot 14 de l'audit du 03/10, regard.js).
    annoncerVeille();
    return () => { document.documentElement.classList.remove('loggia-ambient-on'); annoncerVeille(); };
  }, []);
  const [clock, setClock] = useState(() => new Date());
  // Chaque seconde : la maquette les montre en exposant de l'heure.
  useEffect(() => { const iv = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(iv); }, []);
  /* Anti burn-in : le bloc entier derive de quelques pixels chaque minute — un
   * OLED garde la trace d'une horloge immobile. La derive est lente (6 s) pour
   * ne pas se voir ; en reduced-motion elle saute sans transition, le burn-in
   * ne negocie pas. */
  const [decal, setDecal] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const bouge = () => setDecal({ x: Math.round((Math.random() - 0.5) * 48), y: Math.round((Math.random() - 0.5) * 32) });
    const iv = setInterval(bouge, 60000);
    return () => clearInterval(iv);
  }, []);
  // La nuit, la veille baisse encore d'un ton : personne ne la regarde, et une
  // chambre n'a pas besoin d'une lanterne.
  const nuit = clock.getHours() >= 23 || clock.getHours() < 6;
  /* Économiseur d'écran : un diaporama des images des MÉDIAS LOCAUX de Home
   * Assistant (le dossier media) — jamais un service externe, le projet se
   * l'interdit. Sans image trouvée, la veille classique reste. */
  const photosOn = (() => { try { return localStorage.getItem('loggia-ambphotos') === '1'; } catch { return false; } })();
  const [photos, setPhotos] = useState([]);
  const [photoIdx, setPhotoIdx] = useState(0);
  useEffect(() => {
    if (!photosOn) return;
    let mort = false;
    (async () => {
      try {
        const h = getHass(); if (!h || !h.callWS) return;
        const images = [];
        const parcourir = async (id, prof) => {
          if (mort || images.length >= 60 || prof > 2) return;
          // try PAR SOURCE : une intégration qui refuse le browse (Netatmo…)
          // ne doit pas emporter les images déjà trouvées ailleurs.
          let r = null;
          try { r = await h.callWS({ type: 'media_source/browse_media', ...(id ? { media_content_id: id } : {}) }); } catch { return; }
          for (const c of (r && r.children) || []) {
            if (mort || images.length >= 60) return;
            if (c.media_class === 'image' && c.media_content_id) images.push(c.media_content_id);
            else if (c.can_expand) await parcourir(c.media_content_id, prof + 1);
          }
        };
        await parcourir(null, 0);
        if (mort || !images.length) return;
        const urls = [];
        for (const mid of images.slice(0, 40)) {
          if (mort) return;
          try { const rr = await h.callWS({ type: 'media_source/resolve_media', media_content_id: mid }); if (rr && rr.url) urls.push(rr.url); } catch { /* image illisible */ }
        }
        // Mélange : ne pas revoir toujours les mêmes premières photos.
        for (let i = urls.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t2 = urls[i]; urls[i] = urls[j]; urls[j] = t2; }
        if (!mort && urls.length) setPhotos(urls);
      } catch { /* pas de médias : la veille classique */ }
    })();
    return () => { mort = true; };
  }, [photosOn]);
  useEffect(() => {
    if (photos.length < 2) return;
    const iv = setInterval(() => setPhotoIdx(i => (i + 1) % photos.length), 30000);
    return () => clearInterval(iv);
  }, [photos.length]);
  /* Détection de mouvement : la caméra de la TABLETTE réveille l'écran quand
   * quelqu'un passe. Tout est local — les frames ne quittent jamais l'appareil,
   * rien n'est enregistré. getUserMedia exige un contexte sécurisé : en HTTP
   * local la fonction s'éteint d'elle-même, le toucher réveille toujours. */
  const motionOn = (() => { try { return localStorage.getItem('loggia-ambmotion') === '1'; } catch { return false; } })();
  useEffect(() => {
    if (!motionOn) return;
    let flux = null, iv = 0, mort = false, avant = null;
    const video = document.createElement('video'); video.muted = true; video.playsInline = true;
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 24;
    const ctx2 = canvas.getContext('2d', { willReadFrequently: true });
    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
        flux = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
        if (mort) { flux.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = flux; await video.play();
        iv = setInterval(() => {
          try {
            ctx2.drawImage(video, 0, 0, 32, 24);
            const d = ctx2.getImageData(0, 0, 32, 24).data;
            if (avant) {
              let diff = 0;
              for (let i = 0; i < d.length; i += 16) { if (Math.abs(d[i] - avant[i]) > 26) diff++; }
              // ~192 points échantillonnés : une vingtaine qui bougent = une présence, pas du bruit de capteur.
              if (diff > 18) reveiller();
            }
            avant = new Uint8ClampedArray(d);
          } catch { /* frame illisible */ }
        }, 900);
      } catch { /* permission refusée : le toucher réveille */ }
    })();
    return () => { mort = true; clearInterval(iv); try { if (flux) flux.getTracks().forEach(t => t.stop()); } catch {} try { video.srcObject = null; } catch {} };
  }, [motionOn]);
  /* La maquette du 01/11 (handoff « Loggia Prototype », mode ambiant) : l'heure
   * en grand avec ses secondes en exposant, la date en italique, le ciel du
   * moment suivi des cinq prochaines heures, UN seul point qui mérite l'œil, et
   * la température de chaque pièce en pied d'écran, à la teinte de la pièce.
   * Ce que la maquette ne montre plus s'en va : les puces (intérieur, lumières,
   * alarme) et les scénarios — la veille se regarde, elle ne se pilote pas.
   * L'alarme déclenchée passe avant tout : elle prend la place du point. */
  const hass = hassProp || getHass();
  const S = (hass && hass.states) || {};
  /* Les pièces de la configuration, lues ICI dans les états : l'Accueil n'est
   * calculé que sur sa vue, et la veille s'allume depuis n'importe laquelle. */
  const num = (id) => (id && S[id] ? lireNombre(S[id].state) : null);
  const lues = (rooms || []).filter(r => r && r.room).map(r => {
    const h = r.haid || {};
    return { name: r.room, temp: num(h.temp), co2: num(h.co2), co2Id: h.co2 || null, co2Seuil: Number(h.co2seuil) > 0 ? Math.round(Number(h.co2seuil)) : null };
  });
  const idMeteo = weatherEntity(hass);
  const typesMeteo = typesPrevision(idMeteo ? S[idMeteo] : null);
  const parHeure = usePrevisions(hass, idMeteo, typesMeteo.heure ? 'hourly' : null);
  const prochaines = heuresMeteo({ etat: idMeteo ? S[idMeteo] : null, previsions: parHeure, maintenant: clock.getTime(), soleil: S['sun.sun'] || null })
    .filter(h => h.cle !== 'maint');
  const large = useWide(760);
  // Une rangée tient sur UNE ligne : quatre heures au téléphone, cinq ailleurs.
  const heures = prochaines.slice(0, large ? 5 : 4);
  const hm = clock.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const ss = String(clock.getSeconds()).padStart(2, '0');
  // « dimanche 1er novembre » : le français écrit le premier du mois en ordinal.
  const dateBrute = clock.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const dateStr = String(locale()).indexOf('fr') === 0 && clock.getDate() === 1 ? dateBrute.replace(/\b1\b/, '1er') : dateBrute;
  const un = (v) => v.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pieces = lues.filter(r => r.temp != null && !estDehors(r.name)).slice(0, 6);
  const point = (() => {
    if (ast === 'triggered') return { niveau: 'danger', icone: 'bell-ring', texte: tr('Alarme déclenchée') };
    const p = pointsAttention({
      S, pieces: lues.map(r => ({ nom: r.name, co2: r.co2, haid: r.co2Id, seuil: r.co2Seuil })),
      plateforme: plateformeDe, voisins: voisinsDe, nomAppareil: nomAppareilDe, vigilance: capteurVigilance(S, LOGGIA_INDEX),
    })[0];
    if (p) return { niveau: p.niveau, icone: p.icone || 'triangle-warning', texte: p.sous ? p.titre + ' · ' + p.sous : p.titre };
    const n = (notifs || []).find(x => x && x.c === 'var(--o-bad)');
    return n ? { niveau: 'danger', icone: 'triangle-warning', texte: n.t + ' · ' + n.m } : null;
  })();
  const tonPoint = point ? couleurNiveau(point.niveau) : null;
  return (
    /* La veille n'est pas un `role="button"` (lot 13 de l'audit du 03/10) : le
     * geste « réveiller » passe par un bouton de SURFACE, premier enfant — le
     * toucher réveille toujours par la fenêtre ; le bouton donne au clavier et
     * au lecteur d'écran un nom et une action. Il change d'écran, il n'ouvre
     * pas de fiche : `popup={false}`. */
    <div className="o-sombre" style={{ position: 'fixed', inset: 0, zIndex: 500, background: FOND, color: ENCRE, overflow: 'hidden', cursor: 'pointer', animation: REDUCE_MOTION ? 'none' : 'o-ambient-in 1s ease', userSelect: 'none' }}>
    <Surface onClick={reveiller} label={tr('Toucher pour réveiller')} popup={false} />
    {/* Diaporama : la photo courante en fondu, la suivante préchargée invisible,
        un voile pour que l'horloge reste lisible — plus opaque la nuit. */}
    {photos.length > 0 && (
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {photos.map((u, i) => (i === photoIdx || i === (photoIdx + 1) % photos.length)
          ? <img key={u} src={u} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: i === photoIdx ? 1 : 0, transition: REDUCE_MOTION ? 'none' : 'opacity 2.5s ease' }} />
          : null)}
        <div style={{ position: 'absolute', inset: 0, background: nuit ? 'rgba(4,7,13,.74)' : 'rgba(4,7,13,.48)' }} />
      </div>
    )}
    {/* Le halo qui respire derrière l'heure, sans photo seulement : il ne se
      * pose pas sur un souvenir. */}
    {!photos.length && <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '38%', width: 900, height: 600, margin: '-300px 0 0 -450px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(74,118,190,.22), transparent)', animation: REDUCE_MOTION ? 'none' : 'o-ic-shine 9s ease-in-out infinite', pointerEvents: 'none' }} />}
    {/* Le toucher traverse tout ce qui suit jusqu'à la surface (relecture du
      * lot 13, 04/10) : l'écoute haptique de l'App cherche un bouton sous le
      * doigt. Anti burn-in : tout le contenu dérive ensemble, pied d'écran
      * compris ; la nuit, il baisse d'un ton. */}
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: large ? 40 : '40px 18px', boxSizing: 'border-box', pointerEvents: 'none', transform: `translate(${decal.x}px, ${decal.y}px)`, opacity: nuit ? .55 : 1, transition: REDUCE_MOTION ? 'opacity 2s ease' : 'transform 6s ease, opacity 2s ease' }}>
      <div style={{ position: 'absolute', top: 'calc(24px + var(--o-safe-top, 0px))', right: 28, fontSize: 11, fontWeight: 700, color: encre(.3) }}>{tr('Touchez l’écran pour revenir')}</div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', lineHeight: .9 }}>
        <span style={{ fontSize: 'clamp(100px, 17vw, 220px)', fontWeight: 400, letterSpacing: '-.05em', fontVariantNumeric: 'tabular-nums' }}>{hm}</span>
        <span style={{ fontSize: 22, fontWeight: 600, color: encre(.55), margin: '14px 0 0 10px', fontVariantNumeric: 'tabular-nums' }}>{ss}</span>
      </div>
      <div style={{ position: 'relative', fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontWeight: 500, fontSize: large ? 'clamp(28px, 3.2vw, 40px)' : 28, color: encre(.82), marginTop: 14, textAlign: 'center' }}>{dateStr}</div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: large ? 22 : 14, marginTop: 30, justifyContent: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }} title={weatherLabel || undefined}>
          <WeatherIco wx={wx} size={34} anime={!!wxFx} />
          <span style={{ fontSize: 32, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{weatherTemp != null ? un(weatherTemp) + '°' : '—'}</span>
        </span>
        {heures.length > 0 && <span aria-hidden="true" style={{ width: 1, height: 30, background: 'rgba(255,255,255,.12)' }} />}
        {heures.map(h => (
          <span key={h.cle} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: encre(.58) }}>
            <span>{h.libelle}</span>
            <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{h.mode && <WeatherIco wx={h.mode} size={18} anime={false} />}</span>
            <span style={{ color: ENCRE, fontSize: 13 }}>{h.temp}</span>
          </span>
        ))}
      </div>
      {point && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, marginTop: 30, padding: '9px 16px 9px 12px', borderRadius: 999, maxWidth: '84vw', background: `rgba(${tonPoint.rgb},.1)`, border: `1px solid rgba(${tonPoint.rgb},.28)`, fontSize: 13, fontWeight: 700, color: tonPoint.col }}>
          <Ico name={point.icone} size={14} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{point.texte}</span>
        </div>
      )}
      {pieces.length > 0 && (
        <div style={{ position: 'absolute', left: large ? 40 : 18, right: large ? 40 : 18, bottom: 'calc(30px + var(--o-safe-bottom, 0px))', display: 'grid', gridTemplateColumns: `repeat(${large ? pieces.length : Math.min(3, pieces.length)}, minmax(0, 1fr))`, gap: 10 }}>
          {pieces.map(r => (
            <div key={r.name} style={{ textAlign: 'center', lineHeight: 1.3, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: habillagePiece(r.name).col, opacity: .85, fontVariantNumeric: 'tabular-nums' }}>{un(r.temp)}°</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: encre(.42), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}
