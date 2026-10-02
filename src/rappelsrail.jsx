/* ── Les rappels et la collecte : deux cartes du rail (maquettes du 03/10) ──
 *
 * La carte « Rappels » portait deux lignes qui n'avaient rien à voir : le
 * prochain repas du chat et le prochain ramassage. La maquette fournie en fait
 * une VRAIE liste de choses à faire — « Rappels · 4 à faire aujourd'hui », un
 * bouton « + », trois onglets (Aujourd'hui · Demain · Plus tard), et des
 * lignes avec leur pastille de couleur, leur catégorie et leur heure, « En
 * retard » en rouge.
 *
 * La collecte, elle, prend la carte qui lui manquait — « j'aime beaucoup la
 * carte collecte ».
 *
 * ADAPTÉ À TOUS. Les catégories sont les listes `todo.*` de chacun ; sans
 * liste, pas de carte. La collecte se lit d'un capteur OU d'un calendrier, et
 * sans source elle ne s'affiche pas non plus.
 *
 * Tout ce qui se calcule vit dans `todos.js` et `collecte.js`, testés à sec :
 * ici on ne fait que poser des pixels et appeler Home Assistant.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { tr, trN, locale } from './i18n.js';
import { Fi, ListeChoix } from './ui.jsx';
import { listesTodo, lireTodo, rangerTodos, ONGLETS_RAPPELS, peutCreer, peutCocher } from './todos.js';
import { CARTE_RAIL } from './styles.js';

const hhmm = (d) => d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/* ════════════ LA LECTURE DES LISTES ════════════ */

/**
 * Les tâches de toutes les listes, relues toutes les cinq minutes.
 *
 * Home Assistant ne pousse pas le CONTENU d'une liste : l'entité `todo.…` ne
 * porte que le NOMBRE de tâches à faire, et le détail s'obtient par le service
 * `todo.get_items`. On relit donc au montage, quand ce nombre bouge — c'est
 * lui qui signale un ajout ou une coche venus d'ailleurs —, et à intervalle
 * pour les échéances qui passent.
 *
 * `tick` force une relecture : après avoir coché une tâche, attendre le sondage
 * suivant donnerait l'impression que le geste a échoué.
 */
export function useTodos(hass, tick = 0) {
  const [taches, setTaches] = useState([]);
  const S = hass && hass.states;
  const listes = useMemo(() => listesTodo(S), [S]);
  /* La signature porte le compte de chaque liste : il change à chaque ajout ou
   * coche, y compris depuis l'application de Home Assistant. */
  const sig = useMemo(() => listes.map(l => l.id + ':' + ((S && S[l.id] && S[l.id].state) || '')).join('|'), [listes, S]);
  const ws = hass && hass.callWS ? hass.callWS.bind(hass) : null;
  const pret = ws ? 1 : 0;
  const listesRef = useRef(listes);
  useEffect(() => { listesRef.current = listes; });

  useEffect(() => {
    if (!ws || !sig) { setTaches([]); return undefined; }
    let mort = false;
    const relire = async () => {
      const tous = [];
      for (const l of listesRef.current) {
        try {
          const r = await ws({ type: 'call_service', domain: 'todo', service: 'get_items',
            target: { entity_id: l.id }, service_data: { status: ['needs_action'] }, return_response: true });
          /* La réponse arrive sous `response[entity_id].items`, et selon la
           * version sous `response.response`. On accepte les deux plutôt que
           * de parier sur une. */
          const rep = (r && (r.response || r)) || {};
          const items = ((rep[l.id] || {}).items) || [];
          for (const it of items) tous.push(lireTodo(it, l, new Date()));
        } catch { /* une liste qui refuse ne prive pas les autres */ }
      }
      if (!mort) setTaches(tous);
    };
    relire();
    const iv = setInterval(relire, 5 * 60000);
    return () => { mort = true; clearInterval(iv); };
  }, [pret, sig, tick]);

  return taches;
}

/* ════════════ LA CARTE RAPPELS ════════════ */

export function CarteRappels({ hass = null, taches = null, onFait = null, onAjouter = null }) {
  const liste = Array.isArray(taches) ? taches : [];
  const [onglet, setOnglet] = useState('aujourdhui');
  const [nouveau, setNouveau] = useState(false);
  /* L'heure qui tourne fait passer une tâche en retard sans qu'on touche à
   * rien : on se relit toutes les minutes. */
  const [minute, setMinute] = useState(() => Date.now());
  useEffect(() => { const iv = setInterval(() => setMinute(Date.now()), 60000); return () => clearInterval(iv); }, []);
  const ranges = useMemo(() => rangerTodos(liste, new Date(minute)), [liste, minute]);
  const montrees = ranges[onglet] || [];
  const NOMS = { aujourdhui: tr('Aujourd’hui'), demain: tr('Demain'), plustard: tr('Plus tard') };

  const S = (hass && hass.states) || {};
  const creables = useMemo(() => listesTodo(S).filter(l => peutCreer(S[l.id])), [S]);

  return (
    <div style={{ ...CARTE_RAIL, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{tr('Rappels')}</div>
          <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 14, fontWeight: 500, color: 'var(--o-text2)', marginTop: 2 }}>
            {ranges.aujourdhui.length
              ? trN(ranges.aujourdhui.length, '1 à faire aujourd’hui', '{n} à faire aujourd’hui')
              : tr('Rien à faire aujourd’hui')}
          </div>
        </div>
        {/* Le « + » n'existe que s'il y a une liste OÙ écrire : une liste en
          * lecture seule renverrait le geste refusé, sans un mot. */}
        {onAjouter && creables.length > 0 && (
          <button type="button" onClick={() => setNouveau(v => !v)} aria-label={tr('Nouveau rappel')} aria-expanded={nouveau}
            style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Fi i="plus" size={13} />
          </button>
        )}
      </div>

      {nouveau && (
        <NouveauRappel listes={creables} onAjouter={onAjouter} onClose={() => setNouveau(false)} />
      )}

      {/* Les trois onglets, avec leur compte — une puce choisie se remplit
        * d'accent, comme partout dans Loggia. */}
      <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 12, background: 'var(--o-s2)' }}>
        {ONGLETS_RAPPELS.map(id => {
          const on = onglet === id;
          const n = (ranges[id] || []).length;
          return (
            <button key={id} type="button" onClick={() => setOnglet(id)} aria-pressed={on}
              style={{ flex: '1 1 auto', minWidth: 0, height: 32, padding: '0 8px', borderRadius: 10, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden',
                background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text1)' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{NOMS[id]}</span>
              {n > 0 && <span style={{ fontSize: 11, fontWeight: 800, opacity: on ? .85 : .6, fontVariantNumeric: 'tabular-nums' }}>{n}</span>}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {montrees.map(t => <LigneRappel key={t.cle} t={t} onFait={onFait} cochable={peutCocher(S[t.listeId])} />)}
        {!montrees.length && (
          <div style={{ padding: 12, borderRadius: 12, background: 'var(--o-s2)', fontSize: 12.5, color: 'var(--o-text2)' }}>
            {onglet === 'aujourdhui' ? tr('Rien à faire aujourd’hui') : tr('Rien de prévu.')}
          </div>
        )}
      </div>
    </div>
  );
}

/* Une ligne : la pastille de la catégorie, le titre, la catégorie, et l'heure
 * — ou « En retard » en rouge. La pastille COCHE la tâche quand la liste le
 * permet ; sinon elle n'est qu'un repère de couleur, et ne se clique pas. */
function LigneRappel({ t, onFait, cochable }) {
  const retard = t.quand === 'retard';
  const droite = retard ? tr('En retard') : (t.avecHeure && t.echeance ? hhmm(t.echeance) : '');
  const pastille = (
    <span aria-hidden={cochable ? undefined : 'true'} style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box', border: '2px solid rgb(' + t.rgb + ')', background: 'transparent', display: 'block' }} />
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 12, background: 'var(--o-s2)' }}>
      {cochable && onFait
        ? (
          <button type="button" onClick={() => onFait(t)} aria-label={tr('Marquer fait : {t}', { t: t.titre })}
            style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
            {pastille}
          </button>
        )
        : pastille}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titre}</div>
        {t.categorie && <div style={{ fontSize: 11, color: 'var(--o-text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.categorie}</div>}
      </div>
      {droite && (
        <span style={{ fontSize: 11.5, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: retard ? 'var(--o-bad)' : 'var(--o-text1)' }}>{droite}</span>
      )}
    </div>
  );
}

/* ════════════ LE FORMULAIRE D'UN RAPPEL ════════════ */

/**
 * Le panneau qu'ouvre le « + » de la maquette. Même air que celui d'un
 * événement (`formevenement.jsx`) : la ressemblance n'est pas décorative,
 * c'est le même geste.
 *
 * L'HEURE EST FACULTATIVE. Une tâche datée sans heure n'est en retard que le
 * lendemain ; avec une heure, à la minute près. Home Assistant refuse
 * `due_date` et `due_datetime` ensemble : on envoie l'un OU l'autre.
 */
function NouveauRappel({ listes = [], onAjouter = null, onClose = null }) {
  const [titre, setTitre] = useState('');
  const [liste, setListe] = useState(() => (listes[0] ? listes[0].id : ''));
  const [jour, setJour] = useState(() => {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  });
  const [heure, setHeure] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const champ = {
    appearance: 'none', WebkitAppearance: 'none', background: 'var(--o-s2)', color: 'var(--o-text)',
    border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 12, padding: '10px 12px', fontSize: 13, font: 'inherit',
    boxSizing: 'border-box', minHeight: 44, width: '100%',
  };
  const legende = { fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: 'var(--o-text1)', opacity: .78, marginBottom: 5 };

  const valider = () => {
    if (!titre.trim()) { setErreur(tr('Il faut un titre.')); return; }
    if (!liste) { setErreur(tr('Il faut une liste.')); return; }
    setErreur('');
    setEnvoi(true);
    /* Avec une heure, on envoie une DATE COMPLÈTE ; sans, le jour seul. */
    const quand = heure ? new Date(jour + 'T' + heure + ':00') : jour;
    Promise.resolve(onAjouter && onAjouter(liste, titre.trim(), quand)).then((ok) => {
      setEnvoi(false);
      if (ok === false) { setErreur(tr('Home Assistant a refusé.')); return; }
      if (onClose) onClose();
    });
  };

  return (
    <div style={{ marginBottom: 12, padding: 13, borderRadius: 16, background: 'var(--o-s1)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 800 }}>{tr('Nouveau rappel')}</span>
        <button onClick={onClose} aria-label={tr('Fermer')}
          style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--o-s2)', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Fi i="cross" size={12} />
        </button>
      </div>

      <div>
        <div style={legende}>{tr('TITRE')}</div>
        {/* `autoFocus` délibéré : ce panneau s'ouvre sur un clic, pour saisir un
          * titre. La règle vise les champs focalisés au CHARGEMENT d'une page. */}
        <input value={titre} autoFocus onChange={e => setTitre(e.target.value)}
          aria-label={tr('Titre du rappel')} placeholder={tr('Arroser les plantes, rappeler le garage…')} style={champ} />
      </div>

      {listes.length > 1 && (
        <div>
          <div style={legende}>{tr('LISTE')}</div>
          <ListeChoix value={liste} onChange={setListe} label={tr('Liste')}
            options={listes.map(l => ({ id: l.id, label: l.nom }))} style={champ} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={legende}>{tr('JOUR')}</div>
          <input type="date" value={jour} onChange={e => setJour(e.target.value)} aria-label={tr('Jour')} style={champ} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={legende}>{tr('HEURE')}</div>
          <input type="time" value={heure} onChange={e => setHeure(e.target.value)} aria-label={tr('Heure (facultative)')} style={champ} />
        </div>
      </div>

      {erreur && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{erreur}</div>}

      <button onClick={valider} disabled={envoi}
        style={{ minHeight: 44, borderRadius: 12, border: 'none', background: 'var(--o-accent)', color: '#fff', font: 'inherit', fontSize: 13, fontWeight: 800, cursor: envoi ? 'default' : 'pointer', opacity: envoi ? .6 : 1 }}>
        {tr('Ajouter le rappel')}
      </button>
    </div>
  );
}

/* ════════════ LE BANDEAU DE COLLECTE (03/10) ════════════ */

/**
 * Le jour où il faut sortir les bacs, et la veille au soir — rien le reste du
 * temps.
 *
 * Une carte « Collectes » complète avait d'abord été faite, avec sa bande de
 * sept jours : « ça fait dupliquer le calendrier ». La carte Agenda porte déjà
 * cette bande, et les collectes y sont puisqu'elles viennent d'un calendrier.
 * Il ne restait donc que le BANDEAU, et sa place est juste au-dessus d'elle :
 * un point d'attention doit être actionnable et rare.
 *
 * `onSorti` le fait taire jusqu'à la collecte suivante. Les couleurs viennent
 * de `familleCollecte` : les familles répandues sont reconnues à leur nom,
 * dans les sept langues, et un nom inconnu prend la couleur suivante.
 */
export function BandeauCollecte({ prochain = null, heureSortie = '20:00', sorti = false, onSorti = null }) {
  if (!prochain || !prochain.types.length) return null;
  const auj = prochain.jour === 0;
  const veille = prochain.jour === 1;
  if (!auj && !veille) return null;          // après-demain, ce n'est pas encore une affaire

  const teinte = prochain.types[0].rgb;
  const noms = prochain.types.map(t => t.nom).join(' · ');
  /* L'échéance reste écrite même une fois le bac sorti : c'est le BOUTON qui
   * porte l'état, plein et coché. Le sous-titre la répétait, et « C'est sorti »
   * s'affichait alors deux fois sur la même ligne. */
  const quand = auj ? tr('À sortir ce matin') : tr('À sortir ce soir avant {h}', { h: heureSortie });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, marginBottom: 12,
      background: sorti ? 'var(--o-s2)' : 'rgba(' + teinte + ',.10)',
      border: '1px solid ' + (sorti ? 'transparent' : 'rgba(' + teinte + ',.38)') }}>
      <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: sorti ? 'rgba(var(--o-ok-rgb),.16)' : 'rgba(' + teinte + ',.18)', color: sorti ? 'var(--o-ok)' : 'rgb(' + teinte + ')' }}>
        <Fi i={sorti ? 'check' : 'trash'} size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{noms}</div>
        <div style={{ fontSize: 11.5, color: 'var(--o-text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{quand}</div>
      </div>
      {onSorti && (
        <button type="button" onClick={() => onSorti(!sorti)} aria-pressed={sorti}
          /* Une fois cliqué, le bouton passe au VERT : c'est fait. La teinte du
           * bac dit CE QU'ON SORT, elle ne peut pas dire en plus que c'est
           * fait — un bac jaune coché resterait jaune, comme avant le clic. */
          style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, minHeight: 34, padding: '0 12px', borderRadius: 10, cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 800,
            border: '1px solid ' + (sorti ? 'transparent' : 'rgba(' + teinte + ',.45)'),
            background: sorti ? 'rgba(var(--o-ok-rgb),.22)' : 'transparent', color: sorti ? 'var(--o-ok)' : 'var(--o-text1)' }}>
          <Fi i={sorti ? 'check' : 'angle-right'} size={11} />{tr('C’est sorti')}
        </button>
      )}
    </div>
  );
}

/* ════════════ COCHER, AJOUTER ════════════ */

/** Marque une tâche faite. Rend une promesse : l'appelant relit ensuite. */
export function marquerFait(hass, t) {
  if (!hass || !hass.callService || !t || !t.listeId) return Promise.resolve(false);
  return hass.callService('todo', 'update_item', {
    entity_id: t.listeId, item: t.uid || t.titre, status: 'completed',
  }).then(() => true, () => false);
}

/** Ajoute une tâche à une liste. */
export function ajouterTache(hass, listeId, titre, due) {
  if (!hass || !hass.callService || !listeId || !titre) return Promise.resolve(false);
  const data = { entity_id: listeId, item: titre };
  /* `due_datetime` quand l'heure compte, `due_date` sinon : Home Assistant
   * refuse les deux ensemble. */
  if (due instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    data.due_datetime = due.getFullYear() + '-' + p(due.getMonth() + 1) + '-' + p(due.getDate()) + ' ' + p(due.getHours()) + ':' + p(due.getMinutes()) + ':00';
  } else if (typeof due === 'string' && due) {
    data.due_date = due;
  }
  return hass.callService('todo', 'add_item', data).then(() => true, () => false);
}

/** Un compteur à incrémenter après chaque écriture, pour forcer la relecture. */
export function useRelecture() {
  const [tick, setTick] = useState(0);
  return [tick, useCallback(() => setTick(n => n + 1), [])];
}
