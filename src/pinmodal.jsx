/* La modale du code administrateur (sortie d'App.jsx le 23/09, plan M1).
 *
 * Troisieme etape du decoupage : un ecran entier, ferme sur lui-meme — il ne
 * connait que `hass` pour poser sa question au serveur, et deux rappels. Il
 * n'avait rien a faire au milieu du monolithe, entre la barre du bas et le
 * bouton de l'assistant.
 */
import { useState, useEffect, useRef } from 'react';
import { tr } from './i18n.js';

// Modale du code administrateur — gate le basculement vers un profil Admin.
// Le code n'est PLUS dans le navigateur (18/09) : il est vérifié par le
// composant (`loggia/pin/verifier`), qui compte les essais ratés et bloque.
// Un seul code pour la maison, le même sur chaque appareil et chaque accès.
export function PinModal({ hass, onClose, onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [attente, setAttente] = useState(false);
  const [bloque, setBloque] = useState(0);   // secondes annoncées par le serveur
  const [horsLigne, setHorsLigne] = useState(false);
  const timers = useRef([]);
  // Le compte à rebours du blocage : on l'affiche, on ne le contourne pas.
  useEffect(() => {
    if (!bloque) return undefined;
    const iv = setInterval(() => setBloque(b => (b > 1 ? b - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, [bloque]);
  const verifier = async (np) => {
    const h = hass && typeof hass.callWS === 'function' ? hass : null;
    if (!h) { setHorsLigne(true); setError(true); timers.current.push(setTimeout(() => { setPin(''); setError(false); }, 900)); return; }
    setAttente(true);
    try {
      const r = await h.callWS({ type: 'loggia/pin/verifier', pin: np });
      if (r && r.ok) { onSuccess(); return; }
      setBloque(r && r.bloque ? Number(r.bloque) : 0);
      setError(true);
      timers.current.push(setTimeout(() => { setPin(''); setError(false); }, 650));
    } catch {
      setHorsLigne(true); setError(true);
      timers.current.push(setTimeout(() => { setPin(''); setError(false); }, 900));
    } finally { setAttente(false); }
  };
  const partiDuVoile = useRef(false);
  const boiteRef = useRef(null);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  // Focus dans la boite a l'ouverture, rendu a l'element d'origine ensuite —
  // sans quoi le clavier reste derriere la modale.
  useEffect(() => {
    const avant = document.activeElement;
    const t = setTimeout(() => { try { const el = boiteRef.current; if (el) (el.querySelector('button, [tabindex="0"]') || el).focus({ preventScroll: true }); } catch {} }, 40);
    return () => { clearTimeout(t); try { if (avant && avant.focus) avant.focus({ preventScroll: true }); } catch {} };
  }, []);
  const padBtn = { height: 52, borderRadius: 14, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 19, fontWeight: 600, cursor: 'pointer' };
  const add = (d) => {
    if (attente || bloque) return;
    setError(false); setHorsLigne(false);
    setPin(p => {
      if (p.length >= 4) return p;
      const np = p + d;
      if (np.length === 4) timers.current.push(setTimeout(() => { verifier(np); }, 110));
      return np;
    });
  };
  return (
    <div role="presentation"
      onPointerDown={(e) => { partiDuVoile.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && partiDuVoile.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.62)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* Une boite de dialogue qui ecoute Echap n'est pas une anomalie. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div ref={boiteRef} role="dialog" aria-modal="true" aria-label={tr('Code administrateur')} tabIndex={-1}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
        onClick={e => e.stopPropagation()} style={{ width: 296, maxHeight: '92vh', overflowY: 'auto', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd1)', borderRadius: 'var(--o-radius,18px)', padding: 24, boxShadow: '0 30px 70px rgba(0,0,0,.6)', animation: error ? 'm-shake .45s' : 'none' }}>
        <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700 }}>{tr('Code administrateur')}</div>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--o-text2)', marginTop: 4 }}>{tr('Requis pour ce profil')}</div>
        {bloque > 0 && <div role="alert" style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)', marginTop: 10 }}>{tr('Trop d’essais. Réessaie dans {n} s.', { n: bloque })}</div>}
        {horsLigne && <div role="alert" style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)', marginTop: 10 }}>{tr('Home Assistant n’est pas joignable : le code ne peut pas être vérifié.')}</div>}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '22px 0' }}>{[0, 1, 2, 3].map(i => <span key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < pin.length ? (error ? 'var(--o-bad)' : 'var(--o-accent-soft)') : 'transparent', border: `1px solid ${error ? 'var(--o-bad)' : 'var(--o-bd2)'}`, transition: 'background .15s' }} />)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <button key={n} onClick={() => add(String(n))} style={padBtn}>{n}</button>)}
          <span />
          <button onClick={() => add('0')} style={padBtn}>0</button>
          <button onClick={() => setPin(p => p.slice(0, -1))} style={{ ...padBtn, fontSize: 15 }}>⌫</button>
        </div>
      </div>
    </div>
  );
}
