/* ── Le formulaire d'un événement : il crée, et il modifie ─────────────────
 *
 * Il vivait au milieu d'`App.jsx`, utilisable par la seule feuille qui le
 * contenait. L'agenda du rail en a eu besoin le 02/10 pour son bouton
 * « + Événement » : plutôt qu'un second formulaire — et donc une seconde
 * validation, c'est-à-dire un endroit où une divergence ne se verrait pas —,
 * il sort ici et les deux feuilles l'appellent.
 */
import { useState } from 'react';
import { tr } from './i18n.js';
import { Fi, ListeChoix } from './ui.jsx';
import {
  champsDepuisEvenement, datesEvenement, finApresDebut, runPlan, actionCtx,
  planAction as actionsPlan,
} from './actions.js';

export function NouvelEvenement({ hass, cals, jour, evenement = null, onFait, onClose }) {
  /* Le meme formulaire cree et modifie. Les champs sont les memes, les regles
   * de date aussi ; seuls le titre du panneau, le libelle du bouton et la
   * commande envoyee changent. En faire deux composants aurait duplique la
   * validation, c'est-a-dire l'endroit ou une divergence ne se verrait pas. */
  const edition = !!(evenement && evenement.uid);
  const depart = edition ? champsDepuisEvenement(evenement) : null;
  const dd = (n) => String(n).padStart(2, '0');
  const isoJour = (d) => d.getFullYear() + '-' + dd(d.getMonth() + 1) + '-' + dd(d.getDate());
  /* L'heure proposée est la prochaine demie, pas l'heure courante : personne ne
   * crée un rendez-vous qui commence à 14h37. */
  const prochaineDemie = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() >= 30 ? 60 : 30, 0, 0);
    return dd(d.getHours()) + ':' + dd(d.getMinutes());
  };
  const [cal, setCal] = useState(edition ? evenement._cal : cals[0]);
  const [titre, setTitre] = useState(edition ? (evenement.summary || '') : '');
  const [journee, setJournee] = useState(edition ? depart.journee : false);
  const [dDebut, setDDebut] = useState(() => (edition ? depart.dDebut : isoJour(jour)));
  const [dFin, setDFin] = useState(() => (edition ? depart.dFin : isoJour(jour)));
  const [hDebut, setHDebut] = useState(() => (edition ? (depart.hDebut || prochaineDemie()) : prochaineDemie()));
  const [hFin, setHFin] = useState(() => {
    if (edition && depart.hFin) return depart.hFin;
    const [h, m] = prochaineDemie().split(':');
    return dd((Number(h) + 1) % 24) + ':' + m;
  });
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const nomCal = (id) => ((((hass && hass.states) || {})[id] || {}).attributes || {}).friendly_name || id.replace('calendar.', '');

  const envoyer = async () => {
    const t = titre.trim();
    if (!t) { setErreur(tr('Il faut un titre.')); return; }
    /* Une fin avant le début est le seul cas que Home Assistant accepte sans
     * broncher tout en ne créant rien de visible. On le refuse ici, où l'on
     * peut encore le dire. */
    if (!finApresDebut(journee, dDebut, hDebut, dFin, hFin)) {
      setErreur(tr('La fin doit venir après le début.'));
      return;
    }
    const dates = datesEvenement(journee, dDebut, hDebut, dFin, hFin);
    setErreur(null); setEnvoi(true);
    /* `planAction` + `runPlan` plutôt que `commander` : celui-ci ne rend pas de
     * promesse — il signale ses échecs au toast global et rend la valeur
     * envoyée. Un formulaire, lui, doit savoir QUAND c'est fait, pour se fermer
     * et rafraîchir la liste, et POURQUOI ça ne l'est pas, pour le dire sur
     * place plutôt que dans un bandeau qui passe. */
    /* `calendar/event/update` prend les nouvelles valeurs dans un OBJET
     * `event`, pas a plat — le serveur le dit lui-meme si on l'oublie. Et
     * `recurrence_id`, quand il existe, dit QUELLE occurrence d'une serie on
     * touche : sans lui, Home Assistant ne saurait pas laquelle. */
    const p = edition
      ? actionsPlan(evenement._cal, 'modifier_evenement', evenement.uid, actionCtx(hass),
        Object.assign({ event: { summary: t, ...dates } },
          evenement.recurrence_id ? { recurrence_id: evenement.recurrence_id } : null))
      : actionsPlan(cal, 'creer_evenement', t, actionCtx(hass), dates);
    if (!p.ok) { setEnvoi(false); setErreur(p.reason || tr('Home Assistant a refusé.')); return; }
    const r = await runPlan(hass, p);
    setEnvoi(false);
    if (!r || !r.ok) { setErreur((r && r.reason) ? String(r.reason) : tr('Home Assistant a refusé.')); return; }
    onFait();
  };

  const champ = {
    padding: '10px 12px', borderRadius: 12, background: 'var(--o-s2)', color: 'var(--o-text)',
    border: 'var(--o-bw,1px) solid var(--o-bd2)', fontSize: 13, fontWeight: 600,
    boxSizing: 'border-box', minHeight: 44, width: '100%',
  };
  const legende = { fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: 'var(--o-text1)', opacity: .78, marginBottom: 5 };

  return (
    <div style={{ marginBottom: 14, padding: 13, borderRadius: 16, background: 'var(--o-s1)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 800 }}>{edition ? tr('Modifier l’événement') : tr('Nouvel événement')}</span>
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
          aria-label={tr('Titre de l’événement')} placeholder={tr('Dentiste, dîner, anniversaire…')} style={champ} />
      </div>

      {!edition && cals.length > 1 && (
        <div>
          <div style={legende}>{tr('AGENDA')}</div>
          <ListeChoix value={cal} onChange={setCal} label={tr('Agenda')} options={cals.map(k => ({ id: k, label: nomCal(k) }))} style={champ} />
        </div>
      )}

      <button onClick={() => setJournee(v => !v)} aria-pressed={journee}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', minHeight: 44, borderRadius: 12, cursor: 'pointer',
          border: 'var(--o-bw,1px) solid var(--o-bd2)', background: journee ? 'rgba(var(--o-accent-rgb),.12)' : 'transparent', color: 'var(--o-text1)', textAlign: 'left' }}>
        <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: journee ? 'var(--o-accent-fond)' : 'transparent', border: journee ? 'none' : 'var(--o-bw,1px) solid var(--o-bd2)' }}>
          {journee && <Fi i="check" size={11} color="#fff" />}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{tr('Journée entière')}</span>
      </button>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={legende}>{tr('DÉBUT')}</div>
          <input type="date" value={dDebut} onChange={e => setDDebut(e.target.value)} aria-label={tr('Date de début')} style={champ} />
          {!journee && <input type="time" value={hDebut} onChange={e => setHDebut(e.target.value)} aria-label={tr('Heure de début')} style={{ ...champ, marginTop: 7 }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={legende}>{tr('FIN')}</div>
          <input type="date" value={dFin} onChange={e => setDFin(e.target.value)} aria-label={tr('Date de fin')} style={champ} />
          {!journee && <input type="time" value={hFin} onChange={e => setHFin(e.target.value)} aria-label={tr('Heure de fin')} style={{ ...champ, marginTop: 7 }} />}
        </div>
      </div>

      {erreur && <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{erreur}</div>}

      <button onClick={envoyer} disabled={envoi}
        style={{ padding: '12px 16px', minHeight: 44, borderRadius: 14, border: 'none', cursor: envoi ? 'default' : 'pointer',
          background: 'var(--o-accent-fond)', color: '#fff', fontSize: 13, fontWeight: 800, opacity: envoi ? .6 : 1 }}>
        {envoi ? tr('Envoi…') : edition ? tr('Enregistrer') : tr('Créer l’événement')}
      </button>
    </div>
  );
}
