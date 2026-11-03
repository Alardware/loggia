/* ── La liste de courses, à part des rappels (lot 11 Gladys, ADR 0315) ──────
 *
 * Une liste d'achats n'a pas de dates : rangée avec les rappels, tout tombait
 * dans « Plus tard », mêlé à ce qui attend son jour. Elle a donc sa carte, sous
 * celle des rappels : son nom (celui que Home Assistant lui donne), ce qui
 * reste à acheter, un champ pour ajouter un article et la pastille qui le
 * coche. Pas d'onglets de dates.
 *
 * QUELLE LISTE. Celle de la plateforme `shopping_list` — la liste de courses
 * de Home Assistant —, reconnue à sa plateforme (`estCourses`), jamais à son
 * nom. Une liste `todo` ordinaire reste un rappel, même sans dates.
 *
 * AUCUNE COMMANDE PAR ELLE-MÊME. Ajouter (`todo.add_item`) et cocher
 * (`todo.update_item`) ne partent que d'un geste, par les mêmes fonctions que
 * les rappels (`ajouterTache`, `marquerFait`). Le champ et la pastille
 * n'existent que si la liste l'accepte (`supported_features`).
 *
 * Chargé à la demande par la carte des rappels, et seulement s'il y a une
 * liste d'achats.
 */
import { useState } from 'react';
import { tr, trN } from './i18n.js';
import { Fi } from './ui.jsx';
import { listesTodo, peutCreer, peutCocher } from './todos.js';
import { CARTE_RAIL } from './styles.js';
import { LigneRappel } from './rappelsrail.jsx';

/** Les articles qui restent à acheter dans une liste, dans l'ordre que Home Assistant leur donne. */
export function articlesDe(taches, listeId) {
  return (taches || []).filter(t => t && !t.fait && t.titre && t.listeId === listeId)
    /* La catégorie d'une ligne est le nom de sa liste : déjà le titre de la carte. */
    .map(t => ({ ...t, categorie: '' }));
}

/**
 * Une carte par liste d'achats (il n'y en a d'ordinaire qu'une), posée sous
 * celle des rappels avec l'écart du rail. `onFait` et `onAjouter` sont ceux
 * des rappels : l'Accueil y relit les listes après le geste.
 */
export default function CartesCourses({ hass = null, taches = null, onFait = null, onAjouter = null }) {
  const listes = listesTodo((hass && hass.states) || {});
  const apres = listes.some(l => !l.courses);
  return listes.filter(l => l.courses).map((l, i) => (
    <CarteCourses key={l.id} hass={hass} liste={l} taches={taches} onFait={onFait} onAjouter={onAjouter} ecart={apres || i > 0} />
  ));
}

export function CarteCourses({ hass = null, liste, taches = null, onFait = null, onAjouter = null, ecart = false }) {
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const etat = ((hass && hass.states) || {})[liste.id];
  const articles = articlesDe(taches, liste.id);
  const cochable = peutCocher(etat);

  const valider = (e) => {
    e.preventDefault();
    const titre = texte.trim();
    if (!titre || envoi) return;
    setEnvoi(true);
    setErreur('');
    /* Sans date : une liste d'achats n'en a pas. */
    Promise.resolve(onAjouter(liste.id, titre)).then((ok) => {
      setEnvoi(false);
      if (ok === false) { setErreur(tr('Home Assistant a refusé.')); return; }
      setTexte('');
    });
  };

  return (
    <div style={{ ...CARTE_RAIL, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginTop: ecart ? 12 : 0 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{liste.nom}</div>
        <div style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 14, fontWeight: 500, color: 'var(--o-text2)', marginTop: 2 }}>
          {articles.length ? trN(articles.length, '1 article à acheter', '{n} articles à acheter') : tr('Rien à acheter')}
        </div>
      </div>

      {/* Le champ n'existe que s'il y a OÙ écrire : une liste en lecture seule
        * renverrait le geste refusé, sans un mot. */}
      {onAjouter && peutCreer(etat) && (
        <form onSubmit={valider} style={{ display: 'flex', gap: 8 }}>
          <input value={texte} onChange={e => setTexte(e.target.value)} aria-label={tr('Ajouter un article')} placeholder={tr('Ajouter un article')}
            style={{ flex: 1, minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text)', font: 'inherit', fontSize: 13 }} />
          <button type="submit" disabled={envoi || !texte.trim()} aria-label={tr('Ajouter')}
            style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 12, border: 'none', background: 'var(--o-accent)', color: '#fff', cursor: envoi ? 'default' : 'pointer', opacity: envoi || !texte.trim() ? .6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Fi i="plus" size={13} />
          </button>
        </form>
      )}

      {erreur && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{erreur}</div>}

      {articles.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {articles.map(t => <LigneRappel key={t.cle} t={t} onFait={onFait} cochable={cochable} />)}
        </div>
      )}
    </div>
  );
}
