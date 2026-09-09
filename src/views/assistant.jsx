/* ── L'assistant conversationnel ────────────────────────────────────────────
 *
 * La maison peut avoir un assistant : un composant Home Assistant qui écoute,
 * répond, et sait agir. Loggia lui parle sans le nommer.
 *
 * Son nom n'est PAS dans ce fichier, et ce n'est pas un détail d'écriture. Un
 * assistant porte souvent le prénom de quelqu'un — c'est le cas ici — et ce
 * dépôt est public. Le nom vit donc dans la configuration de l'installation,
 * sous `loggia_assistant`, où il ne voyage avec personne. Sans réglage, Loggia
 * ne cherche rien et n'affiche rien.
 *
 * En échange, ce fichier parle à N'IMPORTE QUEL composant de cette forme, et
 * pas seulement à celui d'ici.
 *
 * Le protocole, relevé sur l'installation plutôt que deviné — `ns` est le nom
 * réglé :
 *
 *   ns/history {limit}   → { conversation_id, messages: [{ role, text, ts }] }
 *   ns/chat  {text, client_id, device, conversation_id?}
 *                        → un ABONNEMENT qui émet, dans l'ordre :
 *                          accepted (message_id, conversation_id)
 *                          delta (text)   — mot à mot
 *                          tool           — ce qu'il est allé chercher
 *                          proposal       — ce qu'il propose de faire
 *                          done | error
 *   ns/cancel {message_id}
 *   ns/info              → { addon, identity, phases, profile }
 *
 * Ce que cette première version NE fait pas, et le dit : la voix. Le micro, la
 * reconnaissance et l'apprentissage des empreintes vocales sont un morceau à
 * part entière. L'orbe, elle, est déjà prête à écouter — son API prend un
 * niveau d'amplitude, il ne restera qu'à le lui donner.
 */
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { tr, locale } from '../i18n.js';
import { Fi, BottomSheet } from '../ui.jsx';

/* L'orbe tire Three.js — 448 ko. Elle ne se charge donc qu'à l'ouverture de la
 * popup, jamais au démarrage du dashboard. Même raison que le fond météo. */
const Orbe = lazy(() => import('../orbe.jsx'));

/** L'appareil, pour qu'il sache d'où on lui parle. Stable par navigateur. */
function idAppareil() {
  try {
    const cle = 'loggia-assistant-device';
    let v = localStorage.getItem(cle);
    if (!v) { v = 'loggia-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(cle, v); }
    return v;
  } catch { return 'loggia'; }
}

const heure = (ts) => {
  try { return new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
};

export default function AssistantSheet({ hass, ns, onClose }) {
  // Le titre affiché vient du réglage, jamais du code.
  const titre = ns ? ns.charAt(0).toUpperCase() + ns.slice(1) : tr('Assistant');
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState('');
  const [etat, setEtat] = useState('idle');
  const [erreur, setErreur] = useState(null);
  const [outils, setOutils] = useState([]);
  const conversationRef = useRef(null);
  const messageRef = useRef(null);
  const desabonnerRef = useRef(null);
  const filRef = useRef(null);

  const ws = hass && typeof hass.callWS === 'function' ? hass : null;

  /* Le fil se recolle en bas à chaque message — sauf si l'on est remonté lire
   * plus haut, auquel cas le déplacer sous les doigts serait une brimade. */
  const colleRef = useRef(true);
  const defiler = useCallback(() => {
    const el = filRef.current;
    if (el && colleRef.current) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(() => { defiler(); }, [messages, defiler]);

  useEffect(() => {
    if (!ws) return undefined;
    let vivant = true;
    ws.callWS({ type: `${ns}/history`, limit: 50 })
      .then((r) => {
        if (!vivant) return;
        conversationRef.current = r && r.conversation_id;
        const l = ((r && r.messages) || []).filter(m => m && m.role !== 'system');
        setMessages(l.map(m => ({ qui: m.role === 'user' ? 'moi' : 'assistant', texte: m.text || '', ts: m.ts })));
      })
      .catch(() => { if (vivant) setErreur(tr('L’assistant n’a pas répondu.')); });
    return () => { vivant = false; };
    // `ns` en dependance : changer d'assistant doit relire son historique,
    // pas garder celui du precedent a l'ecran.
  }, [ws, ns]);

  // Un envoi en cours doit mourir avec la popup, sinon son flux continue de
  // remplir un état que plus personne ne regarde.
  useEffect(() => () => { if (desabonnerRef.current) { try { desabonnerRef.current(); } catch { /* déjà fermé */ } } }, []);

  const envoyer = async () => {
    const t = texte.trim();
    if (!t || !ws || etat !== 'idle') return;
    setTexte(''); setErreur(null); setOutils([]);
    setMessages(l => [...l, { qui: 'moi', texte: t, ts: Date.now() }]);
    colleRef.current = true;
    setEtat('thinking');

    const message = { type: `${ns}/chat`, text: t, client_id: 'loggia', device: idAppareil() };
    if (conversationRef.current) message.conversation_id = conversationRef.current;

    const surEvenement = (evt) => {
      if (!evt) return;
      switch (evt.event) {
        case 'accepted':
          messageRef.current = evt.message_id;
          if (evt.conversation_id) conversationRef.current = evt.conversation_id;
          break;
        case 'delta':
          /* Le premier fragment crée la bulle ; les suivants s'y ajoutent. La
           * créer d'avance laisserait une bulle vide pendant que l'assistant réfléchit,
           * et l'on ne saurait pas si elle a commencé. */
          setEtat('speaking');
          setMessages((l) => {
            const dernier = l[l.length - 1];
            if (dernier && dernier.qui === 'assistant' && dernier.encours) {
              return [...l.slice(0, -1), { ...dernier, texte: dernier.texte + (evt.text || '') }];
            }
            return [...l, { qui: 'assistant', texte: evt.text || '', ts: Date.now(), encours: true }];
          });
          break;
        case 'tool':
          // Ce que l'assistant est allée chercher pour répondre. On le montre : une
          // réponse dont on voit d'où elle vient se croit plus facilement.
          setOutils(o => [...o, evt.name || evt.tool || tr('outil')]);
          break;
        case 'done':
          setEtat('idle');
          messageRef.current = null;
          setMessages(l => l.map((m, i) => (i === l.length - 1 ? { ...m, encours: false } : m)));
          break;
        case 'error':
          setEtat('idle');
          messageRef.current = null;
          setErreur(evt.message || tr('L’assistant n’a pas répondu.'));
          break;
        default:
          break;
      }
    };

    try {
      desabonnerRef.current = await ws.connection.subscribeMessage(surEvenement, message);
    } catch (e) {
      setEtat('idle');
      setErreur((e && e.message) ? String(e.message) : tr('L’assistant n’a pas répondu.'));
    }
  };

  const annuler = () => {
    if (!ws || !messageRef.current) return;
    ws.callWS({ type: `${ns}/cancel`, message_id: messageRef.current }).catch(() => { /* déjà fini */ });
    setEtat('idle');
    messageRef.current = null;
  };

  const sousTitre = etat === 'thinking' ? tr('Réfléchit…')
    : etat === 'speaking' ? tr('Répond…')
      : tr('Prête');

  const bulle = (m, i) => (
    <div key={i} style={{ display: 'flex', justifyContent: m.qui === 'moi' ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '82%', padding: '10px 13px', borderRadius: 16,
        borderBottomRightRadius: m.qui === 'moi' ? 5 : 16,
        borderBottomLeftRadius: m.qui === 'moi' ? 16 : 5,
        background: m.qui === 'moi' ? 'var(--o-accent-fond)' : 'var(--o-s1)',
        color: m.qui === 'moi' ? '#fff' : 'var(--o-text)',
        fontSize: 13.5, fontWeight: 500, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {m.texte}
        {m.ts ? <span style={{ display: 'block', marginTop: 4, fontSize: 10, fontWeight: 600, opacity: .6 }}>{heure(m.ts)}</span> : null}
      </div>
    </div>
  );

  return (
    <BottomSheet onClose={onClose}>
      {close => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 16, fontWeight: 800, letterSpacing: '.08em' }}>{titre}</span>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)' }}>{sousTitre}</span>
          </span>
          {etat !== 'idle' && (
            <button onClick={annuler} style={{
              padding: '8px 13px', minHeight: 36, borderRadius: 11, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'transparent', color: 'var(--o-text1)',
            }}>{tr('Arrêter')}</button>
          )}
          <button onClick={close} aria-label={tr('Fermer')} style={{
            width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--o-s1)',
            color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Fi i="cross" size={14} /></button>
        </div>

        {/* L'orbe. Un vide de la même hauteur pendant le chargement : sans lui,
          * tout ce qui est dessous sauterait de deux cents pixels quand
          * Three.js finit d'arriver. */}
        <Suspense fallback={<div style={{ height: 200 }} />}>
          <Orbe etat={etat} taille={200} />
        </Suspense>

        <div ref={filRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            colleRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
          style={{ maxHeight: '38vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {messages.length === 0 && !erreur && (
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', textAlign: 'center', padding: '10px 0' }}>
              {tr('Pose-lui une question.')}
            </div>
          )}
          {messages.map(bulle)}
        </div>

        {outils.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {outils.map((o, i) => (
              <span key={i} style={{
                padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                background: 'var(--o-s2)', color: 'var(--o-text2)',
              }}>{o}</span>
            ))}
          </div>
        )}

        {erreur && <div role="alert" style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{erreur}</div>}

        <div style={{ display: 'flex', gap: 9, marginTop: 14, alignItems: 'center' }}>
          <input
            value={texte}
            onChange={e => setTexte(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
            aria-label={tr('Écrire à l’assistant')}
            placeholder={tr('Écrire…')}
            style={{
              flex: 1, minWidth: 0, padding: '12px 15px', minHeight: 46, borderRadius: 999,
              background: 'var(--o-s2)', color: 'var(--o-text)',
              border: 'var(--o-bw,1px) solid var(--o-bd2)', fontSize: 13.5, fontWeight: 600, boxSizing: 'border-box',
            }}
          />
          <button onClick={envoyer} disabled={!texte.trim() || etat !== 'idle'} aria-label={tr('Envoyer')}
            style={{
              width: 46, height: 46, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: 'var(--o-accent-fond)', color: '#fff',
              cursor: (!texte.trim() || etat !== 'idle') ? 'default' : 'pointer',
              opacity: (!texte.trim() || etat !== 'idle') ? .45 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Fi i="paper-plane" size={16} /></button>
        </div>
      </>)}
    </BottomSheet>
  );
}
