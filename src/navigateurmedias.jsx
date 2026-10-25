/* ── Le navigateur de médias et les favoris de lecture (chantier Médias, § 10 : la place au démarrage) ──
 *
 * Ce que CE lecteur sait jouer (`media_player/browse_media`), la seconde feuille
 * de la fiche d'un lecteur ; et les favoris de lecture, rangés PAR LECTEUR dans
 * le navigateur de l'utilisateur. Tout cela vivait dans App.jsx, donc au
 * démarrage, alors que seule la fiche d'un lecteur — chargée à la demande —
 * l'emploie. Il vit ici, dans le même morceau que la fiche (fichemedia.jsx
 * l'importe), et n'importe jamais App.jsx. Rien ne change à l'écran.
 */
import { useState, useEffect } from 'react';
import { tr } from './i18n.js';
import { BottomSheet, NomFeuille, CroixFeuille, Fi } from './ui.jsx';
import { Ico } from './icones.jsx';
import { entreeFavorite, memeFavori, basculerFavori } from './favlecture.js';

/* Les favoris de lecture se rangent PAR LECTEUR, et dans le navigateur de
 * celui qui regarde : un `media_content_id` est propre à l'intégration qui l'a
 * émis, et ce classement est une commodité personnelle — son absence ne casse
 * rien, comme pour les dernières applications lancées. */
const CLE_FAVLECTURE = 'loggia_favlecture';
export function favorisLecture(cle) {
  try {
    const table = JSON.parse(localStorage.getItem(CLE_FAVLECTURE) || '{}');
    const v = table && typeof table === 'object' ? table[cle] : null;
    return Array.isArray(v) ? v.filter(x => x && typeof x.i === 'string' && typeof x.c === 'string') : [];
  } catch { return []; }
}
export function noterFavori(cle, entree) {
  const suite = basculerFavori(favorisLecture(cle), entree);
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_FAVLECTURE) || '{}');
    const table = (brut && typeof brut === 'object' && !Array.isArray(brut)) ? brut : {};
    if (suite.length) table[cle] = suite; else delete table[cle];
    localStorage.setItem(CLE_FAVLECTURE, JSON.stringify(table));
  } catch { /* stockage plein ou refusé : on perd le raccourci, pas la lecture */ }
  return suite;
}

/* Le navigateur de medias : ce que CE lecteur sait jouer.
 *
 * Home Assistant expose l'arbre par lecteur — un Chromecast propose les
 * sources partagees (radios, fichiers locaux), un Apple TV ses applications.
 * On ne devine donc rien : on demande au lecteur, et on affiche ce qu'il
 * repond. Un lecteur qui ne sait rien proposer le DIT, plutot que de montrer
 * une liste vide qu'on prendrait pour un chargement sans fin.
 *
 * Deux gestes seulement : ouvrir un dossier, lancer un media. Le reste — les
 * files d'attente, les melanges — appartient au lecteur, pas au tableau de
 * bord.
 */
export const MEDIA_ICONES = {
  music: 'music-alt', album: 'album', artist: 'music', playlist: 'list',
  podcast: 'podcast', tv_show: 'tv', movie: 'film', video: 'film',
  image: 'picture', directory: 'folder', channel: 'radio', app: 'play',
};

export default function NavigateurMedias({ id, hass, onClose }) {
  const nom = (((hass && hass.states && hass.states[id]) || {}).attributes || {}).friendly_name || id;
  /* La pile : chaque niveau garde de quoi le redemander. Revenir en arriere
   * relit plutot que de conserver l'arbre entier en memoire — un lecteur peut
   * offrir des milliers de radios. */
  const [pile, setPile] = useState([{ titre: nom, cid: undefined, ctype: undefined }]);
  const [contenu, setContenu] = useState(null);
  const [etat, setEtat] = useState('charge');   // charge | pret | vide | erreur
  const [envoi, setEnvoi] = useState(null);
  const [favoris, setFavoris] = useState(() => favorisLecture(id));

  const niveau = pile[pile.length - 1];
  useEffect(() => {
    let mort = false;
    setEtat('charge'); setContenu(null);
    (async () => {
      try {
        if (!hass || !hass.callWS) { if (!mort) setEtat('erreur'); return; }
        const r = await hass.callWS({
          type: 'media_player/browse_media', entity_id: id,
          ...(niveau.cid ? { media_content_id: niveau.cid, media_content_type: niveau.ctype } : {}),
        });
        if (mort) return;
        const enfants = (r && r.children) || [];
        setContenu(enfants);
        setEtat(enfants.length ? 'pret' : 'vide');
      } catch { if (!mort) setEtat('erreur'); }
    })();
    return () => { mort = true; };
  }, [id, niveau.cid, niveau.ctype]);

  const ouvrir = (c) => {
    if (c.can_expand) { setPile(p => p.concat({ titre: c.title, cid: c.media_content_id, ctype: c.media_content_type })); return; }
    if (!c.can_play) return;
    setEnvoi(c.media_content_id);
    /* Pas de `try/catch` : il n'attraperait rien. `callService` rend une
     * promesse, et un refus la rejette plus tard, hors de portée d'un bloc
     * synchrone. Le rejet remonte à l'écoute globale, qui affiche « Commande
     * non exécutée » — c'est bien le lecteur qui dit s'il a refusé, mais par ce
     * chemin-là, pas par un `catch` qui ne voit jamais rien passer. */
    hass.callService('media_player', 'play_media', {
      entity_id: id, media_content_id: c.media_content_id, media_content_type: c.media_content_type,
    });
    // Le retour visuel dure le temps qu'il faut pour que l'oeil le voie ; ce
    // n'est pas une mesure du lancement, que Home Assistant ne raconte pas.
    setTimeout(() => setEnvoi(v => (v === c.media_content_id ? null : v)), 1400);
  };
  const remonter = () => setPile(p => (p.length > 1 ? p.slice(0, -1) : p));

  const btnRond = { width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--o-s1)', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
  const message = { fontSize: 13, fontWeight: 600, color: 'var(--o-text1)', opacity: .82, padding: '22px 4px', textAlign: 'center' };
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          {pile.length > 1 && (
            <button onClick={remonter} aria-label={tr('Revenir')} style={btnRond}>
              <Fi i="angle-left" size={14} />
            </button>
          )}
          <span style={{ flex: 1, minWidth: 0 }}>
            <NomFeuille><span style={{ display: 'block', fontSize: 15, fontWeight: 800, letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{niveau.titre}</span></NomFeuille>
            {pile.length > 1 && <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--o-text1)', opacity: .82, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pile.slice(0, -1).map(x => x.titre).join(' · ')}</span>}
          </span>
          <CroixFeuille />
        </div>

        {etat === 'charge' && <div style={message}>{tr('Chargement…')}</div>}
        {etat === 'erreur' && <div style={message}>{tr('Ce lecteur ne propose rien à parcourir.')}</div>}
        {etat === 'vide' && <div style={message}>{tr('Dossier vide')}</div>}
        {etat === 'pret' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '58vh', overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
            {contenu.map((c, i) => {
              const jouable = !c.can_expand && c.can_play;
              const parti = envoi === c.media_content_id;
              const utile = c.can_expand || c.can_play;
              /* L'étoile ne peut pas vivre DANS la rangée : un bouton dans un
                * bouton n'est pas du HTML valide, et le clavier n'en atteindrait
                * qu'un seul. La rangée est donc une boîte, et les deux gestes y
                * sont côte à côte. */
              const gardable = entreeFavorite(c);
              const garde = !!gardable && favoris.some(x => memeFavori(x, gardable));
              return (
                <div key={(c.media_content_id || '') + i}
                  style={{ display: 'flex', alignItems: 'center', borderRadius: 13, overflow: 'hidden',
                    background: parti ? 'rgba(var(--o-accent-rgb),.16)' : 'var(--o-s1)', transition: 'background .2s' }}>
                <button onClick={() => ouvrir(c)} disabled={!utile}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', minHeight: 52,
                    border: 'none', background: 'transparent', color: 'var(--o-text1)',
                    cursor: utile ? 'pointer' : 'default', textAlign: 'left', flex: 1, minWidth: 0,
                    opacity: utile ? 1 : .55 }}>
                  {/* La vignette quand elle existe : une pochette reconnait un
                    * album plus vite que son titre. */}
                  {c.thumbnail
                    ? <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, backgroundImage: `url("${c.thumbnail}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    : <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Fi i={MEDIA_ICONES[c.media_class] || (c.can_expand ? 'folder' : 'music-alt')} size={14} />
                    </span>}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  {c.can_expand
                    ? <Fi i="angle-right" size={13} style={{ opacity: .65, flexShrink: 0 }} />
                    : jouable ? <Fi i="play" size={12} style={{ flexShrink: 0 }} /> : null}
                </button>
                {gardable && (
                  <button onClick={() => setFavoris(noterFavori(id, gardable))} aria-pressed={garde}
                    aria-label={garde ? tr('Retirer des favoris') : tr('Ajouter aux favoris')}
                    title={garde ? tr('Retirer des favoris') : tr('Ajouter aux favoris')}
                    style={{ width: 44, alignSelf: 'stretch', border: 'none', background: 'transparent', cursor: 'pointer',
                      color: garde ? 'var(--o-gold)' : 'var(--o-text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ico name="star" size={14} />
                  </button>
                )}
                </div>
              );
            })}
          </div>
        )}
      </>)}
    </BottomSheet>
  );
}
