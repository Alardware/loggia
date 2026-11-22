/* Le bandeau « … · Annuler » (06/11, étape 7 du rapport sur l'usage ; la règle vit dans `annuler.js`).
 *
 * Monté UNE fois, à la racine : il écoute les gestes groupés (`EVENEMENT_ANNULABLE`), dit ce qui vient de se faire et
 * propose « Annuler » cinq secondes ; un nouveau geste le remplace et relance les cinq secondes. En bas, au-dessus de la
 * barre du téléphone ; au-dessus aussi des feuilles — une scène se lance depuis sa fiche — et hors de leur inertie
 * (`data-annonce`). */
import { useEffect, useState } from 'react';
import { tr } from '../i18n.js';
import { DUREE_ANNULER_MS, EVENEMENT_ANNULABLE, defaireAnnulable } from '../annuler.js';

export function BandeauAnnuler() {
  const [geste, setGeste] = useState(null);
  /* Ce que dit la région d'annonce (audit du 12/11, lot 4, I6). Un `status`
   * qui NAÎT avec son texte n'est pas lu (WAI-ARIA 1.2 : seul un changement
   * dans une région déjà là se dit) — le bandeau apparaissait sans un mot, et
   * l'annulation ne se disait pas du tout. La région est donc montée en
   * permanence, à côté du bandeau ; le bandeau, lui, reste pour l'œil et le
   * bouton. `data-annonce` : au premier niveau, une feuille ouverte ne la
   * rend pas inerte (`inerterAutour`, ui.jsx). */
  const [annonce, setAnnonce] = useState('');
  useEffect(() => {
    let t = 0;
    const sur = (e) => {
      clearTimeout(t);
      const g = (e && e.detail) || null;
      setGeste(g); setAnnonce(g && g.texte ? g.texte : '');
      t = setTimeout(() => { setGeste(null); setAnnonce(''); }, DUREE_ANNULER_MS);
    };
    window.addEventListener(EVENEMENT_ANNULABLE, sur);
    return () => { clearTimeout(t); window.removeEventListener(EVENEMENT_ANNULABLE, sur); };
  }, []);
  const region = <div className="o-vh" role="status" data-annonce="">{annonce}</div>;
  if (!geste) return region;
  return (<>
    {region}
    <div data-annonce="" className="o-annuler"
      /* La barre du bas compte DÉJÀ la zone de sécurité de l'iPhone : sa
       * hauteur (`--o-navh`, navmobile.jsx) inclut son rembourrage
       * `var(--o-safe-bottom) + 6px`. L'ajouter encore faisait flotter le
       * bandeau une trentaine de pixels trop haut. Le plus grand des deux :
       * la barre quand elle est là, la zone de sécurité seule sinon (audit du
       * 12/11, lot 4, R6). */
      style={{ position: 'fixed', left: '50%', bottom: 'calc(24px + max(var(--o-navh, 0px), var(--o-safe-bottom, 0px)))', transform: 'translateX(-50%)', zIndex: 9500,
        display: 'flex', alignItems: 'center', gap: 14, maxWidth: 'calc(100vw - 32px)', padding: '6px 6px 6px 18px', borderRadius: 999,
        background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', boxShadow: 'var(--o-shadow)', color: 'var(--o-text)', fontSize: 13.5, fontWeight: 700 }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{geste.texte}</span>
      <button type="button" onClick={() => { defaireAnnulable(geste); setGeste(null); setAnnonce(tr('Annulé')); }}
        style={{ flex: 'none', minHeight: 36, padding: '0 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, background: 'var(--o-accent-fond)', color: '#fff' }}>
        {tr('Annuler')}
      </button>
    </div>
  </>);
}
