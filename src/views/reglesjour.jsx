/* « Aujourd'hui » : la journée des règles sur une frise (maquette v3 des
 * Règles, 03/11 ; son choix « Passé et à venir »).
 *
 * Le passé, c'est le journal de la maison, aujourd'hui seulement, et
 * seulement ce que les RÈGLES ont fait : un bouton, une prise ou un minuteur
 * n'est pas une règle. L'avenir, c'est ce que le serveur annonce déjà : les
 * manœuvres à venir de chaque volet (`a_venir`) et l'extinction du soir à
 * son heure, les jours où elle tourne. Rien d'autre n'est deviné : la
 * veilleuse attend qu'on l'allume, le rappel de collecte un jour de collecte.
 *
 * Les heures sont celles de l'écran, comme les lignes du journal
 * (`quandCourt`). Deux moments à moins de 36 min se lisent ensemble.
 */
import { useEffect, useRef, useState } from 'react';
import { useEtatServeur } from '../ui.jsx';
import { tr } from '../i18n.js';
import { mot } from '../journalmots.js';
import { Panneau, majuscule } from './parcommun.jsx';

/* La teinte et l'icône d'un module, celles de son onglet. */
const MODULES = {
  volets: ['purple', 'blinds'], fenetres: ['orange', 'flame'], chauffage: ['orange', 'flame'],
  presence: ['ok', 'running'], nuit: ['cyan', 'moon'], veilles: ['warn', 'eye'],
  enfant: ['accent', 'child-head'], alertes: ['accent', 'bell'],
};
const nomModule = (m) => ({
  volets: tr('Volets'), fenetres: tr('Chauffage'), chauffage: tr('Planning de chauffe'), presence: tr('Départ et retour'),
  nuit: tr('La nuit'), veilles: tr('Veilles'), enfant: tr('Mode enfant'), alertes: tr('Alertes'),
}[m] || m);
const ECART = 0.6;
const p2 = (n) => String(n).padStart(2, '0');
const heureDe = (d) => d.getHours() + d.getMinutes() / 60;
const hh = (h) => p2(Math.floor(h)) + ':' + p2(Math.round((h % 1) * 60) % 60);
const pct = (h) => (Math.max(0, Math.min(24, h)) / 24 * 100).toFixed(2) + '%';

/* Les moments du jour, triés et rapprochés : `{ h, t, k, ico }`. Exportée pour les tests. */
export function momentsDuJour({ journal = [], volets = {}, nuit = null, maintenant = new Date() } = {}) {
  const jour = maintenant.toDateString();
  const evts = [];
  journal.forEach(j => {
    const m = MODULES[j && j.module];
    if (!m || !Number.isFinite(Number(j.ts))) return;
    const d = new Date(Number(j.ts) * 1000);
    if (d.toDateString() !== jour) return;
    const quoi = majuscule(mot(j, 'quoi')) + (j.n > 1 ? ' ' + j.n : '');
    const ico = j.module === 'volets' ? (j.quoi === 'ouvrir' ? 'blinds-open' : j.quoi === 'proteger' ? 'sun' : 'blinds') : m[1];
    evts.push({ h: heureDe(d), t: quoi + ' · ' + nomModule(j.module), k: m[0], ico });
  });
  // Les volets à venir, rangés par minute et par sens : « Fermer 4 · Volets ».
  const prevus = {};
  Object.values(volets || {}).forEach(v => (Array.isArray(v && v.a_venir) ? v.a_venir : []).forEach(a => {
    const d = new Date(a && a.heure);
    if (Number.isNaN(d.getTime()) || d.toDateString() !== jour || d <= maintenant) return;
    const cle = a.sens + '@' + d.getHours() + ':' + d.getMinutes();
    prevus[cle] = prevus[cle] || { h: heureDe(d), sens: a.sens, n: 0 };
    prevus[cle].n += 1;
  }));
  Object.values(prevus).forEach(p => {
    const quoi = majuscule(tr(p.sens === 'ouverture' ? 'ouvrir' : 'fermer')) + (p.n > 1 ? ' ' + p.n : '');
    evts.push({ h: p.h, t: quoi + ' · ' + nomModule('volets'), k: 'purple', ico: p.sens === 'ouverture' ? 'blinds-open' : 'blinds' });
  });
  // L'extinction du soir : à son heure, les jours cochés (lundi vaut 0, comme sur le serveur).
  const c = nuit && nuit.config && nuit.config.coucher;
  const m = c && c.actif && /^(\d{1,2}):(\d{2})$/.exec(String(c.heure || ''));
  const jours = c && Array.isArray(c.jours) ? c.jours : [0, 1, 2, 3, 4, 5, 6];
  if (m && jours.indexOf((maintenant.getDay() + 6) % 7) >= 0) {
    const h = Number(m[1]) + Number(m[2]) / 60;
    if (h > heureDe(maintenant)) evts.push({ h, t: tr('Extinction du soir'), k: 'cyan', ico: 'power' });
  }
  evts.sort((a, b) => a.h - b.h);
  // Rapprochés : le premier donne l'heure, l'icône et le texte ; les autres se comptent, « +n ».
  // Jamais un moment passé avec un moment à venir : « Ensuite » sauterait le prochain (relecture du 03/11).
  const nowH = heureDe(maintenant);
  const groupes = [];
  evts.forEach(e => {
    const g = groupes[groupes.length - 1];
    if (g && e.h - g.h < ECART && (g.h > nowH) === (e.h > nowH)) g.textes.push(e.t);
    else groupes.push({ ...e, textes: [e.t] });
  });
  return groupes.map(g => ({ h: g.h, k: g.k, ico: g.ico, textes: g.textes, t: libelle(g.textes) }));
}
const libelle = (textes) => textes[0] + (textes.length > 1 ? ' · +' + (textes.length - 1) : '');

export function FriseJour({ hass }) {
  const regles = useEtatServeur(hass, 'loggia/regles/etat', 30000, tr('Journal indisponible.'));
  const volets = useEtatServeur(hass, 'loggia/volets/etat', 60000, tr('Réglages indisponibles.'));
  const nuit = useEtatServeur(hass, 'loggia/nuit/etat', 60000, tr('Réglages indisponibles.'));
  const piste = useRef(null);
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    const lire = () => { if (piste.current) setLargeur(piste.current.offsetWidth); };
    lire();
    window.addEventListener('resize', lire);
    return () => window.removeEventListener('resize', lire);
  }, []);
  const maintenant = new Date();
  const now = heureDe(maintenant);
  const evts = momentsDuJour({
    journal: (regles.etat && regles.etat.journal) || [],
    volets: (volets.etat && volets.etat.volets) || {},
    nuit: nuit.etat, maintenant,
  });
  const prochain = evts.find(e => e.h > now);
  const desc = !regles.etat && regles.err ? regles.err
    : prochain ? tr('Ensuite : {quoi}, à {heure}.', { quoi: prochain.t.charAt(0).toLowerCase() + prochain.t.slice(1), heure: hh(prochain.h) })
      : tr('Plus rien de prévu aujourd’hui.');
  // Dessus ou dessous la piste, en alternance, pour que deux étiquettes voisines ne se chevauchent pas (maquette).
  const TT = 70;
  /* Deux étiquettes d'un même côté demandent 128 px entre leurs centres (118 de large, et de l'air),
   * mesurés sur la largeur réelle de la piste (1 000 px tant qu'elle n'est pas mesurée). Près des bords,
   * l'étiquette se décale vers l'intérieur : son centre aussi. */
  const W = largeur > 0 ? largeur : 1000;
  const decale = (h) => { const l = h / 24; return l > .9 ? -.38 : l < .1 ? .38 : 0; };
  const centre = (h) => h / 24 * W + decale(h) * 118;
  /* Ce qui vient se place d'abord, du plus proche au plus lointain, puis le passé, du plus récent au
   * plus ancien : sans place ni dessus ni dessous, un moment rejoint son voisin le plus proche, qui le
   * compte (« +n »). Une étiquette ne se pose jamais sur une autre, et « ensuite » reste lisible. */
  const ordre = [...evts.filter(e => e.h > now), ...evts.filter(e => e.h <= now).reverse()];
  const poses = [];
  ordre.forEach(e => {
    const libre = (haut) => poses.every(p => p.haut !== haut || Math.abs(centre(p.h) - centre(e.h)) >= 128);
    const haut = libre(true) ? true : libre(false) ? false : null;
    if (haut === null) {
      const voisin = poses.reduce((a, p) => (!a || Math.abs(p.h - e.h) < Math.abs(a.h - e.h) ? p : a), null);
      // Le voisin garde son heure, donc son texte en tête ; les autres se comptent.
      voisin.textes = [...voisin.textes, ...e.textes];
      voisin.t = libelle(voisin.textes);
      return;
    }
    poses.push({ ...e, haut, tx: (-50 + decale(e.h) * 100) + '%', op: e.h < now ? 1 : .62 });
  });
  const marques = poses.sort((a, b) => a.h - b.h);
  return (
    <Panneau titre={tr('Aujourd’hui')} desc={desc}>
      <div style={{ padding: '6px 22px 18px' }}>
        <div ref={piste} style={{ position: 'relative', height: 170 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: TT, height: 6, borderRadius: 3, background: 'var(--o-s1)' }} />
          {marques.map((m, i) => (
            <div key={i}>
              <span aria-hidden="true" style={{ position: 'absolute', left: pct(m.h), top: m.haut ? 38 : TT + 14, height: m.haut ? TT - 46 : 14, width: 1, background: 'var(--o-bd1)' }} />
              <div style={{ position: 'absolute', left: pct(m.h), top: m.haut ? 0 : TT + 30, transform: 'translateX(' + m.tx + ')', width: 118, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textAlign: 'center', lineHeight: 1.25, opacity: m.op }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>{hh(m.h)}</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, textWrap: 'balance', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{m.t}</span>
              </div>
              <span aria-hidden="true" style={{ position: 'absolute', left: pct(m.h), top: TT - 8, width: 22, height: 22, marginLeft: -11, borderRadius: '50%', background: 'var(--o-' + m.k + ')', boxShadow: '0 0 0 3px var(--o-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: m.op }}>
                <i className={'fi fi-rr-' + m.ico} style={{ fontSize: 10, lineHeight: 1, display: 'inline-flex', color: 'var(--o-bg)' }} />
              </span>
            </div>
          ))}
          <span aria-hidden="true" style={{ position: 'absolute', left: pct(now), top: 44, height: 60, width: 2, marginLeft: -1, background: 'var(--o-accent)', borderRadius: 1, boxShadow: '0 0 8px var(--o-accent)' }} />
          {[0, 6, 12, 18, 24].map(h => (
            <span key={h} style={{ position: 'absolute', bottom: 0, left: pct(h), transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{tr('{n} h', { n: h })}</span>
          ))}
        </div>
      </div>
    </Panneau>
  );
}
