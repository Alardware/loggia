// Le mode edition (maquette du 14/09), le meme partout : le bandeau, la carte
// d'edition, la fiche « Modifier l'entite », et le glisser libre.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

test('le bandeau : le mot d’ordre de la maquette et ses trois boutons', () => {
  const b = bloc('function BandeauEdition(', NL + '}');
  assert.ok(b.includes("tr('Mode édition : attrape une carte pour la déplacer où tu veux, ou ajoute, renomme et retire une carte.')"));
  assert.ok(b.includes("tr('Ajouter une carte')") && b.includes("tr('Toutes les cartes')") && b.includes("tr('Terminer')"));
  assert.ok(b.includes('useContext(HeaderCtx)') && b.includes('ctx.onToggleEdit'), 'Terminer quitte l’edition par le contexte de l’en-tete');
  assert.ok(b.includes('ed.reset()'), 'Toutes les entites ramene la liste automatique');
});

test('la carte d’edition : icone, bouton de taille en coin, « Domaine · identifiant », Modifier et Supprimer — et on la saisit n’importe ou', () => {
  const c = bloc('function EditableCard(', NL + '}');
  assert.ok(c.includes("{tr('Modifier')}") && c.includes("{tr('Supprimer')}"), 'les deux boutons');
  assert.ok(c.includes("info.label + ' · ' + identifiantEdition(brut)"), 'le sous-titre de la maquette');
  assert.ok(c.includes('<Fi i="resize" size={13} />') && c.includes('onClick={() => ed.basculerCompact(id)}'), 'le bouton de taille en haut a droite : compacte ↔ standard (retour user du 15/09)');
  assert.ok(!c.includes('ed.basculerLarge('), 'le coin ne touche pas a la largeur');
  assert.ok(!c.includes('<Fi i="pencil" size={14} />'), 'plus de crayon en coin : Modifier suffit');
  assert.ok(c.includes('const bouton = boutonEdition, petit = BOUTON_PETIT;') && c.includes('style={BOUTON_COIN}'), 'les boutons sont ceux de toutes les cartes d’edition');
  assert.ok(c.includes('<div data-id={id} role="button" tabIndex={0} {...prise}'), 'la carte entiere est la prise');
  assert.ok(!c.includes("position: 'absolute', inset: 0, zIndex: 2"), 'plus de voile de saisie');
  assert.ok(c.includes('onPointerDown={stop}'), 'les boutons ne saisissent pas');
  assert.ok(c.includes('...RM_CARD'), 'au gabarit des cartes');
});

test('le glisser : prise immediate a la souris, 200 ms au doigt, la carte suit partout, les autres se rangent en direct', () => {
  const h = bloc('function useLayoutEditor(', NL + '}');
  assert.ok(h.includes('}, 200);'), 'appui court au doigt');
  assert.ok(!h.includes('380'), 'plus d’appui long');
  assert.ok(h.includes("d.fantome.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.04)'"), 'le fantome suit le pointeur, dans tous les sens');
  assert.ok(h.includes('const [ordreTemp, setOrdreTemp] = useState(null);') && h.includes('setOrdreTemp(l);'), 'l’ordre change pendant le geste');
  assert.ok(h.includes('return { ids: ordreTemp || ids,'), 'et la grille le montre');
  assert.ok(h.includes("if (d.temp.join('|') !== ids.join('|')) write({ order: d.temp });"), 'la configuration n’est ecrite qu’a la depose');
  assert.ok(h.includes("d.grid.querySelectorAll('[data-id]')"), 'les cases sont remesurees a chaque mouvement');
  assert.ok(!h.includes('dragOver'), 'plus de simple surlignage de la cible');
});

test('la fiche « Modifier l’entite » : nom, domaine, piece, identifiant, epingle — et pas d’etat de depart invente', () => {
  const f = bloc('function CardEditSheet(', NL + '}');
  ['NOM', 'DOMAINE', 'PIÈCE', 'IDENTIFIANT'].forEach(k => assert.ok(f.includes("tr('" + k + "')"), k));
  assert.ok(f.includes("tr('Modifier l’entité')") && f.includes("tr('Épinglée sur l’accueil')"));
  assert.ok(f.includes('declarerLumiere(brut, lumiere)'), 'une prise peut se declarer lumiere');
  assert.ok(f.includes('deplacerDansPiece(hass, brut, choixPiece)'), 'changer de piece deplace l’entite');
  // Deux boutons : fermer, c'est la croix de la feuille, la même partout (19/09).
  assert.ok(f.includes("tr('Supprimer')") && f.includes("tr('Enregistrer')") && !f.includes("tr('Annuler')"), 'Supprimer et Enregistrer ; plus d’« Annuler » à côté de la croix');
  assert.ok(!f.includes('État de départ') && !f.includes('Niveau'), 'Loggia n’invente pas ce que Home Assistant n’a pas dit');
  const m = bloc('function deplacerDansPiece(', NL + '}');
  assert.equal((m.match(/cfgSet\(/g) || []).length, 1, 'une seule ecriture pour toutes les pieces');
});

test('partout : pieces, volets et Objets ont le bandeau, la case d’ajout et la fiche', () => {
  const room = bloc('function RoomView(', NL + 'function ');
  assert.ok(room.includes('<BandeauEdition ed={ed} onAjouter={() => setAddSheet(true)}') && room.includes('<CarteAjout onClick={() => setAddSheet(true)} />') && room.includes('piece={room}'));
  assert.ok(!room.includes("tr('Ajouter un appareil')"), 'l’ancien bandeau de la piece a disparu');
  const volets = bloc('function VoletsContent(', NL + 'function ');
  assert.ok(volets.includes("<BandeauEdition ed={ed} onAjouter={() => setAddSheet(true)} ajouterLabel={tr('Ajouter un volet')} onEnt={onEnt} />") && volets.includes('<CarteAjout onClick={() => setAddSheet(true)}'));
  assert.ok((src.match(/<ObjetsView hass=\{hass\} onNav=\{setView\}(?: filtre="[a-z]+")? edit=\{editMode && peutEditer\} onEnt=/g) || []).length === 4, 'Objets recoit l’edition sur ses quatre routes');
});

test('un seul type de carte, le standard : plus de CARTE dans la fiche, plus de type dans l’editeur', () => {
  const f = bloc('function CardEditSheet(', NL + '}');
  assert.ok(!f.includes("tr('CARTE')") && !f.includes('CarteApercu'), 'la partie CARTE a disparu');
  assert.ok(f.includes("tr('LARGEUR')"), 'la largeur reste');
  const h = bloc('function useLayoutEditor(', NL + '}');
  assert.ok(!h.includes('typeOf') && !h.includes('setType'), 'plus de type de carte dans l’editeur');
  assert.ok(!src.includes('function BoutonCarteLibre('), 'plus de carte libre');
  const room = bloc('function RoomView(', NL + 'function ');
  assert.ok(room.includes('const card = compacte ? dc.compact(id, lbl) : dc.card(id, lbl, zone);') && !room.includes('CvTyped'), 'la piece ne dessine que la carte standard, en une ou deux rangees');
  const volets = bloc('function VoletsContent(', NL + 'function ');
  assert.ok(volets.includes('const carte = compacte ? dc.compact(k, ed.labelOf(k)) : dc.card(k, ed.labelOf(k));') && !volets.includes('CvTyped'), 'les volets aussi');
});

test('des couleurs dans la fiche : l’icone porte la teinte du domaine, la piece la sienne', () => {
  const f = bloc('function CardEditSheet(', NL + '}');
  assert.ok(f.includes('puce(on, possible, teinteRgb(dm.rgb))'), 'la puce du domaine se teinte');
  assert.ok(f.includes("color={'rgb(' + dm.rgb + ')'}"), 'l’icone du domaine est coloree');
  assert.ok(f.includes('habillagePiece(p, zone && zone.icon)') && f.includes('const couleur = hp.col;'), 'la piece prend son icone et sa couleur — celle de l’habillage, teinte choisie comprise');
});

test('Accueil et Energie ont le meme bandeau, et la carte suit le doigt partout', () => {
  const home = bloc('function Dashboard(', NL + 'function ');
  assert.ok(home.includes('<BandeauEdition extra={<>'), 'l’Accueil a le bandeau');
  assert.ok(home.includes('poserFantome(hote,'), 'les sections et les pieces suivent le doigt');
  assert.ok(!src.includes('}, 380);'), 'plus d’appui long de 380 ms nulle part');
  const en = bloc('function EnergieContent(', NL + 'function ');
  assert.ok(en.includes("<BandeauEdition ed={ed} onAjouter={() => setEnAdd(true)} ajouterLabel={tr('Ajouter un poste')}") && en.includes("<CarteAjout onClick={() => setEnAdd(true)} label={tr('Ajouter un poste')} />"), 'l’Energie aussi');
});

test('la taille : compacte (une rangee de 88 px) ou standard (deux), rangee dans l’agencement et rendue partout', () => {
  const h = bloc('function useLayoutEditor(', NL + '}');
  assert.ok(h.includes("const estCompact = (id) => (layout.compacts || []).indexOf(id) >= 0;") && h.includes('write({ compacts: vide('), 'compacts, a cote de larges');
  assert.ok(h.includes('compacts: null') && h.includes('(layout.compacts || []).length'), 'Toutes les entites l’efface, et elle compte comme une retouche');
  assert.ok(h.includes('estLarge, basculerLarge, estCompact, basculerCompact }'), 'l’editeur la rend');
  const dc = bloc('function useDomainCards(', NL + '}');
  assert.ok(dc.includes('const compact = (id, label = null) => card(id, label, null, true);') && dc.includes("if (chip) return <CvCard id={id} hass={hass} label={label} onOpen={ouvrir} dense />;") && dc.includes('return { card, compact, nom, plante, distributeur, sheets, fermer, ouvrir };'), 'la compacte passe par la fabrique : CvCard dense pour une entite, la chip du distributeur ou de la plante sinon');
  const c = bloc('function EditableCard(', NL + '}');
  assert.ok(c.includes("compact ? 'o-cvrow1' : ''") && c.includes('if (compact) {') && c.includes("minHeight: 0, height: '100%'"), 'la carte d’edition compacte tient sur une rangee');
  assert.ok(c.includes("brut.indexOf('zone:') !== 0") && c.includes('taille && !!ed.basculerCompact'), 'pas de compacte pour une zone fil pilote, ni la ou la vue n’en offre pas');
  const obj = bloc('function ObjetsView(', NL + '}');
  assert.equal((bloc('function useDomainCards(', NL + '}').match(/chip=\{chip\}/g) || []).length, 2, 'distributeur et plantes prennent leur compacte, dans la fabrique commune');
  assert.ok(obj.includes('className="grid-objets grid-dense"') && obj.includes("(ed.estCompact(o.cle) ? 'o-cvrow1' : '')"), 'la grille d’Objets est dense, la compacte y prend une rangee');
  const en = bloc('function EnergieContent(', NL + 'function ');
  assert.ok(en.includes('taille={false}'), 'les postes d’Energie n’ont pas de compacte');
  const f = bloc('function CardEditSheet(', NL + '}');
  assert.ok(f.includes("tr('Carte compacte')") && f.includes('onToggle={() => ed.basculerCompact(id)}'), 'la fiche a la bascule aussi');
  const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
  assert.ok(css.includes('.grid-dense > .o-cvrow1 { grid-row: span 1; }') && css.includes('.grid-dense { grid-auto-flow: row dense; grid-auto-rows: 88px; }'), 'une rangee = 88 px');
});
