/**
 * Effets météo animés — la scène qui se pose derrière une carte.
 *
 * Repris de la maquette `WeatherEffects.jsx` fournie le 02/09 (dashboard
 * Orion), avec trois adaptations pour Loggia :
 *
 *  1. les keyframes vivent dans `index.css` avec toutes les autres, plutôt que
 *     dans une balise `<style>` injectée à chaque montage ;
 *  2. une ÉCHELLE (`k`) : la maquette dessine pour un panneau de 368 px, une
 *     carte de prévision fait moitié moins. Tout ce qui est en pixels est
 *     multiplié par `k` — sans quoi le soleil déborde et la lune mange le
 *     texte ;
 *  3. les huit ambiances portent déjà les noms que produit `haWeatherMode`
 *     (`sun`, `partly`, `clouds`, `wind`, `rain`, `snow`, `storm`, `night`) :
 *     aucune table de correspondance à maintenir.
 *
 * La scène est en `position: absolute; inset: 0` et ne prend jamais les
 * clics ; le parent doit être `position: relative; overflow: hidden`. Un
 * masque de dégradé la dissout vers le bas — c'est ce qui évite la couture
 * horizontale d'un calque semi-transparent.
 */
import { useMemo } from 'react';

/** Dégradé de ciel par ambiance. */
export const WX_SKY = {
  sun: 'linear-gradient(165deg,#2f7fd6 0%,#5fa0e4 52%,#93bfee 100%)',
  partly: 'linear-gradient(165deg,#4a86c8 0%,#79a6d8 52%,#aecae8 100%)',
  clouds: 'linear-gradient(165deg,#586c80 0%,#8499ad 52%,#a7b8c9 100%)',
  wind: 'linear-gradient(165deg,#6a8aa6 0%,#90a8be 52%,#b3c6d6 100%)',
  rain: 'linear-gradient(165deg,#39434f 0%,#515d6b 52%,#697585 100%)',
  snow: 'linear-gradient(165deg,#7f90a4 0%,#a8b8c9 52%,#ccd6e1 100%)',
  storm: 'linear-gradient(165deg,#262c39 0%,#39414f 52%,#4a5564 100%)',
  night: 'linear-gradient(to bottom,#060010 0%,#0a0121 42%,#19023e 74%,#2e045a 92%,#3a0668 100%)',
};

/* PRNG déterministe : le champ de gouttes ou d'étoiles ne se réarrange pas à
 * chaque rendu, sinon la pluie sauterait à chaque changement d'état. */
const rnd = (i, k) => { const x = Math.sin((i + 1) * (k * 12.9 + 7.3)) * 43758.5; return x - Math.floor(x); };

/* ---------------------------- SOLEIL ------------------------------ */
function Sun({ k }) {
  const rays = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const r = (n) => { const x = Math.sin((i + 1) * (n * 12.9 + 4.1)) * 43758.5; return x - Math.floor(x); };
    const a = i * 30 + (r(1) * 10 - 5);
    return (
      <span key={i} style={{
        position: 'absolute', left: '50%', bottom: '50%',
        width: ((7 + r(3) * 9) * k).toFixed(1) + 'px',
        height: Math.round((30 + r(2) * 26) * k) + 'px',
        transformOrigin: 'bottom center',
        transform: `translateX(-50%) rotate(${a.toFixed(1)}deg)`,
        background: 'linear-gradient(to top, rgba(255,240,180,0), rgba(255,243,190,.9))',
        borderRadius: '80% 80% 0 0',
        opacity: (0.12 + r(2) * 0.18).toFixed(2),
        filter: 'blur(1px)',
      }} />
    );
  }), [k]);
  const T = 84 * k;
  return (
    <div style={{ position: 'absolute', top: 22 * k, right: 30 * k, width: T, height: T }}>
      <div style={{ position: 'absolute', inset: -30 * k, borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,226,140,.5),rgba(255,205,95,.12) 48%,transparent 70%)' }} />
      <div style={{ position: 'absolute', inset: 0, animation: 'we-spin 64s linear infinite' }}>{rays}</div>
      <div style={{
        position: 'absolute', inset: 22 * k, borderRadius: '50%',
        background: 'radial-gradient(circle at 38% 33%,#fffef6,#ffe27a 55%,#ffc23d)',
        boxShadow: `0 0 ${26 * k}px ${7 * k}px rgba(255,212,95,.7),0 0 ${56 * k}px ${18 * k}px rgba(255,190,70,.32)`,
        animation: 'we-sunpulse 4.5s ease-in-out infinite',
      }} />
    </div>
  );
}

/* ---------------------------- NUAGES ------------------------------ */
const CLOUD_PATH = 'M40 60 a23 23 0 0 1 2 -45 a27 27 0 0 1 50 6 a19 19 0 0 1 -2 39 Z';
function Clouds({ k }) {
  return (
    <>
      <svg width={150 * k} height={80 * k} viewBox="0 0 150 80" style={{ position: 'absolute', top: 6 * k, left: -18 * k, opacity: .92, animation: 'we-clouddrift 9s ease-in-out infinite alternate' }}><path fill="rgba(255,255,255,.9)" d={CLOUD_PATH} /></svg>
      <svg width={118 * k} height={64 * k} viewBox="0 0 150 80" style={{ position: 'absolute', top: 40 * k, right: -16 * k, opacity: .8, animation: 'we-clouddrift 11s ease-in-out infinite alternate-reverse' }}><path fill="rgba(255,255,255,.82)" d={CLOUD_PATH} /></svg>
      <svg width={96 * k} height={52 * k} viewBox="0 0 150 80" style={{ position: 'absolute', top: 74 * k, left: '32%', opacity: .68, animation: 'we-clouddrift 13s ease-in-out infinite alternate' }}><path fill="rgba(255,255,255,.78)" d={CLOUD_PATH} /></svg>
    </>
  );
}

/* ---------------------- PLUIE (goutte + « ploc ») ------------------ */
function Rain({ count, k }) {
  const drops = useMemo(() => Array.from({ length: count }, (_, i) => {
    const r = (n) => rnd(i, n);
    const dur = (0.62 + r(3) * 0.5).toFixed(2);
    const delay = (-(r(4) * 1.7)).toFixed(2);
    const op = (0.32 + r(2) * 0.42).toFixed(2);
    const anim = (n) => `${n} ${dur}s linear ${delay}s infinite`;
    return (
      <span key={i} style={{
        position: 'absolute', top: -42 * k, left: (r(1) * 102 - 1).toFixed(1) + '%', width: 15 * k,
        '--we-fall': Math.round((150 + r(5) * 72) * k) + 'px',
        animation: anim('we-rdrop'),
      }}>
        <span style={{
          display: 'block', width: 1, height: Math.round((26 + r(2) * 26) * k) + 'px', marginLeft: 7 * k,
          background: `linear-gradient(to bottom, rgba(255,255,255,0), rgba(202,222,255,${op}))`,
          animation: anim('we-rstem'),
        }} />
        <span style={{
          display: 'block', width: 15 * k, height: 9 * k, borderTop: `2px dotted rgba(206,224,255,${op})`,
          borderRadius: '50%', transform: 'scale(0)', animation: anim('we-rsplat'),
        }} />
      </span>
    );
  }), [count, k]);
  return <>{drops}</>;
}

/* ---------------------------- NEIGE ------------------------------- */
function Snow({ count, k }) {
  const flakes = useMemo(() => {
    const lefts = [8, 18, 28, 40, 52, 62, 72, 84, 14, 46, 68, 90];
    const sizes = [6, 5, 7, 5, 6, 5, 7, 5, 6, 6, 5, 6];
    const durs = [3.2, 3.6, 3, 3.8, 3.3, 3.5, 3.1, 3.7, 3.4, 3.2, 3.6, 3.5];
    const delay = [0, .6, 1.1, .3, .9, 1.4, .5, 1, 1.6, .8, 1.3, .4];
    return Array.from({ length: count }, (_, i) => (
      <span key={i} style={{
        position: 'absolute', top: -8 * k, left: lefts[i % 12] + '%',
        width: sizes[i % 12] * k, height: sizes[i % 12] * k, borderRadius: '50%',
        background: `rgba(255,255,255,${sizes[i % 12] >= 7 ? .95 : sizes[i % 12] >= 6 ? .9 : .82})`,
        animation: `we-snowfall ${durs[i % 12]}s linear ${delay[i % 12]}s infinite`,
      }} />
    ));
  }, [count, k]);
  return <>{flakes}</>;
}

/* ------------------------ VENT (feuilles) -------------------------- */
function Wind({ count, k }) {
  const leaves = useMemo(() => {
    const cols = ['#9c7b3f', '#7d8a3e', '#b5894a', '#8a6d35'];
    return Array.from({ length: count }, (_, i) => {
      const r = (n) => { const x = Math.sin((i + 1) * (n * 12.9 + 5.7)) * 43758.5; return x - Math.floor(x); };
      const col = cols[Math.floor(r(5) * cols.length)];
      const t = 13 * k;
      return (
        <span key={i} style={{
          position: 'absolute', top: ((8 + r(1) * 52) * k).toFixed(0) + 'px', left: 0, width: t, height: t,
          transform: `scale(${(0.6 + r(2) * 0.7).toFixed(2)})`,
          animation: `we-leafblow ${(2.6 + r(3) * 2.4).toFixed(2)}s linear ${(-(r(4) * 5)).toFixed(2)}s infinite`,
        }}>
          <svg width={t} height={t} viewBox="0 0 24 24" fill={col}>
            <path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14zm2-3c3-5 6-7 10-8" />
          </svg>
        </span>
      );
    });
  }, [count, k]);
  return <>{leaves}</>;
}

/* ---------------------- ORAGE (2 éclairs + flash) ------------------ */
const BOLT_MAIN = 'M23 1 L15 13 L21 16 L11 28 L18 31 L8 45 L16 47 L9 65';
function Storm({ k }) {
  return (
    <>
      <div style={{
        position: 'absolute', inset: 0, mixBlendMode: 'screen',
        background: 'radial-gradient(120% 80% at 52% 0%,rgba(255,255,255,.95),rgba(214,229,255,.35) 30%,transparent 62%)',
        animation: 'we-lightning 4.2s linear infinite',
      }} />
      <svg width={58 * k} height={100 * k} viewBox="0 0 40 66" style={{
        position: 'absolute', top: 12 * k, left: '45%',
        animation: 'we-lightning 4.2s linear infinite',
        filter: 'drop-shadow(0 0 6px rgba(255,246,190,.98)) drop-shadow(0 0 18px rgba(150,185,255,.9))',
      }}>
        <path fill="none" stroke="#fff8cc" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" d={BOLT_MAIN} />
        <path fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" d={BOLT_MAIN} />
        <path fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M18 31 L24 34 L19 44" />
      </svg>
      <svg width={38 * k} height={66 * k} viewBox="0 0 40 66" style={{
        position: 'absolute', top: 28 * k, left: '23%', opacity: .85,
        animation: 'we-lightning2 4.2s linear infinite',
        filter: 'drop-shadow(0 0 5px rgba(255,246,190,.9)) drop-shadow(0 0 14px rgba(150,185,255,.8))',
      }}>
        <path fill="none" stroke="#fff8cc" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M22 1 L14 14 L20 17 L10 30 L17 33 L9 50" />
      </svg>
    </>
  );
}

/* -------------------- NUIT (étoiles + lune) ------------------------ */
function Night({ stars, k }) {
  const field = useMemo(() => Array.from({ length: stars }, (_, i) => {
    const r = (n) => { const x = Math.sin((i + 1) * (n * 12.9 + 9.7)) * 43758.5; return x - Math.floor(x); };
    const sz = ((0.8 + r(2) * 1.9) * Math.max(k, .7)).toFixed(1);
    const big = r(2) > 0.82;
    const blink = r(5) > 0.45;
    return (
      <span key={i} style={{
        position: 'absolute', top: (r(1) * 60).toFixed(1) + '%', left: (r(6) * 100).toFixed(1) + '%',
        width: sz + 'px', height: sz + 'px', borderRadius: '50%', background: '#fff', opacity: .85,
        boxShadow: big ? '0 0 6px 1px rgba(255,255,255,.7)' : 'none',
        animation: blink ? `we-twinkle ${(1.8 + r(3) * 2.8).toFixed(2)}s ease-in-out ${(-(r(4) * 3)).toFixed(2)}s infinite` : 'none',
      }} />
    );
  }), [stars, k]);
  const L = 50 * k;
  return (
    <>
      {field}
      <div style={{
        position: 'absolute', top: 24 * k, right: 32 * k, width: L, height: L, borderRadius: '50%', overflow: 'hidden',
        background: 'radial-gradient(circle at 36% 34%,#fdfcf3,#d3dbe9 64%,#aab6cc)',
        boxShadow: `0 0 ${22 * k}px ${6 * k}px rgba(206,222,255,.45),0 0 ${46 * k}px ${14 * k}px rgba(150,170,230,.25)`,
      }}>
        <div style={{ position: 'absolute', top: 7 * k, left: 9 * k, width: 9 * k, height: 9 * k, borderRadius: '50%', background: 'rgba(150,165,195,.4)' }} />
        <div style={{ position: 'absolute', top: 24 * k, left: 26 * k, width: 12 * k, height: 12 * k, borderRadius: '50%', background: 'rgba(150,165,195,.32)' }} />
        <div style={{ position: 'absolute', top: 30 * k, left: 11 * k, width: 6 * k, height: 6 * k, borderRadius: '50%', background: 'rgba(150,165,195,.3)' }} />
      </div>
    </>
  );
}

/**
 * La scène complète.
 *
 * `k` met tout à l'échelle : 1 pour un grand panneau, ~0,5 pour une carte de
 * prévision. `fadeStart` dit à quel pourcentage de la hauteur le fondu
 * commence. `showSky` à false ne garde que les effets, sans dégradé.
 */
export default function WeatherEffects({ weather = 'sun', k = 1, fadeStart = 18, showSky = true, densite = 1, offsetY = 0, style }) {
  const mask = `linear-gradient(to bottom, #000 0%, #000 ${fadeStart}%, transparent 100%)`;
  const hasSun = weather === 'sun' || weather === 'partly';
  const hasClouds = weather !== 'sun' && weather !== 'night';
  const hasRain = weather === 'rain' || weather === 'storm';
  return (
    <div data-we={weather} aria-hidden="true" style={{
      position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none',
      background: showSky ? (WX_SKY[weather] || WX_SKY.sun) : 'transparent',
      WebkitMaskImage: mask, maskImage: mask,
      ...style,
    }}>
      {/* Les ornements peuvent descendre (`offsetY`) : dans une carte de
        * prévision, les nuages de la maquette tombent pile sur le nom du jour.
        * Le ciel, lui, reste au fond, sur toute la hauteur. */}
      <div style={{ position: 'absolute', inset: 0, transform: offsetY ? `translateY(${offsetY}px)` : undefined }}>
      {hasSun && <Sun k={k} />}
      {hasClouds && <Clouds k={k} />}
      {weather === 'wind' && <Wind count={Math.round(11 * densite)} k={k} />}
      {hasRain && <Rain count={Math.round(42 * densite)} k={k} />}
      {weather === 'snow' && <Snow count={Math.round(12 * densite)} k={k} />}
      {weather === 'storm' && <Storm k={k} />}
      {weather === 'night' && <Night stars={Math.round(54 * densite)} k={k} />}
      </div>
    </div>
  );
}
