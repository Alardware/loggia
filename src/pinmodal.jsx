/* La modale du code administrateur (sortie d'App.jsx le 23/09, plan M1).
 *
 * Troisieme etape du decoupage : un ecran entier, ferme sur lui-meme — il ne
 * connait que `hass` pour poser sa question au serveur, et deux rappels. Il
 * n'avait rien a faire au milieu du monolithe, entre la barre du bas et le
 * bouton de l'assistant.
 */
import { useState, useEffect, useRef } from 'react';
import { tr, trN } from './i18n.js';
import { inerterAutour } from './ui.jsx';
import { cfgVal } from './state.js';

// Modale du code administrateur — gate le basculement vers un profil Admin.
// Le code n'est PLUS dans le navigateur (18/09) : il est vérifié par le
// composant (`loggia/pin/verifier`), qui compte les essais ratés et bloque.
// Un seul code pour la maison, le même sur chaque appareil et chaque accès.
// `sousTitre` (chantier Mode enfant, E19) : POURQUOI le code est demandé —
// « Requis pour ce profil » par défaut, « Requis pour les réglages du mode
// enfant » quand la fiche d'un lecteur ouvre le pavé.
export function PinModal({ hass, onClose, onSuccess, sousTitre = null }) {
  const [pin, setPin] = useState('');
  /* Jamais défini, AUCUN code n'ouvre rien (audit du 28/10, ADR 0279) :
   * jusque-là `0000` ouvrait le laissez-passer à tout compte. Le pavé le sait
   * par la configuration, ou par le refus nommé du composant
   * (`code_non_defini`) si elle n'était pas à jour. Un administrateur de
   * Home Assistant CRÉE alors le code ici, en le tapant deux fois ; les
   * autres apprennent qui peut le faire. */
  const [nonDefini, setNonDefini] = useState(() => cfgVal('loggia_admin_pin_defini', false) !== true);
  const admin = !!(hass && hass.user && hass.user.is_admin);
  const creer = nonDefini && admin;
  const [premier, setPremier] = useState(null);   // le code choisi, en attente de sa confirmation
  const [ecart, setEcart] = useState(false);      // la confirmation ne correspondait pas
  /* Combien de chiffres attendre (ADR 0278, ticket #38). Le pavé vérifiait
   * dès le quatrième : un code de huit, accepté par Paramètres, ne se
   * saisissait jamais. Le composant dit la longueur, jamais le code. Défini
   * avant le 27/10 : inconnue tant qu'il n'a pas été tapé juste une fois — on
   * valide alors par ✓, de 4 à 8 chiffres. Un code qu'on CRÉE se valide
   * aussi par ✓. */
  const lu = Number(cfgVal('loggia_admin_pin_longueur', 0));
  const longueur = nonDefini ? null : (lu >= 4 && lu <= 8 ? lu : null);
  const [error, setError] = useState(false);
  const [attente, setAttente] = useState(false);
  const [bloque, setBloque] = useState(0);   // secondes annoncées par le serveur
  const [horsLigne, setHorsLigne] = useState(false);
  /* Le code a été REFUSÉ — et seulement lui (audit du 03/10) : un blocage a
   * sa propre alerte, et un serveur injoignable n'a rien vérifié. Le message
   * tient jusqu'à la touche suivante, pas 650 ms comme le rouge des points :
   * effacé si tôt, une annonce encore en file d'attente peut se perdre, et
   * un œil qui regardait le pavé ne l'aurait pas vu. */
  const [faux, setFaux] = useState(false);
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
      setFaux(!(r && r.bloque));
      setError(true);
      timers.current.push(setTimeout(() => { setPin(''); setError(false); }, 650));
    } catch (e) {
      // La configuration n'était pas à jour : le composant n'a aucun code, et le dit.
      if (e && e.code === 'code_non_defini') { setPin(''); setNonDefini(true); return; }
      setHorsLigne(true); setError(true);
      timers.current.push(setTimeout(() => { setPin(''); setError(false); }, 900));
    } finally { setAttente(false); }
  };
  const partiDuVoile = useRef(false);
  const boiteRef = useRef(null);
  const voileRef = useRef(null);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  // Focus dans la boite a l'ouverture, rendu a l'element d'origine ensuite —
  // sans quoi le clavier reste derriere la modale.
  useEffect(() => {
    const avant = document.activeElement;
    /* Et le reste de la page devient INERTE (audit du 27/09). La boite ne
     * piegeait rien du tout : Echap la fermait, mais le curseur virtuel d'un
     * lecteur d'ecran — qui lit le document, pas le parcours clavier —
     * atteignait et activait une carte derriere le voile, sans code.
     *
     * Inerte, le fond n'a plus besoin de piege a focus : Tab ne trouve plus
     * rien d'autre. Reveille AVANT de rendre le focus, sinon on le rendrait a
     * un element encore inerte, qui le refuserait. */
    const reveiller = inerterAutour(voileRef.current);
    const t = setTimeout(() => { try { const el = boiteRef.current; if (el) (el.querySelector('button, [tabindex="0"]') || el).focus({ preventScroll: true }); } catch {} }, 40);
    return () => { clearTimeout(t); reveiller(); try { if (avant && avant.focus) avant.focus({ preventScroll: true }); } catch {} };
  }, []);
  const padBtn = { height: 52, borderRadius: 14, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 19, fontWeight: 600, cursor: 'pointer' };
  const add = (d) => {
    if (attente || bloque) return;
    setError(false); setHorsLigne(false); setFaux(false); setEcart(false);
    setPin(p => {
      if (p.length >= (longueur || 8)) return p;
      const np = p + d;
      if (np.length === longueur) timers.current.push(setTimeout(() => { verifier(np); }, 110));
      return np;
    });
  };
  /* Créer le code : le choisir, le retaper, puis `loggia/pin/definir` —
   * réservée aux administrateurs, comme dans Paramètres. Un administrateur
   * n'a pas besoin du code pour passer : le code posé, le pavé a fini. */
  const definir = async (code) => {
    const h = hass && typeof hass.callWS === 'function' ? hass : null;
    if (!h) { setHorsLigne(true); setPin(''); return; }
    setAttente(true);
    try {
      await h.callWS({ type: 'loggia/pin/definir', pin: code });
      onSuccess();
    } catch {
      setHorsLigne(true); setPin(''); setPremier(null);
    } finally { setAttente(false); }
  };
  const confirmer = () => {
    if (premier == null) { setPremier(pin); setPin(''); return; }
    if (pin !== premier) { setEcart(true); setError(true); setPremier(null); timers.current.push(setTimeout(() => { setPin(''); setError(false); }, 650)); return; }
    definir(pin);
  };
  const valider = () => { if (!attente && !bloque && pin.length >= 4) { if (creer) confirmer(); else verifier(pin); } };
  const points = longueur || Math.max(4, pin.length);
  /* Ce que dit le sous-titre quand on CRÉE le code : l'étape, ou l'écart. */
  const etapeCreation = ecart ? tr('Les deux codes ne correspondent pas.')
    : premier == null ? tr('Choisissez un code de 4 à 8 chiffres') : tr('Retapez-le pour confirmer');
  const dit = longueur === 4 ? trN(pin.length, '{n} chiffre sur 4', '{n} chiffres sur 4')
    : longueur ? trN(pin.length, '{n} chiffre sur {t}', '{n} chiffres sur {t}', { t: longueur })
      : trN(pin.length, '{n} chiffre saisi', '{n} chiffres saisis');
  return (
    <div role="presentation" ref={voileRef}
      onPointerDown={(e) => { partiDuVoile.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && partiDuVoile.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.62)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* Une boite de dialogue qui ecoute Echap n'est pas une anomalie.
        * Pas d'`aria-modal` : `inerterAutour` confine deja, et la region
        * d'annonce du tableau de bord doit rester lisible (voir BottomSheet). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div ref={boiteRef} role="dialog" aria-label={tr('Code administrateur')} tabIndex={-1}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
        onClick={e => e.stopPropagation()} style={{ width: 296, maxHeight: '92vh', overflowY: 'auto', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd1)', borderRadius: 'var(--o-radius,18px)', padding: 24, boxShadow: '0 30px 70px rgba(0,0,0,.6)', animation: error ? 'm-shake .45s' : 'none' }}>
        <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700 }}>{creer ? tr('Créer le code administrateur') : tr('Code administrateur')}</div>
        {/* Aucun code, et pas administrateur : rien à taper. La boîte dit qui
          * peut le créer, et où ; le voile et Échap la ferment, comme avant. */}
        {nonDefini && !admin ? (
          <>
            <div role="status" style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--o-warn)', marginTop: 10 }}>{tr('Aucun code n’est encore défini')}</div>
            <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--o-text2)', marginTop: 8, lineHeight: 1.45 }}>{tr('Un administrateur de Home Assistant doit d’abord le créer, dans Paramètres › Profils.')}</div>
          </>
        ) : <>
        {/* « Code incorrect » à l'ŒIL aussi (audit du 03/10) : le rouge des
          * points ne tient que 650 ms, un œil qui distingue mal le rouge n'y
          * voit que des points qui se vident, et le tremblement, « réduire les
          * animations » l'efface. Le sous-titre le dit donc jusqu'à la touche
          * suivante. Même ligne, même corps : rien ne bouge sous le doigt — un
          * message glissé au-dessus des points ferait descendre le pavé, puis
          * remonter à la première touche, au milieu de la saisie. Tu le temps
          * de l'erreur : la région d'alerte le dit déjà, une fois suffit. */}
        {creer
          ? <div aria-hidden={ecart || undefined} style={{ textAlign: 'center', fontSize: 12, color: ecart ? 'var(--o-bad)' : 'var(--o-text2)', fontWeight: ecart ? 700 : undefined, marginTop: 4 }}>{etapeCreation}</div>
          : <div aria-hidden={faux || undefined} style={{ textAlign: 'center', fontSize: 12, color: faux ? 'var(--o-bad)' : 'var(--o-text2)', fontWeight: faux ? 700 : undefined, marginTop: 4 }}>{faux ? tr('Code incorrect') : (sousTitre || tr('Requis pour ce profil'))}</div>}
        {bloque > 0 && <div role="alert" style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)', marginTop: 10 }}>{tr('Trop d’essais. Réessayez dans {n} s.', { n: bloque })}</div>}
        {horsLigne && <div role="alert" style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)', marginTop: 10 }}>{tr('Home Assistant n’est pas joignable : le code ne peut pas être vérifié.')}</div>}
        {/* « Code incorrect », pour le lecteur d'écran (audit du 03/10) : un
          * code faux et un code en cours de saisie s'y ressemblaient exactement.
          *
          * La région est TOUJOURS montée, vide tant que rien n'est faux : un
          * lecteur d'écran n'annonce que ce qui CHANGE dans une région déjà
          * là, et une alerte qui naît remplie peut se taire. Elle vit DANS la
          * boîte : le reste de la page est inerte pendant la saisie, et une
          * région inerte ne dit rien. Lue, pas vue — ce qui se voit, c'est le
          * sous-titre. */}
        {creer
          ? <div className="o-vh" role="alert">{ecart ? tr('Les deux codes ne correspondent pas.') : ''}</div>
          : <div className="o-vh" role="alert">{faux ? tr('Code incorrect') : ''}</div>}
        {/* Les points, en mots : « 2 chiffres sur 4 », annoncé à chaque
          * touche comme les points se remplissent à l'œil — le nombre, jamais
          * les chiffres. Les points eux-mêmes se taisent. Hors flux (o-vh),
          * l'équivalent ne prend pas de place dans la rangée.
          *
          * Les deux gabarits vont NUS à trN. Passés d'abord par tr, l'objet de
          * formes du polonais serait tranché SANS le nombre, donc toujours en
          * « other » : « 2 cyfr » au lieu de « 2 cyfry » (ADR 0071). */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '22px 0' }}><span className="o-vh" role="status">{dit}</span>{Array.from({ length: points }, (_, i) => <span key={i} aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', background: i < pin.length ? (error ? 'var(--o-bad)' : 'var(--o-accent-soft)') : 'transparent', border: `1px solid ${error ? 'var(--o-bad)' : 'var(--o-bd2)'}`, transition: 'background .15s' }} />)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <button key={n} onClick={() => add(String(n))} style={padBtn}>{n}</button>)}
          {longueur ? <span /> : <button onClick={valider} disabled={pin.length < 4} aria-label={tr('Valider')} style={{ ...padBtn, fontSize: 17, opacity: pin.length < 4 ? .4 : 1 }}>✓</button>}
          <button onClick={() => add('0')} style={padBtn}>0</button>
          <button onClick={() => setPin(p => p.slice(0, -1))} style={{ ...padBtn, fontSize: 15 }}>⌫</button>
        </div>
        </>}
      </div>
    </div>
  );
}
