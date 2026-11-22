/* Les commandes qu'une caméra pose sur son image : le son et la croix d'orientation (chantier du 20/11, A8).
 * Le mot « Privé » vit à part (`camprive.jsx`) : il part avec la page, ceci se charge à la demande.
 *
 * Elles vivent dans le cadre de la tuile — celui de `CamLive`, qui les monte —, au-dessus du bouton qui agrandit
 * (z-index 3 contre 2). Ce qui se lit (le son, les boutons de direction, le mode privé) est dans `camson.js` et
 * `camcmd.js`, purs et testés ; ici, seulement ce qu'il faut de React. */
import { useState, useEffect, useRef, useId } from 'react';
import { tr } from './i18n.js';
import { commanderService } from './actions.js';
import { LOGGIA_INDEX } from './state.js';
import { ptzDe } from './camcmd.js';
import { aDuSon, prendreLeSon, rendreLeSon } from './camson.js';

// Les glyphes sont des tracés, comme le ⤢ de la tuile : ni police d'icônes, ni `ui.jsx` (la tuile se charge avant lui,
// dans la feuille de l'aspirateur).
const HP = '11 5 6 9 2 9 2 15 6 15 11 19 11 5';
const TRACES = {
  son: <><polygon points={HP} /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></>,
  muet: <><polygon points={HP} /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></>,
  haut: <polyline points="18 15 12 9 6 15" />,
  bas: <polyline points="6 9 12 15 18 9" />,
  gauche: <polyline points="15 18 9 12 15 6" />,
  droite: <polyline points="9 18 15 12 9 6" />,
};
const Glyphe = ({ i, size }) => <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{TRACES[i]}</svg>;

// La même verrerie que le ⤢ de la tuile (camera, `CameraTile`) : une commande de plus sur l'image, pas un autre dessin.
const VERRE = { border: 'none', padding: 0, borderRadius: 10, color: '#fff', cursor: 'pointer', background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
// Choisi = le bleu plein de la maison, texte blanc.
const CHOISI = { background: 'var(--o-accent-fond)' };

/** « Écouter » : une caméra à la fois, coupée en quittant. Ne s'affiche que si le flux PORTE du son. */
export function BoutonSon({ vidRef, nom }) {
  const cle = useId();
  const [present, setPresent] = useState(false);
  const [ecoute, setEcoute] = useState(false);
  /* La piste audio WebRTC arrive APRÈS la vidéo (deux pistes, deux événements) : on relit le flux jusqu'à ce qu'on
   * le sache, puis de temps en temps — une renégociation peut en changer. */
  useEffect(() => {
    const lire = () => setPresent(aDuSon(vidRef.current) === true);
    lire();
    const iv = setInterval(lire, 2000);
    return () => clearInterval(iv);
  }, [vidRef]);
  // Quitter coupe : la tuile qui s'en va (autre vue, direct coupé par le regard) rend le son et remet le muet.
  useEffect(() => {
    const v = vidRef.current;
    return () => { if (v) v.muted = true; rendreLeSon(cle); };
  }, [vidRef, cle]);
  if (!present) return null;
  const x = nom || tr('Caméra');
  const basculer = (e) => {
    e.stopPropagation();
    const v = vidRef.current;
    if (!v) return;
    if (ecoute) { v.muted = true; rendreLeSon(cle); setEcoute(false); return; }
    v.muted = false;
    setEcoute(true);
    prendreLeSon(cle, () => { const w = vidRef.current; if (w) w.muted = true; setEcoute(false); });
    // Le navigateur peut refuser un son non demandé : on remet alors le muet plutôt que d'afficher « écoute » pour rien.
    const p = v.play && v.play();
    if (p && p.catch) p.catch(() => { v.muted = true; rendreLeSon(cle); setEcoute(false); });
  };
  const dit = ecoute ? tr('Couper le son de {x}', { x }) : tr('Écouter {x}', { x });
  return (
    <button type="button" className="o-camson" aria-pressed={ecoute} aria-label={dit} title={dit} onClick={basculer}
      style={{ ...VERRE, ...(ecoute ? CHOISI : null), position: 'absolute', top: 30, right: 12, zIndex: 3, width: 30, height: 30 }}>
      <Glyphe i={ecoute ? 'son' : 'muet'} size={15} />
    </button>
  );
}

// Le sens, son glyphe, sa place dans la croix (ligne, colonne) et sa phrase.
const CROIX = [
  { sens: 'haut', i: 'haut', l: 1, c: 2, dit: (x) => tr('Orienter {x} vers le haut', { x }) },
  { sens: 'gauche', i: 'gauche', l: 2, c: 1, dit: (x) => tr('Orienter {x} vers la gauche', { x }) },
  { sens: 'droite', i: 'droite', l: 2, c: 3, dit: (x) => tr('Orienter {x} vers la droite', { x }) },
  { sens: 'bas', i: 'bas', l: 3, c: 2, dit: (x) => tr('Orienter {x} vers le bas', { x }) },
];

/** La croix d'orientation d'une caméra motorisée. Rien quand l'appareil n'expose pas de quoi bouger (`ptzDe`), et
 *  seulement dans la FICHE : sur la tuile, tout le cadre agrandit, et une croix y masquerait l'image. */
export function CamOrientation({ hass, haid, nom }) {
  const racine = useRef(null);
  const [fiche, setFiche] = useState(false);
  const [enCours, setEnCours] = useState(null);
  const ptz = ptzDe(LOGGIA_INDEX, hass && hass.states, haid);
  const aPtz = !!ptz;
  const mobile = useRef({});
  mobile.current = { hass, ptz, enCours: mobile.current.enCours || null };
  // La fiche est une feuille (`role="dialog"`, ui.jsx) : on la reconnaît à son parent, la tuile ne sait pas où elle est.
  useEffect(() => {
    const r = racine.current;
    setFiche(!!(r && r.closest && r.closest('[role="dialog"]')));
  }, [aPtz]);
  /* Une caméra qui part ne s'arrête pas toute seule : si la croix disparaît pendant un mouvement (fiche fermée,
   * autre vue), l'arrêt part avec elle. */
  useEffect(() => () => {
    const m = mobile.current;
    if (m.enCours && m.ptz && m.ptz.stop) commanderService(m.hass, m.ptz.stop, 'button', 'press', { entity_id: m.ptz.stop });
  }, []);
  if (!ptz) return null;
  const presser = (id) => commanderService(hass, id, 'button', 'press', { entity_id: id });
  const demarrer = (e, sens) => {
    if (e.repeat) return;
    e.preventDefault();
    e.stopPropagation();
    try { if (e.pointerId != null) e.currentTarget.setPointerCapture(e.pointerId); } catch { /* clavier, ou pas de capture */ }
    mobile.current.enCours = sens;
    setEnCours(sens);
    presser(ptz[sens]);
  };
  const arreter = () => {
    if (!mobile.current.enCours) return;
    mobile.current.enCours = null;
    setEnCours(null);
    if (ptz.stop) presser(ptz.stop);
  };
  const touche = (e) => e.key === 'Enter' || e.key === ' ';
  const x = nom || tr('Caméra');
  const continu = ptz.mode === 'continu';
  return (
    <div ref={racine} style={{ display: 'contents' }}>
      {fiche && (
        <div role="group" aria-label={tr('Orientation de la caméra')}
          style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', zIndex: 3, display: 'grid', gridTemplateColumns: 'repeat(3,34px)', gridTemplateRows: 'repeat(3,34px)', gap: 4 }}>
          {CROIX.filter(b => ptz[b.sens]).map(b => {
            const st = hass && hass.states ? hass.states[ptz[b.sens]] : null;
            const mort = !st || st.state === 'unavailable';
            // En continu : le mouvement dure tant qu'on tient (doigt, souris ou touche), et s'arrête au relâchement.
            const gestes = continu
              ? { onPointerDown: (e) => demarrer(e, b.sens), onPointerUp: arreter, onPointerCancel: arreter, onLostPointerCapture: arreter,
                onKeyDown: (e) => { if (touche(e)) demarrer(e, b.sens); }, onKeyUp: (e) => { if (touche(e)) arreter(); }, onBlur: arreter }
              : { onClick: (e) => { e.stopPropagation(); presser(ptz[b.sens]); } };
            return (
              <button key={b.sens} type="button" disabled={mort} aria-label={b.dit(x)} title={b.dit(x)} {...gestes}
                onContextMenu={(e) => e.preventDefault()}
                style={{ ...VERRE, ...(enCours === b.sens ? CHOISI : null), gridRow: b.l, gridColumn: b.c, touchAction: 'none', opacity: mort ? .4 : 1, cursor: mort ? 'default' : 'pointer' }}>
                <Glyphe i={b.i} size={20} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
