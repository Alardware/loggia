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
 * pas seulement à celui d'ici — et, à défaut, à n'importe quelle entité de
 * conversation de Home Assistant.
 *
 * Le protocole, relevé sur l'installation plutôt que deviné — `ns` est le nom
 * du composant :
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
 *   ns/speak {text}      → { url } — la réponse, dite par la voix d'Assist
 *   ns/info              → { addon, identity, phases, profile }
 *
 * ── L'écran ────────────────────────────────────────────────────────────────
 *
 * Celui de la maquette « Sentinel Mobile » (09/2026). On ouvre cette popup
 * pour PARLER : l'écran est donc fait pour la voix. L'orbe au centre ; dessous,
 * la phrase — la question entendue, puis la réponse, le mot prononcé allumé ;
 * le gros micro ; quelques suggestions. La conversation écrite monte en
 * feuille par-dessus, et c'est le même fil : ce qu'on a dit s'y relit, ce
 * qu'on y écrit reçoit sa réponse.
 *
 * L'orbe reste celle de `orbe.jsx`. La maquette en apportait une autre ; seules
 * ses couleurs ont fait le voyage — la teinte de ce dont l'assistant parle,
 * voir `parole.js`.
 */
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { tr, locale } from '../i18n.js';
import { cfgSet } from '../state.js';
import { Fi, BottomSheet, REDUCE_MOTION } from '../ui.jsx';
import { conversationsDe, entiteChoisie } from '../assistant.js';
import { ecouter, voixDisponible, raisonLisible, preparerLecture, jouer, couperLecture, positionLecture, synthese } from '../voix.js';
import { teinteDe, mots, poidsDesMots, motAuTemps, phraseAutour } from '../parole.js';

/* L'orbe tire Three.js — 448 ko. Elle ne se charge donc qu'à l'ouverture de la
 * popup, jamais au démarrage du dashboard. Même raison que le fond météo. */
const Orbe = lazy(() => import('../orbe.jsx'));

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/* Des questions qu'on pose à SA maison, et non à une maison en particulier :
 * ce dépôt est public, et l'assistant d'ici n'est pas celui d'ailleurs. Le
 * premier texte s'affiche, le second part. */
const SUGGESTIONS = [
  ['Briefing', 'Fais-moi le briefing.'],
  ['État de la maison', 'Fais le point sur la maison.'],
  ['Tout est fermé ?', 'Est-ce que tout est bien fermé ?'],
  ['Résumé du jour', 'Résume-moi la journée.'],
];

/* Combien de temps l'orbe garde la couleur du sujet, une fois la réponse
 * finie. */
const TEINTE_MS = 9000;

/* Le point d'état de l'en-tête, repris de la maquette : vert au repos,
 * l'accent quand on s'écoute ou qu'elle parle, l'ambre quand elle réfléchit. */
const POINT = {
  idle: 'var(--o-ok)', listening: 'var(--o-accent)', thinking: 'var(--o-warn2)', speaking: 'var(--o-accent)',
};

const TITRE = { fontSize: 13, fontWeight: 800, letterSpacing: '.24em', textTransform: 'uppercase' };

/* Le mot prononcé : la couleur de l'accent, et un halo, comme l'orbe. */
const MOT_LU = { color: 'var(--o-accent)', textShadow: '0 0 16px rgba(var(--o-accent-rgb), .8)' };

/** Un bouton carré de l'en-tête — `actif` quand ce qu'il ouvre est ouvert. */
const carre = (actif) => ({
  width: 36, height: 36, borderRadius: 11, flexShrink: 0, cursor: 'pointer', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 'var(--o-bw,1px) solid ' + (actif ? 'rgba(var(--o-accent-rgb), .45)' : 'var(--o-bd2)'),
  background: actif ? 'rgba(var(--o-accent-rgb), .13)' : 'transparent',
  color: actif ? 'var(--o-accent)' : 'var(--o-text1)',
});

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

/* La ligne sous l'orbe : l'invitation, la question entendue, ou la réponse.
 *
 * Pendant que la voix lit, elle ne montre que la PHRASE en cours, le mot
 * prononcé allumé — des sous-titres. La réponse entière n'y tiendrait pas, et
 * le mot allumé finirait sous la coupure des quatre lignes. */
function Legende({ legende, mot, invite }) {
  const cadre = {
    textAlign: 'center', fontSize: 15.5, fontWeight: 500, lineHeight: 1.5, color: 'var(--o-text2)',
    padding: '8px 6px 0', minHeight: 52, textWrap: 'pretty', overflowWrap: 'anywhere',
    display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 4, overflow: 'hidden',
  };
  if (!legende) return <div style={cadre}>{invite}</div>;
  if (legende.genre === 'question') {
    return <div style={cadre}><b style={{ color: 'var(--o-text)', fontWeight: 600 }}>{legende.texte}</b></div>;
  }
  const liste = mots(legende.texte);
  const [debut, fin] = mot >= 0 ? phraseAutour(liste, mot) : [0, liste.length - 1];
  return (
    <div style={cadre}>
      {liste.slice(debut, fin + 1).map((m, k) => (
        <span key={debut + k} style={{ transition: 'color .12s, text-shadow .12s', ...(debut + k === mot ? MOT_LU : null) }}>
          {m}{debut + k < fin ? ' ' : ''}
        </span>
      ))}
    </div>
  );
}

/** Une bulle du fil. L'heure dessous, hors de la bulle, comme sur la maquette. */
function Bulle({ m }) {
  const moi = m.qui === 'moi';
  return (
    <div className="o-assist-msg" style={{ display: 'flex', flexDirection: 'column', alignItems: moi ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '86%', padding: '10px 14px', borderRadius: 16,
        borderBottomRightRadius: moi ? 5 : 16, borderBottomLeftRadius: moi ? 16 : 5,
        background: moi ? 'var(--o-accent-fond)' : 'var(--o-s1)',
        border: moi ? 'none' : 'var(--o-bw,1px) solid var(--o-bd2)',
        color: moi ? '#fff' : 'var(--o-text)',
        fontSize: 14, fontWeight: 500, lineHeight: 1.48, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>{m.texte}</div>
      {m.ts ? <span style={{ marginTop: 4, fontFamily: MONO, fontSize: 9.5, color: 'var(--o-text3)' }}>{heure(m.ts)}</span> : null}
    </div>
  );
}

/** Trois points : elle a reçu la question, sa réponse n'a pas commencé. */
function Points() {
  const point = { display: 'block', width: 5, height: 5, borderRadius: '50%', background: 'var(--o-text2)' };
  return (
    <div className="o-assist-msg o-assist-dots" aria-hidden="true" style={{
      display: 'flex', gap: 4, padding: '13px 15px', width: 'fit-content',
      background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 16, borderBottomLeftRadius: 5,
    }}><i style={point} /><i style={point} /><i style={point} /></div>
  );
}

export default function AssistantSheet({ hass, ns, onClose, question = '' }) {
  /* Deux façons de parler à un assistant.
   *
   *   • son PROTOCOLE, quand son composant en a un — `ns` est alors son nom :
   *     la réponse arrive mot à mot, avec l'historique et ce qu'il est allé
   *     chercher ;
   *   • l'API commune de Home Assistant sinon — `ns` est alors l'identifiant
   *     de l'entité de conversation. Ni historique ni flux : la réponse
   *     arrive d'un bloc. Mais toute entité de conversation la comprend.
   *
   * Le point les distingue : un nom de composant n'en a pas. */
  const entite = ns && ns.indexOf('.') > 0 ? ns : null;
  /* L'entité choisie — y compris quand son composant parle son propre
   * protocole, et que `ns` est alors le nom du composant. L'en-tête affiche
   * SON nom, le même que dans la liste : « Démo » et non « Demo ». */
  const actuelle = entiteChoisie(hass);
  const etatEntite = hass && hass.states ? hass.states[entite || actuelle] : null;
  // Le titre affiché vient du réglage ou de la maison, jamais du code.
  const titre = etatEntite
    ? String((etatEntite.attributes || {}).friendly_name || entite || actuelle)
    : (ns ? ns.charAt(0).toUpperCase() + ns.slice(1) : tr('Assistant'));
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState('');
  /* L'ecoute.
   *
   * `niveau` porte l'amplitude du micro jusqu'a l'orbe : c'est ce qui la
   * fait respirer au rythme de la voix plutot que de la sienne. `null` lui
   * rend sa respiration propre.
   *
   * La session vit dans une reference et non dans l'etat : on doit pouvoir
   * l'arreter depuis le nettoyage du composant, ou elle garderait le micro
   * ouvert apres la fermeture de la popup — la pastille rouge de l'onglet
   * resterait allumee. */
  const [ecoute, setEcoute] = useState(false);
  const [niveau, setNiveau] = useState(null);
  const sessionRef = useRef(null);
  const micro = voixDisponible();
  /* La reponse a voix haute.
   *
   * Elle ne part QUE si la question est venue du micro. On a parle, elle
   * repond ; on a tape, elle ecrit. Faire parler la maison parce qu'on a
   * ecrit une phrase serait une surprise, et une mauvaise.
   *
   * `reponseRef` accumule les fragments : l'etat des messages est fait pour
   * l'affichage, et le lire au moment du `done` donnerait la valeur du rendu
   * precedent. */
  const vocalRef = useRef(false);
  const reponseRef = useRef('');

  const [etat, setEtat] = useState('idle');
  const [erreur, setErreur] = useState(null);
  const [outils, setOutils] = useState([]);
  const conversationRef = useRef(null);
  const messageRef = useRef(null);
  const desabonnerRef = useRef(null);
  /* Le tour de parole en cours. « Arrêter » en ouvre un nouveau : les
   * événements de l'ancien peuvent encore arriver — le serveur finit parfois
   * sa phrase — et doivent tomber dans le vide au lieu de remplir la bulle. */
  const tourRef = useRef(0);
  const filRef = useRef(null);

  /* La conversation écrite : fermée, ouverte, ou en train de redescendre. */
  const [fil, setFil] = useState('ferme');
  const saisieRef = useRef(null);
  const basculeRef = useRef(null);
  const focaliserRef = useRef(false);
  const [menu, setMenu] = useState(false);

  /* La ligne sous l'orbe. `null` au départ : la popup s'ouvre sur une
   * invitation, pas sur le dernier message d'hier, que l'historique ramène. */
  const [legende, setLegende] = useState(null);
  const [mot, setMot] = useState(-1);
  const [teinte, setTeinte] = useState('base');

  const ws = hass && typeof hass.callWS === 'function' ? hass : null;
  const lie = !!ws;

  /* Le fil se recolle en bas à chaque message — sauf si l'on est remonté lire
   * plus haut, auquel cas le déplacer sous les doigts serait une brimade. */
  const colleRef = useRef(true);
  const defiler = useCallback(() => {
    const el = filRef.current;
    if (el && colleRef.current) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(() => { defiler(); }, [messages, defiler]);

  /* La feuille s'ouvre sur le dernier message, et le champ prend la main si
   * c'est pour écrire qu'on l'a ouverte. */
  useEffect(() => {
    if (fil !== 'ouvert') return;
    colleRef.current = true;
    defiler();
    if (focaliserRef.current && saisieRef.current) {
      focaliserRef.current = false;
      saisieRef.current.focus({ preventScroll: true });
    }
  }, [fil, defiler]);

  /* Redescendre. L'animation porte la fin — mais une animation peut ne pas
   * finir (onglet caché, mouvement réduit), d'où le filet. */
  useEffect(() => {
    if (fil !== 'sortant') return undefined;
    const id = setTimeout(() => setFil('ferme'), 360);
    return () => clearTimeout(id);
  }, [fil]);

  // Le choix de l'assistant se referme dès qu'elle écoute ou répond.
  useEffect(() => { if (etat !== 'idle' || ecoute) setMenu(false); }, [etat, ecoute]);

  const ouvrirFil = () => { setMenu(false); setFil('ouvert'); };
  const fermerFil = () => setFil((f) => (f === 'ferme' ? f : (REDUCE_MOTION ? 'ferme' : 'sortant')));
  const ecrire = () => { focaliserRef.current = true; ouvrirFil(); };

  useEffect(() => {
    // Un autre assistant, un autre fil : rien du précédent ne doit rester.
    conversationRef.current = null;
    setLegende(null); setErreur(null); setOutils([]);
    if (!ws) return undefined;
    /* L'API commune n'a pas d'historique : le fil commence vide, et
     * `conversation_id` garde le contexte le temps de l'échange. */
    if (entite) { setMessages([]); return undefined; }
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
    /* `ns` : changer d'assistant doit relire son historique, pas garder celui
     * du précédent à l'écran. La LIAISON et non l'objet `hass` : celui-ci
     * change à chaque état de la maison, et l'historique se relisait sans
     * cesse — de quoi vider le fil d'une entité qui n'en a pas. */
  }, [lie, ns]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Un envoi en cours doit mourir avec la popup, sinon son flux continue de
  // remplir un état que plus personne ne regarde.
  useEffect(() => () => { if (desabonnerRef.current) { try { desabonnerRef.current(); } catch { /* déjà fermé */ } } }, []);

  /* Parler.
   *
   * Un appui ouvre le micro, un second le ferme — mais le second est
   * facultatif : Home Assistant detecte lui-meme la fin de la parole et rend
   * la phrase. Le bouton reste pour couper court.
   *
   * L'assistant ne transcrit pas : sa commande `chat` ne prend que du texte.
   * C'est le pipeline Assist de Home Assistant qui ecoute, et Loggia qui lui
   * passe le son. Voir `src/voix.js`. */
  const basculerEcoute = async () => {
    if (sessionRef.current) { sessionRef.current.arreter(); return; }
    setErreur(null);
    /* ICI, dans le geste, et nulle part ailleurs : c'est le seul moment ou le
     * navigateur accepte de debloquer la lecture. La reponse arrive plusieurs
     * secondes plus tard, quand il est trop tard pour demander. */
    preparerLecture();
    let session = null;
    try {
      session = await ecouter(hass, { onNiveau: setNiveau });
      sessionRef.current = session;
      setEcoute(true);
      const dit = await session.texte;
      sessionRef.current = null;
      setEcoute(false); setNiveau(null);
      if (dit) envoyerTexte(dit, { parle: true });
      else setErreur(tr('Rien n’a été entendu.'));
    } catch (e) {
      if (session) { try { session.annuler(); } catch { /* deja ferme */ } }
      sessionRef.current = null;
      setEcoute(false); setNiveau(null);
      setErreur(raisonLisible(e && e.message, tr));
    }
  };

  /* La phrase dictee au bouton part une fois, des que la liaison est prete.
   * Une reference et non un etat : deux rendus de suite l'enverraient deux
   * fois, et l'assistant repondrait en double a la meme question. */
  const posee = useRef(false);
  useEffect(() => {
    if (posee.current || !question || !ws) return;
    posee.current = true;
    envoyerTexte(question, { parle: true });
  }, [question, ws]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Le micro ne survit pas a la popup.
  useEffect(() => () => {
    if (sessionRef.current) { try { sessionRef.current.annuler(); } catch { /* deja ferme */ } }
    // Et la voix se tait avec la popup, sinon elle finit sa phrase toute seule.
    couperLecture();
  }, []);

  /* Le mot prononcé.
   *
   * Home Assistant rend un fichier audio, pas les frontières des mots : on
   * les estime depuis la position de la lecture (voir `parole.js`). Cette
   * position vient du fichier que l'on ENTEND et non d'une horloge à part :
   * une voix plus lente ou un fichier qui tarde ne décalent rien, et le
   * dernier mot s'allume à la fin. */
  const texteDit = legende && legende.genre === 'reponse' ? legende.texte : '';
  useEffect(() => {
    if (etat !== 'speaking' || !vocalRef.current || !texteDit) return undefined;
    const poids = poidsDesMots(mots(texteDit));
    let id = 0;
    let dernier = -2;
    const suivre = () => {
      const p = positionLecture();
      const i = p ? motAuTemps(poids, p.t / p.d) : -1;
      if (i !== dernier) { dernier = i; setMot(i); }
      id = requestAnimationFrame(suivre);
    };
    id = requestAnimationFrame(suivre);
    return () => cancelAnimationFrame(id);
  }, [etat, texteDit]);

  /* La teinte tient le temps de la réponse, puis TEINTE_MS : assez pour qu'on
   * la voie en relevant les yeux, pas au point de colorer la question
   * suivante. */
  useEffect(() => {
    if (etat !== 'idle' || teinte === 'base') return undefined;
    const id = setTimeout(() => setTeinte('base'), TEINTE_MS);
    return () => clearTimeout(id);
  }, [etat, teinte]);

  const envoyer = () => envoyerTexte(texte);

  /* Dire la reponse.
   *
   * `speak` synthetise cote Home Assistant et rend une URL de MEME ORIGINE :
   * la popup n'a donc ni requete a signer ni jeton a manipuler, elle pose
   * l'adresse dans un element audio et c'est tout. La voix est celle du
   * pipeline Assist — l'assistant parle pareil ici et depuis un satellite.
   * Une entité sans protocole n'a pas de `speak` : le pipeline de la maison
   * dit sa réponse à sa place.
   *
   * Sans voix configuree, la commande repond `tts_unavailable`. Ce n'est pas
   * une panne : la reponse reste ecrite, et l'on n'affiche rien. */
  const dire = async (quoi) => {
    const t = String(quoi || '').trim();
    if (!ws || !t) { setEtat('idle'); return; }
    try {
      const r = entite ? await synthese(ws, t) : await ws.callWS({ type: `${ns}/speak`, text: t });
      if (!r || !r.url) { setEtat('idle'); return; }
      couperLecture();
      setEtat('speaking');
      // `jouer` rend faux si le navigateur refuse : la reponse reste ecrite.
      const parti = await jouer(r.url, () => setEtat('idle'));
      if (!parti) setEtat('idle');
    } catch {
      setEtat('idle');   // pas de voix : la reponse reste lisible
    }
  };

  const envoyerTexte = async (brut, { parle = false } = {}) => {
    const t = String(brut || '').trim();
    if (!t || !ws || etat !== 'idle') return;
    vocalRef.current = parle;
    reponseRef.current = '';
    tourRef.current += 1;
    const tour = tourRef.current;
    setTexte(''); setErreur(null); setOutils([]);
    setTeinte('base');
    setLegende({ genre: 'question', texte: t });
    setMessages(l => [...l, { qui: 'moi', texte: t, ts: Date.now() }]);
    colleRef.current = true;
    setEtat('thinking');

    /* Une entité de conversation, par l'API commune : la réponse arrive d'un
     * bloc. On la pose comme si elle venait d'arriver en entier — la suite,
     * teinte, voix et mot allumé, est la même. */
    if (entite) {
      try {
        const demande = { type: 'conversation/process', text: t, agent_id: entite };
        if (conversationRef.current) demande.conversation_id = conversationRef.current;
        const r = await ws.callWS(demande);
        if (tour !== tourRef.current) return;   // arrêtée entre-temps
        if (r && r.conversation_id) conversationRef.current = r.conversation_id;
        const rep = String(((((r && r.response) || {}).speech || {}).plain || {}).speech || '').trim();
        reponseRef.current = rep;
        if (rep) {
          setLegende({ genre: 'reponse', texte: rep });
          setMessages(l => [...l, { qui: 'assistant', texte: rep, ts: Date.now() }]);
        }
        setTeinte(teinteDe(rep));
        if (vocalRef.current && rep) dire(rep); else setEtat('idle');
      } catch (e) {
        if (tour !== tourRef.current) return;
        setEtat('idle');
        setErreur((e && e.message) ? String(e.message) : tr('L’assistant n’a pas répondu.'));
      }
      return;
    }

    const message = { type: `${ns}/chat`, text: t, client_id: 'loggia', device: idAppareil() };
    if (conversationRef.current) message.conversation_id = conversationRef.current;

    const surEvenement = (evt) => {
      if (tour !== tourRef.current) return;   // un tour arrêté : ses restes tombent dans le vide
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
          reponseRef.current += evt.text || '';
          setLegende({ genre: 'reponse', texte: reponseRef.current });
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
          messageRef.current = null;
          setMessages(l => l.map((m, i) => (i === l.length - 1 ? { ...m, encours: false } : m)));
          // La couleur de ce dont elle a parlé — le temps qu'on la voie.
          setTeinte(teinteDe(reponseRef.current));
          // On a parle : elle repond. On a tape : elle ecrit.
          if (vocalRef.current) dire(reponseRef.current); else setEtat('idle');
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

  /* Arrêter : la réponse qui s'écrit ET la voix qui la dit.
   *
   * Le bouton restait affiché pendant qu'elle parlait, et n'y faisait rien :
   * `cancel` vise un message en cours, et une réponse déjà écrite n'en est
   * plus un. */
  const annuler = () => {
    tourRef.current += 1;
    vocalRef.current = false;
    couperLecture();
    setEtat('idle');
    setMessages((l) => l.map((m, i) => (i === l.length - 1 && m.encours ? { ...m, encours: false } : m)));
    if (!ws || !messageRef.current) return;
    ws.callWS({ type: `${ns}/cancel`, message_id: messageRef.current }).catch(() => { /* déjà fini */ });
    messageRef.current = null;
  };

  /* Changer d'assistant sans quitter la popup. Plus d'une entité de
   * conversation dans la maison : le nom de l'en-tête devient un choix, et le
   * choix est le réglage lui-même — la popup suivante s'ouvre sur lui. */
  const choix = conversationsDe(hass);
  const choisir = (id) => {
    setMenu(false);
    if (id !== actuelle) cfgSet({ loggia_assistant: id });
  };

  const etiquette = ecoute ? tr('Écoute…')
    : etat === 'thinking' ? tr('Réfléchit…')
      : etat === 'speaking' ? tr('Répond…')
        : tr('Prête');
  const etatVu = ecoute ? 'listening' : etat;
  const occupe = etat !== 'idle';
  const ouvert = fil === 'ouvert';
  const pret = !!texte.trim() && !occupe && lie;
  const invite = ecoute ? tr('Parle, je t’écoute.')
    : micro.ok ? tr('Appuie et parle, j’écoute jusqu’au silence.')
      : raisonLisible(micro.raison, tr);
  const motLu = etat === 'speaking' ? mot : -1;
  /* La couleur de l'orbe, dans l'ordre où elle l'emporte :
   *   • l'ALERTE, toujours — elle n'attend pas la fin d'une phrase ;
   *   • le CYAN tant qu'elle parle — l'accent de sa voix, repris de la
   *     maquette ;
   *   • puis le sujet de la réponse — le vert de ce qui est fait, l'orangé
   *     du chauffage —, tenu TEINTE_MS une fois qu'elle s'est tue. */
  const teinteVue = teinte === 'alerte' ? 'alerte' : (etat === 'speaking' ? 'parle' : teinte);
  const redescendre = () => { fermerFil(); if (basculeRef.current) basculeRef.current.focus({ preventScroll: true }); };

  return (
    /* `opaque` : la feuille renonce au verre depoli, et il y a une raison.
     * Voir `.o-sheet-opaque` dans index.css. */
    <BottomSheet onClose={onClose} opaque>
      {close => (
        <div className="o-assist" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {/* L'en-tête : le point d'état, le nom, ce qu'elle fait. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8 }}>
            <span aria-hidden="true" style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: POINT[etatVu],
              boxShadow: `0 0 10px 1px color-mix(in srgb, ${POINT[etatVu]} 70%, transparent)`,
              transition: 'background .3s, box-shadow .3s',
            }} />
            {choix.length > 1 ? (
              <button onClick={() => setMenu((m) => !m)} disabled={occupe} aria-expanded={menu}
                aria-label={titre + ' — ' + tr('Choisir l’assistant')} title={tr('Choisir l’assistant')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, minHeight: 36, padding: '0 2px', minWidth: 0,
                  background: 'none', border: 0, color: 'var(--o-text)', cursor: occupe ? 'default' : 'pointer',
                }}>
                <span style={{ ...TITRE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titre}</span>
                <Fi i="angle-small-down" size={15} color="var(--o-text2)" />
              </button>
            ) : <span style={TITRE}>{titre}</span>}
            <span aria-live="polite" style={{
              fontFamily: MONO, fontSize: 10.5, color: 'var(--o-text2)', letterSpacing: '.04em',
              textTransform: 'lowercase', whiteSpace: 'nowrap',
            }}>{etiquette}</span>
            <span style={{ flex: 1 }} />
            {occupe && (
              <button onClick={annuler} style={{
                padding: '0 13px', height: 36, borderRadius: 11, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'transparent', color: 'var(--o-text1)',
              }}>{tr('Arrêter')}</button>
            )}
            <button ref={basculeRef} onClick={() => (ouvert ? fermerFil() : ouvrirFil())}
              aria-label={ouvert ? tr('Refermer la conversation') : tr('Ouvrir la conversation')}
              aria-expanded={ouvert} style={carre(ouvert)}><Fi i="comment" size={15} /></button>
            <button onClick={close} aria-label={tr('Fermer')} style={carre(false)}><Fi i="cross" size={13} /></button>
          </div>

          {/* Les entités de conversation de la maison. */}
          {menu && (
            <div role="group" aria-label={tr('Choisir l’assistant')} style={{
              position: 'absolute', top: 46, left: 0, right: 0, zIndex: 5, padding: 6,
              display: 'flex', flexDirection: 'column', gap: 2, borderRadius: 14,
              background: 'linear-gradient(var(--o-surfA), var(--o-surfA)), var(--o-bg)',
              border: 'var(--o-bw,1px) solid var(--o-bd1)', boxShadow: 'var(--o-shadow)',
            }}>
              {choix.map((c) => {
                const sur = c.id === actuelle;
                return (
                  <button key={c.id} onClick={() => choisir(c.id)} aria-pressed={sur} style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '0 12px',
                    borderRadius: 10, border: 0, cursor: 'pointer', textAlign: 'left',
                    background: sur ? 'rgba(var(--o-accent-rgb), .13)' : 'transparent',
                    color: sur ? 'var(--o-accent)' : 'var(--o-text)', fontSize: 13.5, fontWeight: 700,
                  }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, color: 'var(--o-text3)' }}>{c.id}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* L'écran « Parler », et la conversation qui monte par-dessus. */}
          <div style={{ position: 'relative', flex: '1 1 0', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column',
              /* Recouvert, cet écran se cache — une fois la feuille montée, pas
               * avant, sinon il disparaîtrait sous elle pendant qu'elle monte.
               * Ses boutons quittent alors l'ordre de tabulation. */
              visibility: fil === 'ouvert' ? 'hidden' : 'visible',
              transition: fil === 'ouvert' && !REDUCE_MOTION ? 'visibility 0s linear .32s' : 'none',
            }}>
              {/* L'orbe prend la place qui reste. Pas de vide réservé pendant
                * que Three.js arrive : la zone a déjà sa taille, rien ne saute. */}
              <div style={{ position: 'relative', flex: '1 1 0', minHeight: 0 }}>
                <div style={{ position: 'absolute', inset: 0 }}>
                  <Suspense fallback={null}>
                    <Orbe etat={etatVu} niveau={niveau} remplir teinte={teinteVue} />
                  </Suspense>
                </div>
              </div>

              <div style={{
                textAlign: 'center', fontSize: 11, fontWeight: 600, letterSpacing: '.2em',
                textTransform: 'uppercase', color: 'var(--o-text2)',
              }}>{titre} · <b style={{ color: 'var(--o-text)', fontWeight: 800 }}>{etiquette}</b></div>

              <Legende legende={ecoute ? null : legende} mot={motLu} invite={invite} />
              {erreur && !ouvert && (
                <div role="alert" style={{ textAlign: 'center', marginTop: 6, fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{erreur}</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 8px' }}>
                {/* Le micro n'apparait que s'il peut servir.
                  *
                  * Mesure du 09/09/2026 : sur l'adresse locale en HTTP,
                  * `isSecureContext` vaut faux et `navigator.mediaDevices` est
                  * `undefined` — le navigateur INTERDIT la capture audio hors
                  * contexte securise. Un bouton pose la n'aurait rien pu faire, et
                  * ne l'aurait dit qu'apres l'appui. Sur l'adresse https, tout
                  * s'ouvre : contexte securise, politique de l'iframe, permission. */}
                {micro.ok && (
                  <button className="o-assist-mic" onClick={basculerEcoute} disabled={occupe && !ecoute}
                    aria-label={ecoute ? tr('Arrêter l’écoute') : tr('Parler à l’assistant')}
                    title={ecoute ? tr('Arrêter l’écoute') : tr('Parler à l’assistant')}
                    style={{
                      position: 'relative', width: 78, height: 78, borderRadius: '50%', border: 'none', flexShrink: 0,
                      background: ecoute ? 'var(--o-bad)' : 'var(--o-accent-fond)', color: '#fff',
                      cursor: (occupe && !ecoute) ? 'default' : 'pointer', opacity: (occupe && !ecoute) ? .45 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: ecoute ? 'none' : '0 10px 30px rgba(var(--o-accent-rgb), .28)',
                    }}>
                    {/* L'anneau bat à l'amplitude captée : on voit qu'elle entend. */}
                    <span aria-hidden="true" style={{
                      position: 'absolute', inset: -6, borderRadius: '50%', border: '2px solid var(--o-bad)',
                      opacity: ecoute ? .9 : 0, transform: `scale(${1 + (niveau || 0) * 0.3})`,
                      transition: 'opacity .2s, transform .08s linear', pointerEvents: 'none',
                    }} />
                    <Fi i={ecoute ? 'square' : 'microphone'} size={26} />
                  </button>
                )}
                {/* Sans micro, le gros bouton ne ment pas : il ouvre la
                  * conversation, et la phrase au-dessus dit pourquoi la voix
                  * manque. */}
                {!micro.ok && (
                  <button className="o-assist-mic" onClick={ecrire}
                    aria-label={tr('Écrire à l’assistant')} title={tr('Écrire à l’assistant')}
                    style={{
                      width: 78, height: 78, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                      border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}><Fi i="keyboard" size={26} /></button>
                )}
              </div>

              <div className="o-assist-chips" style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '2px 0 4px' }}>
                {SUGGESTIONS.map(([libelle, q]) => (
                  <button key={libelle} onClick={() => { ouvrirFil(); envoyerTexte(tr(q)); }} disabled={occupe || !lie}
                    style={{
                      flex: 'none', padding: '0 14px', height: 36, borderRadius: 999, whiteSpace: 'nowrap',
                      border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s1)', color: 'var(--o-text1)',
                      fontSize: 12.5, fontWeight: 600,
                      cursor: (occupe || !lie) ? 'default' : 'pointer', opacity: (occupe || !lie) ? .45 : 1,
                    }}>{tr(libelle)}</button>
                ))}
              </div>

              <button onClick={ouvrirFil} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
                padding: '10px 0 0', minHeight: 36, background: 'none', border: 0, cursor: 'pointer',
                fontSize: 12, fontWeight: 700, letterSpacing: '.04em', color: 'var(--o-text2)',
              }}>
                <span aria-hidden="true" style={{ width: 26, height: 3, borderRadius: 99, background: 'var(--o-text3)', opacity: .45 }} />
                {tr('Conversation')}
              </button>
            </div>

            {/* La conversation n'existe que quand on l'ouvre. Cachée seulement,
              * ses boutons resteraient dans l'ordre de tabulation, et le piège
              * de focus de la feuille — qui boucle entre le premier et le
              * dernier de la liste — bouclerait sur un bouton invisible. */}
            {fil !== 'ferme' && (
              <section aria-label={tr('Conversation')}
                className={fil === 'sortant' ? 'o-assist-fil sortant' : 'o-assist-fil'}
                onAnimationEnd={(e) => { if (e.target === e.currentTarget && fil === 'sortant') setFil('ferme'); }}
                style={{
                  position: 'absolute', inset: 0, zIndex: 2, display: 'flex', flexDirection: 'column',
                  background: 'linear-gradient(var(--o-surfA), var(--o-surfA)), var(--o-bg)',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0 12px', borderBottom: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
                  <button onClick={redescendre} aria-label={tr('Refermer la conversation')} style={carre(false)}>
                    <Fi i="angle-small-down" size={18} />
                  </button>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 800 }}>{tr('Conversation')}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--o-text3)' }}>{tr('même fil que la voix')}</span>
                </div>

                <div ref={filRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    colleRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                  }}
                  style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 11, padding: '14px 2px 10px' }}>
                  {messages.length === 0 && !occupe && (
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', textAlign: 'center', padding: '10px 0' }}>
                      {tr('Pose-lui une question.')}
                    </div>
                  )}
                  {messages.map((m, i) => <Bulle key={i} m={m} />)}
                  {etat === 'thinking' && <Points />}
                </div>

                {outils.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 8 }}>
                    {outils.map((o, i) => (
                      <span key={i} style={{
                        padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: 'var(--o-s2)', color: 'var(--o-text2)',
                      }}>{o}</span>
                    ))}
                  </div>
                )}
                {erreur && ouvert && (
                  <div role="alert" style={{ paddingBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{erreur}</div>
                )}

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 12, borderTop: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
                  <input
                    ref={saisieRef}
                    value={texte}
                    onChange={e => setTexte(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); return; }
                      // Échap redescend la conversation, sans fermer toute la popup.
                      if (e.key === 'Escape') { e.stopPropagation(); redescendre(); }
                    }}
                    maxLength={4000}
                    aria-label={tr('Écrire à l’assistant')}
                    placeholder={tr('Écrire…')}
                    style={{
                      flex: 1, minWidth: 0, height: 46, padding: '0 16px', borderRadius: 23,
                      background: 'var(--o-s2)', color: 'var(--o-text)',
                      border: 'var(--o-bw,1px) solid var(--o-bd2)', fontSize: 14, fontWeight: 600, boxSizing: 'border-box',
                    }}
                  />
                  <button onClick={envoyer} disabled={!pret} aria-label={tr('Envoyer')}
                    style={{
                      width: 46, height: 46, borderRadius: '50%', border: 'none', flexShrink: 0,
                      background: 'var(--o-accent-fond)', color: '#fff',
                      cursor: pret ? 'pointer' : 'default', opacity: pret ? 1 : .4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}><Fi i="paper-plane" size={16} /></button>
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
