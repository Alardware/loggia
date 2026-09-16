// Le haut informe, le milieu controle (16/09, ADR 0030, etape 3 de la
// refonte) : le hero plus bas, les tuiles de la banniere cliquables, une
// seule rangee de scenarios avec « Tous les scenarios ».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

test('le hero est plus bas : marges et corps resserres, le fond meteo, les avatars et les faits gardes', () => {
  assert.ok(src.includes("borderRadius: 'var(--o-radius,18px)', padding: '14px 8px' }}>" + NL + "          {REDUCE_MOTION && <WeatherFx weather={wx} />}"), 'le conteneur, et son fond meteo');
  assert.ok(src.includes('<div className="o-banner-row" style={{ position: \'relative\', display: \'flex\', flexDirection: \'column\', gap: 0, minWidth: 0 }}>'), 'sans air entre les lignes');
  assert.ok(src.includes("fontStyle: 'italic', fontSize: 28, fontWeight: 500, lineHeight: 1, minWidth: 0"), 'le nom a 28 px');
  assert.ok(src.includes("style={{ position: 'relative', width: 34, height: 34, flexShrink: 0, display: 'inline-block' }}>"), 'les avatars a 34, toujours sur la ligne du nom');
  assert.ok(src.includes("color: 'var(--o-text2)', marginTop: 4 }}><span style={{ width: 7, height: 7"), 'les faits colles au nom');
  assert.ok(src.includes('<div className="o-banner-metrics" style={{ position: \'relative\', display: \'flex\', gap: 10, marginTop: 10, overflowX: \'auto\', paddingBottom: 2 }}>'), 'la rangee de tuiles rapprochee');
  assert.ok(css.includes('.o-greet-name { font-size: 25px !important; }') && css.includes('.o-banner-row { gap: 8px !important; }'), 'le telephone garde son nom a 25 px, avec moins d’air');
});

test('les tuiles de la banniere sont des boutons qui menent la ou l’on agit', () => {
  const d = bloc('function Dashboard(', NL + '}');
  const c = d.slice(d.indexOf('const clics = {'), d.indexOf('const cases = [];'));
  assert.ok(c.includes("ex: () => onNav && onNav('energie'),") && c.includes("ouv: () => onNav && onNav('securite'),") && c.includes("lum: () => onNav && onNav('lumieres'),") && c.includes("med: () => onNav && onNav('medias'),") && c.includes('app: voirMoment,'), 'energie, securite, lumieres, medias, en ce moment');
  assert.ok(c.includes("air: () => { if (pieceCo2Max && onOpenRoom) onOpenRoom(pieceCo2Max); else if (onNav) onNav('objets'); },"), 'l’air ouvre la piece la plus chargee');
  assert.ok(d.includes("return rs.reduce((m, r) => (r.co2 > m.co2 ? r : m), rs[0]).name;"), 'la piece au CO2 le plus haut, d’apres les donnees');
  for (const k of ['ex', 'air', 'ouv', 'lum', 'med', 'app']) {
    assert.ok(d.includes('<button type="button" key="' + k + '" className="o-tuile-hero" onClick={clics.' + k + '} aria-label={libelles.' + k + '} style={tuile({'), 'la tuile ' + k + ' est un bouton');
  }
  assert.ok(!d.includes("<div key=\"ex\" style={{ flexShrink: 0"), 'plus de case inerte');
  assert.ok(d.includes("const tuile = (extra) => ({ flexShrink: 0, background: 'none', border: 'none', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer', borderRadius: 10, padding: '4px 14px 4px 0', whiteSpace: 'nowrap', ...extra });"), 'meme dessin qu’avant');
  assert.ok(css.includes('.o-tuile-hero:hover, .o-tuile-hero:focus-visible { background: var(--o-s1) !important; }'), 'le survol le dit');
});

test('« appareils actifs » mene a En ce moment : le rail sur PC, la seconde page sur telephone', () => {
  const d = bloc('function Dashboard(', NL + '}');
  assert.ok(d.includes("const el = document.querySelector('[data-sec=\"moment\"]');") && d.includes("el.scrollIntoView({ behavior: 'smooth', block: 'start' })"), 'sur PC, le panneau du rail');
  assert.ok(d.includes('setPageDemandee(1);') && d.includes('const [pageDemandee, setPageDemandee] = useState(null);'), 'sur telephone, la seconde page');
  const o = bloc('function OngletsAccueil(', NL + '}');
  assert.ok(o.includes('demande = null, onDemande = null })') && o.includes("useEffect(() => { if (demande != null) { va(demande); if (onDemande) onDemande(); } }, [demande, va, onDemande]);"), 'les pages obeissent puis rendent la main');
  assert.ok(d.includes('demande={pageDemandee} onDemande={() => setPageDemandee(null)} />;'), 'la demande voyage jusqu’aux pages');
});

test('les scenarios : une rangee sur PC et tablette, cinq et « Tous les scenarios » ; tous sur telephone', () => {
  const s = bloc('function ScenariosAccueil(', NL + '}');
  assert.ok(s.includes('const large = useWide(821);') && s.includes('const montres = large ? liste.slice(0, 5) : liste;'), 'cinq au plus des 821 px');
  assert.ok(s.includes("{montres.map(s => <CarteScenario key={s.id} s={s} noms={sc.noms} compacte enCours={sc.enCours === s.id} onLancer={sc.lancer} />)}"), 'les cartes montrees');
  assert.ok(s.includes("<button type=\"button\" onClick={() => onNav('scenes')} aria-label={tr('Tous les scénarios')}") && s.includes("{tr('Tous les scénarios')}{liste.length > montres.length ? ' · ' + liste.length : ''}"), 'la tuile vers la vue, avec le compte quand il en manque');
  for (const k of ['Voir l’énergie', 'Voir la pièce la plus chargée', 'Voir la sécurité', 'Voir les lumières', 'Voir les médias', 'Voir ce qui tourne', 'Tous les scénarios']) {
    assert.ok(en.includes("'" + k + "':"), k + ' manque a en.js');
  }
});
