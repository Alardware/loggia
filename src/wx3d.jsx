// Fond météo de l'Accueil : l'hôte React du ciel <loggia-ciel> (src/ciel.js).
// Le ciel lui-même — shader, particules, qualité auto — vient du handoff
// « Loggia themes redesign » (17/10/2026) et vit dans ciel.js ; ici, seulement
// ce que Loggia lui passe : la condition de Home Assistant, l'heure, le vrai
// lever et le vrai coucher, la qualité choisie sur CET appareil, la hauteur de
// l'en-tête (le soleil et la lune restent dessous) et les cartes sur lesquelles
// la pluie rebondit.
import { useEffect, useState } from 'react';
import { lireQualiteCiel, EVT_QUALITE_CIEL } from './wxpresets.js';
import './ciel.js';

/* Les cartes dont le haut reçoit les gouttes (« plocs » de la maquette, posés
 * sur ses `.o-hov`) : scénarios, pièces, widgets du rail. Les tuiles de la
 * bannière n'en sont pas, comme dans la maquette. */
const PLOC = '.grid-qscenes > button, .o-piece, .o-rail-col > *';

export default function WeatherGL({ condition = 'partlycloudy', heure = null, lever = null, coucher = null, sombre = false }) {
  const [qualite, setQualite] = useState(lireQualiteCiel);
  const [marge, setMarge] = useState(0);
  useEffect(() => {
    const relis = () => setQualite(lireQualiteCiel());
    window.addEventListener(EVT_QUALITE_CIEL, relis);
    return () => window.removeEventListener(EVT_QUALITE_CIEL, relis);
  }, []);
  useEffect(() => {
    const hdr = document.querySelector('.loggia-hdr');
    if (!hdr) return undefined;
    const lis = () => setMarge(Math.round(hdr.getBoundingClientRect().height));
    lis();
    const ro = new ResizeObserver(lis);
    ro.observe(hdr);
    return () => ro.disconnect();
  }, []);
  /* Ciel sombre (la nuit, l'orage) : en thème clair, la maquette passe en
   * blanc les titres de section posés SUR le ciel, et eux seuls — « Pièces »,
   * plus bas, reste sur le fond clair. L'ordre des sections se règle : on
   * mesure donc lesquelles sont dans le haut du ciel, et on le refait quand
   * l'Accueil change de taille. Le CSS n'en tient compte qu'en thème clair. */
  useEffect(() => {
    const contenu = document.querySelector('.loggia-content');
    const ciel = document.querySelector('.o-wx3d');
    const lignes = () => [...document.querySelectorAll('.loggia-content h2')].map((h) => h.parentElement);
    if (!sombre || !contenu || !ciel) { lignes().forEach((l) => l.classList.remove('o-sur-ciel')); return undefined; }
    const marque = () => {
      // Le ciel clair de nuit reste aux trois quarts sombre jusqu'à 85 % de sa hauteur (mesuré dans la démo).
      const c = ciel.getBoundingClientRect(), lim = c.top + c.height * 0.85;
      lignes().forEach((l) => { const r = l.getBoundingClientRect(); l.classList.toggle('o-sur-ciel', (r.top + r.bottom) / 2 < lim); });
    };
    marque();
    const ro = new ResizeObserver(marque);
    ro.observe(contenu);
    return () => { ro.disconnect(); lignes().forEach((l) => l.classList.remove('o-sur-ciel')); };
  }, [sombre]);
  return (
    <loggia-ciel aria-hidden="true" meteo={condition} heure={heure == null ? 'auto' : String(heure)}
      lever={lever == null ? undefined : String(lever)} coucher={coucher == null ? undefined : String(coucher)}
      qualite={qualite} data-ploc={PLOC} data-marge-haut={String(marge)} />
  );
}
