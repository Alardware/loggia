/* Le plan dans la section Pieces de l'Accueil (chantier Plan 3D).
 *
 * Charge PARESSEUSEMENT par App.jsx : qui reste sur « Cartes » ne paie ni
 * three.js ni le modele. Ce fichier fait le lien entre l'Accueil et le plan :
 *   — quel plan : celui de l'etage choisi (sa puce), sinon « maison » ;
 *   — d'ou : la route authentifiee du composant, ou la maison de la demo ;
 *   — la teinte des sols : la zone de confort de la temperature (confort.js) ;
 *   — l'import (administrateur) et la liaison au toucher en mode edition.
 *
 * Tout l'etat partage vit dans la cle commune `loggia_plan3d` :
 *   { plans: { <etage>: { version, nom, taille, date } },   (ecrit par le serveur)
 *     liens: { <etage>: { <nom d'objet>: lien } } }          (ecrit ici)
 */
import { useState } from 'react';
import Plan3D, { chargeurServeur } from './plan3d.jsx';
import { FeuilleImportPlan, FeuilleLienPlan, changerLien } from './plan3dimport.jsx';
import { btnPrimaire, btnSecondaire } from './views/parcommun.jsx';
import { cfgVal, cfgSet } from './state.js';
import { verdictMesure } from './confort.js';   // la couleur de la zone, dans les deux generations de confort.js
import { tr } from './i18n.js';

const CLE = 'loggia_plan3d';
const enDemo = () => typeof window !== 'undefined' && !!window.__loggiaDemo;
const URL_DEMO = () => (import.meta.env && import.meta.env.BASE_URL ? import.meta.env.BASE_URL : '/') + 'demo/maison-demo.glb';

/** Une temperature en °C, quelle que soit l'unite du capteur. */
function celsius(hass, piece) {
  const live = piece && piece.live;
  if (!live || live.temp == null || !Number.isFinite(Number(live.temp))) return null;
  const st = hass && hass.states && live.tempId ? hass.states[live.tempId] : null;
  const unite = st && st.attributes && st.attributes.unit_of_measurement;
  const v = Number(live.temp);
  return unite === '°F' ? (v - 32) * 5 / 9 : v;
}

/**
 * @param pieces  les pieces de l'Accueil (celles de l'etage choisi)
 * @param etage   l'etage choisi (sa puce), ou null pour « Tous »
 * @param etages  [{ id, nom }] — les etages habites
 * @param zones   [{ id, name }] — les zones de HA, pour relier un objet
 */
export default function PlanPieces({ hass, pieces = [], etage = null, etages = [], zones = [], edition = false, admin = false, etroit = false, onPiece, onEntite }) {
  const [, relire] = useState(0);
  const [importer, setImporter] = useState(false);
  const [objet, setObjet] = useState(null);
  const demo = enDemo();
  const valeur = cfgVal(CLE, null) || {};
  const ici = etage || 'maison';
  const fiche = (valeur.plans || {})[ici] || null;
  const liens = (valeur.liens || {})[ici] || null;

  const vues = pieces.map((p) => {
    const t = celsius(hass, p);
    const z = t == null ? null : verdictMesure('temp', t);
    return { name: p.name, area: p.live && p.live.area, teinte: z ? z.c : null };
  });

  const charger = demo
    ? () => (ici === 'maison' ? fetch(URL_DEMO()).then((r) => r.arrayBuffer()) : Promise.reject(Object.assign(new Error('plan_absent'), { code: 'plan_absent' })))
    : chargeurServeur(hass, ici);

  const poserLien = (nom, lien) => {
    cfgSet({ [CLE]: changerLien(cfgVal(CLE, null), ici, nom, lien) });
    relire((n) => n + 1);
  };

  const peutImporter = admin && !demo;
  const boutonImport = peutImporter
    ? <button type="button" style={btnPrimaire} onClick={() => setImporter(true)}>{tr('Importer un plan')}</button>
    : <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text3)', maxWidth: 360 }}>{tr('Un administrateur peut importer le plan 3D de la maison.')}</span>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Plan3D hass={hass} charger={charger} cle={ici + ':' + ((fiche && fiche.version) || (demo ? 'demo' : '0'))}
        liens={liens} pieces={vues}
        edition={edition && admin} selection={objet && objet.nom}
        onPiece={onPiece} onEntite={onEntite} onObjet={setObjet} vide={boutonImport} />
      {edition && admin && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: '1 1 240px', fontSize: 12.5, fontWeight: 600, color: 'var(--o-text3)' }}>
            {tr('Touchez un objet du plan pour le relier à un appareil ou à une pièce.')}
          </span>
          {peutImporter && <button type="button" style={btnSecondaire} onClick={() => setImporter(true)}>{fiche ? tr('Remplacer le plan') : tr('Importer un plan')}</button>}
        </div>
      )}
      {importer && (
        <FeuilleImportPlan hass={hass} etage={ici} existe={!!fiche} pieces={vues}
          etages={etages.length ? [{ id: 'maison', name: tr('Toute la maison') }, ...etages.map((e) => ({ id: e.id, name: e.nom }))] : []}
          onClose={() => setImporter(false)} onFait={() => relire((n) => n + 1)} />
      )}
      {objet && (
        <FeuilleLienPlan hass={hass} objet={objet} zones={zones} onLien={poserLien} onClose={() => setObjet(null)} />
      )}
    </div>
  );
}
