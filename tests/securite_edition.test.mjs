// La vue Securite s'edite comme les autres, et la tuile Alarme de la
// banniere — elle seule — prend un verre teinte par son etat (17/09, ADR 0036).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tuileAlarme } from '../src/attention.js';
import { domaineEdition, identifiantEdition } from '../src/objets.js';
import { LOGGIA_SYNC_KEYS } from '../src/state.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

test('la teinte du verre suit l’etat : vert desarmee, bleu maison, orange absent, violet nuit, rouge declenchee', () => {
  const rgb = (s) => tuileAlarme({ state: s }).rgb;
  assert.equal(rgb('disarmed'), 'var(--o-ok-rgb)');
  assert.equal(rgb('armed_home'), 'var(--o-accent-rgb)');
  assert.equal(rgb('armed_away'), 'var(--o-warn2-rgb)');
  assert.equal(rgb('armed_vacation'), 'var(--o-warn2-rgb)');
  assert.equal(rgb('armed_night'), 'var(--o-purple-rgb)');
  assert.equal(rgb('arming'), 'var(--o-warn-rgb)');
  assert.equal(rgb('triggered'), 'var(--o-bad-rgb)');
  assert.equal(rgb('armed_custom_bypass'), 'var(--o-warn2-rgb)');
  // La couleur du texte et la teinte du verre vont ensemble.
  for (const s of ['disarmed', 'armed_away', 'armed_night', 'triggered']) {
    const t = tuileAlarme({ state: s });
    assert.equal(t.rgb, t.couleur.replace(')', '-rgb)').replace('-soft-rgb', '-rgb'), s + ' : texte et verre de la meme famille');
  }
});

test('la tuile Alarme, et elle seule, est en verre', () => {
  const home = bloc('function Dashboard(', NL + '}');
  assert.ok(home.includes("<button type=\"button\" key=\"al\" className=\"o-tuile-hero o-tuile-alarme\"") && home.includes("'--al-rgb': alarmeTuile.rgb })}>"), 'la classe et la teinte, sur la tuile « al »');
  assert.equal(home.split('o-tuile-alarme').length - 1, 1, 'aucune autre tuile ne la porte');
  assert.ok(css.includes('.o-tuile-alarme { background: rgba(var(--al-rgb), .16) !important; -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2);'), 'un fond teinte leger et un flou');
  assert.ok(css.includes('.o-tuile-hero.o-tuile-alarme:hover, .o-tuile-hero.o-tuile-alarme:focus-visible { background: rgba(var(--al-rgb), .26) !important; }'), 'le survol garde la teinte');
  assert.ok(css.indexOf('.o-tuile-alarme { background') < css.indexOf('@media (hover: hover) and (pointer: fine) {' + NL + '  .o-hov'), 'le verre ne depend pas du pointeur : il vaut aussi au doigt');
});

test('les domaines d’edition connaissent l’alarme, la sirene et la carte Presence', () => {
  assert.equal(domaineEdition('alarm_control_panel.maison'), 'alarme');
  assert.equal(domaineEdition('siren.interieure'), 'sirene');
  assert.equal(domaineEdition('carte:presence'), 'presence');
  assert.equal(domaineEdition('switch.sirene'), 'prise', 'un interrupteur reste une prise');
  assert.equal(identifiantEdition('carte:presence'), 'presence');
  assert.ok(src.includes("{ id: 'alarme', label: tr('Alarme'), fi: 'shield-check', rgb: 'var(--o-ok-rgb)' },") && src.includes("{ id: 'sirene', label: tr('Sirène'), fi: 'bell-ring', rgb: 'var(--o-bad-rgb)' },"), 'leur mot, leur glyphe, leur teinte');
});

test('la vue Securite passe par le meme editeur d’agencement que les autres vues', () => {
  const vue = bloc('function SecuriteContent(', NL + '}');
  assert.ok(vue.includes("const ed = useLayoutEditor('loggia_seclayout', 'securite', derivesSec);"), 'le crochet commun, sa cle, son perimetre');
  assert.ok(vue.includes("const derivesSec = [...(alarmId ? [alarmId] : []), ...sirenes, ...(people.length ? ['carte:presence'] : []), ...(ouvrantsIds.length ? ['sect:ouvrants', ...ouvrantsIds] : [])];"), 'la decouverte propose : alarme, sirenes, presence, puis les ouvrants sous leur titre');
  assert.ok(vue.includes('{edit && <BandeauEdition ed={ed} onAjouter={() => setAddSheet(true)} />}'), 'le bandeau d’edition des autres vues');
  assert.ok(vue.includes('? <EditableCard key={k} ed={ed} id={k} nom={nomDe(k)} onEdit={setCardEdit} hass={hass} taille={false} />'), 'chaque carte se saisit, se retire, se renomme — sans compacte ici');
  assert.ok(vue.includes('{bloc.titre && (edit ? <EditableCard plat ed={ed} id={bloc.titre} nom={nomDe(bloc.titre)} onEdit={setCardEdit}>{titre}</EditableCard> : titre)}'), 'les titres aussi');
  assert.ok(vue.includes("className={ed.estLarge(k) ? 'o-cvw2' : ''}"), 'la largeur choisie vaut hors edition');
  assert.ok(vue.includes('{edit && bi === blocs.length - 1 && <CarteAjout onClick={() => setAddSheet(true)} />}') && vue.includes('<ComposeurCartes hass={hass} dc={dc} present={ed.ids} onToggle={ed.toggle}') && vue.includes("pied={<button onClick={addSection} style={editBtn(false)}>{tr('Ajouter un titre')}</button>}"), 'ajouter une carte ou un titre');
  assert.ok(vue.includes('{cardEdit && <CardEditSheet ed={ed} id={cardEdit} nom={nomDe(cardEdit)} origine={origineDe(cardEdit)} hass={hass} onClose={() => setCardEdit(null)} />}'), 'la fiche d’une carte');
  assert.ok(vue.includes('<div ref={ed.gridRef}'), 'le glisser-deposer a sa grille');
  assert.ok(vue.indexOf('<CarteAttention points={pointsSec}') < vue.indexOf('<div ref={ed.gridRef}'), '« A surveiller » passe devant les cartes');
});

test('la carte d’une cle, les noms choisis, la cle synchronisee, les mots', () => {
  const vue = bloc('function SecuriteContent(', NL + '}');
  assert.ok(vue.includes('return dc.card(k, ed.labelOf(k));'), 'une carte ajoutee passe par la fabrique commune');
  assert.ok(src.includes('function CvSirene({ id, hass, label = null }) {') && src.includes('const nom = label || cvName(st, id);') && src.includes('<div style={RM_NAME}>{label || cvName(st, id)}</div>'), 'l’alarme et la sirene portent le nom choisi');
  assert.ok(LOGGIA_SYNC_KEYS.indexOf('loggia_seclayout') >= 0, 'l’agencement de la vue suit le compte, comme les autres');
  for (const k of ['Sirène', 'Mode édition : choisis le panneau d’alarme et les caméras ; glisse une carte pour la déplacer, clique-la pour la modifier.']) {
    assert.ok(en.includes("'" + k + "':"), k + ' manque a en.js');
  }
});
