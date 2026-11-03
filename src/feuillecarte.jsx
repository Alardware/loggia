/* ── La carte des personnes et des traceurs (lot 16 du rapport Gladys ; ADR 0321) ──
 *
 * « Reporter la map de Home Assistant dans Loggia » : une POPUP, la carte de HA
 * redessinée avec la même bibliothèque (Leaflet), le même fond, la même façon
 * de l'assombrir. Chargée à la demande, Leaflet et sa feuille de style compris :
 * le démarrage n'en porte que l'adresse. Deux entrées : « Voir sur la carte »
 * dans la feuille Présence (galerie.jsx) et dans la popup d'un traceur
 * (fichetraceur.jsx, qui passe `focus`).
 *
 * Elle LIT, elle ne fait rien d'autre : aucune commande, rien d'écrit au
 * serveur ni dans le navigateur, pas de géocodage. Les coordonnées ne servent
 * qu'à placer les marqueurs ; seules les tuiles se demandent, à Home Assistant
 * (son relais `map_tiles`), comme sa propre carte. Sans fond (hors ligne, un
 * Home Assistant d'avant 2026.9), les cercles et les marqueurs restent, sur le
 * gris des panneaux. Ce qui se pose et pourquoi : cartegeo.js. */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import cssLeaflet from 'leaflet/dist/leaflet.css?inline';
import { tr } from './i18n.js';
import { BottomSheet, TitreFeuille, Fi } from './ui.jsx';
import { LOGGIA_INDEX, estTraceur, getHass, entitesAppareilDe } from './state.js';
import { useHass } from './app/noyau.jsx';
import { relTime } from './format.js';
import { peopleList } from './cartescustom/galerie.jsx';
import { PANNEAU, RANGEE_SERREE, EN_BOUTON, TITRE, SOUS } from './fichekit.js';
import { filet } from './fichecommune.jsx';
import { tuilesDe, CSS_CARTE, ZOOMS, zonesCarte, pointsCarte, pointsCadre, initiales } from './cartegeo.js';

/* La feuille de style de Leaflet et la nôtre, posées une fois, à la première ouverture. */
let stylePose = false;
function poserStyle() {
  if (stylePose || typeof document === 'undefined') return;
  stylePose = true;
  const el = document.createElement('style');
  el.setAttribute('data-loggia', 'carte');
  el.textContent = cssLeaflet + '\n' + CSS_CARTE;
  document.head.appendChild(el);
}

const enDemo = () => typeof window !== 'undefined' && !!window.__loggiaDemo;
/* Le fond de la démo EN LIGNE (lot 17, ADR 0322) : `import.meta.env.MODE` est remplacé à la construction ; dans le paquet de
 * Home Assistant (« production »), la condition vaut faux et l'adresse disparaît du morceau. Aucun repli vers un tiers. */
const FOND_DEMO = import.meta.env.MODE === 'demo' ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' : null;

/** Le jeton du relais de tuiles de Home Assistant (`map_tiles/access_token`), ou null : un HA d'avant 2026.9 ne le connaît pas. */
function demanderJeton() {
  const h = getHass();
  if (!h || typeof h.callWS !== 'function') return Promise.resolve(null);
  try {
    return Promise.resolve(h.callWS({ type: 'map_tiles/access_token' })).then((r) => (r && typeof r.token === 'string' && r.token ? r.token : null), () => null);
  } catch { return Promise.resolve(null); }
}

/** « À la maison · il y a 5 min » : sa zone, et depuis quand. */
const ligneDe = (m) => m.zone + (m.quand != null ? ' · ' + relTime(new Date(m.quand).toISOString()).toLowerCase() : '');

/** Le visage, les initiales, ou l'icône du traceur : un élément du DOM, le texte posé en `textContent` (jamais en HTML). */
function pastille(m, choisi) {
  const el = document.createElement('div');
  el.className = 'o-geo-m' + (m.maison ? ' o-geo-ici' : '') + (choisi ? ' o-geo-choisi' : '');
  if (m.img) {
    const im = document.createElement('img');
    im.alt = '';
    im.onerror = () => { im.remove(); el.textContent = initiales(m.nom); };
    im.src = m.img;
    el.appendChild(im);
  } else if (m.genre === 'traceur') {
    const i = document.createElement('i');
    i.className = 'fi fi-rr-marker';
    i.setAttribute('aria-hidden', 'true');
    i.style.fontSize = '18px';
    el.appendChild(i);
  } else el.textContent = initiales(m.nom);
  return el;
}

const TAILLE = 40;

/** La carte elle-même : Leaflet dans un `div`, redessiné quand les points ou le choix changent. */
function Carte({ marqueurs, zones, choisi, onChoisir, focus }) {
  const boite = useRef(null);
  const etat = useRef(null);
  const [sansFond, setSansFond] = useState(false);

  useEffect(() => {
    poserStyle();
    const map = L.map(boite.current, { minZoom: ZOOMS.min, maxZoom: ZOOMS.max, zoomControl: false });
    // Comme la carte de HA (setup-leaflet-map.ts) : pas de préfixe, l'attribution des tuiles seule.
    map.attributionControl.setPrefix('');
    L.control.zoom({ zoomInTitle: tr('Zoom avant'), zoomOutTitle: tr('Zoom arrière') }).addTo(map);
    const e = { map, zones: L.layerGroup().addTo(map), points: L.layerGroup().addTo(map), cadre: false, vivant: true };
    etat.current = e;
    const poser = (t) => {
      const couche = L.tileLayer(t.url, t.options).addTo(map);
      // Le jeton tourne toutes les 30 min (deux vivent à la fois) : une tuile refusée en redemande un, pas plus d'une fois par 30 s.
      let dernier = 0;
      couche.on('tileerror', () => {
        if (Date.now() - dernier < 30000) return;
        dernier = Date.now();
        demanderJeton().then((j) => { if (e.vivant && j && j !== couche.options.token) { couche.options.token = j; couche.redraw(); } });
      });
    };
    /* La démo en ligne : les tuiles d'OpenStreetMap ; un `?demo` sur une installation : pas de fond, et rien à dire — elle joue
     * un Home Assistant récent (cartegeo.js). */
    if (enDemo()) { const t = tuilesDe({ fondDemo: FOND_DEMO }); if (t) L.tileLayer(t.url, t.options).addTo(map); }
    else demanderJeton().then((jeton) => { if (!e.vivant) return; const t = tuilesDe({ jeton }); if (t) poser(t); else setSansFond(true); });
    // La feuille glisse en entrant : la taille se relit quand elle est posée, puis à chaque changement de la boîte.
    const t = setTimeout(() => { if (e.vivant) map.invalidateSize(); }, 480);
    let ro = null;
    try { ro = new ResizeObserver(() => { if (e.vivant) map.invalidateSize(); }); ro.observe(boite.current); } catch { ro = null; }
    return () => { e.vivant = false; clearTimeout(t); if (ro) ro.disconnect(); map.remove(); etat.current = null; };
  }, []);

  // Les zones : un cercle chacune, la maison en premier (sous les autres).
  const sigZones = zones.map((z) => [z.id, z.lat, z.lon, z.rayon].join(':')).join('|');
  useEffect(() => {
    const e = etat.current; if (!e) return;
    e.zones.clearLayers();
    zones.forEach((z) => {
      if (z.rayon > 0) L.circle([z.lat, z.lon], { radius: z.rayon, interactive: false, className: 'o-geo-z' + (z.maison ? ' o-geo-maison' : '') }).addTo(e.zones);
    });
  }, [sigZones]); // eslint-disable-line react-hooks/exhaustive-deps

  // Les marqueurs, et la bulle de celui qu'on a touché : son nom, sa zone, « il y a N min ».
  const sigPoints = marqueurs.map((m) => [m.id, m.lat, m.lon, m.zone, m.quand, m.img, m.maison].join(':')).join('|');
  useEffect(() => {
    const e = etat.current; if (!e) return;
    e.points.clearLayers();
    marqueurs.forEach((m) => {
      const ici = m.id === choisi;
      const texte = m.nom + ' · ' + ligneDe(m);
      const mk = L.marker([m.lat, m.lon], {
        icon: L.divIcon({ html: pastille(m, ici), className: 'o-geo-i', iconSize: [TAILLE, TAILLE], iconAnchor: [TAILLE / 2, TAILLE / 2] }),
        title: texte, keyboard: true, riseOnHover: true, zIndexOffset: ici ? 1000 : 0,
      });
      mk.on('click', () => onChoisir(m.id));
      mk.addTo(e.points);
      const icone = mk.getElement();
      if (icone) icone.setAttribute('aria-label', texte);
      if (ici) {
        const bulle = document.createElement('span');
        bulle.textContent = texte;
        mk.bindTooltip(bulle, { direction: 'top', offset: [0, -TAILLE / 2], permanent: true }).openTooltip();
      }
    });
    // Le premier cadrage : le marqueur demandé, sinon tout le monde et la maison (14 au plus, le zoom par défaut de la carte de HA).
    if (!e.cadre) {
      const f = focus ? marqueurs.find((m) => m.id === focus) : null;
      const pts = pointsCadre(marqueurs, zones);
      if (f) { e.map.setView([f.lat, f.lon], ZOOMS.focus); e.cadre = true; }
      else if (pts.length) { e.map.fitBounds(L.latLngBounds(pts), { maxZoom: ZOOMS.cadre, padding: [TAILLE, TAILLE] }); e.cadre = true; }
    }
  }, [sigPoints, choisi, sigZones]); // eslint-disable-line react-hooks/exhaustive-deps

  // Choisi depuis la liste : la carte va le chercher.
  useEffect(() => {
    const e = etat.current; if (!e || !choisi || !e.cadre) return;
    const m = marqueurs.find((x) => x.id === choisi);
    if (m) e.map.panTo([m.lat, m.lon]);
  }, [choisi]); // eslint-disable-line react-hooks/exhaustive-deps

  return (<>
    <div className="o-geo"><div ref={boite} style={{ height: '100%' }} /></div>
    {sansFond && <div style={{ ...SOUS, marginTop: 8 }}>{tr('Fond de carte indisponible : Home Assistant le fournit à partir de la version 2026.9.')}</div>}
  </>);
}

/** Le petit visage d'une rangée de la liste. */
function Visage({ m }) {
  return (
    <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      background: m.img ? `url("${m.img}") center/cover` : 'var(--o-s1)', color: m.maison ? 'var(--o-ok)' : 'var(--o-text2)', fontSize: 11, fontWeight: 800 }}>
      {!m.img && (m.genre === 'traceur' ? <Fi i="marker" size={14} /> : initiales(m.nom))}
    </span>
  );
}

/**
 * La popup. `suivies` : les personnes à montrer (la feuille Présence passe les
 * siennes) — sinon celles de la carte Présence (`peopleList`) ; `focus` : le
 * marqueur à montrer d'abord (le traceur dont on vient).
 */
export default function FeuilleCarte({ onClose, suivies = null, focus = null }) {
  /* Ce qu'il faut suivre : les personnes, les zones, les traceurs, et les capteurs de l'appareil d'un traceur (son dernier signal). */
  const cles = useMemo(() => {
    const S = (getHass() || {}).states || {};
    const capteurs = Object.keys(S).filter((id) => estTraceur(id)).flatMap((id) => entitesAppareilDe(id).filter((x) => x.indexOf('sensor.') === 0));
    return ['person.', 'zone.', 'device_tracker.', ...capteurs];
  }, []);
  const hass = useHass(cles);
  const S = (hass && hass.states) || {};
  const gens = suivies || peopleList();
  const { marqueurs, sansPosition } = pointsCarte({ S, suivies: gens, estTraceur, index: LOGGIA_INDEX });
  const zones = zonesCarte(S);
  const [choisi, setChoisi] = useState(focus);
  const liste = [...marqueurs, ...sansPosition];
  return (
    <BottomSheet onClose={onClose}>
      <TitreFeuille marge={12}><span style={{ fontSize: 17, fontWeight: 800 }}>{tr('Localisation')}</span></TitreFeuille>
      {marqueurs.length > 0
        ? <Carte marqueurs={marqueurs} zones={zones} choisi={choisi} onChoisir={setChoisi} focus={focus} />
        : <div style={{ ...PANNEAU, padding: 18, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Aucune personne suivie ni aucun traceur n’a de position dans Home Assistant.')}</div>}
      {liste.length > 0 && (
        <div style={{ ...PANNEAU, marginTop: 12, overflow: 'hidden' }}>
          {liste.map((m, i) => {
            const pose = i < marqueurs.length;
            const corps = (<>
              <Visage m={m} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...TITRE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.nom}</span>
                <span style={{ ...SOUS, color: m.maison ? 'var(--o-ok)' : 'var(--o-text2)' }}>{pose ? ligneDe(m) : m.zone + ' · ' + tr('Sans position')}</span>
              </span>
            </>);
            /* Une rangée posée se touche : la carte va au marqueur et montre sa bulle. Sans position, elle se lit seulement. */
            return pose
              ? <button key={m.id} type="button" aria-pressed={choisi === m.id} onClick={() => setChoisi(m.id)}
                style={{ ...RANGEE_SERREE, ...EN_BOUTON, borderTop: filet(i), background: choisi === m.id ? 'var(--o-s1)' : 'none' }}>{corps}</button>
              : <div key={m.id} style={{ ...RANGEE_SERREE, borderTop: filet(i) }}>{corps}</div>;
          })}
        </div>
      )}
    </BottomSheet>
  );
}
