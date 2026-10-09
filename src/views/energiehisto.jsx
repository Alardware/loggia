/* ── L'Énergie au-delà de l'instant ─────────────────────────────────────────
 *
 * Le tarif, l'historique sur quatre périodes et le calendrier des douze
 * derniers mois. Tout ce qui, dans la vue Énergie, ne regarde PAS le moment
 * présent — l'aperçu, le schéma de la maison et les chiffres en direct restent
 * dans `App.jsx`, c'est ce qu'on voit en arrivant.
 *
 * CHARGÉ À LA DEMANDE (ADR 0104, 0145). Ces trois sections pèsent une
 * trentaine de kilo-octets : les statistiques longue durée, deux graphes et la
 * lecture des créneaux d'heures creuses. L'Accueil n'en affiche rien, et le
 * budget du boot (`tests/lot14_chargement.test.mjs`) refuse qu'elles y entrent.
 *
 * Rien n'est importé d'`App.jsx` : les briques communes viennent de `ui.jsx`,
 * `format.js` et `i18n.js`, et les identifiants d'entités arrivent en prop.
 */
import { useState, useRef } from 'react';
import { Fi, BottomSheet } from '../ui.jsx';
import { tr, locale } from '../i18n.js';
import { nombre } from '../format.js';
import { facteurKwh, kwhDe } from '../unites.js';
import { useStats, bornesStat, damier, sommeStat, libellePeriode, RECUL_MAX } from '../stats.js';
import { plagesVraies, barreTarif, prixDuMoment, prochainTarif } from '../tarif.js';
import { useEtatsHist } from '../historique.jsx';
import { EnHistoBarres, EnCalendrier, CalendrierMois } from '../engraphes.jsx';

const CARTE = {
  background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))',
  border: 'var(--o-bw,1px) solid var(--o-bd2)',
  borderRadius: 'var(--o-radius,18px)',
  boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.4))',
  minWidth: 0,
};
const CL_ONGLETS = 'o-en-onglets';
const ONGLETS = { display: 'inline-flex', gap: 2, padding: 3, borderRadius: 12, background: 'var(--o-well)', border: 'var(--o-bw,1px) solid var(--o-bd2)', flexShrink: 0 };
const onglet = (actif) => ({
  height: 30, padding: '0 13px', borderRadius: 10, border: 'none', cursor: 'pointer',
  fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
  background: actif ? 'var(--o-accent-fond)' : 'transparent', color: actif ? '#fff' : 'var(--o-text2)',
});
const TITRE = { fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, fontWeight: 500, marginTop: 2 };
const SURTITRE = { fontSize: 13.5, fontWeight: 700, color: 'var(--o-text2)' };
/* Le titre du calendrier dit CE QU'IL MONTRE : « Consommation par jour ». Les
 * trois mots viennent du catalogue, pas d'une concatenation. */
const MESURE_NOM = () => ({ conso: tr('Consommation'), prod: tr('Production'), cout: tr('Coût') });
/* Un repère horaire de l'axe : « 06h ». Hors du JSX, où le filet de traduction
 * prendrait le suffixe pour un mot resté en français (`rien_en_francais`) —
 * c'est une graduation, pas une phrase, et `casesStat` l'écrit déjà ainsi. */
const repereHeure = (h) => String(h).padStart(2, '0') + 'h';

/* Les lecteurs d'état, refaits ici plutôt que reçus en prop : quatre lignes,
 * et le module reste indépendant de `App.jsx`. */
function lecteurs(hass) {
  const S = (hass && hass.states) || null;
  const brut = (id) => (S && id && S[id]) || null;
  const avail = (id) => { const e = brut(id); return !!(e && e.state != null && e.state !== 'unknown' && e.state !== 'unavailable' && !isNaN(parseFloat(e.state))); };
  const num = (id, def = null) => { const e = brut(id); if (!avail(id)) return def; const n = parseFloat(e.state); return isNaN(n) ? def : n; };
  const unite = (id) => { const e = brut(id); return (e && e.attributes && e.attributes.unit_of_measurement) || ''; };
  const kwh = (id, def = null) => { const k = avail(id) ? kwhDe(brut(id)) : null; return k == null ? def : k; };
  return { brut, avail, num, unite, kwh };
}

/* Les compteurs de consommation du réseau, dans l'ordre de préférence.
 *
 * `consoJourParts` : les compteurs d'un contrat à plusieurs tarifs, quand le
 * tableau de bord Énergie en déclare plus d'un (resolve.js). Aucun ne vaut pour
 * le tout — on les additionne, sinon on ne lirait que la moitié de la facture.
 */
function compteursConso(EN) {
  /* DEUX COMPTEURS NOMMES D'ABORD. Depuis que la fiche et le tableau de bord
   * se marient (07/10), les deux arrivent ensemble : `consoJourParts` porte
   * les connexions du tableau, qui n'ont pas de nom, et `consoJourHc` /
   * `consoJourHp` les compteurs que la fiche designe. En prenant les parts
   * d'abord, l'historique perdait ses libelles et reunissait tout sous
   * « Reseau » — alors que la maison sait dire lequel est lequel. */
  if (EN.consoJourHc && EN.consoJourHp) return [EN.consoJourHc, EN.consoJourHp];
  if (Array.isArray(EN.consoJourParts) && EN.consoJourParts.length) return EN.consoJourParts.filter(Boolean);
  return [EN.consoJour || EN.consoReseauToday].filter(Boolean);
}

/**
 * LA CARTE DU TARIF : ce que coûte le kilowattheure, et quand.
 *
 * Elle tient à droite de l'aperçu. Home Assistant ne publie pas les CRÉNEAUX
 * d'un contrat : il publie un capteur binaire, vrai quand on est en heures
 * creuses. La barre des vingt-quatre heures se reconstitue donc depuis son
 * historique (tarif.js) — ce qui montre ce qui s'est vraiment passé
 * aujourd'hui, et marche avec n'importe quel contrat.
 *
 * Rien ne s'affiche si rien ne se lit : ni prix, ni créneau, ni ligne de coût,
 * et la carte n'existe pas (ADR 0030).
 */
export function CarteTarif({ hass, EN = {}, tour = 0, devise = '€', etroit = false, prixHa = [], venteHa = [], coutJour = null, revenuJour = null }) {
  const { brut, num, unite } = lecteurs(hass);
  const dec = (v, d) => nombre(v, d);
  const jour = bornesStat('jour', 0);
  const t0 = jour.debut.getTime(), t1 = jour.fin.getTime();
  const etatsHc = useEtatsHist(hass, EN.hcActive || null, t0, t1, tour);
  const plages = etatsHc ? plagesVraies(etatsHc, t0, Math.min(Date.now(), t1)) : [];
  const barre = barreTarif(plages, t0, t1);
  /* `avail` exige un NOMBRE : il ne dira jamais oui d'un capteur binaire. Un
   * « on »/« off » se lit directement, et tout le reste (`unknown`,
   * `unavailable`, entité absente) vaut « on ne sait pas » — pas « heures
   * pleines », qui afficherait un prix faux. */
  const eHc = brut(EN.hcActive);
  const enHc = eHc && (eHc.state === 'on' || eHc.state === 'off') ? eHc.state === 'on' : null;
  /* Les deux prix viennent de la fiche quand elle les nomme, sinon de ce que le
   * TABLEAU DE BORD ENERGIE declare (`enPrix`, state.js) — un nombre fixe ou
   * une entite qui le publie. Sans cela, la carte ne s'affichait que chez qui
   * avait fabrique ses propres capteurs de prix (07/10).
   *
   * Deux connexions : la MOINS CHERE est l'heure creuse. Ce n'est pas une
   * devinette sur les noms — c'est la definition meme du tarif reduit. */
  const duTableau = (prixHa || [])
    .map(p => (p.valeur != null ? p.valeur : num(p.entite)))
    .filter(v => typeof v === 'number' && isFinite(v))
    .sort((x, y) => x - y);
  const hcLu = num(EN.hcPrice) != null ? num(EN.hcPrice) : (duTableau.length > 1 ? duTableau[0] : null);
  const hpLu = num(EN.hpPrice) != null ? num(EN.hpPrice)
    : (duTableau.length > 1 ? duTableau[duTableau.length - 1] : (duTableau.length === 1 ? duTableau[0] : null));
  const prix = prixDuMoment({ hc: hcLu, hp: hpLu, enHc });
  /* LE PRIX DE REVENTE. Le tableau de bord le declare en face de celui
   * d'achat ; personne n'a de capteur « tarif de rachat » par defaut, et on ne
   * le devine pas. Plusieurs connexions peuvent en porter un : on prend le
   * plus eleve, celui qu'on touche. */
  const vendu = (venteHa || [])
    .map(p => (p.valeur != null ? p.valeur : num(p.entite)))
    .filter(v => typeof v === 'number' && isFinite(v));
  const prixVente = vendu.length ? Math.max(...vendu) : null;
  const bascule = prochainTarif(plages, Date.now(), enHc);
  const heure = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const maintenant = Math.max(0, Math.min(100, (Date.now() - t0) / (t1 - t0) * 100));
  const parKwh = unite(EN.hcPrice) || unite(EN.hpPrice) || (devise + '/kWh');
  const uniteDe = (id) => unite(id) || devise;
  const lignes = [
    /* Le COUT DU JOUR vient de l'apercu, qui sait distinguer un compteur
     * journalier d'un index (`jourstat.js`) : les deux cartes disent le meme
     * chiffre, et aucune ne prend un total depuis toujours pour une journee. */
    coutJour != null && { l: tr('Coût du jour'), v: dec(coutJour, 2) + ' ' + uniteDe(EN.coutJour), c: 'var(--o-text)' },
    num(EN.coutMois) != null && { l: tr('Coût du mois'), v: dec(num(EN.coutMois), 2) + ' ' + uniteDe(EN.coutMois), c: 'var(--o-text)' },
    /* Ce que l'injection a RAPPORTE aujourd'hui, juste sous ce qu'elle a
     * coute : les deux chiffres se lisent ensemble. */
    revenuJour != null && { l: tr('Revente du jour'), v: '+' + dec(revenuJour, 2) + ' ' + (uniteDe(EN.revenuJour) || devise), c: 'var(--o-ok)' },
    num(EN.ecoMois) != null && { l: tr('Économie du mois'), v: '+' + dec(num(EN.ecoMois), 2) + ' ' + uniteDe(EN.ecoMois), c: 'var(--o-ok)' },
    num(EN.abonnement) != null && { l: tr('Abonnement'), v: dec(num(EN.abonnement), 2) + ' ' + uniteDe(EN.abonnement), c: 'var(--o-text2)' },
    num(EN.bill) != null && { l: tr('Facture en cours'), v: dec(num(EN.bill), 2) + ' ' + uniteDe(EN.bill), c: 'var(--o-text)' },
  ].filter(Boolean);
  if (prix.valeur == null && prixVente == null && !barre.length && !lignes.length) return null;

  return (
    <section style={{ ...CARTE, flex: 1, padding: etroit ? 14 : '22px 24px', display: 'flex', flexDirection: 'column' }}>
      {/* Au telephone, le prix tient sur la MEME ligne que le titre : en
        * dessous, il poussait la barre des vingt-quatre heures hors de l'ecran. */}
      <div style={etroit ? { display: 'flex', alignItems: 'flex-end', gap: 10 } : undefined}>
        <div style={etroit ? { flex: 1, minWidth: 0 } : undefined}>
          <div style={SURTITRE}>{tr('Le tarif')}</div>
          <div style={TITRE}>
            {prix.unique ? tr('Tarif unique') : prix.enHc === true ? tr('Heures creuses') : prix.enHc === false ? tr('Heures pleines') : tr('Heures creuses et pleines')}
          </div>
        </div>
        {(prix.valeur != null || prixVente != null) && (
          <div style={{ marginTop: etroit ? 0 : 18, textAlign: etroit ? 'right' : undefined }}>
            {prix.valeur != null && (
              <div style={{ fontSize: etroit ? 22 : 34, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {dec(prix.valeur, 4)}<span style={{ fontSize: etroit ? 11 : 13, fontWeight: 700, color: 'var(--o-text2)', marginLeft: etroit ? 3 : 5 }}>{parKwh}</span>
              </div>
            )}
            {/* CE QU'ON TOUCHE en revendant, sous ce qu'on paie en achetant :
              * les deux ne se comparent que cote a cote. Absent tant que le
              * tableau de bord Energie ne declare pas de tarif de rachat. */}
            {prixVente != null && (
              <div style={{ marginTop: 3, fontSize: etroit ? 10.5 : 12, fontWeight: 700, color: 'var(--o-ok)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {tr('Revendu {p}', { p: dec(prixVente, 4) + ' ' + parKwh })}
              </div>
            )}
          </div>
        )}
      </div>
      {bascule && (
        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>
          {bascule.versHc ? tr('Heures creuses à partir de {h}', { h: heure(bascule.instant) }) : tr('Heures pleines à partir de {h}', { h: heure(bascule.instant) })}
        </div>
      )}
      {barre.length > 0 && (
        <>
          {/* Le repère « maintenant » DÉBORDE de la barre, en haut comme en bas :
            * il se voit mieux, et c'est ce que fait la maquette. Il est donc
            * FRÈRE de la barre, pas dedans — l'`overflow: hidden` qui arrondit
            * les créneaux le couperait net. */}
          <div style={{ position: 'relative', marginTop: 20 }}>
            <div style={{ position: 'relative', height: 10, borderRadius: 6, overflow: 'hidden', background: 'var(--o-accent-fond)' }}>
              {barre.map((p, i) => (
                <span key={i} aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: p.gauche + '%', width: p.largeur + '%', background: 'rgba(var(--o-cold-rgb),.4)' }} />
              ))}
            </div>
            <span aria-hidden="true" style={{ position: 'absolute', top: -5, left: maintenant + '%', width: 3, height: 20, borderRadius: 2, background: 'var(--o-text)', boxShadow: '0 0 0 2px var(--o-surfB)', transform: 'translateX(-50%)' }} />
          </div>
          {/* Minuit à minuit. Le dernier repère s'aligne à DROITE : centré sur
            * 100 %, la moitié de « 24h » sortirait de la carte. */}
          <div aria-hidden="true" style={{ position: 'relative', height: 14, marginTop: 7, fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>
            {[0, 6, 12, 18, 24].map(h => (
              <span key={h} style={h === 24 ? { position: 'absolute', right: 0 } : { position: 'absolute', left: (h / 24 * 100) + '%', transform: h ? 'translateX(-50%)' : 'none' }}>
                {repereHeure(h)}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, fontSize: 12, fontWeight: 700, color: 'var(--o-text2)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: 'rgba(var(--o-cold-rgb),.55)' }} />{tr('Heures creuses')}{hcLu != null && <span style={{ color: 'var(--o-text)', fontVariantNumeric: 'tabular-nums' }}>{dec(hcLu, 4)}</span>}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--o-accent-fond)' }} />{tr('Heures pleines')}{hpLu != null && <span style={{ color: 'var(--o-text)', fontVariantNumeric: 'tabular-nums' }}>{dec(hpLu, 4)}</span>}</span>
          </div>
        </>
      )}
      {lignes.length > 0 && (
        <div style={{ marginTop: 18 }}>
          {lignes.map(r => (
            <div key={r.l} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{r.l}</span>
              <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: r.c }}>{r.v}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * L'HISTORIQUE feuilletable : jour, semaine, mois, année.
 *
 * Les compteurs sont ceux que la vue lit déjà pour « aujourd'hui » : rien de
 * neuf à régler, Home Assistant tient les statistiques de tout capteur qui
 * déclare un `state_class`. Sans statistiques — pas de `recorder`, ou des
 * compteurs trop jeunes — la section n'existe pas.
 */
export function SectionHistorique({ hass, EN = {}, tour = 0, devise = '€', etroit = false }) {
  const { unite } = lecteurs(hass);
  const [periode, setPeriode] = useState('jour');
  const [recul, setRecul] = useState(0);
  const [comparer, setComparer] = useState(false);
  const dec = (v, d) => nombre(v, d);

  const aHcHp = !!(EN.consoJourHc && EN.consoJourHp);
  const consoIds = compteursConso(EN);
  // Le coût voyage avec les kWh : une seule requête pour la période entière.
  const ids = [...consoIds, EN.prodJour, EN.coutJour].filter(Boolean);
  const facteurs = {};
  ids.forEach(id => { facteurs[id] = id === EN.coutJour ? 1 : facteurKwh(unite(id)); });
  const hist = useStats(hass, ids, periode, recul, tour, facteurs);
  /* La période PRÉCÉDENTE, pour la comparaison : une deuxième lecture, et
   * seulement quand la bascule est mise — sinon on paierait une requête de plus
   * à chaque changement de page pour une ligne que personne ne regarde. */
  const avant = useStats(hass, comparer ? consoIds : [], periode, recul + 1, tour, facteurs);

  /* Plusieurs compteurs sous un seul nom : leurs valeurs s'additionnent case
   * par case. Une case reste vide tant qu'AUCUN n'a parlé. */
  const sommeDe = (sources, liste, nom, couleur) => {
    const dispo = liste.filter(id => Array.isArray(sources[id]));
    if (!dispo.length) return null;
    if (dispo.length === 1) return { nom, couleur, valeurs: sources[dispo[0]] };
    const n = hist.cases.length;
    const v = Array.from({ length: n }, () => null);
    dispo.forEach(id => sources[id].forEach((x, i) => {
      if (x != null && isFinite(x) && i < n) v[i] = (v[i] || 0) + x;
    }));
    return { nom, couleur, valeurs: v };
  };
  const une = (id, nom, couleur) => (id && Array.isArray(hist.series[id])) ? { nom, couleur, valeurs: hist.series[id] } : null;
  /* Deux compteurs NOMMÉS heures creuses et pleines se dessinent chacun dans sa
   * couleur ; deux compteurs anonymes n'ont pas de nom à afficher — ils se
   * réunissent sous « Réseau », plutôt que d'inventer lequel est lequel. */
  const nommes = aHcHp && consoIds.length === 2 && consoIds[0] === EN.consoJourHc;
  const series = [
    ...(nommes
      ? [une(EN.consoJourHc, tr('Heures creuses'), 'var(--o-ok)'), une(EN.consoJourHp, tr('Heures pleines'), 'var(--o-accent)')]
      : [sommeDe(hist.series, consoIds, tr('Réseau'), 'var(--o-accent)')]),
    une(EN.prodJour, tr('Solaire'), 'var(--o-gold)'),
  ].filter(Boolean);
  const cmp = comparer ? sommeDe(avant.series, consoIds, '', '') : null;
  const veille = cmp ? cmp.valeurs : null;
  /* LA SECTION NE DISPARAIT PAS LE TEMPS D'UNE REQUETE. Changer de periode
   * relance la lecture : les series repartaient vides, le composant rendait
   * `null`, la carte s'effaçait et la page remontait d'un coup sous le doigt.
   * On garde le dernier graphe lisible jusqu'à l'arrivée du suivant. */
  const dernier = useRef(null);
  if (series.length) dernier.current = { series, cases: hist.cases };
  const vu = series.length ? { series, cases: hist.cases } : dernier.current;
  if (!vu) return null;

  const totalDe = (liste) => {
    let s = null;
    liste.filter(Boolean).forEach(id => { const v = sommeStat(hist.series[id]); if (v != null) s = (s || 0) + v; });
    return s;
  };
  const tConso = totalDe(consoIds);
  const tProd = EN.prodJour ? sommeStat(hist.series[EN.prodJour]) : null;
  const tCout = EN.coutJour ? sommeStat(hist.series[EN.coutJour]) : null;
  const PERIODES = [['jour', tr('Jour')], ['semaine', tr('Semaine')], ['mois', tr('Mois')], ['annee', tr('Année')]];
  /* « Aujourd'hui » et « Hier » sont des MOTS : `libellePeriode` ne rend que des
   * dates (stats.js), la traduction reste ici. */
  const titre = periode === 'jour' && recul === 0 ? tr('Aujourd’hui')
    : periode === 'jour' && recul === 1 ? tr('Hier')
      : periode === 'semaine' && recul === 0 ? tr('Cette semaine')
        : periode === 'mois' && recul === 0 ? tr('Ce mois-ci')
          : periode === 'annee' && recul === 0 ? tr('Cette année')
            : libellePeriode(periode, recul);

  return (
    <section style={{ ...CARTE, padding: etroit ? 14 : '22px 24px 20px' }}>
      {(() => {
        const totaux = [
          tConso != null && { l: tr('Consommation'), v: dec(tConso, 1), u: 'kWh' },
          tProd != null && { l: tr('Production'), v: dec(tProd, 1), u: 'kWh' },
          tCout != null && { l: tr('Coût'), v: dec(tCout, 2), u: devise },
        ].filter(Boolean);
        /* Au telephone les totaux passent SOUS les reglages, encadres et sur
          * trois colonnes : alignes a droite du titre, ils le compressaient
          * jusqu'a l'ellipse. */
        if (etroit) {
          return (
            <>
              <div style={SURTITRE}>{tr('Historique')}</div>
              <div style={TITRE}>{titre}</div>
            </>
          );
        }
        return (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={SURTITRE}>{tr('Historique')}</div>
              <div style={TITRE}>{titre}</div>
            </div>
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
              {totaux.map(x => (
                <div key={x.l} style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)' }}>{x.l}</div>
                  <div style={{ marginTop: 3, fontSize: 17, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{x.v}<span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)', marginLeft: 4 }}>{x.u}</span></div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {/* Pas de `o-bar` ici : cette barre porte QUATRE réglages distincts, dont
        * une bascule. `.o-bar` les met sur une seule ligne qui glisse
        * (index.css, sous 760 px) et « Comparer » devenait inatteignable au
        * téléphone — elle passe à la ligne, comme celle des ambiances. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <div className={CL_ONGLETS} style={ONGLETS}>
          {PERIODES.map(([id, lb]) => (
            <button key={id} onClick={() => { setPeriode(id); setRecul(0); }} aria-pressed={periode === id} style={onglet(periode === id)}>{lb}</button>
          ))}
        </div>
        {/* AU TELEPHONE la navigation prend sa propre ligne, avec des boutons
          * assez grands pour le pouce. Serree contre les periodes, elle
          * n'offrait que des cibles de trente pixels. */}
        <div style={etroit
          ? { display: 'flex', alignItems: 'center', gap: 6, width: '100%' }
          : { display: 'inline-flex', alignItems: 'center', gap: 2, height: 38, padding: '0 3px', borderRadius: 12, background: 'var(--o-well)', border: 'var(--o-bw,1px) solid var(--o-bd2)', flexShrink: 0 }}>
          <button onClick={() => setRecul(r => Math.min(RECUL_MAX[periode], r + 1))} disabled={recul >= RECUL_MAX[periode]} aria-label={tr('Période précédente')}
            style={etroit
              ? { width: 44, height: 38, flexShrink: 0, border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 11, background: 'var(--o-well)', color: 'var(--o-text1)', cursor: recul >= RECUL_MAX[periode] ? 'default' : 'pointer', opacity: recul >= RECUL_MAX[periode] ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }
              : { width: 32, height: 30, border: 'none', borderRadius: 9, background: 'none', color: 'var(--o-text1)', cursor: recul >= RECUL_MAX[periode] ? 'default' : 'pointer', opacity: recul >= RECUL_MAX[periode] ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i="angle-small-left" size={15} /></button>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, flex: etroit ? 1 : undefined, minWidth: 0, padding: '0 6px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', fontVariantNumeric: 'tabular-nums' }}><Fi i="calendar" size={12} color="var(--o-text3)" />{libellePeriode(periode, recul)}</span>
          <button onClick={() => setRecul(r => Math.max(0, r - 1))} disabled={recul === 0} aria-label={tr('Période suivante')}
            style={etroit
              ? { width: 44, height: 38, flexShrink: 0, border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 11, background: 'var(--o-well)', color: 'var(--o-text1)', cursor: recul === 0 ? 'default' : 'pointer', opacity: recul === 0 ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }
              : { width: 32, height: 30, border: 'none', borderRadius: 9, background: 'none', color: 'var(--o-text1)', cursor: recul === 0 ? 'default' : 'pointer', opacity: recul === 0 ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i="angle-small-right" size={15} /></button>
        </div>
        {/* Les totaux, encadres sur trois colonnes : leur place au telephone,
          * sous les reglages et au-dessus du trace. */}
        {etroit && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 6, width: '100%' }}>
            {[
              tConso != null && { l: tr('Consommation'), v: dec(tConso, 1), u: 'kWh' },
              tProd != null && { l: tr('Production'), v: dec(tProd, 1), u: 'kWh' },
              tCout != null && { l: tr('Coût'), v: dec(tCout, 2), u: devise },
            ].filter(Boolean).map(x => (
              <div key={x.l} style={{ minWidth: 0, padding: '8px 10px', background: 'var(--o-well)', border: 'var(--o-bw,1px) solid var(--o-bd3)', borderRadius: 14 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.l}</div>
                <div style={{ marginTop: 3, fontSize: 14, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{x.v}<span style={{ fontSize: 10, fontWeight: 700, color: 'var(--o-text2)', marginLeft: 2 }}>{x.u}</span></div>
              </div>
            ))}
          </div>
        )}
        {!etroit && <button onClick={() => setComparer(v => !v)} aria-pressed={comparer}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 9, height: 38, padding: '0 6px', border: 'none', background: 'none', color: 'var(--o-text2)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          <span style={{ position: 'relative', width: 34, height: 20, borderRadius: 999, background: comparer ? 'var(--o-accent-fond)' : 'var(--o-well0)', transition: 'background .2s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 2, left: comparer ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .25s cubic-bezier(.34,1.56,.64,1)' }} />
          </span>
          {tr('Comparer')}
        </button>}
        {!etroit && <span style={{ flex: 1 }} />}
        {!etroit && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, fontWeight: 700, color: 'var(--o-text2)' }}>
            {vu.series.map(s => (
              <span key={s.nom} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: s.couleur }} />{s.nom}</span>
            ))}
            {comparer && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 12, borderTop: '2px dashed var(--o-text3)' }} />{tr('Période précédente')}</span>}
          </div>
        )}
      </div>
      {/* UNE JOURNÉE se lit en courbe, le reste en barres : vingt-quatre points
        * dessinent un relief, trente-et-un jours comparent des totaux. */}
      <EnHistoBarres cases={vu.cases} series={vu.series} veille={veille} veilleNom={tr('Période précédente')}
        /* EN BARRES, LA JOURNEE AUSSI (08/10). Elle se tracait en aires
         * lissees : la courbe s'arretait net a l'heure courante, « coupee »,
         * alors qu'une barre absente dit simplement que l'heure n'est pas
         * passee. Les quatre periodes se lisent desormais pareil. */
        unite="kWh" decimales={periode === 'annee' ? 0 : 1} hauteur={etroit ? 190 : 290} mode="barres" />
      {etroit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 11.5, fontWeight: 700, color: 'var(--o-text2)' }}>
          {vu.series.map(s => (
            <span key={s.nom} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: s.couleur }} />{s.nom}</span>
          ))}
          <span style={{ flex: 1 }} />
          <button onClick={() => setComparer(v => !v)} aria-pressed={comparer}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: 0, border: 'none', background: 'none', color: 'var(--o-text2)', font: 'inherit', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
            <span style={{ position: 'relative', width: 34, height: 20, borderRadius: 999, background: comparer ? 'var(--o-accent-fond)' : 'var(--o-well0)', transition: 'background .2s', flexShrink: 0 }}>
              <span style={{ position: 'absolute', top: 2, left: comparer ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .25s cubic-bezier(.34,1.56,.64,1)' }} />
            </span>
            {tr('Veille')}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * LE DETAIL D'UNE JOURNEE, ouvert en cliquant une case du calendrier.
 *
 * Le calendrier dit « ce jour-la, 14 kWh » et s'arrete la. La feuille repond
 * aux deux questions suivantes : a quelle heure, et combien ca a coute. On y
 * retrouve les trois chiffres du jour, son heure la plus chargee, et le profil
 * heure par heure — le meme trace que l'historique, en plus petit.
 *
 * `jour` est l'instant de MINUIT du jour choisi. Le recul se compte en JOURS
 * de calendrier, pas en tranches de 24 h : celle du changement d'heure en fait
 * 23 ou 25, et la feuille se serait ouverte sur la veille.
 */
function FeuilleJour({ hass, EN = {}, jour, devise = '\u20ac', onClose }) {
  const { unite } = lecteurs(hass);
  const dec = (v, d) => nombre(v, d);
  const d = new Date(jour);
  const minuit = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const recul = Math.max(0, Math.round((minuit(new Date()) - minuit(d)) / 864e5));

  const consoIds = compteursConso(EN);
  const ids = [...consoIds, EN.prodJour, EN.coutJour].filter(Boolean);
  const facteurs = {};
  ids.forEach(id => { facteurs[id] = id === EN.coutJour ? 1 : facteurKwh(unite(id)); });
  const h = useStats(hass, ids, 'jour', recul, 0, facteurs);

  const sommeDe = (liste) => {
    let s = null;
    liste.filter(Boolean).forEach(id => { const v = sommeStat(h.series[id]); if (v != null) s = (s || 0) + v; });
    return s;
  };
  const une = (id, nom, couleur) => (id && Array.isArray(h.series[id])) ? { nom, couleur, valeurs: h.series[id] } : null;
  /* Plusieurs compteurs de reseau SANS nom connu se somment en une seule
   * courbe : « Reseau ». Deux compteurs nommes — heures creuses et heures
   * pleines — gardent chacun le sien, c'est tout l'interet de les separer. */
  const reunies = () => {
    const dispo = consoIds.filter(id => Array.isArray(h.series[id]));
    if (!dispo.length) return null;
    if (dispo.length === 1) return { nom: tr('Réseau'), couleur: 'var(--o-accent)', valeurs: h.series[dispo[0]] };
    const n = h.cases.length;
    const v = Array.from({ length: n }, () => null);
    dispo.forEach(id => h.series[id].forEach((x, i) => { if (x != null && isFinite(x) && i < n) v[i] = (v[i] || 0) + x; }));
    return { nom: tr('Réseau'), couleur: 'var(--o-accent)', valeurs: v };
  };
  const nommes = consoIds.length === 2 && consoIds[0] === EN.consoJourHc && consoIds[1] === EN.consoJourHp;
  const parts = [
    ...(nommes
      ? [une(EN.consoJourHc, tr('Heures creuses'), 'var(--o-ok)'), une(EN.consoJourHp, tr('Heures pleines'), 'var(--o-accent)')]
      : [reunies()]),
    une(EN.prodJour, tr('Solaire'), 'var(--o-gold)'),
  ].filter(Boolean);

  const chiffres = [
    { l: tr('Consommation'), v: sommeDe(consoIds), u: 'kWh', d: 1 },
    { l: tr('Production'), v: EN.prodJour ? sommeStat(h.series[EN.prodJour]) : null, u: 'kWh', d: 1 },
    { l: tr('Coût'), v: EN.coutJour ? sommeStat(h.series[EN.coutJour]) : null, u: devise, d: 2 },
  ].filter(x => x.v != null);

  /* L'HEURE LA PLUS CHARGEE : le genre de detail qu'on vient chercher en
   * ouvrant une journee, et qu'un total ne dit pas. Le solaire en est exclu —
   * la pointe cherchee est celle de la consommation. */
  const pointe = (() => {
    const conso = parts.filter(p => p.couleur !== 'var(--o-gold)');
    if (!conso.length || !h.cases.length) return null;
    let meilleur = null;
    h.cases.forEach((c, i) => {
      let s = null;
      conso.forEach(p => { const v = p.valeurs[i]; if (v != null && isFinite(v)) s = (s || 0) + v; });
      if (s != null && s > 0 && (!meilleur || s > meilleur.v)) meilleur = { v: s, label: c.label };
    });
    return meilleur;
  })();

  const CHIFFRE = { minWidth: 0, padding: '10px 12px', background: 'var(--o-well)', border: 'var(--o-bw,1px) solid var(--o-bd3)', borderRadius: 14 };
  return (
    <BottomSheet onClose={onClose} title={d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
      <div style={{ padding: '0 2px 6px' }}>
        {chiffres.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(104px,1fr))', gap: 10 }}>
            {chiffres.map(x => (
              <div key={x.l} style={CHIFFRE}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.l}</div>
                <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {dec(x.v, x.d)}<span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', marginLeft: 3 }}>{x.u}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text3)' }}>{h.pret ? tr('pas encore de données') : tr('Chargement…')}</div>
        )}

        {pointe && (
          <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>
            {tr('Heure la plus chargée')} · {pointe.label} · {dec(pointe.v, 2)} kWh
          </div>
        )}

        {parts.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 16, fontSize: 12, fontWeight: 700, color: 'var(--o-text2)' }}>
              {parts.map(p => (
                <span key={p.nom} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 3, background: p.couleur, flexShrink: 0 }} />{p.nom}
                </span>
              ))}
            </div>
            {/* En barres comme l'historique : ce sont les memes heures. */}
            <EnHistoBarres cases={h.cases} series={parts} unite="kWh" decimales={2} hauteur={190} mode="barres" />
          </>
        )}
      </div>
    </BottomSheet>
  );
}

/**
 * Le calendrier des douze derniers mois.
 *
 * Il vient APRÈS les postes de consommation, d'où un composant à part : les
 * trois voyagent dans le même module, donc dans le même chargement.
 */
export function EnergieCalendrier({ hass, EN = {}, tour = 0, devise = '€', etroit = false }) {
  const { unite } = lecteurs(hass);
  const [mesure, setMesure] = useState('conso');
  /* AU TELEPHONE, un MOIS a la fois : trente-et-une colonnes sur douze lignes
   * sont illisibles sur 390 px. On feuillette donc les mois, comme un vrai
   * calendrier — c'est ce que montre la maquette mobile. */
  const [moisRecul, setMoisRecul] = useState(0);
  /* Le jour dont on lit le detail, ou `null`. Une case du calendrier l'ouvre —
   * l'infobulle du systeme ne disait qu'une valeur, en noir sur blanc, hors du
   * theme (demande du 07/10). */
  const [jourOuvert, setJourOuvert] = useState(null);
  /* LE MEME REMEDE QUE POUR LE DAMIER ET L'HISTORIQUE. Changer de mois relance
   * la lecture : la serie repartait vide, le composant rendait `null`, la carte
   * s'effacait et la page remontait d'un coup sous le doigt. On garde le
   * dernier mois lisible jusqu'a l'arrivee du suivant — les cases voyagent avec
   * lui, elles changent de mois en meme temps que les valeurs. */
  const dernierMois = useRef(null);
  const dec = (v, d) => nombre(v, d);

  const consoIds = compteursConso(EN);
  const PAR_MESURE = {
    conso: consoIds,
    prod: [EN.prodJour].filter(Boolean),
    cout: [EN.coutJour].filter(Boolean),
  };
  const choix = PAR_MESURE[mesure] && PAR_MESURE[mesure].length ? mesure : (PAR_MESURE.conso.length ? 'conso' : null);
  const liste = choix ? PAR_MESURE[choix] : [];
  const facteurs = {};
  liste.forEach(id => { facteurs[id] = choix === 'cout' ? 1 : facteurKwh(unite(id)); });
  const cal = useStats(hass, liste, etroit ? 'mois' : 'calendrier', etroit ? moisRecul : 0, tour, facteurs);
  const serie = (() => {
    const dispo = liste.filter(id => Array.isArray(cal.series[id]));
    if (!dispo.length) return null;
    const n = cal.cases.length;
    const out = Array.from({ length: n }, () => null);
    dispo.forEach(id => cal.series[id].forEach((v, i) => {
      if (v != null && isFinite(v) && i < n) out[i] = (out[i] || 0) + v;
    }));
    return out;
  })();
  const frais = (serie && !etroit) ? damier(cal.cases, serie) : [];
  /* Comme l'historique : passer de « Consommation » à « Production » relance la
   * lecture, et un damier vide ferait disparaître la carte sous le doigt. */
  const dernier = useRef(null);
  if (frais.length) dernier.current = frais;
  const mois = frais.length ? frais : dernier.current;
  if (!etroit && (!mois || !mois.length)) return null;
  if (etroit && serie) dernierMois.current = { cases: cal.cases, serie };
  const vuMois = etroit ? (serie ? { cases: cal.cases, serie } : dernierMois.current) : null;
  if (etroit && !vuMois) return null;
  const TEINTE = { conso: 'var(--o-accent-rgb)', prod: 'var(--o-gold-rgb)', cout: 'var(--o-purple-rgb)' };
  const estCout = choix === 'cout';
  const totalMois = etroit && vuMois ? sommeStat(vuMois.serie) : null;
  const fmt = (v) => (estCout ? dec(v, 2) + ' ' + devise : dec(v, 1) + ' kWh');

  return (
    <section style={{ ...CARTE, padding: etroit ? 14 : '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={SURTITRE}>{tr('Le calendrier')}</div>
          <div style={TITRE}>{etroit ? tr('{m} par jour', { m: MESURE_NOM()[choix] || MESURE_NOM().conso }) : tr('Les douze derniers mois')}</div>
        </div>
        {etroit && totalMois != null && (
          <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{tr('Total du mois')}</div>
            <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(totalMois)}</div>
          </div>
        )}
        <div className={CL_ONGLETS} style={ONGLETS}>
          {[['conso', tr('Consommation')], ['prod', tr('Production')], ['cout', tr('Coût')]]
            .filter(([id]) => PAR_MESURE[id] && PAR_MESURE[id].length).map(([id, lb]) => (
              <button key={id} onClick={() => setMesure(id)} aria-pressed={choix === id} style={onglet(choix === id)}>{lb}</button>
            ))}
        </div>
      </div>
      {etroit ? (
        <>
          {/* Un mois a la fois : la fleche de gauche remonte, celle de droite
            * s'arrete au mois en cours — on ne feuillette pas l'avenir. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
            <button onClick={() => setMoisRecul(r => Math.min(RECUL_MAX.mois, r + 1))} disabled={moisRecul >= RECUL_MAX.mois} aria-label={tr('Période précédente')}
              style={{ width: 44, height: 38, flexShrink: 0, border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 11, background: 'var(--o-well)', color: 'var(--o-text1)', cursor: moisRecul >= RECUL_MAX.mois ? 'default' : 'pointer', opacity: moisRecul >= RECUL_MAX.mois ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i="angle-small-left" size={15} /></button>
            <span style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden' }}>{libellePeriode('mois', moisRecul)}</span>
            <button onClick={() => setMoisRecul(r => Math.max(0, r - 1))} disabled={moisRecul === 0} aria-label={tr('Période suivante')}
              style={{ width: 44, height: 38, flexShrink: 0, border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 11, background: 'var(--o-well)', color: 'var(--o-text1)', cursor: moisRecul === 0 ? 'default' : 'pointer', opacity: moisRecul === 0 ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i="angle-small-right" size={15} /></button>
          </div>
          <div style={{ marginTop: 12 }}>
            <CalendrierMois cases={vuMois.cases} serie={vuMois.serie} rgb={TEINTE[choix] || TEINTE.conso} formater={(v) => dec(v, estCout ? 2 : 0)} onJour={setJourOuvert} />
          </div>
        </>
      ) : (
        <div style={{ marginTop: 16 }}>
          <EnCalendrier mois={mois} rgb={TEINTE[choix] || TEINTE.conso} formater={fmt} onJour={setJourOuvert} />
        </div>
      )}
      {jourOuvert != null && (
        <FeuilleJour hass={hass} EN={EN} jour={jourOuvert} devise={devise} onClose={() => setJourOuvert(null)} />
      )}
    </section>
  );
}

/**
 * LES BILANS du mois et de l'année, sous l'aperçu.
 *
 * Ils exigeaient des capteurs `consoMois`, `consoAnnee`, `prodAnnee` — que
 * Home Assistant ne publie nulle part. Seule une maison qui les avait fabriqués
 * à la main voyait ces trois tuiles (07/10).
 *
 * Ils se calculent maintenant depuis les STATISTIQUES, qui existent chez tout
 * le monde : UNE requête sur l'année au pas du mois donne douze lignes — la
 * dernière est le mois en cours, leur somme est l'année. Les capteurs de la
 * fiche gardent la priorité quand ils existent : une maison qui tient ses
 * propres compteurs sait mieux que nous ce qu'elle veut montrer.
 */
export function BilansEnergie({ hass, EN = {}, tour = 0, devise = '€', etroit = false }) {
  const { avail, num, unite, kwh } = lecteurs(hass);
  const dec = (v, d) => nombre(v, d);
  const consoIds = compteursConso(EN);
  const ids = [...consoIds, EN.prodJour, EN.coutJour].filter(Boolean);
  const facteurs = {};
  ids.forEach(id => { facteurs[id] = id === EN.coutJour ? 1 : facteurKwh(unite(id)); });
  const an = useStats(hass, ids, 'annee', 0, tour, facteurs);

  /* Le mois en cours est la DERNIÈRE case lue, pas la douzième : en janvier,
   * les onze suivantes n'existent pas encore. */
  const dernierMois = (liste) => {
    let s = null;
    liste.filter(Boolean).forEach(id => {
      const serie = an.series[id];
      if (!Array.isArray(serie)) return;
      for (let i = serie.length - 1; i >= 0; i--) {
        if (serie[i] != null && isFinite(serie[i])) { s = (s || 0) + serie[i]; return; }
      }
    });
    return s;
  };
  const total = (liste) => {
    let s = null;
    liste.filter(Boolean).forEach(id => { const v = sommeStat(an.series[id]); if (v != null) s = (s || 0) + v; });
    return s;
  };
  // Le capteur de la fiche d'abord, la statistique ensuite.
  const ou = (id, calcule) => (avail(id) ? kwh(id) : calcule);
  const consoMois = ou(EN.consoMois, dernierMois(consoIds));
  const consoAn = ou(EN.consoAnnee, total(consoIds));
  const prodAn = ou(EN.prodAnnee, EN.prodJour ? total([EN.prodJour]) : null);
  const coutMois = avail(EN.coutMois) ? num(EN.coutMois) : (EN.coutJour ? dernierMois([EN.coutJour]) : null);
  const uniteDe = (id) => unite(id) || devise;
  const eco = avail(EN.ecoMois) ? num(EN.ecoMois) : null;

  const tuiles = [
    consoMois != null && { l: tr('Consommation du mois'), v: dec(consoMois, 1), u: 'kWh', s: coutMois != null ? dec(coutMois, 2) + ' ' + uniteDe(EN.coutMois || EN.coutJour) : null },
    consoAn != null && { l: tr('Consommation de l’année'), v: dec(consoAn, 0), u: 'kWh', s: null },
    prodAn != null && { l: tr('Production de l’année'), v: dec(prodAn, 0), u: 'kWh', s: eco != null ? tr('{v} économisés', { v: dec(eco, 2) + ' ' + uniteDe(EN.ecoMois) }) : null },
  ].filter(Boolean);
  if (!tuiles.length) return null;

  /* AU TELEPHONE les bilans sont des LIGNES, pas des tuiles : trois cartes de
   * plus sous l'ecran, pour trois nombres qu'on lit en passant. Libelle a
   * gauche, valeur a droite, un trait entre chacune. */
  if (etroit) {
    return (
      <div style={{ marginTop: 6 }}>
        {tuiles.map(b => (
          <div key={b.l} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.l}</div>
              {b.s && <div style={{ marginTop: 2, fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.s}</div>}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{b.v}<span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', marginLeft: 3 }}>{b.u}</span></div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginTop: 24 }}>
      {tuiles.map(b => (
        <div key={b.l} style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--o-well)', border: 'var(--o-bw,1px) solid var(--o-bd3)', minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)' }}>{b.l}</div>
          <div style={{ marginTop: 7, fontSize: 22, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{b.v}<span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)', marginLeft: 4 }}>{b.u}</span></div>
          {b.s && <div style={{ marginTop: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.s}</div>}
        </div>
      ))}
    </div>
  );
}
