/* La Bibliothèque des cartes, chargée à la demande.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useMemo } from 'react';
import { Fi } from '../ui.jsx';
import { HorlogeRail, Co2Rail } from '../widgetsrail.jsx';
import { LISERE } from '../styles.js';
import { tr } from '../i18n.js';
import { dec } from '../app/noyau.jsx';
import { RM_ICO, RM_NAME, RM_SUB } from '../cartes/briques.jsx';
import { RoomFeederCard, biblioDistributeur } from '../cartes/distributeur.jsx';
import { RoomPlantCard } from '../cartes/plante.jsx';
import { useDomainCards } from '../appareils/fiches.jsx';
import { CV_CADRE, CvCard, CameraTile, CAMERAS, CvAlarm, CvSirene } from '../cartescustom/cartes.jsx';
import { OUTILS_VUES } from '../outilsvues.js';

// Emprunté au monolithe (outilsvues.js) : App.jsx le pose avant le premier rendu.
const {
  CarteAttention, CarteScenario, CvActivite, CvAir, CvBigSensor, CvCalendrier, CvCamera, CvCarte, CvChip, CvChips, CvClock,
  CvEnergie, CvHistory, CvOuvrants, CvPerson, CvPresence, CvWeather, PieceCard, biblioStates
} = OUTILS_VUES;

/* ── Briques d'affichage, au niveau du module ────────────────────────────────
 *
 * Elles vivaient dans le corps de leur composant. Une fonction declaree la est
 * recreee a chaque rendu : React voit un type different au meme endroit et
 * remonte tout le sous-arbre — l'ancien noeud est jete, un neuf prend sa place.
 *
 * Aucune de celles-ci n'entoure de champ de saisie, donc rien ne se voyait :
 * c'est un champ qui rend la faute visible, en perdant son focus a chaque
 * lettre. Le gaspillage, lui, etait bien la — `Item` est employe quarante-huit
 * fois dans la Bibliotheque, et toute transition CSS en cours repartait de
 * zero a chaque rendu du parent.
 *
 * `rad` devient RAD pour la meme raison qu'il monte : un autre composant du
 * fichier declare son propre `rad`, et une constante de module masquee par une
 * locale du meme nom se lit mal.
 *
 * Voir `tests/composants.test.mjs`.
 */

const Titre = ({ i, c, t }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '26px 0 12px' }}>
    <Fi i={i} size={16} color={c} />
    <span style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 500 }}>{t}</span>
  </div>
);

/* Chaque exemplaire vit dans un gabarit à hauteur FIXE, comme dans les
 * vraies grilles : compacte = 88 px, standard = 184 px. La vitrine montre
 * exactement ce que les vues montreront. */
const Item = ({ l, w = 250, h = 184, children }) => (
  <div style={{ width: w, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--o-text3)', textTransform: 'uppercase' }}>{l}</span>
    <div className="o-bibitem" style={{ minWidth: 0, height: h }}>{children}</div>
  </div>
);

const Rangee = ({ children }) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>{children}</div>;
/* Électroménager : cycle en cours — progression, fin prévue, consommation.
 * À PROPS pour l'instant (biblio) : le branchement config viendra. */
function ApplianceCard({ nom, etat, pct, restant, fin, conso, chip = false }) {
  if (chip) {
    return (
      <div className="o-piece o-cvdense" style={{ position: 'relative', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 14px', borderRadius: 'var(--o-radius,18px)', background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: LISERE, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))' }}>
        <div className="o-cvrow" style={{ display: 'flex', alignItems: 'center' }}>
          <span className="o-cvico" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--o-purple-rgb),.16)', color: 'var(--o-purple)' }}><Fi i="soap" size={15} /></span>
          <div className="o-cvtxt">
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-purple)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{etat}</div>
          </div>
          {restant && <span style={{ fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{restant}</span>}
        </div>
      </div>
    );
  }
  const tuile = (l, v) => v != null && (
    <div style={{ flex: 1, minWidth: 0, padding: '5px 9px', borderRadius: 10, background: 'var(--o-s1)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--o-text3)' }}>{l}</div>
      <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>{v}</div>
    </div>
  );
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', minHeight: 172, overflow: 'hidden' }}>
      {/* Gabarit maison : icône hg, temps restant hd, TITRE SOUS L'ICÔNE. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={RM_ICO('rgba(var(--o-purple-rgb),.16)', 'var(--o-purple)')}><Fi i="soap" size={16} /></span>
        {restant && <span style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, color: 'var(--o-purple)' }}>{restant}</span>}
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={RM_NAME}>{nom}</div>
        <div style={{ ...RM_SUB, color: 'var(--o-purple)' }}>{etat}</div>
        <div style={{ height: 5, borderRadius: 4, background: 'var(--o-bd1)', margin: '7px 0 7px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: Math.min(100, pct || 0) + '%', background: 'var(--o-purple)', borderRadius: 4, transition: 'width .3s' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tuile(tr('Fin prévue'), fin)}
          {tuile(tr('Conso cycle'), conso)}
        </div>
      </div>
    </div>
  );
}
/* Neuf personnes, pour voir la grille et le « +n » : presents et absents meles. */
const FAMILLE_BIBLIO = ['Camille', 'Alex', 'Marie', 'Sam', 'Noa', 'Lou', 'Éli', 'Maé', 'Zoé'].map((name, i) => ({ name, haid: 'person.biblio' + (i === 0 ? '' : '_' + (i + 1)), img: null }));
/* Un scenario fictif, pour la carte des Scenarios : deux actions, lance il y a
 * un moment — de quoi remplir le resume et le repere sans rien inventer. */
const SCN_BIBLIO = () => ({
  // Son nom et la pièce de son action s'affichent (« Lumières à 20 % ·
  // Séjour ») : dans la langue de l'écran (relecture du 03/10).
  id: 'biblio-cinema', nom: tr('Cinéma'), icone: 'film', teinte: 'chambre',
  // `dernier` se compte en SECONDES, comme le serveur le donne.
  dernier: Math.round(Date.now() / 1000) - 95 * 60,
  actions: [
    { famille: 'lumieres', geste: 'allumer', valeur: 20, portee: 'piece', piece: tr('Séjour') },
    { famille: 'volets', geste: 'fermer', portee: 'vie' },
    { famille: 'medias', geste: 'tv' },
  ],
});
// La plante d'exemple de la Bibliothèque : la forme de `lirePlante`, un sol qui demande de l'eau.
const PLANTE_BIBLIO = { mort: false, muetDepuis: null, img: 'dracaena', hum: 14, lux: 820, temp: 22, cond: 640, uniteTemp: 'C' };
function BiblioView() {
  // hass figé au montage : les cartes optimistes bougent toutes seules,
  // aucune confirmation ne viendra (et n'a pas à venir) d'un vrai serveur.
  const [S] = useState(biblioStates);
  const hb = useMemo(() => ({ states: S, connected: true, callService: () => {}, callApi: () => Promise.resolve([]), callWS: () => Promise.resolve(null) }), [S]);
  const dc = useDomainCards(hb);
  // Son nom s'affiche sur la carte : traduit (relecture du 03/10).
  const pieceDemo = {
    name: tr('Séjour'), bg: 'rgba(96,165,250,.16)', tc: '#60a5fa',
    icon: <Fi i="home" color="#60a5fa" size={17} />, box: 44, rad: 13,
    live: { temp: 21.4, hum: 47 }, status: { kind: 'repos' }, badge: '612 ppm', bc: 'var(--o-ok)', bbg: 'rgba(var(--o-ok-rgb),.14)',
  };
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, padding: '26px 28px 40px', overflowX: 'hidden' }}>
      <h1 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Bibliothèque')}</h1>
      <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 4 }}>{tr('Toutes les cartes de Loggia, sur données fictives — rien ne pilote la maison ici.')}</div>

      <Titre i="door-open" c="#60a5fa" t={tr('Pièces')} />
      <Rangee>
        <Item l={tr('Compacte')} h={88}><PieceCard p={pieceDemo} chip lights={[{ on: false }]} mains={[]} onOpen={null} /></Item>
        <Item l={tr('Standard')}><PieceCard p={pieceDemo} compact lights={[{ on: true }, { on: false }]} mains={[{ on: true }]} onToggleLights={() => {}} covers={{ open: true, onToggle: () => {} }} clim={{ on: true, froid: false, onToggle: () => {} }} onOpen={null} /></Item>
      </Rangee>

      {/* Les scenarios ont leur carte depuis l'ADR 0052 — la bibliotheque ne
        * la montrait pas (retour du 20/09 : « actualise la bibliotheque »). */}
      <Titre i="sparkles" c="var(--o-accent-soft)" t={tr('Scénarios')} />
      <Rangee>
        <Item l={tr('Standard')} w={200}><CarteScenario s={SCN_BIBLIO()} onLancer={() => {}} /></Item>
        <Item l={tr('Compacte')} w={200} h={88}><CarteScenario s={SCN_BIBLIO()} compacte onLancer={() => {}} /></Item>
        <Item l={tr('En cours')} w={200}><CarteScenario s={SCN_BIBLIO()} enCours onLancer={() => {}} /></Item>
      </Rangee>

      <Titre i="bulb" c="var(--o-warn)" t={tr('Lumières et prises')} />
      <Rangee>
        <Item l={tr('Compacte')} h={88}><CvCard id="light.biblio_rgb" hass={hb} onOpen={dc.ouvrir} dense /></Item>
        <Item l={tr('Standard (lumière)')}>{dc.card('light.biblio_rgb')}</Item>
        <Item l={tr('Tout ou rien (non dimmable)')}>{dc.card('light.biblio_simple')}</Item>
        <Item l={tr('Prise')} h={88}><CvCard id="switch.biblio_prise" hass={hb} onOpen={dc.ouvrir} dense /></Item>
      </Rangee>

      <Titre i="thermometer-half" c="var(--o-orange)" t={tr('Climat')} />
      <Rangee>
        <Item l={tr('Compacte (étroite)')} h={88}><CvCard id="climate.biblio" hass={hb} onOpen={dc.ouvrir} dense /></Item>
        <Item l={tr('Compacte (large)')} w={340} h={88}><CvCard id="climate.biblio" hass={hb} onOpen={dc.ouvrir} dense /></Item>
        <Item l={tr('Standard')}>{dc.card('climate.biblio')}</Item>
      </Rangee>

      <Titre i="blinds" c="var(--o-purple)" t={tr('Volets')} />
      <Rangee>
        <Item l={tr('Compacte')} h={88}><CvCard id="cover.biblio" hass={hb} onOpen={dc.ouvrir} dense /></Item>
        <Item l={tr('Standard')}>{dc.card('cover.biblio')}</Item>
        <Item l={tr('Garage')}>{dc.card('cover.biblio_garage')}</Item>
      </Rangee>

      <Titre i="tv-music" c="var(--o-purple)" t={tr('Médias')} />
      <Rangee>
        <Item l={tr('Compacte')} h={88}><CvCard id="media_player.biblio" hass={hb} onOpen={dc.ouvrir} dense /></Item>
        <Item l={tr('Standard (pochette en fond)')}>{dc.card('media_player.biblio')}</Item>
      </Rangee>

      <Titre i="settings-sliders" c="var(--o-accent-soft)" t={tr('Machines et objets')} />
      <Rangee>
        <Item l={tr('Aspirateur')}>{dc.card('vacuum.biblio')}</Item>
        <Item l={tr('Aspirateur (compacte)')} h={88}><CvCard id="vacuum.biblio" hass={hb} onOpen={dc.ouvrir} dense /></Item>
        <Item l={tr('Tondeuse')}>{dc.card('lawn_mower.biblio')}</Item>
        <Item l={tr('Tondeuse (compacte)')} h={88}><CvCard id="lawn_mower.biblio" hass={hb} onOpen={dc.ouvrir} dense /></Item>
        <Item l={tr('Distributeur')}><RoomFeederCard v={biblioDistributeur()} onOpen={() => {}} /></Item>
        <Item l={tr('Distributeur (compacte)')} h={88}><RoomFeederCard chip v={biblioDistributeur()} onOpen={() => {}} /></Item>
        {/* La plante a une seule source, `pl` (C30) : les props d'avant faisaient tomber toute la vue (audit du 19/10, H1). */}
        <Item l={tr('Plante (standard)')}><RoomPlantCard pl={PLANTE_BIBLIO} nom="Monstera" onOpen={() => {}} /></Item>
        <Item l={tr('Plante (compacte)')} h={88}><RoomPlantCard chip pl={PLANTE_BIBLIO} nom="Monstera" onOpen={() => {}} /></Item>
      </Rangee>

      <Titre i="stats" c="var(--o-ok)" t={tr('Capteurs et chiffres')} />
      <Rangee>
        <Item l={tr('Compacte')} h={88}><CvCard id="sensor.biblio_temp" hass={hb} onOpen={dc.ouvrir} dense /></Item>
        <Item l={tr('Compacte (binaire)')} h={88}><CvCard id="binary_sensor.biblio_mouvement" hass={hb} onOpen={dc.ouvrir} dense /></Item>
        <Item l={tr('Chiffre')}><CvBigSensor id="sensor.biblio_co2" hass={hb} /></Item>
        <Item l={tr('Chiffre (lettres)')}><CvBigSensor id="binary_sensor.biblio_mouvement" hass={hb} /></Item>
        <Item l={tr('Graphique (courbe)')}><CvHistory id="sensor.biblio_temp" hass={hb} demoPoints={(() => { const t0 = Date.now() - 86400000; return Array.from({ length: 48 }, (_, i) => ({ t: t0 + i * 1800000, v: Math.round((22 + Math.sin(i / 6.5) * 1.3 - i * 0.01) * 10) / 10 })); })()} /></Item>
        <Item l={tr('Graphique (barres, énergie)')}><CvHistory id="sensor.biblio_energie_hist" hass={hb} demoPoints={(() => { const t0 = Date.now() - 86400000; let v = 0; return Array.from({ length: 48 }, (_, i) => { const h = new Date(t0 + i * 1800000).getHours(); v += h < 7 ? 0.03 : h < 18 ? 0.18 : 0.09; return { t: t0 + i * 1800000, v: Math.round(v * 100) / 100 }; }); })()} /></Item>
        {/* La STANDARD d'un capteur porte sa jauge depuis l'ADR 0057 — et la
          * compacte, elle, n'en a pas (v3.57.1). La bibliotheque le montrait
          * a l'envers : elle n'avait que la compacte. */}
        <Item l={tr('Standard (jauge)')}>{dc.card('sensor.biblio_co2')}</Item>
        <Item l={tr('Standard (température)')}>{dc.card('sensor.biblio_temp')}</Item>
        <Item l={tr('Horloge')} h={88}><CvClock /></Item>
      </Rangee>

      {/* Les widgets du cote de l'Accueil (ADR 0041, 0044) — presents par
        * defaut depuis la v3.59.0, absents de la bibliotheque jusqu'ici. */}
      <Titre i="clock" c="var(--o-accent-soft)" t={tr('Widgets du rail')} />
      <Rangee>
        <Item l={tr('Heure')} w={280} h={200}><HorlogeRail hass={hb} /></Item>
        <Item l={tr('CO₂')} w={280} h={200}><Co2Rail hass={hb} capteur={{ id: 'sensor.biblio_co2', nom: tr('CO₂ séjour'), piece: tr('Séjour'), valeur: 640 }} seuil={1400} /></Item>
      </Rangee>

      <Titre i="apps" c="var(--o-accent-soft)" t={tr('Cartes maison (agrégats)')} />
      <Rangee>
        <Item l={tr('Qualité air')} w={280}><CvAir hass={hb} /></Item>
        <Item l={tr('Présence maison')} w={280}><CvPresence hass={hb} gens={[{ name: 'Camille', haid: 'person.biblio', img: null }, { name: 'Alex', haid: 'person.biblio_2', img: null }]} /></Item>
        <Item l={tr('Famille nombreuse')} w={280}><CvPresence hass={hb} gens={FAMILLE_BIBLIO} /></Item>
        <Item l={tr('Ouvrants')} w={280}><CvOuvrants hass={hb} /></Item>
        <Item l={tr('Énergie maison')} w={280}><CvEnergie hass={hb} roles={{ solarNow: 'sensor.biblio_solaire', gridNow: 'sensor.biblio_reseau', consoJour: 'sensor.biblio_conso_jour' }} /></Item>
        <Item l={tr('Calendrier')} w={280}><CvCalendrier id="calendar.biblio" hass={hb} /></Item>
        <Item l={tr('Localisation')} w={280}><CvCarte hass={hb} gensDemo={[{ name: 'Camille', haid: 'person.biblio', img: null }, { name: 'Marie', haid: 'person.biblio_3', img: null }]} /></Item>
        <Item l={tr('Météo')} w={280}><CvWeather id="weather.biblio" hass={hb} /></Item>
        {/* Une carte chips : ses pastilles, chacune cliquable (le resume
          * automatique a ete retire le 01/09). */}
        <Item l={tr('Chips (groupe)')} w={280} h={88}><CvChips hass={hb} x={{ ids: ['light.biblio_rgb', 'cover.biblio', 'climate.biblio'] }} /></Item>
        <Item l={tr('Activité récente')} w={280}><CvActivite hass={hb} demoEvents={(() => { const t0 = Date.now(); return [
          { entity_id: 'cover.biblio', state: 'closed', when: t0 - 6 * 60000 },
          { entity_id: 'vacuum.biblio', state: 'docked', when: t0 - 82 * 60000 },
          { entity_id: 'binary_sensor.biblio_garage', state: 'on', when: t0 - 109 * 60000 },
          { entity_id: 'binary_sensor.biblio_porte', state: 'off', when: t0 - 26 * 3600000 },
        ]; })()} /></Item>
      </Rangee>

      <Titre i="soap" c="var(--o-purple)" t={tr('Électroménager')} />
      <Rangee>
        {/* La consommation passe par `dec` (relecture du 03/10) : « 0,6 kWh »
          * écrit d'avance gardait sa virgule sur une page anglaise. */}
        <Item l={tr('Compacte')} h={88}><ApplianceCard chip nom={tr('Lave-linge')} etat={tr('Essorage')} restant={tr('{n} min', { n: 34 })} /></Item>
        <Item l={tr('Standard')} w={280}><ApplianceCard nom={tr('Lave-linge')} etat={tr('Coton 40° · essorage')} pct={72} restant={tr('{n} min', { n: 34 })} fin="13:38" conso={dec(0.6, 1) + ' kWh'} /></Item>
      </Rangee>

      <Titre i="shield-check" c="var(--o-ok)" t={tr('Sécurité et divers')} />
      <Rangee>
        <Item l={tr('Caméra (standard 1×1)')}><CvCamera id="camera.biblio_entree" hass={hb} /></Item>
        {/* La tuile 16/9 de l'Accueil et de la vue Securite : ce n'est pas la
          * meme carte que la 1×1 du catalogue. */}
        <Item l={tr('Caméra (tuile 16/9)')} w={300} h={169}><CameraTile c={{ label: tr('Caméra entrée'), tag: 'LIVE · ' + tr('Caméra entrée').toUpperCase(), grad: CAMERAS()[0].grad, glow: CAMERAS()[0].glow, sub: tr('Direct'), online: true }} /></Item>
        <Item l={tr('Carte personne')}><CvPerson id="person.biblio" hass={hb} /></Item>
        <Item l={tr('Alarme')}><CvAlarm id="alarm_control_panel.biblio" hass={hb} /></Item>
        {/* Arrivee le 16/09 (« je n'ai pas la carte sirene ») : beaucoup de
          * sirenes Zigbee n'arrivent qu'en `switch`, celle-ci est un vrai
          * `siren`. */}
        <Item l={tr('Sirène')}><CvSirene id="siren.biblio" hass={hb} /></Item>
        <Item l={tr('Alarme (seule)')}><CvAlarm id="alarm_control_panel.biblio" hass={hb} sans /></Item>
        <Item l={tr('Alarme (compacte)')} h={88}><CvCard id="alarm_control_panel.biblio" hass={hb} onOpen={dc.ouvrir} dense /></Item>
        <Item l={tr('Chip')} h={88}><CvChip id="light.biblio_rgb" hass={hb} dc={dc} /></Item>
        <Item l={tr('Chip (capteur)')} h={88}><CvChip id="sensor.biblio_co2" hass={hb} dc={dc} /></Item>
        <Item l={tr('Serrure')} h={88}><CvCard id="lock.biblio" hass={hb} onOpen={dc.ouvrir} dense /></Item>
        <Item l={tr('Vanne')} h={88}><CvCard id="valve.biblio" hass={hb} onOpen={dc.ouvrir} dense /></Item>
        <Item l={tr('Scène')} h={88}><CvCard id="scene.biblio" hass={hb} onOpen={dc.ouvrir} dense /></Item>
        <Item l={tr('Ouverture')} h={88}><CvCard id="binary_sensor.biblio_porte" hass={hb} onOpen={dc.ouvrir} dense /></Item>
      </Rangee>

      {/* « A surveiller » (ADR 0028) : la carte de tete de l'Accueil. Elle
        * n'existe que quand il y a un point — ici, deux, pour la montrer. */}
      <Titre i="triangle-warning" c="var(--o-warn)" t={tr('À surveiller')} />
      <Rangee>
        <Item l={tr('Points d’attention')} w={420} h="auto">
          <CarteAttention points={[
            /* Un nom, un point médian, une mesure, comme `pointsAttention`
             * (attention.js) — dans la langue de l'écran, pas en français
             * écrit d'avance (relecture du 03/10). */
            { cle: 'biblio-garage', niveau: 'alerte', icone: 'garage-open', titre: tr('Garage ouvert'), sous: tr('Garage') + ' · ' + tr('{h} h {m}', { h: 1, m: 49 }) },
            { cle: 'biblio-co2', niveau: 'info', icone: 'wind', titre: tr('CO₂ élevé'), sous: tr('Séjour') + ' · ' + tr('{v} ppm', { v: 1480 }) },
          ]} />
        </Item>
      </Rangee>

      <div style={{ marginTop: 26, fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>
        {tr('Absentes ici : agenda et journal — elles vivent des données du vrai serveur. Graphiques, activité et widgets du rail montrent un historique factice ; la caméra 1×1 son vrai flux.')}
      </div>
      {dc.sheets}
    </main>
  );
}

export { BiblioView };
