/* ── Le formulaire d'un rappel : le panneau qu'ouvre le « + » de la carte ──
 *
 * Sorti de `rappelsrail.jsx` (lot 11 Gladys, ADR 0315) : il ne s'affiche que
 * sur un geste, et se charge donc à ce moment-là (ADR 0145). Le démarrage
 * n'avait plus la place de porter la carte des courses à côté de lui.
 */
import { useState } from 'react';
import { tr } from './i18n.js';
import { Fi, ListeChoix } from './ui.jsx';

/**
 * Le panneau qu'ouvre le « + » de la maquette. Même air que celui d'un
 * événement (`formevenement.jsx`) : la ressemblance n'est pas décorative,
 * c'est le même geste.
 *
 * L'HEURE EST FACULTATIVE. Une tâche datée sans heure n'est en retard que le
 * lendemain ; avec une heure, à la minute près. Home Assistant refuse
 * `due_date` et `due_datetime` ensemble : on envoie l'un OU l'autre.
 */
export default function NouveauRappel({ listes = [], onAjouter = null, onClose = null }) {
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
