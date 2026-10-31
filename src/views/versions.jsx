/* « Versions précédentes » (29/10, ADR 0285) : une ligne du panneau
 * Installation de Paramètres › À propos, à côté d’Exporter et d’Importer.
 *
 * Elle montre les copies que le composant garde avant les écritures : leur
 * date (« il y a 2 h », sinon le jour et l’heure), le compte dont
 * l’enregistrement a suivi, et « Revenir à celle-ci » — confirmé en deux
 * temps comme la remise à zéro, puis Loggia se recharge comme après un import.
 * Des lignes du panneau, jamais des cartes dans le panneau.
 */
import { useState, useEffect, useRef } from 'react';
import { tr } from '../i18n.js';
import { Ligne, btnDanger, btnSecondaire } from './parcommun.jsx';
import { listerVersions, rendreVersion, quandVersion, motifVersion, texteVersion } from '../versions.js';

const ARME = { ...btnDanger, background: 'var(--o-bad)', color: '#fff' };

/** Le composant : la page de Home Assistant, ou la démo — celui que Paramètres reçoit. */
const pontDe = (hass) => (hass && typeof hass.callWS === 'function' ? hass : null);

/** L’affichage seul : ce qu’un premier rendu montre, sans aller au serveur. */
export function ListeVersions({ etat, arme = null, enCours = null, onChoisir = () => {}, maintenant = Date.now() }) {
  const desc = etat.erreur ? etat.erreur
    : !etat.charge ? tr('Lecture…')
      : etat.liste.length ? tr('Une copie de toute la configuration, gardée avant chaque série de réglages — au plus une par quart d’heure, les dix dernières.')
        : tr('Aucune copie pour l’instant : la première se fera au prochain enregistrement.');
  return (
    <>
      <Ligne titre={tr('Versions précédentes')} desc={desc} />
      {etat.liste.map((v) => (
        <Ligne key={v.id} retrait titre={quandVersion(v.date, maintenant)} desc={motifVersion(v)}>
          <button type="button" disabled={enCours != null} onClick={() => onChoisir(v.id)}
            style={arme === v.id || enCours === v.id ? ARME : btnSecondaire}>
            {enCours === v.id ? tr('Retour…') : arme === v.id ? tr('Confirmer ?') : tr('Revenir à celle-ci')}
          </button>
        </Ligne>
      ))}
    </>
  );
}

/** La ligne branchée au composant. `motif` : la phrase d’un échec (parametres.jsx, `motifEchec`) ; `alerter` : la
 * feuille d’alerte (ui.jsx), prêtée par Paramètres — l’importer ici ferait exporter un nom de plus au démarrage. */
export function VersionsPrecedentes({ hass, motif, alerter }) {
  const [etat, setEtat] = useState({ charge: false, liste: [], erreur: null });
  const [arme, setArme] = useState(null);
  const [enCours, setEnCours] = useState(null);
  /* `hass` change à chaque état d’entité : la liste se lit une fois, à
   * l’ouverture d’À propos, pas à chaque lampe qui s’allume. */
  const courant = useRef({ hass, motif });
  courant.current = { hass, motif };

  useEffect(() => {
    let vivant = true;
    const h = pontDe(courant.current.hass);
    if (!h) { setEtat({ charge: true, liste: [], erreur: tr('Home Assistant n’est pas joignable.') }); return undefined; }
    listerVersions(h)
      .then((liste) => { if (vivant) setEtat({ charge: true, liste, erreur: null }); })
      .catch((err) => {
        if (!vivant) return;
        // Un composant mis à jour sans redémarrage ne connaît pas encore la commande.
        const erreur = err && err.code === 'unknown_command'
          ? tr('Les versions précédentes ne répondent pas : Home Assistant doit être redémarré après la mise à jour.')
          : texteVersion(err) || courant.current.motif(err);
        setEtat({ charge: true, liste: [], erreur });
      });
    return () => { vivant = false; };
  }, []);
  useEffect(() => { if (!arme) return undefined; const t = setTimeout(() => setArme(null), 4000); return () => clearTimeout(t); }, [arme]);

  const choisir = async (id) => {
    if (arme !== id) { setArme(id); return; }
    const h = pontDe(hass);
    setArme(null);
    setEnCours(id);
    try {
      if (!h) throw new Error('hors ligne');
      await rendreVersion(h, id);
    } catch (err) {
      setEnCours(null);
      // Un refus porte un code : rien n'a été écrit. Une connexion perdue n'en porte pas.
      const x = texteVersion(err) || motif(err);
      alerter({ titre: tr('Versions précédentes'), texte: err && typeof err.code === 'string'
        ? tr('Retour refusé par Home Assistant : {x}. La configuration de la maison n’a pas été touchée.', { x })
        : tr('Retour interrompu : {x}. Rechargez la page pour voir la configuration en place.', { x }) });
      return;
    }
    window.location.reload();
  };

  return <ListeVersions etat={etat} arme={arme} enCours={enCours} onChoisir={choisir} />;
}
