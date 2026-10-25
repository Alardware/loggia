/* Importer un plan, relier ses objets (chantier Plan 3D, P1 a P3).
 *
 * L'import lit le fichier DANS le navigateur, avec le meme code que l'ecran
 * du plan (`plan3dmodele.js`) : ce que l'apercu annonce (« 11 appareils,
 * 7 pieces ») est ce que le plan montrera. Un .obj ou un .gltf en plusieurs
 * fichiers devient un seul .glb ; un .glb part tel quel, sa compression
 * gardee. Le fichier va au composant par sa route authentifiee — jamais dans
 * `/config/www/`, ouvert a tous.
 *
 * Relier : en mode edition, toucher un objet du plan ouvre `FeuilleLienPlan`.
 * La liaison porte sur le NOM de l'objet et vit dans la cle commune
 * `loggia_plan3d` : la meme sur tous les ecrans, et elle survit a un nouvel
 * import du meme modele. */
import { useRef, useState } from 'react';
import { BottomSheet, TitreFeuille, ListeChoix, EntPicker, cvName } from './ui.jsx';
import { btnPrimaire, btnSecondaire, btnDanger } from './views/parcommun.jsx';
import { tr } from './i18n.js';
import { lireFichiers, indexerModele, resumer, versGlb } from './plan3dmodele.js';

const TAILLE_MAX_PLAN = 40 * 1024 * 1024;
const DOMAINES_RELIABLES = ['light', 'switch', 'cover', 'fan', 'climate', 'media_player', 'binary_sensor', 'lock'];

const MOTIFS = {
  plan_format: () => tr('Ce fichier n’est pas un plan 3D lisible (.glb, .gltf ou .obj).'),
  plan_draco: () => tr('Ce plan est compressé en Draco, que Loggia ne lit pas encore. Exportez-le sans compression, ou compressé en meshopt.'),
  plan_trop_lourd: () => tr('Ce plan dépasse 40 Mo.'),
  plan_tronque: () => tr('Le fichier est arrivé incomplet. Réessayez.'),
  plan_vide: () => tr('Le fichier est vide.'),
  plan_sans_mtl: () => tr('Il manque le .mtl de ce .obj : sans lui, le plan serait tout blanc. Choisissez les deux fichiers ensemble, ou le .glb s’il existe.'),
  not_admin: () => tr('Seul un administrateur peut changer le plan.'),
};
const motifPlan = (code) => (MOTIFS[code] ? MOTIFS[code]() : tr('Le plan n’a pas pu être enregistré.'));

/** Envoie un .glb au composant. Rend { version } ou lève une erreur avec `code`. */
async function envoyerPlan(hass, etage, glb, nom) {
  const jeton = hass && hass.auth && hass.auth.data && hass.auth.data.access_token;
  const r = await fetch('/api/loggia/plan/' + encodeURIComponent(etage) + '?nom=' + encodeURIComponent(nom || ''), {
    method: 'POST',
    headers: { 'Content-Type': 'model/gltf-binary', ...(jeton ? { Authorization: 'Bearer ' + jeton } : {}) },
    body: glb,
  });
  let corps = null;
  try { corps = await r.json(); } catch { /* corps vide */ }
  if (!r.ok) { const e = new Error((corps && corps.code) || 'plan_erreur'); e.code = (corps && corps.code) || 'plan_erreur'; throw e; }
  return corps || {};
}

async function retirerPlan(hass, etage) {
  const jeton = hass && hass.auth && hass.auth.data && hass.auth.data.access_token;
  const r = await fetch('/api/loggia/plan/' + encodeURIComponent(etage), { method: 'DELETE', headers: jeton ? { Authorization: 'Bearer ' + jeton } : {} });
  if (!r.ok) { const e = new Error('plan_erreur'); e.code = 'plan_erreur'; throw e; }
}

const legende = { fontSize: 12.5, fontWeight: 600, color: 'var(--o-text3)', lineHeight: 1.45 };

/**
 * @param etages  [{ id, name }] — vide quand la maison n'en declare pas (le plan est alors « maison »)
 * @param existe  le plan de l'etage choisi existe deja (on propose de le retirer)
 */
export function FeuilleImportPlan({ hass, etages = [], etage: etageDepart = 'maison', existe = false, pieces = [], onClose, onFait }) {
  const [etage, setEtage] = useState(etageDepart);
  const [lu, setLu] = useState(null);           // { glb, racine, nom, resume }
  const [etape, setEtape] = useState(null);     // lecture | conversion | envoi
  const [erreur, setErreur] = useState(null);
  const [retirer, setRetirer] = useState(false);
  const champ = useRef(null);

  const choisir = async (e) => {
    const fichiers = [...(e.target.files || [])];
    e.target.value = '';
    if (!fichiers.length) return;
    setErreur(null); setLu(null); setEtape('lecture');
    try {
      const r = await lireFichiers(fichiers);
      setLu({ ...r, resume: resumer(indexerModele(r.racine, {}, { connus: Object.keys((hass && hass.states) || {}) }), pieces) });
    } catch (err) {
      setErreur(motifPlan(err && err.code));
    }
    setEtape(null);
  };

  const enregistrer = async () => {
    if (!lu) return;
    setErreur(null);
    try {
      let glb = lu.glb;
      if (!glb) { setEtape('conversion'); glb = await versGlb(lu.racine); }
      if (glb.byteLength > TAILLE_MAX_PLAN) throw Object.assign(new Error('plan_trop_lourd'), { code: 'plan_trop_lourd' });
      setEtape('envoi');
      await envoyerPlan(hass, etage, glb, lu.nom);
      setEtape(null);
      if (onFait) onFait(etage);
      onClose();
    } catch (err) {
      setEtape(null);
      setErreur(motifPlan(err && err.code));
    }
  };

  const toutRetirer = async () => {
    if (!retirer) { setRetirer(true); setTimeout(() => setRetirer(false), 8000); return; }
    try { await retirerPlan(hass, etage); if (onFait) onFait(etage); onClose(); } catch (err) { setErreur(motifPlan(err && err.code)); }
  };

  const r = lu && lu.resume;
  return (
    <BottomSheet onClose={onClose}>
      <TitreFeuille marge={14}><span style={{ fontSize: 18, fontWeight: 800 }}>{tr('Importer un plan')}</span></TitreFeuille>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={legende}>{tr('Un modèle 3D de la maison : .glb ou .gltf, ou .obj avec son .mtl et ses images (Sweet Home 3D, Blender, floor3d-card). Il est rangé sur Home Assistant et ne se voit qu’une fois connecté.')}</span>
        {etages.length > 0 && (
          <ListeChoix label={tr('Étage')} value={etage} onChange={setEtage}
            options={etages.map((f) => ({ id: f.id, label: f.name }))} />
        )}
        <input ref={champ} type="file" multiple aria-label={tr('Choisir les fichiers du plan')}
          accept=".glb,.gltf,.bin,.obj,.mtl,image/*" style={{ display: 'none' }} onChange={choisir} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" style={btnSecondaire} disabled={etape != null} onClick={() => champ.current && champ.current.click()}>
            {etape === 'lecture' ? tr('Lecture…') : lu ? tr('Choisir un autre fichier') : tr('Choisir les fichiers')}
          </button>
          {lu && (
            <button type="button" style={btnPrimaire} disabled={etape != null} onClick={enregistrer}>
              {etape === 'conversion' ? tr('Conversion…') : etape === 'envoi' ? tr('Envoi…') : tr('Enregistrer le plan')}
            </button>
          )}
        </div>
        {r && (
          <span role="status" style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text1)' }}>
            {lu.nom} · {tr('{n} appareils reconnus', { n: r.appareils.length })} · {tr('{n} pièces reconnues', { n: r.pieces.length })}
            <span style={{ display: 'block', ...legende, marginTop: 4 }}>
              {tr('Ce que le modèle ne dit pas se relie ensuite : en mode édition, touchez un objet du plan.')}
              {lu.aPlat && <span style={{ display: 'block', marginTop: 4 }}>{tr('Un .obj ne garde pas les groupes du modèle : pièces, volets et portes s’y reconnaissent moins bien. Si le même plan existe en .glb, préférez-le.')}</span>}
            </span>
          </span>
        )}
        {erreur && <span role="alert" style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-bad)' }}>{erreur}</span>}
        {existe && (
          <div>
            <button type="button" style={retirer ? { ...btnDanger, background: 'var(--o-bad)', color: '#fff' } : btnDanger} onClick={toutRetirer}>
              {retirer ? tr('Retirer ce plan ?') : tr('Retirer le plan')}
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/**
 * Relier un objet du plan.
 * @param objet   { nom, entite, piece, manuel } — ce que le plan a designe
 * @param zones   [{ id, name }] — les zones de HA
 * @param onLien  (nom, lien | null) — null : revenir a ce que Loggia trouve seul
 */
export function FeuilleLienPlan({ hass, objet, zones = [], onLien, onClose }) {
  const [choix, setChoix] = useState(null);   // null | 'appareil'
  const m = objet.manuel;
  const S = (hass && hass.states) || {};
  const nomEntite = (id) => cvName(S[id], id);
  const actuel = objet.entite ? tr('Relié à {x}', { x: nomEntite(objet.entite) })
    : objet.piece ? tr('Fait partie de la pièce {x}', { x: objet.piece })
      : tr('Relié à rien');
  const origine = m ? tr('relié à la main') : (objet.entite || objet.piece) ? tr('trouvé seul par son nom ou sa place') : null;
  const poser = (lien) => { onLien(objet.nom, lien); onClose(); };
  return (
    <BottomSheet onClose={onClose}>
      <TitreFeuille marge={12}><span style={{ fontSize: 18, fontWeight: 800 }}>{tr('Relier cet objet')}</span></TitreFeuille>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text1)', overflowWrap: 'anywhere' }}>
          {objet.nom}
          <span style={{ display: 'block', ...legende, marginTop: 4 }}>{actuel}{origine ? ' — ' + origine : ''}</span>
        </span>
        {choix === 'appareil' ? (
          <EntPicker hass={hass} autoFocus domaines={DOMAINES_RELIABLES} onPick={(id) => poser({ entite: id })} />
        ) : (
          <>
            <button type="button" style={btnSecondaire} onClick={() => setChoix('appareil')}>{tr('Relier à un appareil')}</button>
            {zones.length > 0 && (
              <ListeChoix label={tr('Ou en faire une pièce')} value={(m && m.piece) || ''} vide={tr('Choisir une pièce')}
                options={zones.map((z) => ({ id: z.id, label: z.name }))} onChange={(id) => poser({ piece: id })} />
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {(objet.entite || objet.piece) && !(m && m.aucun) && (
                <button type="button" style={btnDanger} onClick={() => poser({ aucun: true })}>{tr('Ne plus relier')}</button>
              )}
              {m && (
                <button type="button" style={btnSecondaire} onClick={() => poser(null)}>{tr('Revenir à ce que Loggia trouve seul')}</button>
              )}
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

/** Les liaisons d'un etage, apres un changement. `lien` null : on l'efface. */
export function changerLien(valeur, etage, nom, lien) {
  const v = valeur && typeof valeur === 'object' ? { ...valeur } : {};
  const liens = { ...(v.liens || {}) };
  const ici = { ...(liens[etage] || {}) };
  if (lien) ici[nom] = lien; else delete ici[nom];
  liens[etage] = ici;
  v.liens = liens;
  return v;
}
