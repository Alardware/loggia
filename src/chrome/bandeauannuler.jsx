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
  useEffect(() => {
    let t = 0;
    const sur = (e) => { clearTimeout(t); setGeste((e && e.detail) || null); t = setTimeout(() => setGeste(null), DUREE_ANNULER_MS); };
    window.addEventListener(EVENEMENT_ANNULABLE, sur);
    return () => { clearTimeout(t); window.removeEventListener(EVENEMENT_ANNULABLE, sur); };
  }, []);
  if (!geste) return null;
  return (
    <div role="status" data-annonce="" className="o-annuler"
      style={{ position: 'fixed', left: '50%', bottom: 'calc(24px + var(--o-navh, 0px) + var(--o-safe-bottom, 0px))', transform: 'translateX(-50%)', zIndex: 9500,
        display: 'flex', alignItems: 'center', gap: 14, maxWidth: 'calc(100vw - 32px)', padding: '6px 6px 6px 18px', borderRadius: 999,
        background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', boxShadow: 'var(--o-shadow)', color: 'var(--o-text)', fontSize: 13.5, fontWeight: 700 }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{geste.texte}</span>
      <button type="button" onClick={() => { defaireAnnulable(geste); setGeste(null); }}
        style={{ flex: 'none', minHeight: 36, padding: '0 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, background: 'var(--o-accent-fond)', color: '#fff' }}>
        {tr('Annuler')}
      </button>
    </div>
  );
}
