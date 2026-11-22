/* Le Nuancier (20/11) : tous les éléments de base de Loggia sous le thème appliqué.
 *
 * La Bibliothèque montre les CARTES ; le Nuancier montre ce dont elles sont faites — les jetons de couleur (avec le
 * contraste réellement obtenu), l'écriture, les formes, les commandes et une popup. Un sélecteur change le thème et le
 * mode en direct : un défaut de thème se voit d'un coup d'œil, sans fouiller l'application.
 *
 * Rien n'est dessiné à part : chaque élément est le VRAI (styles.js, parcommun.jsx, ui.jsx). Une valeur affichée est
 * lue sur la page (getComputedStyle), après que le thème l'a posée — jamais recopiée d'une table. Rien ne pilote la
 * maison ici. */
import { useState, useEffect } from 'react';
import { Fi, Bascule, ListeChoix, Gauge, MetricTile, BottomSheet, TitreFeuille } from '../ui.jsx';
import { puce, puceHaute, petitesCapitales, NOM_CARTE, SOUS_CARTE, ICONE_CARTE, LISERE, sectionTitle } from '../styles.js';
import { btnPrimaire, btnSecondaire, btnDiscret, btnDanger } from '../views/parcommun.jsx';
import { PRESET_META } from '../views/parametres.jsx';
import { lireCouleur, contraste, composer, SEUILS } from '../contraste.js';
import { tr } from '../i18n.js';
import { dec } from '../app/noyau.jsx';

/* Les jetons montrés, par famille. Les textes portent le seuil que la garde de contraste leur tient (contraste.js). */
const JETONS_PAR_FAMILLE = () => [
  { t: tr('Fonds'), j: ['--o-bg', '--o-bg2', '--o-s1', '--o-s2', '--o-s3', '--o-surfA', '--o-surfB', '--o-well'] },
  { t: tr('Textes'), j: [['--o-text', SEUILS.texte], ['--o-text1', SEUILS.wcag], ['--o-text2', SEUILS.text2], ['--o-text3', SEUILS.text3]] },
  { t: tr('Lignes'), j: ['--o-bd1', '--o-bd2', '--o-bd3'] },
  { t: tr('Accent'), j: ['--o-accent', '--o-accent-soft', '--o-accent-fond'] },
  { t: tr('États et teintes'), j: ['--o-ok', '--o-warn', '--o-warn2', '--o-bad', '--o-cold', '--o-lampe', '--o-purple', '--o-cyan', '--o-gold', '--o-rose', '--o-orange'] },
];

const lireJeton = (nom) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(nom).trim(); } catch { return ''; }
};

/* Relit les jetons quand le thème ou le mode change : `applyTheme` les pose dans un effet, après ce rendu-ci. On
 * attend donc que la racine change (classe ou style), puis une image. */
function useJetons(cle) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const relire = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setN(x => x + 1)); };
    relire();
    const obs = new MutationObserver(relire);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    return () => { obs.disconnect(); cancelAnimationFrame(raf); };
  }, [cle]);
  return n;
}

const Titre = ({ i, t }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '30px 0 12px' }}>
    <Fi i={i} size={16} color="var(--o-accent-soft)" />
    <h2 style={{ ...sectionTitle }}>{t}</h2>
  </div>
);

const Etiquette = ({ children }) => <span style={{ ...petitesCapitales(10.5), color: 'var(--o-text3)' }}>{children}</span>;

const Mono = ({ children, c = 'var(--o-text2)' }) => (
  <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 11, color: c, overflowWrap: 'anywhere' }}>{children}</span>
);

/* Une pastille de couleur : le jeton en fond, son nom, sa valeur ; pour un texte, le contraste obtenu là où la garde
 * le tient (contraste.js, `garde`) — la page et une carte (`--o-surfA`) au seuil du jeton, une puce (`--o-s1`) au
 * seuil WCAG simple. Mesuré autrement, le nuancier dénoncerait des défauts que le thème n'a pas. */
function Pastille({ nom, seuil }) {
  const val = lireJeton(nom);
  let mesure = null;
  if (seuil) {
    const fond = lireCouleur(lireJeton('--o-bg'));
    const texte = lireCouleur(val);
    if (fond && texte) {
      const sur = (jeton) => { const c = lireCouleur(lireJeton(jeton)); return c ? contraste(texte, composer(fond, c)) : null; };
      const page = contraste(texte, fond);
      const carte = sur('--o-surfA');
      const puceS1 = sur('--o-s1');
      mesure = { page, carte, puce: puceS1,
        ok: page >= seuil && (carte == null || carte >= seuil) && (puceS1 == null || puceS1 >= SEUILS.wcag) };
    }
  }
  const un = (x) => (x == null ? '—' : dec(x, 1));
  return (
    <div style={{ width: 148, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Un contour NEUTRE, pas le liseré du thème : sous un thème sans filet (Neumorphix, iOS), une pastille de la
        * couleur du fond disparaîtrait — la pastille doit se voir, quel que soit le thème. */}
      <div style={{ height: 52, borderRadius: 'var(--o-radius, 14px)', border: '1px solid rgba(128,128,128,.35)', background: seuil ? 'var(--o-bg)' : `var(${nom})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {seuil && <span style={{ color: `var(${nom})`, fontSize: 20, fontWeight: 700 }}>{tr('Aa')}</span>}
      </div>
      <Mono c="var(--o-text1)">{nom}</Mono>
      <Mono>{val || '—'}</Mono>
      {mesure && (
        <span style={{ fontSize: 11, fontWeight: 700, color: mesure.ok ? 'var(--o-ok)' : 'var(--o-bad)' }}>
          {tr('Page {a} · carte {b} · puce {c}', { a: un(mesure.page), b: un(mesure.carte), c: un(mesure.puce) })}
          <br />
          <span style={{ fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Seuil {s}:1, puce {w}:1', { s: dec(seuil, 1), w: dec(SEUILS.wcag, 1) })}</span>
        </span>
      )}
    </div>
  );
}

const Ligne = ({ l, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 180px) 1fr', gap: 16, alignItems: 'center', padding: '12px 0', borderTop: LISERE }}>
    <Etiquette>{l}</Etiquette>
    <div style={{ minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>{children}</div>
  </div>
);

const Forme = ({ l, style }) => (
  <div style={{ width: 150, display: 'flex', flexDirection: 'column', gap: 8 }}>
    {/* La surface d'une carte, telle que les cartes la posent (MetricTile, CARTE_RAIL) : le dégradé surfA → surfB. */}
    <div style={{ height: 88, borderRadius: 'var(--o-radius, 18px)', background: 'linear-gradient(180deg, var(--o-surfA), var(--o-surfB))', ...style }} />
    <Etiquette>{l}</Etiquette>
  </div>
);

function NuancierView({ loggiaTheme = '', themeMode = 'dark', onPickTheme = null, onMode = null }) {
  useJetons(loggiaTheme + '|' + themeMode);
  const [bascule, setBascule] = useState(true);
  const [choix, setChoix] = useState('salon');
  const [puceOn, setPuceOn] = useState('jour');
  const [popup, setPopup] = useState(false);
  const themes = PRESET_META();
  const courant = themes.find(p => p.id === (loggiaTheme || '')) || themes[0];
  const modes = [['dark', tr('Sombre')], ['light', tr('Clair')], ['auto', tr('Auto')]];

  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, padding: '26px 28px 40px', overflowX: 'hidden' }}>
      <h1 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Nuancier')}</h1>
      <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 4 }}>
        {tr('Les éléments de base de Loggia sous le thème appliqué. Rien ne pilote la maison ici.')}
      </div>

      {/* Le thème et le mode, en direct : les mêmes réglages que Paramètres › Apparence. */}
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {themes.map(p => {
            const on = p.id === (loggiaTheme || '');
            return (
              <button key={p.id || 'loggia'} type="button" aria-pressed={on} disabled={!onPickTheme}
                onClick={() => onPickTheme && onPickTheme(p.id)} style={{ ...puce(on), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: p.cols[0], boxShadow: '0 0 0 1px rgba(255,255,255,.35)' }} />
                {p.name}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {modes.map(([m, l]) => (
            <button key={m} type="button" aria-pressed={themeMode === m} disabled={!onMode} onClick={() => onMode && onMode(m)} style={puce(themeMode === m)}>{l}</button>
          ))}
          <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginLeft: 6 }}>
            {tr('Thème appliqué : {t}', { t: courant.name })}
          </span>
        </div>
      </div>

      <Titre i="palette" t={tr('Couleurs')} />
      {JETONS_PAR_FAMILLE().map(f => (
        <div key={f.t} style={{ marginBottom: 18 }}>
          <div style={{ marginBottom: 8 }}><Etiquette>{f.t}</Etiquette></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {f.j.map(j => Array.isArray(j) ? <Pastille key={j[0]} nom={j[0]} seuil={j[1]} /> : <Pastille key={j} nom={j} />)}
          </div>
        </div>
      ))}

      <Titre i="text" t={tr('Écriture')} />
      <Ligne l={tr('Titre de vue')}><span style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Séjour')}</span></Ligne>
      <Ligne l={tr('Titre de section')}><h2 style={{ ...sectionTitle }}>{tr('Lumières et prises')}</h2></Ligne>
      <Ligne l={tr('Nom de carte')}><span style={NOM_CARTE}>{tr('Lampe du salon')}</span></Ligne>
      <Ligne l={tr('Sous-titre de carte')}><span style={SOUS_CARTE}>{tr('Allumée · 60 %')}</span></Ligne>
      <Ligne l={tr('Petites capitales')}><span style={{ ...petitesCapitales(10.5), color: 'var(--o-text3)' }}>{tr('Consommation')}</span></Ligne>
      <Ligne l={tr('Texte courant')}><span style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600 }}>{tr('Le chauffage reprend à 6 h 30.')}</span></Ligne>

      <Titre i="square" t={tr('Formes')} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <Forme l={tr('Surface')} style={{ border: LISERE }} />
        <Forme l={tr('Ombre')} style={{ border: LISERE, boxShadow: 'var(--o-shadow)' }} />
        <Forme l={tr('Ombre au survol')} style={{ border: LISERE, boxShadow: 'var(--o-shadow-hover)' }} />
        <Forme l={tr('Creux')} style={{ background: 'var(--o-well)' }} />
        <div style={{ width: 150, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ ...ICONE_CARTE, background: 'rgba(var(--o-accent-rgb), .16)' }}><Fi i="bulb" size={18} color="var(--o-accent-soft)" /></div>
          <Etiquette>{tr('Icône de carte')}</Etiquette>
        </div>
      </div>

      <Titre i="settings-sliders" t={tr('Commandes')} />
      <Ligne l={tr('Boutons')}>
        <button type="button" style={btnPrimaire}>{tr('Enregistrer')}</button>
        <button type="button" style={btnSecondaire}>{tr('Annuler')}</button>
        <button type="button" style={btnDiscret}>{tr('Modifier')}</button>
        <button type="button" style={btnDanger}>{tr('Supprimer')}</button>
      </Ligne>
      <Ligne l={tr('Puces')}>
        {[['jour', tr('Jour')], ['semaine', tr('Semaine')], ['mois', tr('Mois')]].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={puceOn === k} onClick={() => setPuceOn(k)} style={puce(puceOn === k)}>{l}</button>
        ))}
        <span style={{ width: 12 }} />
        {[['jour', tr('Jour')], ['semaine', tr('Semaine')]].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={puceOn === k} onClick={() => setPuceOn(k)} style={puceHaute(puceOn === k)}>{l}</button>
        ))}
      </Ligne>
      <Ligne l={tr('Interrupteur')}>
        <Bascule on={bascule} cb={() => setBascule(b => !b)} nom={tr('Interrupteur')} />
        <Bascule on={!bascule} cb={() => setBascule(b => !b)} nom={tr('Interrupteur')} />
      </Ligne>
      <Ligne l={tr('Menu')}>
        <div style={{ width: 260 }}>
          <ListeChoix value={choix} onChange={setChoix} label={tr('Pièce')} recherche={false}
            options={[{ id: 'salon', label: tr('Séjour') }, { id: 'cuisine', label: tr('Cuisine') }, { id: 'chambre', label: tr('Chambre') }]} />
        </div>
      </Ligne>
      <Ligne l={tr('Jauge')}><div style={{ width: 260 }}><Gauge pct={62} color="var(--o-accent)" h={6} /></div></Ligne>
      <Ligne l={tr('Chiffre')}><div style={{ width: 200 }}><MetricTile caption={tr('Consommation')} value="2,4" unit="kWh" icon="bolt" /></div></Ligne>

      <Titre i="window-restore" t={tr('Popup')} />
      <button type="button" style={btnSecondaire} onClick={() => setPopup(true)}>{tr('Ouvrir une popup témoin')}</button>
      {popup && (
        <BottomSheet onClose={() => setPopup(false)}>
          <TitreFeuille marge={14}><span style={{ fontSize: 18, fontWeight: 800 }}>{tr('Lampe du salon')}</span></TitreFeuille>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <MetricTile caption={tr('Luminosité')} value="60" unit="%" icon="bulb" pct={60} tone="var(--o-lampe)" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={btnPrimaire}>{tr('Enregistrer')}</button>
              <button type="button" style={btnSecondaire} onClick={() => setPopup(false)}>{tr('Annuler')}</button>
            </div>
          </div>
        </BottomSheet>
      )}
    </main>
  );
}

export { NuancierView };
