/* « Une nouvelle version de Loggia est installée » (03/11).
 *
 * Une mise à jour (HACS, ou une installation à la main) remplace les fichiers,
 * mais un écran déjà ouvert garde l'ancienne version en mémoire jusqu'à ce
 * qu'on le recharge — une tablette murale, jamais. Le 03/11, une installation
 * pourtant faite ne se voyait pas : l'écran montrait encore l'ancienne.
 *
 * L'écran connaît le boot qu'il a chargé : `index.html` le nomme
 * (`<link rel="modulepreload" … boot-<empreinte>.js>`), et l'empreinte change
 * à chaque construction. Il relit `index.html` sur le serveur, sans cache, à
 * son retour au premier plan et tous les quarts d'heure : un autre boot, c'est
 * une autre version. Rien côté composant, rien qui sorte de la maison. Sans
 * boot nommé (le serveur de développement), il ne regarde pas. */
import { useState, useEffect } from 'react';
import { tr } from './i18n.js';

/** Le nom du boot que nomme un `index.html` (ou une adresse), sinon null. */
export function bootDe(texte) {
  const m = /boot-[A-Za-z0-9_-]+\.js/.exec(String(texte || ''));
  return m ? m[0] : null;
}

/** Le boot que CET écran a chargé, lu dans sa page. */
export function bootCharge(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || !doc.querySelector) return null;
  const el = doc.querySelector('link[href*="boot-"], script[src*="boot-"]');
  return el ? bootDe(el.getAttribute('href') || el.getAttribute('src')) : null;
}

/** Le boot que le serveur sert maintenant : `index.html` relu sans cache. null si la lecture échoue. */
export async function bootServi(lire = (u, o) => fetch(u, o)) {
  try {
    const r = await lire('./index.html', { cache: 'no-store' });
    if (!r || !r.ok) return null;
    return bootDe(await r.text());
  } catch { return null; }
}

/** Une autre version est-elle installée ? Seulement quand les deux noms sont connus et diffèrent. */
export const autreVersion = (ici, la) => !!(ici && la && ici !== la);

const QUART_HEURE = 15 * 60000;

function useNouvelleVersion() {
  const [nouvelle, setNouvelle] = useState(false);
  useEffect(() => {
    const ici = bootCharge();
    if (!ici || typeof window === 'undefined') return undefined;
    let fini = false;
    const regarder = async () => {
      if (fini || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
      const la = await bootServi();
      if (!fini && autreVersion(ici, la)) setNouvelle(true);
    };
    const auRetour = () => { if (document.visibilityState === 'visible') regarder(); };
    const iv = setInterval(regarder, QUART_HEURE);
    document.addEventListener('visibilitychange', auRetour);
    window.addEventListener('online', regarder);
    return () => { fini = true; clearInterval(iv); document.removeEventListener('visibilitychange', auRetour); window.removeEventListener('online', regarder); };
  }, []);
  return nouvelle;
}

/** La pastille, en bas au centre, au-dessus de la barre de navigation (et de la pastille de la démo). « Plus tard » la ferme jusqu'au prochain chargement.
 *  Centrée par `left`/`right` et `fit-content` : `left: 50%` limitait sa largeur à la moitié de l'écran, et elle passait sur deux lignes. */
export function NouvelleVersion() {
  const nouvelle = useNouvelleVersion();
  const [plusTard, setPlusTard] = useState(false);
  if (!nouvelle || plusTard) return null;
  const bouton = { border: 'none', borderRadius: 999, padding: '7px 14px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' };
  return (
    <div role="status" className="o-nouvelle-version"
      style={{ position: 'fixed', left: 16, right: 16, marginInline: 'auto', width: 'fit-content', bottom: 'calc(48px + var(--o-navh, 0px))', zIndex: 9000, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center', boxSizing: 'border-box',
        padding: '8px 8px 8px 16px', borderRadius: 999, background: 'color-mix(in srgb, var(--o-accent) 16%, var(--o-bg))', border: '1px solid rgba(var(--o-accent-rgb),.45)', boxShadow: 'var(--o-shadow)', color: 'var(--o-text)' }}>
      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{tr('Une nouvelle version de Loggia est installée.')}</span>
      <button type="button" onClick={() => setPlusTard(true)} style={{ ...bouton, background: 'transparent', color: 'var(--o-text2)' }}>{tr('Plus tard')}</button>
      <button type="button" onClick={() => window.location.reload()} style={{ ...bouton, background: 'var(--o-accent-fond)', color: '#fff' }}>{tr('Recharger')}</button>
    </div>
  );
}
