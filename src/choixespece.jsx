/* ── L'espèce d'une plante, dans sa fiche (ADR 0390) ─────────────────────────────────────────────────────────────────────────
 *
 * Chargé avec la fiche de la plante (ficheplante.jsx), jamais au démarrage.
 *  - `RangeeEspece` : la rangée « Espèce » de la fiche — la photo de l'espèce si Open Plantbook en a une, son nom, d'où viennent ses
 *    seuils. Elle n'existe que si l'espèce se choisit ici (l'intégration `openplantbook` publie `search` et `get`, règle 46) ou si la
 *    plante en a déjà une (gardée par Loggia, ou connue de Plant Monitor). Un compte ordinaire la lit ; un appui lui dit le refus,
 *    qui nomme la clé (la règle des prises, P4) : l'espèce est la configuration de la MAISON (`loggia_plants`).
 *  - `FeuilleEspece` : la recherche, par-dessus la fiche — un champ et « Chercher » (pas un appel par frappe : Open Plantbook compte
 *    les recherches), la liste trouvée, l'espèce de la plante en bleu plein ; un appui lit ses seuils (`get`) et les garde. « Revenir
 *    aux repères généraux » retire l'espèce.
 */
import { useState, useRef, useEffect } from 'react';
import { tr } from './i18n.js';
import { Fi, BottomSheet, TitreFeuille, cvInp } from './ui.jsx';
import { puce } from './styles.js';
import { cfgSet, compteOrdinaire, LOGGIA_INDEX } from './state.js';
import { raisonEchec } from './refus.js';
import { filet } from './fichecommune.jsx';
import { PANNEAU, RANGEE_SERREE, EN_BOUTON, TITRE, SOUS, ALERTE } from './fichekit.js';
import { CLE_PLANTES, plantbookDisponible, chercherEspeces, lireEspece, poserEspece, genreErreur } from './especes.js';
import { imageEspece } from './plantes.js';

const ERREURS = () => ({ limite: tr('Open Plantbook limite les recherches : réessayez dans un moment.'),
  panne: tr('Open Plantbook ne répond pas. Ses identifiants se règlent dans Home Assistant.') });
const refusMaison = () => raisonEchec(Object.assign(new Error('Unauthorized'), { code: 'unauthorized' }), CLE_PLANTES);
// Choisi : bleu plein, texte blanc — la puce choisie (règle 17), jamais une couleur écrite ici.
const CHOISI = puce(true);

/** L'espèce se choisit-elle d'ici ? Open Plantbook publie ses deux actions. */
const especeChoisissable = (hass) => plantbookDisponible(hass, LOGGIA_INDEX);

/**
 * La rangée « Espèce » de la fiche. `pl` : la plante lue (`lirePlante`) — `espece` (`{ pid, nom, image }`, `pid` nul quand Plant
 * Monitor la connaît seul) et `source` des plages ('espece', 'plantmonitor', null). `onChoisir` ouvre la recherche. Rien quand il n'y a
 * ni espèce, ni seuils de Plant Monitor, ni Open Plantbook.
 */
export function RangeeEspece({ pl, hass, onChoisir }) {
  const [refus, setRefus] = useState('');
  const [photoKo, setPhotoKo] = useState(null);
  const espece = pl.espece || null;
  const choisissable = especeChoisissable(hass);
  if (!espece && !pl.source && !choisissable) return null;
  // L'image se garde aussi à l'affichage : celle de Plant Monitor (`entity_picture`) ne passe pas par `especeValide`.
  const image = espece ? imageEspece(espece.image) : null;
  const photo = image && photoKo !== image;
  const titre = espece ? espece.nom : choisissable ? tr('Choisir l’espèce') : tr('Seuils de Plant Monitor');
  // Plant Monitor sans espèce et sans Open Plantbook : le titre le dit déjà.
  const sous = pl.source === 'espece' ? tr('Ses seuils viennent d’Open Plantbook')
    : pl.source === 'plantmonitor' ? (espece || choisissable ? tr('Ses seuils viennent de Plant Monitor') : null)
      : espece ? tr('Open Plantbook ne donne pas ses seuils : repères généraux') : tr('Ses seuils remplaceront les repères généraux');
  const corps = (<>
    {photo
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- `onError` n'est pas un geste : une photo qui ne vient pas laisse la place à la feuille
      ? <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setPhotoKo(image)} data-photo=""
        style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover', flexShrink: 0, background: 'var(--o-s1)' }} />
      : <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--o-ok-rgb),.14)', color: 'var(--o-ok)' }}><Fi i="leaf" size={17} /></span>}
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ ...TITRE, fontStyle: espece && espece.pid ? 'italic' : undefined, overflowWrap: 'break-word' }}>{titre}</span>
      {sous && <span style={SOUS}>{sous}</span>}
    </span>
    {choisissable && <Fi i="angle-small-right" size={16} color="var(--o-text3)" />}
  </>);
  const style = { ...RANGEE_SERREE, minHeight: 64 };
  if (!choisissable) return <div data-espece="" style={{ ...PANNEAU, overflow: 'hidden' }}><div style={style}>{corps}</div></div>;
  const ordinaire = compteOrdinaire(hass);
  return (
    <div data-espece="" style={{ ...PANNEAU, overflow: 'hidden' }}>
      <button type="button" aria-haspopup={ordinaire ? undefined : 'dialog'} aria-disabled={ordinaire ? 'true' : undefined}
        onClick={() => { if (ordinaire) setRefus(refusMaison()); else onChoisir(); }}
        style={{ ...style, ...EN_BOUTON, ...(ordinaire ? { cursor: 'default' } : null) }}>{corps}</button>
      {refus && <div role="alert" style={{ ...ALERTE, padding: '0 14px 12px 16px' }}>{refus}</div>}
    </div>
  );
}

/**
 * La recherche de l'espèce, par-dessus la fiche. `pl` : la plante (sa `base` est la clé de sa ligne dans `loggia_plants`) ; `onFini`
 * dit que l'espèce a changé — la coquille relit la plante — ; `onClose` ferme.
 */
export function FeuilleEspece({ pl, hass, onClose, onFini = null }) {
  const [texte, setTexte] = useState('');
  const [rech, setRech] = useState({ q: '', liste: null, attente: false, erreur: '' });
  const [lu, setLu] = useState({ pid: null, erreur: '' });
  const vivant = useRef(true);
  // Remis à vrai au montage : le double montage du mode strict passe par un démontage.
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  const actuelle = pl.espece && pl.espece.pid;
  const chercher = (e) => {
    e.preventDefault();
    const q = texte.trim();
    // Une seule chose à la fois : une espèce en lecture ne se laisse pas doubler par une recherche, ni l'inverse.
    if (!q || rech.attente || lu.pid) return;
    setRech({ q, liste: null, attente: true, erreur: '' });
    setLu({ pid: null, erreur: '' });
    chercherEspeces(hass, q).then((liste) => { if (vivant.current) setRech({ q, liste, attente: false, erreur: '' }); },
      (err) => { if (vivant.current) setRech({ q, liste: null, attente: false, erreur: ERREURS()[genreErreur(err)] }); });
  };
  /* Écrire la ligne de CETTE plante seulement, sur ce qui est là (`cfgSet` et une fonction) : une autre plante réglée ailleurs
   * entre-temps n'est pas écrasée. Un refus du composant se dit ici ; sinon la feuille se ferme sur la plante relue. */
  const garder = (espece) => cfgSet({ [CLE_PLANTES]: (brut) => poserEspece(brut, pl.base, espece) }).then((pris) => {
    if (!vivant.current) return;
    if (pris === false) { setLu({ pid: null, erreur: refusMaison() }); return; }
    if (onFini) onFini();
    onClose();
  });
  const choisir = (r) => {
    if (lu.pid || rech.attente) return;
    setLu({ pid: r.pid, erreur: '' });
    lireEspece(hass, r.pid).then((espece) => {
      if (!vivant.current) return undefined;
      if (!espece) { setLu({ pid: null, erreur: tr('Open Plantbook ne connaît pas cette espèce.') }); return undefined; }
      return garder(espece);
    }, (err) => { if (vivant.current) setLu({ pid: null, erreur: ERREURS()[genreErreur(err)] }); });
  };
  const liste = rech.liste || [];
  const vide = !!rech.liste && !liste.length;
  const etat = rech.attente ? tr('Recherche…') : rech.erreur || (vide ? tr('Aucune espèce trouvée pour « {q} ».', { q: rech.q }) : '');
  const inactif = !texte.trim() || rech.attente || !!lu.pid;
  return (
    <BottomSheet onClose={onClose}>
      {() => (
        <div data-feuille-espece="" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TitreFeuille>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{tr('Choisir l’espèce')}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{pl.name}</div>
          </TitreFeuille>
          <form role="search" onSubmit={chercher} style={{ display: 'flex', gap: 8 }}>
            <input type="search" value={texte} onChange={(e) => setTexte(e.target.value)} enterKeyHint="search" spellCheck={false} autoComplete="off"
              aria-label={tr('Rechercher une espèce')} placeholder={tr('Nom commun ou latin')} style={{ ...cvInp, flex: 1, minWidth: 0, minHeight: 44 }} />
            <button type="submit" disabled={inactif}
              style={{ ...CHOISI, minHeight: 44, padding: '0 16px', borderRadius: 14, fontSize: 14, ...(inactif ? { opacity: .5, cursor: 'default' } : null) }}>{tr('Chercher')}</button>
          </form>
          {etat && <div role="status" style={{ ...SOUS, marginTop: 0, padding: '0 4px', color: rech.erreur ? 'var(--o-bad)' : SOUS.color }}>{etat}</div>}
          {lu.erreur && <div role="alert" style={{ ...ALERTE, padding: '0 4px' }}>{lu.erreur}</div>}
          {liste.length > 0 && (
            <div role="list" style={{ ...PANNEAU, overflow: 'hidden' }}>
              {liste.map((r, i) => {
                const choisie = r.pid === actuelle;
                const enLecture = lu.pid === r.pid;
                return (
                  <div role="listitem" key={r.pid}>
                    <button type="button" aria-current={choisie ? 'true' : undefined} onClick={() => choisir(r)} disabled={!!lu.pid && !enLecture}
                      style={{ ...RANGEE_SERREE, ...EN_BOUTON, minHeight: 52, borderTop: filet(i), ...(choisie ? { background: CHOISI.background, color: CHOISI.color } : null) }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ ...TITRE, fontStyle: 'italic', overflowWrap: 'break-word' }}>{r.nom}</span>
                        {enLecture && <span style={{ ...SOUS, color: choisie ? CHOISI.color : SOUS.color }}>{tr('Lecture de ses seuils…')}</span>}
                      </span>
                      {choisie && <Fi i="check" size={16} color={CHOISI.color} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {actuelle && (
            <div style={{ ...PANNEAU, overflow: 'hidden' }}>
              <button type="button" onClick={() => garder(null)} style={{ ...RANGEE_SERREE, ...EN_BOUTON, minHeight: 48, flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
                <span style={TITRE}>{tr('Revenir aux repères généraux')}</span>
                <span style={SOUS}>{tr('Sans espèce, la plante se juge sur des repères communs à toutes.')}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
