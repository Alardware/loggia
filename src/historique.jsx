/* ── Ce que la maison vient de faire ────────────────────────────────────────
 *
 * Le journal d'activite et les courbes d'historique vivaient dans `App.jsx`.
 * Trois vues s'en servent — une piece, la Securite, le Systeme — et deux autres
 * les courbes. Les laisser la-bas obligeait la vue Systeme a y rester avec
 * elles : on ne charge pas une vue a la demande si le tronc la retient.
 *
 * Rien ici ne connait le reste du dashboard : ce module n'importe que la
 * traduction, trois crochets React et les instants du journal
 * (`evenement.js`, sans React — la fenêtre de 24 h et l'heure d'une ligne s'y
 * testent à sec, audit du 03/10). */
import { useState, useEffect, useMemo, useRef } from 'react';
import { tr } from './i18n.js';
import { dansLaFenetre, heureJournal } from './evenement.js';
import { seriesRelues, GARDE_SERIE } from './releve.js';

/* L'heure qui avance, à la minute ronde (audit du 03/10). Un rafraîchissement
 * d'AFFICHAGE, rien d'autre : aucune commande ne part d'ici. Sans lui, un
 * journal que rien de neuf ne vient secouer ne vieillirait jamais. */
function useMinute() {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    let iv = null;
    const to = setTimeout(() => { setT(Date.now()); iv = setInterval(() => setT(Date.now()), 60000); }, 60000 - (Date.now() % 60000));
    return () => { clearTimeout(to); if (iv) clearInterval(iv); };
  }, []);
  return t;
}

export function useRoomLogbook(hass, ids) {
  // `ids = null` : le journal de TOUTE la maison — le logbook écarte déjà de
  // lui-même les capteurs continus, ce qui arrive mérite d'être raconté.
  const [events, setEvents] = useState([]);
  const maintenant = useMinute();
  const conn = hass && hass.connection;
  const sig = ids ? ids.join('|') : '*';
  useEffect(() => {
    setEvents([]);
    if (!conn || (ids && !ids.length)) return;
    let unsub = null, mort = false;
    const debut = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    conn.subscribeMessage((msg) => {
      if (mort || !msg || !Array.isArray(msg.events) || !msg.events.length) return;
      setEvents(prev => {
        /* Dédoublonné (audit du 03/10) : à la reconnexion, l'abonnement est
         * rejoué avec le même `start_time`, et Home Assistant renvoie tout
         * l'historique depuis ce point — chaque ligne s'affichait deux fois. */
        const cle = (e) => e.entity_id + '|' + e.when + '|' + (e.state != null ? e.state : e.message);
        const vus = new Set(prev.map(cle));
        const neufs = msg.events.filter(e => e && e.entity_id && e.state !== 'unknown' && e.state !== 'unavailable' && !vus.has(cle(e)));
        const tous = [...prev, ...neufs];
        tous.sort((a, b) => (b.when || 0) - (a.when || 0));
        return tous.slice(0, 30);
      });
    }, { type: 'logbook/event_stream', start_time: debut, ...(ids ? { entity_ids: ids } : {}) })
      .then(u => { if (mort) { try { u(); } catch {} } else unsub = u; })
      .catch(() => {}); // logbook absent ou refuse : la carte ne s'affiche pas, c'est tout
    return () => { mort = true; if (unsub) { try { unsub(); } catch {} } };
  }, [conn, sig]);
  /* Filtré AU RENDU (audit du 03/10) : l'abonnement remonte 24 h en arrière
   * de son OUVERTURE, puis ajoute sans jamais rien retirer. Sur une tablette
   * allumée plusieurs jours, la carte « 24 h, en direct » montrait encore
   * lundi le jeudi. Ce qui sort de la fenêtre sort de l'écran à la minute
   * près — ce qu'un rechargement aurait montré. */
  return useMemo(() => dansLaFenetre(events, maintenant), [events, maintenant]);
}

/* Le DERNIER declenchement de chaque entite, d'apres le meme flux du journal :
 * { id → instant (ms) }. La carte d'activite garde trente lignes ; ici on ne
 * garde qu'un instant par entite — une camera bavarde ne fait pas oublier la
 * derniere detection d'une camera calme (ADR 0031). `reduire(prev, events)`
 * vient de l'appelant : ce module ne sait pas ce qu'est une detection. */
export function useDerniersEvenements(hass, ids, reduire) {
  const [derniers, setDerniers] = useState({});
  const conn = hass && hass.connection;
  const sig = (ids || []).filter(Boolean).join('|');
  useEffect(() => {
    setDerniers({});
    if (!conn || !sig) return;
    let unsub = null, mort = false;
    const debut = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    conn.subscribeMessage((msg) => {
      if (mort || !msg || !Array.isArray(msg.events) || !msg.events.length) return;
      setDerniers(prev => reduire(prev, msg.events));
    }, { type: 'logbook/event_stream', start_time: debut, entity_ids: sig.split('|') })
      .then(u => { if (mort) { try { u(); } catch {} } else unsub = u; })
      .catch(() => {}); // journal absent ou refuse : la tuile dit « Direct », c'est tout
    return () => { mort = true; if (unsub) { try { unsub(); } catch {} } };
  }, [conn, sig, reduire]);
  return derniers;
}

/** L'etat d'un evenement du journal, dit en un mot. */
export function etatJournal(id, st, S) {
  const dom = id.slice(0, id.indexOf('.'));
  const a = (S && S[id] && S[id].attributes) || {};
  if (['light', 'switch', 'fan', 'input_boolean', 'humidifier'].indexOf(dom) >= 0) return st === 'on' ? tr('Allumé') : tr('Éteint');
  if (dom === 'cover') return st === 'open' ? tr('Ouvert') : st === 'closed' ? tr('Fermé') : st === 'opening' ? tr('Ouverture…') : st === 'closing' ? tr('Fermeture…') : st;
  if (dom === 'lock') return st === 'locked' ? tr('Verrouillée') : st === 'unlocked' ? tr('Déverrouillée') : st;
  if (dom === 'media_player') return st === 'playing' ? tr('Lecture') : st === 'paused' ? tr('En pause') : st === 'off' ? tr('Éteint') : st === 'on' ? tr('Allumé') : tr('Inactif');
  if (dom === 'binary_sensor') {
    const porte = ['door', 'window', 'garage_door', 'opening'].indexOf(a.device_class) >= 0;
    // « RAS » et « Absent » passent par `tr` comme leurs voisins (audit du
    // 03/10) : le journal d'une pièce les disait en français.
    return st === 'on' ? (porte ? tr('Ouvert') : tr('Détecté')) : (porte ? tr('Fermé') : tr('RAS'));
  }
  if (dom === 'climate') return st === 'off' ? tr('Éteint') : st === 'heat' ? tr('CONFORT') : st;
  if (dom === 'vacuum') return st === 'cleaning' ? tr('Nettoyage') : st === 'docked' ? tr('À la base') : st === 'returning' ? tr('Retour base') : st === 'paused' ? tr('En pause') : st;
  if (dom === 'person') return st === 'home' ? tr('Présent') : tr('Absent');
  return st + (a.unit_of_measurement ? ' ' + a.unit_of_measurement : '');
}

/* Regroupe les répétitions CONSÉCUTIVES d'une même entité : un lecteur qui
 * change de titre toutes les trois minutes noyait le journal — une ligne
 * portée « ×n », datée du dernier événement, raconte la même chose. */
export function grouperJournal(events, cle = (e) => e.entity_id) {
  const out = [];
  for (const e of events) {
    const d = out[out.length - 1];
    if (d && cle(d) != null && cle(d) === cle(e)) { d.n = (d.n || 1) + 1; continue; }
    out.push({ ...e, n: 1 });
  }
  return out;
}

export function RoomActivityCard({ hass, ids, titre = null, sous = null, max = 8 }) {
  const events = grouperJournal(useRoomLogbook(hass, ids));
  if (!events.length) return null;
  const S = (hass && hass.states) || {};
  /* L'heure dit le jour quand ce n'est plus aujourd'hui (audit du 03/10) :
   * « 16:00 » seul datait du jour un événement de lundi. Le rendu suit la
   * minute du crochet — la ligne passe à « hier » au premier coup de minuit. */
  const actif = (e) => ['on', 'open', 'unlocked', 'playing', 'heat', 'cleaning', 'home'].indexOf(e.state) >= 0;
  return (
    <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{titre || tr('Activité')}</div>
      <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 10px' }}>{sous || tr('Les dernières 24 heures, en direct')}</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {events.slice(0, max).map((e, i) => (
          <div key={(e.when || 0) + '|' + e.entity_id + '|' + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none' }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: actif(e) ? 'var(--o-warn)' : 'var(--o-text3)', boxShadow: actif(e) ? '0 0 7px var(--o-warn)' : 'none' }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name || (S[e.entity_id] && S[e.entity_id].attributes && S[e.entity_id].attributes.friendly_name) || e.entity_id}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: actif(e) ? 'var(--o-warn)' : 'var(--o-text2)', whiteSpace: 'nowrap' }}>{e.state != null ? etatJournal(e.entity_id, e.state, S) : (e.message || '')}{e.n > 1 ? ' ·×' + e.n : ''}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', flexShrink: 0, minWidth: 38, textAlign: 'right', whiteSpace: 'nowrap' }}>{heureJournal(e.when)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function useSysHist(hass, ids, hours, refreshKey) {
  const [data, setData] = useState({});
  // L'instant de la dernière lecture RÉUSSIE de chaque série (relecture du 03/10).
  const lus = useRef({});
  const key = ids.filter(Boolean).join('|');
  const connecte = hass ? 1 : 0;
  useEffect(() => {
    let alive = true;
    if (!hass || !hass.callApi || !key) { setData({}); return undefined; }
    const start = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    /* Un raté rend `null`, pas `[]` (audit du 03/10) : les courbes se relisent
     * maintenant au tour, et un historique vide effaçait la courbe d'avant
     * pour un simple raté du réseau. `seriesRelues` la garde (releve.js). */
    Promise.all(key.split('|').map(id =>
      hass.callApi('GET', 'history/period/' + start + '?filter_entity_id=' + encodeURIComponent(id) + '&minimal_response&no_attributes')
        .then(res => ({ id, arr: (res && res[0]) || [] })).catch(() => ({ id, arr: null }))
    )).then(rs => {
      if (!alive) return;
      const maintenant = Date.now();
      rs.forEach(r => { if (r && Array.isArray(r.arr)) lus.current[r.id] = maintenant; });
      /* Une courbe gardée après un raté expire : trente minutes au plus — la
       * borne de l'historique 24 h —, et le quart de sa fenêtre pour une
       * courbe courte (celle d'une heure du Système). */
      const garde = Math.min(GARDE_SERIE, hours * 3600 * 1000 / 4);
      setData(avant => seriesRelues(avant, rs, (id) => maintenant - (lus.current[id] || 0) < garde));
    });
    return () => { alive = false; };
  }, [connecte, key, hours, refreshKey]);
  return data;
}
