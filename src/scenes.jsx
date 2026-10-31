/* ── Les Scènes Hue, chargées à la demande (11/10) ───────────────────────────
 *
 * La bibliothèque des ambiances (`HUE_SCENES`), son nuancier et la section qui
 * s'en sert (`ScenesContent`, sous les scénarios de la vue Scénarios) vivaient
 * dans App.jsx — donc dans le boot, que CHAQUE écran télécharge et évalue
 * avant de s'afficher, alors que l'Accueil n'en montre rien. Elles vivent ici,
 * et App.jsx ne les charge qu'à la première ouverture des Scénarios, par
 * `lazyRecharge` (ADR 0104, 0145). La place rendue au démarrage est celle des
 * cartes du chauffage (tâche 6 bis du chantier Chauffage, choix du 11/10).
 *
 * RIEN n'est retiré (règle « Garder la bibliothèque Hue ») : les mêmes 55
 * ambiances en sept collections, les mêmes dégradés, la même luminosité
 * appliquée. Le code est celui d'App.jsx, ligne pour ligne.
 *
 * Trois briques restent au démarrage, parce qu'autre chose que les Scènes s'en
 * sert, et ne sont pas recopiées ici : `dimmableLights` (state.js — App.jsx
 * sonde ces lampes pour les Lumières et les Scènes avant toute ouverture),
 * `kbSlider` (ui.jsx — les jauges des cartes d'appareil, la position et le
 * volume d'un lecteur) et
 * `sectionTitle` (styles.js — les titres de section de l'Accueil).
 */
import { useState, useEffect } from 'react';
import { tr } from './i18n.js';
import { Fi, ListeChoix, kbSlider, useEtatServeur } from './ui.jsx';
import { sectionTitle } from './styles.js';
import { versHex } from './contraste.js';
import { commander, commanderService } from './actions.js';
import { hueScripts } from './lectures.js';
import { dimmableLights, ctxLumieres, LOGGIA_INDEX } from './state.js';
import { lumieresDe, veilleusesLues, sansEpargnees, capacitesLumiere } from './lumieres.js';
import { ordresAmbiance, luminositeAmbiance } from './lumieresfiche.js';

/* Le blanc chaud du repli « Blanc chaud » sans script, en kelvins : chaque lampe le borne à son propre blanc — l'ordre part par
 * `commander` (`set_color_temp`), donc par `planAction`, qui le ramène aux `min_` / `max_color_temp_kelvin` de l'ampoule (R7). */
const BLANC_CHAUD_K = 2700;

/* ════════════ VUE SCÈNES — bibliothèque de scènes colorées ════════════ */
// Catalogue de scènes Hue, relevé sur une installation type. Chaque scène :
// 5 RGB + luminosité + uuid (thumbnail).
const HUE_SCENES = {
  classics: { label: 'Classiques', scenes: [
    { name: 'Rest', uuid: 'e03267e7-9914-4f47-97fe-63c0bd317fe7', colors: [[215,134,30],[215,134,30],[215,134,30],[215,134,30],[215,134,30]], brightness: 35 },
    { name: 'Relax', uuid: 'e71b2ef3-1b15-4c4b-b036-4b3d6efe58f8', colors: [[243,179,80],[243,179,80],[243,179,80],[243,179,80],[243,179,80]], brightness: 56 },
    { name: 'Read', uuid: '035b6ecf-414e-4781-abc7-3911556097cb', colors: [[255,242,149],[255,242,149],[255,242,149],[255,242,149],[255,242,149]], brightness: 100 },
    { name: 'Concentrate', uuid: '0cbec4e8-d064-4457-986a-fe6078a63f39', colors: [[255,252,208],[255,252,208],[255,252,208],[255,252,208],[255,252,208]], brightness: 100 },
    { name: 'Energize', uuid: '0eeacfc5-2d81-4035-a23d-4a9bc02af965', colors: [[249,255,255],[249,255,255],[249,255,255],[249,255,255],[249,255,255]], brightness: 100 },
    { name: 'Cool bright', uuid: '6d10a807-7330-46d1-b093-c15520ba72c0', colors: [[255,251,198],[255,251,198],[255,251,198],[255,251,198],[255,251,198]], brightness: 100 },
    { name: 'Bright', uuid: '84ebc26c-9d61-4d25-830c-41ea66f1c325', colors: [[255,240,138],[255,240,138],[255,240,138],[255,240,138],[255,240,138]], brightness: 100 },
    { name: 'Dimmed', uuid: '8f55e62a-e5f8-456a-9e8b-61f314bd4e99', colors: [[175,140,78],[175,140,78],[175,140,78],[175,140,78],[175,140,78]], brightness: 30 },
    { name: 'Nightlight', uuid: 'b6f58e22-677f-4670-8677-3dea4ac60383', colors: [[21,8,0],[21,8,0],[21,8,0],[21,8,0],[21,8,0]], brightness: 0 },
  ] },
  cosy: { label: 'Cosy', scenes: [
    { name: 'Rolling hills', uuid: '49c61bae-d3ec-4df2-89a4-65235705f3a1', colors: [[251,139,50],[230,156,68],[240,149,55],[219,163,96],[224,160,82]], brightness: 45 },
    { name: 'Warm embrace', uuid: '73b2c0b3-b4c5-4307-8873-eb231c83e996', colors: [[254,114,93],[231,138,66],[251,119,77],[239,130,66],[220,147,67]], brightness: 40 },
    { name: 'Dreamy dusk', uuid: 'a127f9ef-0371-48dc-bc79-852e2e5b2cc3', colors: [[242,163,83],[255,150,83],[255,147,184],[255,134,158],[255,134,109]], brightness: 50 },
    { name: 'Honolulu', uuid: '23ab68cc-3a82-4762-b9db-f0d1a483281d', colors: [[255,67,82],[252,113,91],[229,137,46],[197,158,71],[240,126,68]], brightness: 39 },
    { name: 'Savanna sunset', uuid: 'ea580cb0-149e-48e6-a729-2a500edfb924', colors: [[213,199,111],[255,147,75],[255,115,43],[255,171,91],[235,189,82]], brightness: 58 },
    { name: 'Golden pond', uuid: '89c16361-391d-4346-b6d8-ac1eaf4de3dc', colors: [[251,196,45],[255,178,39],[255,173,37],[243,201,68],[249,197,63]], brightness: 64 },
    { name: 'Ruby glow', uuid: '454176dd-7d24-43de-86c4-ee73f8febbec', colors: [[199,155,164],[255,99,142],[230,134,154],[215,145,160],[246,119,151]], brightness: 40 },
    { name: 'Tropical twilight', uuid: 'ffbf7ff8-dc4a-4c56-b157-7a59113be7b7', colors: [[213,156,199],[221,157,111],[254,132,63],[222,116,255],[225,136,255]], brightness: 44 },
  ] },
  party: { label: tr('Ambiance fête'), scenes: [
    { name: 'Miami', uuid: 'd0b4b2d2-570f-4325-9475-098e3e0501f0', colors: [[69,255,255],[255,166,123],[255,188,104],[163,235,255],[255,129,189]], brightness: 75 },
    { name: 'Cancun', uuid: 'c321d848-51a8-4d09-9ad0-5e6b44bc7f2c', colors: [[255,212,60],[255,86,147],[255,109,16],[255,139,190],[255,164,32]], brightness: 79 },
    { name: 'Rio', uuid: '94fc428e-2855-4f67-877e-3d1e1dd95b7d', colors: [[255,223,81],[255,148,180],[255,117,191],[255,150,255],[255,187,102]], brightness: 79 },
    { name: 'Chinatown', uuid: '7581da02-1688-4128-9bb9-b635f3b89999', colors: [[255,168,36],[255,57,60],[255,141,117],[255,66,89],[255,88,98]], brightness: 60 },
    { name: 'Ibiza', uuid: 'eaa0d424-ac66-4247-8342-06d2b128ac31', colors: [[255,134,57],[239,162,64],[255,147,57],[199,185,79],[214,178,61]], brightness: 49 },
    { name: 'Osaka', uuid: '5768805d-27c1-442e-b069-d20443485201', colors: [[243,110,18],[255,65,142],[201,146,51],[254,93,92],[229,117,164]], brightness: 36 },
    { name: 'Tokyo', uuid: 'de7eda64-84bf-4ed6-a4fa-76e0ebdd1968', colors: [[244,153,32],[203,14,255],[79,192,255],[255,49,143],[255,36,255]], brightness: 47 },
    { name: 'Motown', uuid: '7dded6f8-a2aa-4726-b391-21e9a0f76eee', colors: [[72,210,255],[136,143,255],[163,0,255],[52,220,243],[85,202,255]], brightness: 53 },
    { name: 'Fairfax', uuid: 'abfc5768-5c2c-4d61-bd03-2b64660e813f', colors: [[255,58,56],[134,220,255],[255,115,103],[68,231,255],[255,166,161]], brightness: 62 },
  ] },
  romance: { label: 'Romantique', scenes: [
    { name: 'Ruby romance', uuid: '68d97db1-eb52-4c03-8afc-eed5df30c417', colors: [[255,49,88],[249,140,94],[255,86,113],[255,124,85],[248,140,125]], brightness: 45 },
    { name: 'City of love', uuid: '1fde4a1b-2ace-4b3a-a517-f9660fc84536', colors: [[151,0,255],[70,194,255],[108,159,255],[255,135,48],[226,159,42]], brightness: 45 },
    { name: 'Sunset allure', uuid: '68e8b68e-8237-48a6-bf5f-f62258dd2ff3', colors: [[185,149,255],[255,120,73],[201,146,255],[240,136,70],[226,148,61]], brightness: 41 },
    { name: 'Lovebirds', uuid: 'f1f5f209-ffcb-4734-8567-0819a2885214', colors: [[230,137,64],[233,135,27],[212,150,62],[208,153,67],[208,154,33]], brightness: 39 },
    { name: 'Smitten', uuid: 'a65a2815-52fb-4748-8e02-b607f96f70ea', colors: [[255,154,180],[255,153,128],[255,148,143],[255,160,115],[255,163,90]], brightness: 60 },
    { name: 'Glitz and glam', uuid: '2bf0e527-62ac-4203-b8a1-de06b0913fde', colors: [[255,67,243],[255,143,52],[255,134,231],[255,141,188],[253,155,57]], brightness: 50 },
    { name: 'Promise', uuid: '0b8dcd68-9ad0-4722-b23f-5fddb24204ef', colors: [[122,200,255],[255,141,137],[220,159,255],[162,200,141],[241,162,126]], brightness: 50 },
  ] },
  halloween: { label: 'Halloween', scenes: [
    { name: 'Trick or treat', uuid: '8a363ceb-f4c2-4c7f-9cd3-a71a6181b471', colors: [[255,129,77],[136,147,255],[180,149,255],[255,79,255],[255,135,255]], brightness: 55 },
    { name: 'Glowing grins', uuid: '938da1ed-edbc-4cf0-b9ab-bdc3d7d0659f', colors: [[255,57,76],[237,157,61],[255,139,32],[255,108,55],[131,204,49]], brightness: 47 },
    { name: 'Spellbound', uuid: '0d2a6c4f-9c71-4279-950c-05f3f84b6dbd', colors: [[240,165,19],[91,216,113],[236,30,255],[194,152,255],[134,209,72]], brightness: 50 },
    { name: 'Hocus pocus', uuid: '00b65abf-df21-4f15-a379-c1742fb786fb', colors: [[225,21,255],[255,48,137],[235,153,32],[17,212,116],[255,49,0]], brightness: 45 },
    { name: 'Toil and trouble', uuid: '074338f3-f7f3-4402-9f30-46ac70e5a0e6', colors: [[255,49,5],[255,119,30],[245,144,48],[224,20,255],[221,122,255]], brightness: 44 },
    { name: 'Witching hour', uuid: '2ad04284-2f0a-40d9-b2a9-6b929a475fa1', colors: [[247,142,106],[255,128,68],[255,89,23],[152,0,255],[121,172,255]], brightness: 45 },
    { name: 'Pandemonium', uuid: '0cbcc8ed-5474-471c-b3c1-45b4acc555b1', colors: [[190,0,255],[216,161,255],[250,55,255],[206,91,255],[205,154,255]], brightness: 50 },
    { name: 'Phantom', uuid: 'd824598f-0c09-4e67-beb2-972a8d5813e2', colors: [[117,185,192],[229,138,95],[52,191,235],[73,180,255],[206,152,137]], brightness: 40 },
  ] },
  /* Guillemets DOUBLES, et la cle au catalogue. Le libelle passe par `tr()`
   * a l'affichage (`HUE_CATS()`), mais l'argument est une VARIABLE : le filet
   * i18n, qui ne lit que des litteraux, ne pouvait pas le reclamer. Il
   * sortait donc en francais dans les six autres langues. */
  winter: { label: "Fêtes d'hiver", scenes: [
    { name: 'Snow sparkle', uuid: '6a794ffd-3564-493d-a9ad-a1abcec8b81c', colors: [[32,197,168],[143,151,255],[143,0,255],[228,139,63],[255,104,26]], brightness: 39 },
    { name: 'Under the tree', uuid: '85b8bc42-c564-4661-b058-f4e5792a6a6c', colors: [[255,57,32],[59,198,125],[9,202,63],[205,157,42],[230,138,95]], brightness: 40 },
    { name: 'Nutcracker', uuid: '33c32d2a-e5ad-4b26-8e6f-07090b4c6487', colors: [[59,189,255],[186,166,74],[217,149,34],[106,148,255],[74,196,139]], brightness: 40 },
    { name: 'Jolly', uuid: '77d10893-7b6f-4586-a77b-694b2b78fd3a', colors: [[203,157,63],[255,108,85],[59,198,125],[76,177,255],[255,99,186]], brightness: 40 },
    { name: 'Golden star', uuid: 'a5a12d6a-430d-4324-9078-cf7a74538b52', colors: [[255,49,39],[209,172,60],[246,147,32],[219,166,53],[255,102,74]], brightness: 46 },
    { name: 'Silent night', uuid: '4760abd5-e5a6-425a-be32-8f37f6e2acfd', colors: [[205,149,95],[204,148,126],[217,141,92],[226,134,86],[206,147,109]], brightness: 38 },
    { name: 'Color burst', uuid: 'e24e9183-747e-4d4e-a950-a746c6291c90', colors: [[232,32,255],[255,39,72],[222,102,80],[133,124,255],[161,148,44]], brightness: 30 },
    { name: 'Crystalline', uuid: '713a3f4d-2fc9-4d5e-80a5-a20a25815197', colors: [[186,140,148],[188,141,119],[103,162,253],[83,163,255],[182,139,189]], brightness: 33 },
    { name: 'Rosy sparkle', uuid: 'cf50bd49-16b1-47fd-a020-b83072595f37', colors: [[218,140,105],[205,147,132],[231,127,131],[236,118,176],[230,116,235]], brightness: 38 },
    { name: 'Festive fun', uuid: '667e4f15-4abf-4c56-8ef4-74fe1df422b8', colors: [[103,132,255],[181,26,255],[254,91,67],[200,16,255],[241,108,65]], brightness: 35 },
  ] },
  misc: { label: 'Divers', scenes: [
    { name: 'SECAM', uuid: 'dbffbd71-7f65-428a-9ac7-0db51057d31a', colors: [[244,0,255],[255,0,27],[255,0,255],[73,221,0],[88,213,208]], brightness: 50 },
    { name: 'CGA', uuid: '9565033d-f2ea-4821-bfba-7dd9b35be20a', colors: [[43,217,211],[255,0,255],[255,0,255],[255,0,255],[255,0,255]], brightness: 50 },
    { name: 'Light Cycles', uuid: '97648e18-758a-4382-99a4-8b657f4bb098', colors: [[255,136,11],[109,207,235],[109,207,235],[109,207,235],[109,207,235]], brightness: 50 },
    { name: 'Valetudo', uuid: '4bc4f958-b4af-46cf-8e67-636161e714f5', colors: [[94,181,255],[0,219,213],[111,215,47],[255,94,40],[214,181,51]], brightness: 50 },
  ] },
};
const HUE_SCENE_IMG_BASE = '/local/hue_scenes/';

/* Appliquer une ambiance : le script désigné dans la configuration s'il y en a un (`hueScripts.apply`, il garde la priorité) ;
 * sinon Loggia la pose LUI-MÊME, lampe par lampe (ADR 0304, `ordresAmbiance` de lumieresfiche.js) — les cinq couleurs aux lampes
 * couleur, le blanc le plus proche aux blancs réglables, la luminosité aux variateurs. Avant, sans script, seule la luminosité
 * partait : et celle de « Nightlight », nulle, ÉTEIGNAIT les lampes. */
const scriptSvc = (id) => (typeof id === 'string' && id.indexOf('script.') === 0) ? id.slice(7) : null;

/* Les PIÈCES (ADR 0304) sont les zones de Home Assistant qui ont une lampe d'ambiance, après « Tout » — plus de liste écrite en
 * dur (`HUE_ROOMS` : Séjour, Chambre, Chambre enfant, Toute la maison, d'une seule installation). Une configuration d'avant y
 * renvoie encore par un `input_select` désigné (`hueScripts.room`), que son script lit : ses options restent les pièces, et
 * la pièce choisie le règle comme avant. */
const TOUTE = '*';
const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const zoneDe = (id) => (LOGGIA_INDEX && typeof LOGGIA_INDEX.areaOf === 'function' ? LOGGIA_INDEX.areaOf(id) : null);
const HUE_CATS = () => Object.entries(HUE_SCENES).map(([id, c]) => ({ id, label: tr(c.label) }));
// Le nuancier des ambiances Hue garde son nom (ScenesContent n'est pas
// retouché) ; le calcul est versHex de contraste.js (lot 15 de l'audit du 03/10).
const rgbHex = versHex;
// Aperçu façon app Hue : 5 dégradés radiaux sur fond sombre (fallback si le JPEG manque).
const sceneGradient = (colors) => {
  const pos = ['20% 25%', '78% 22%', '50% 65%', '18% 80%', '85% 78%'];
  const layers = colors.slice(0, 5).map(([r, g, b], i) => `radial-gradient(circle at ${pos[i] || pos[i % 5]}, rgb(${r},${g},${b}) 0%, rgba(${r},${g},${b},0) 55%)`);
  return [...layers, 'linear-gradient(135deg,#1a1f2e,#0d1018)'].join(', ');
};
/* Le vrai JPEG de Hue par-dessus, le degrade RGB en dessous — jamais de carte
 * grise vide. Mais ces images sont FACULTATIVES : il faut les deposer soi-meme
 * dans `www/hue_scenes/`, et presque personne ne le fait. Tant que la carte les
 * demandait sans rien savoir, la vue Scenarios tirait neuf requetes en 404 a
 * CHAQUE affichage, sur la demo en ligne comme sur toute installation sans ce
 * dossier : la console se remplissait, et rien ne le disait (23/09, plan M6).
 *
 * On demande donc l'image UNE fois par ambiance et par session, hors du rendu,
 * et on ne la pose qu'une fois qu'elle a repondu. Une absence se retient : la
 * seconde visite ne redemande rien. */
const HUE_IMG = new Map();
const sceneBackground = (scene, avecImage) => {
  const g = sceneGradient(scene.colors);
  return (scene.uuid && avecImage)
    ? `url('${HUE_SCENE_IMG_BASE}${scene.uuid}.jpeg') center/cover no-repeat, ${g}`
    : g;
};
const sceneByName = (name) => { for (const c of Object.values(HUE_SCENES)) { const s = c.scenes.find(x => x.name === name); if (s) return s; } return null; };

// Bloc du bandeau : libellé + contrôle, comme la vue Pièce
const QuickBox = ({ label, children, className = null }) => (
  <div className={'o-qb' + (className ? ' ' + className : '')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
    <span className="o-qb-lbl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{label}</span>
    {children}
  </div>
);

export default function ScenesContent({ hass }) {
  const S = (hass && hass.states) || null;
  /* Les lampes du REPLI, sans script (ADR 0261) : les lumières de la maison (L11, `lumieresDe` — ni la LED d'une borne, ni un
   * groupe en double), sans les veilleuses de la règle Nuit ni les groupes qui en contiennent une (L2, `sansEpargnees`),
   * relues chaque minute. Tant qu'elles ne sont pas lues (null), on ne sait pas quoi épargner : le repli ne touche AUCUNE
   * lampe (audit du 19/10, B15 — comme la tuile d'une pièce et « Tout éteindre ») ; le module Nuit absent lève l'attente. */
  const { etat: nuitEtat, codeErr: nuitCode } = useEtatServeur(hass, 'loggia/nuit/etat', 60000);
  const veilleuses = veilleusesLues(nuitEtat, nuitCode);
  /* La pièce : un `input_select` d'avant (`hueScripts.room`) garde ses options ; sinon les zones de Home Assistant qui ont une
   * lampe d'ambiance (`variables`, veilleuses épargnées), après « Tout ». Dans le premier cas, la zone du même nom ; toute la
   * maison si aucune ne le porte (« Toute la maison »). */
  const idPieces = hueScripts().room;
  const anciennes = S && S[idPieces] && Array.isArray((S[idPieces].attributes || {}).options) ? S[idPieces].attributes.options.filter(o => typeof o === 'string' && o) : null;
  const variables = veilleuses ? sansEpargnees(dimmableLights(hass), S || {}, veilleuses) : [];
  const zones = (LOGGIA_INDEX && Array.isArray(LOGGIA_INDEX.areaList) ? LOGGIA_INDEX.areaList : []).filter(z => z && variables.some(id => zoneDe(id) === z.id));
  const pieces = anciennes ? anciennes.map(o => ({ id: o, label: o })) : [{ id: TOUTE, label: tr('Tout') }, ...zones.map(z => ({ id: z.id, label: z.name || z.id }))];
  const haActive = (S && S[hueScripts().active] && S[hueScripts().active].state) || '';
  const haRoom = anciennes ? ((S[idPieces] && S[idPieces].state) || '') : TOUTE;
  // état optimiste : maj instantanée au clic (sinon ça "rame" en attendant le poll HA ~2s)
  const [room, setRoomState] = useState(haRoom);
  /* Toute la maison : « Tout », ou l'option « Toute la maison » d'un `input_select` d'avant — rien d'autre. Une pièce dont aucune
   * zone ne porte le nom (« Séjour » face à « Salon »), ou dont la zone n'a qu'une veilleuse, ou un `input_select` muet : RIEN ne
   * part, et la section le dit (relecture du 31/10) — « Nightlight » allumait à 1 % des lampes éteintes hors de la pièce. */
  const toute = anciennes ? ['toute la maison', sansAccent(tr('Toute la maison'))].includes(sansAccent(room)) : room === TOUTE;
  const zonesHA = LOGGIA_INDEX && Array.isArray(LOGGIA_INDEX.areaList) ? LOGGIA_INDEX.areaList : [];
  const zoneChoisie = toute ? null : anciennes ? ((zonesHA.find(z => z && sansAccent(z.name) === sansAccent(room)) || {}).id || null) : room;
  const dansLaPiece = (ids) => (toute ? ids : zoneChoisie ? ids.filter(id => zoneDe(id) === zoneChoisie) : []);
  const nomPiece = (pieces.find(p => p.id === room) || {}).label || room;
  const lampesRepli = () => (veilleuses ? dansLaPiece(sansEpargnees(lumieresDe(S || {}, ctxLumieres()), S || {}, veilleuses)) : []);
  const variablesRepli = () => dansLaPiece(variables);
  const [sel, setSel] = useState(haActive);
  useEffect(() => { setRoomState(haRoom); }, [haRoom]);
  useEffect(() => { setSel(haActive); }, [haActive]);
  const selCat = (Object.entries(HUE_SCENES).find(([, c]) => c.scenes.some(s => s.name === sel)) || [])[0] || null;
  const [cat, setCat] = useState(selCat || 'classics');
  useEffect(() => { if (selCat) setCat(selCat); }, [selCat]);

  const call = (d, s, data) => commanderService(hass, (data || {}).entity_id, d, s, data || {});
  /* Applique une ambiance : le script configuré s'il existe — il reçoit l'ambiance entière, comme avant ; sinon chaque lampe
   * variable de la pièce, veilleuses épargnées, reçoit SON ordre (`ordresAmbiance`) par le moteur : `commander`, donc la
   * capacité que la lampe déclare et ses bornes, sous le compte de la personne — le carnet des lumières le note à son nom. */
  const applyScene = (sc, bri) => {
    const svc = scriptSvc(hueScripts().apply);
    if (svc) { call('script', svc, { scene_name: sc.name, color1: sc.colors[0], color2: sc.colors[1], color3: sc.colors[2], color4: sc.colors[3], color5: sc.colors[4], brightness_pct: bri }); return; }
    const lampes = variablesRepli().map(id => ({ id, a: (S && S[id] && S[id].attributes) || {} }));
    for (const o of ordresAmbiance(sc, lampes, { bri })) commander(hass, o.id, o.capacite, o.valeur, null, o.options);
  };
  const pickScene = (sc) => { setSel(sc.name); setBriOv(null); applyScene(sc, sc.brightness); };
  const pickRoom = (r) => { setRoomState(r); if (anciennes) call('input_select', 'select_option', { entity_id: idPieces, option: r }); };
  /* Deux gestes sans équivalent standard : on garde le script quand il existe. Sans lui (ADR 0261) :
   *  - « Éteindre » éteint les lumières de la maison, veilleuses épargnées — `light.turn_off` pour un `light.*`,
   *    `homeassistant.turn_off` pour un switch déclaré lumière, jamais `toggle` ;
   *  - « Blanc chaud » n'ÉTEINT plus (il envoyait `turn_off`) : il allume en blanc chaud les lampes qui savent le blanc
   *    (`capacitesLumiere`), par le moteur — `commander(…, 'set_color_temp')`, donc `planAction`, qui borne 2 700 K au
   *    blanc de chaque ampoule, en haut comme en bas (R7) —, et n'envoie rien aux autres. */
  const sansScript = (key) => { const svc = scriptSvc(hueScripts()[key]); if (svc) { call('script', svc, {}); return false; } return true; };
  const warmWhite = () => {
    setSel('');
    if (!sansScript('off')) return;
    for (const id of lampesRepli()) {
      if (capacitesLumiere(id, (S && S[id] && S[id].attributes) || null).blancs) commander(hass, id, 'set_color_temp', BLANC_CHAUD_K);
    }
  };
  const allOff = () => {
    setSel('');
    if (!sansScript('allOff')) return;
    const ids = lampesRepli();
    const lampes = ids.filter(id => id.indexOf('light.') === 0), autres = ids.filter(id => id.indexOf('light.') !== 0);
    if (lampes.length) call('light', 'turn_off', { entity_id: lampes });
    if (autres.length) call('homeassistant', 'turn_off', { entity_id: autres });
  };

  const scenes = HUE_SCENES[cat] ? HUE_SCENES[cat].scenes : [];
  /* Les images de la collection affichee, demandees une seule fois. `cat` suffit
   * comme dependance : `scenes` est recalcule a chaque rendu et bouclerait. */
  const [, redessinerImages] = useState(0);
  useEffect(() => {
    const inconnues = scenes.map(x => x.uuid).filter(u => u && !HUE_IMG.has(u));
    if (!inconnues.length) return undefined;
    let vivant = true;
    let reste = inconnues.length;
    inconnues.forEach(u => {
      const img = new Image();
      const fini = (ok) => {
        HUE_IMG.set(u, ok);
        reste -= 1;
        if (vivant && reste === 0) redessinerImages(v => v + 1);
      };
      img.onload = () => fini(true);
      img.onerror = () => fini(false);
      img.src = HUE_SCENE_IMG_BASE + u + '.jpeg';
    });
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);
  const selScene = sel ? sceneByName(sel) : null;
  const lit = !!selScene;
  const selColor = selScene ? rgbHex(selScene.colors[0]) : '#5f6c87';

  // Luminosité appliquée avec la scène (le script accepte brightness_pct). Celle de « Nightlight » se dit 1 % : c'est ce qui part.
  const [briOv, setBriOv] = useState(null);
  const briOfScene = selScene && selScene.brightness != null ? luminositeAmbiance(selScene) : 60;
  const bri = briOv != null ? briOv : briOfScene;
  const setBri = (nv) => {
    const v = Math.max(5, Math.min(100, nv));
    setBriOv(v);
    if (selScene) applyScene(selScene, v);
    else { const ids = variablesRepli(); if (ids.length) call('light', 'turn_on', { entity_id: ids, brightness_pct: v }); }
  };
  const totalScenes = Object.values(HUE_SCENES).reduce((n, c) => n + c.scenes.length, 0);
  const miniBtn = (on) => ({ padding: '5px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text2)' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={sectionTitle}>{tr('Ambiances lumineuses')}</h2>
          <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>{tr('Bibliothèque Hue · {c} collections · {s} scènes', { c: HUE_CATS().length, s: totalScenes })}</div>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: lit ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: lit ? 'var(--o-accent-soft)' : 'var(--o-text3)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: lit ? selColor : 'var(--o-text3)' }} />{lit ? sel.toUpperCase() : tr('AUCUNE ACTIVE')}</span>
      </div>

      {/* réglages rapides : direct, pièce, collection, luminosité */}
      <div className="o-bar o-bar-scenes" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,18px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
        <QuickBox label={tr('Direct')} className="o-qb-direct">
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={warmWhite} aria-label={tr('Blanc chaud')} style={miniBtn(false)}><span className="o-qb-ico" aria-hidden="true"><Fi i="bulb" size={15} color="var(--o-lampe)" /></span><span className="o-qb-txt">{tr('Blanc chaud')}</span></button>
            <button onClick={allOff} aria-label={tr('Éteindre')} style={miniBtn(false)}><span className="o-qb-ico" aria-hidden="true"><Fi i="power" size={15} /></span><span className="o-qb-txt">{tr('Éteindre')}</span></button>
          </div>
        </QuickBox>
        {/* Les zones de Home Assistant, en LISTE : il y en a autant que de pièces éclairées, une rangée de puces ne tiendrait pas
          * au téléphone (ADR 0304). */}
        <QuickBox label={tr('Pièce')} className="o-qb-piece">
          <ListeChoix value={room} options={pieces} onChange={pickRoom} label={tr('Pièce')} />
        </QuickBox>
        <QuickBox label={tr('Collection')} className="o-qb-collection">
          <ListeChoix value={cat} options={HUE_CATS()} onChange={setCat} label={tr('Collection de scènes')} />
        </QuickBox>
        <QuickBox label={tr('Luminosité')} className="o-qb-lumi">
          {/* Le rôle « curseur » vit sur la VALEUR, plus sur la rangée (lot 13
            * de l'audit du 03/10) : posé sur le conteneur, il enfermait − et +,
            * et un curseur ne contient pas de bouton (`nested-interactive`) —
            * les deux disparaissaient d'un lecteur d'écran. Au clavier : Tab
            * jusqu'à « 60 % », puis les flèches, Page préc. / suiv., Début /
            * Fin ; − et + gardent leur clic et disent ce qu'ils règlent
            * (« Monter » se lisait « Move up » en anglais, le mot du mode
            * édition). La valeur reste un `span` enfant direct de la rangée :
            * `.o-qb-lumi > div > span` (index.css) la tient au téléphone. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setBri(bri - 5)} aria-label={tr('Baisser la luminosité')} style={{ width: 24, height: 24, borderRadius: 11, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 }}>−</button>
            <span {...kbSlider(tr('Luminosité des scènes'), bri, setBri, { min: 5, max: 100, step: 5 })} style={{ minWidth: 44, textAlign: 'center', fontSize: 12, fontWeight: 800, color: 'var(--o-warn)' }}>{bri} %</span>
            <button onClick={() => setBri(bri + 5)} aria-label={tr('Monter la luminosité')} style={{ width: 24, height: 24, borderRadius: 11, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 }}>+</button>
          </div>
        </QuickBox>
        <span style={{ flex: 1 }} />
      </div>
      {/* Une pièce sans lampe d'ambiance (une zone inconnue, une veilleuse seule) : rien ne part, et on le dit, une ligne. */}
      {!toute && veilleuses && !variablesRepli().length && (
        <div role="status" style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginTop: -10 }}>{tr('Aucune lampe d’ambiance dans {p}', { p: nomPiece })}</div>
      )}

      {/* carte Appliquer une scène */}

      {/* grille des scènes de la collection : l'IMAGE Hue reste la vignette */}
      <div style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{(HUE_CATS().find(c => c.id === cat) || {}).label}</div>
      <div className="grid-scenecards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(178px,1fr))', gap: 16 }}>
        {scenes.map(sc => {
          const on = sel === sc.name;
          return (
            <button aria-label={tr('Appliquer {nom}', { nom: sc.name })} key={sc.name} onClick={() => pickScene(sc)} title={tr('Appliquer {nom}', { nom: sc.name })} style={{ position: 'relative', textAlign: 'left', padding: 0, overflow: 'hidden', cursor: 'pointer', borderRadius: 18, background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid ' + (on ? 'rgba(var(--o-accent-rgb),.55)' : 'var(--o-bd2)'), boxShadow: on ? '0 0 0 1px rgba(var(--o-accent-rgb),.3)' : 'none', transition: 'border-color .2s, box-shadow .2s' }}>
              <span aria-hidden="true" style={{ display: 'block', height: 96, background: sceneBackground(sc, HUE_IMG.get(sc.uuid) === true) }} />
              <span style={{ display: 'block', padding: '11px 13px 12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: on ? 'var(--o-accent-soft)' : 'var(--o-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.name}</span>
                  {on && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--o-accent-fond)', flexShrink: 0 }} />}
                </span>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2 }}>{tr('Luminosité {n} %', { n: luminositeAmbiance(sc) })}</span>
                <span style={{ display: 'flex', gap: 4, marginTop: 9 }}>
                  {sc.colors.slice(0, 5).map((c, ci) => <span key={ci} style={{ flex: 1, height: 4, borderRadius: 4, background: rgbHex(c) }} />)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
