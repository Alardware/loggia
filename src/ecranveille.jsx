/* L'ecran de veille (sorti d'App.jsx le 23/09, plan M1).
 *
 * Troisieme etape du decoupage. C'est un ecran a lui tout seul : il recouvre
 * tout, ne lit que ce qu'on lui passe, et rend la main au premier toucher. Ses
 * cent-soixante-dix lignes vivaient au milieu du monolithe, entre une carte de
 * piece et la vue Objets.
 */
import { useState, useEffect, useRef } from 'react';
import { REDUCE_MOTION } from './ui.jsx';
import { Ico } from './icones.jsx';
import { WxMini, WeatherIco } from './wxutil.jsx';
import { tr, locale } from './i18n.js';
import { getHass } from './state.js';

/* Mode ambiant : l'ecran de veille de la tablette murale. Apres un delai sans
 * toucher, le dashboard s'efface derriere l'essentiel — l'heure en grand, la
 * meteo animee, la temperature interieure, et seulement ce qui merite l'oeil
 * (lumieres allumees, alarme, alertes surete). Un toucher le retire, on
 * retrouve l'ecran ou on l'avait laisse : c'est le MEME dashboard qui se met
 * en veille, pas un second a entretenir. Toujours sombre, quel que soit le
 * theme : c'est une veille. Idee reprise des dashboards ambiants de Madelena. */
export function AmbientOverlay({ wx, wxFx, weatherTemp, weatherLabel, inTemp, lightsOn, notifs, ast = null, scenes = [], onScene = null }) {
  // Tant que la veille recouvre l'écran, les fonds GPU (wx3d, ciel 3D) rendent
  // pour personne : la classe leur dit de souffler — batterie de la tablette.
  useEffect(() => {
    document.documentElement.classList.add('loggia-ambient-on');
    return () => document.documentElement.classList.remove('loggia-ambient-on');
  }, []);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const iv = setInterval(() => setClock(new Date()), 10000); return () => clearInterval(iv); }, []);
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
              if (diff > 18) { try { window.dispatchEvent(new PointerEvent('pointerdown')); } catch { window.dispatchEvent(new Event('pointerdown')); } }
            }
            avant = new Uint8ClampedArray(d);
          } catch { /* frame illisible */ }
        }, 900);
      } catch { /* permission refusée : le toucher réveille */ }
    })();
    return () => { mort = true; clearInterval(iv); try { if (flux) flux.getTracks().forEach(t => t.stop()); } catch {} try { video.srcObject = null; } catch {} };
  }, [motionOn]);
  // Scène lancée depuis la veille : retour visuel bref, sans réveiller l'écran.
  const [scFlash, setScFlash] = useState(null);
  const scRef = useRef(0);
  useEffect(() => () => clearTimeout(scRef.current), []);
  const lancerScene = (s) => {
    setScFlash(s.id); clearTimeout(scRef.current); scRef.current = setTimeout(() => setScFlash(null), 1600);
    // Le refus remonte à l'écoute globale : un `try/catch` ne le verrait pas.
    if (onScene) onScene(s);
  };
  const hm = clock.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const capit = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const dateStr = capit(clock.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }));
  const rouges = (notifs || []).filter(n => n && n[0] === 'var(--o-bad)').slice(0, 3);
  const chip = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)', fontSize: 14, fontWeight: 700, color: '#aeb9cc' };
  const pt = (c) => <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: c, boxShadow: '0 0 8px ' + c }} />;
  return (
    <div className="o-sombre" role="button" aria-label={tr('Toucher pour réveiller')} style={{ position: 'fixed', inset: 0, zIndex: 500, background: '#05070b', color: '#e8edf5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', animation: REDUCE_MOTION ? 'none' : 'o-ambient-in 1s ease', userSelect: 'none' }}>
    {/* Diaporama : la photo courante en fondu, la suivante préchargée invisible,
        un voile pour que l'horloge reste lisible — plus opaque la nuit. */}
    {photos.length > 0 && (
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {photos.map((u, i) => (i === photoIdx || i === (photoIdx + 1) % photos.length)
          ? <img key={u} src={u} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: i === photoIdx ? 1 : 0, transition: REDUCE_MOTION ? 'none' : 'opacity 2.5s ease' }} />
          : null)}
        <div style={{ position: 'absolute', inset: 0, background: nuit ? 'rgba(5,7,11,.74)' : 'rgba(5,7,11,.48)' }} />
      </div>
    )}
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transform: `translate(${decal.x}px, ${decal.y}px)`, opacity: nuit ? .55 : 1, transition: REDUCE_MOTION ? 'opacity 2s ease' : 'transform 6s ease, opacity 2s ease' }}>
      <div style={{ fontSize: 'clamp(72px, 17vw, 170px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{hm}</div>
      <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 'clamp(17px, 2.6vw, 24px)', color: '#8b95a7' }}>{dateStr}</div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 22px', borderRadius: 18, background: 'rgba(255,255,255,.035)', marginTop: 18, overflow: 'hidden' }}>
        <WxMini wx={wx} on={wxFx} />
        <WeatherIco wx={wx} size={46} />
        <div style={{ position: 'relative', lineHeight: 1.15 }}>
          <div style={{ fontSize: 25, fontWeight: 800 }}>{weatherTemp != null ? Math.round(weatherTemp) : '—'}°</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#8b95a7' }}>{weatherLabel || ''}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 16, maxWidth: '84vw' }}>
        {inTemp != null && <span style={chip}>{pt('#54c8f0')}{inTemp.toFixed(1).replace('.', ',')} °C {tr('intérieur')}</span>}
        {lightsOn > 0 && <span style={{ ...chip, color: 'var(--o-lampe)' }}>{pt('var(--o-lampe)')}{lightsOn > 1 ? tr('{n} allumées', { n: lightsOn }) : tr('{n} allumée', { n: lightsOn })}</span>}
        {ast != null && <span style={{ ...chip, color: ast === 'triggered' ? 'var(--o-bad)' : ast === 'disarmed' ? 'var(--o-ok)' : 'var(--o-warn)' }}>{pt(ast === 'triggered' ? 'var(--o-bad)' : ast === 'disarmed' ? 'var(--o-ok)' : 'var(--o-warn)')}{ast === 'triggered' ? tr('Alarme') : ast === 'disarmed' ? tr('Alarme désarmée') : tr('Alarme armée')}</span>}
      </div>
      {rouges.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, alignItems: 'center' }}>
          {rouges.map((n, i) => <span key={i} style={{ ...chip, color: 'var(--o-bad)', border: '1px solid rgba(var(--o-bad-rgb),.3)', background: 'rgba(var(--o-bad-rgb),.08)' }}>{pt('var(--o-bad)')}{n[1]} · {n[2]}</span>)}
        </div>
      )}
      {/* Scènes rapides SANS réveiller : le pointeur est stoppé avant d'atteindre
          la fenêtre (le réveil écoute là) — le geste du soir se fait depuis la
          veille, l'écran reste en veille. */}
      {scenes.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '84vw' }}>
          {scenes.slice(0, 4).map(s => (
            <button key={s.id}
              onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); lancerScene(s); }}
              style={{ ...chip, cursor: 'pointer', fontSize: 12, padding: '8px 14px', transition: 'background .3s, border-color .3s',
                background: scFlash === s.id ? 'rgba(var(--o-accent-rgb),.28)' : 'rgba(255,255,255,.05)',
                border: '1px solid ' + (scFlash === s.id ? 'rgba(var(--o-accent-rgb),.55)' : 'rgba(255,255,255,.09)') }}>
              <Ico name={s.icone || 'sparkles'} size={13} />{s.nom || s.id}
            </button>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}
