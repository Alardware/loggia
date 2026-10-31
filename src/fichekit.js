/* ── Le kit des fiches (lot 6 de l'audit du 28/10, M7) ───────────────────────
 *
 * Les styles que les fiches des maquettes recopiaient chacune chez elle — le
 * volet, la prise, la lumière, le capteur, la météo, la plante, le média, le
 * groupe, le chauffage, le robot, le distributeur. Ils étaient
 * identiques à l'octet près : une seule copie ici, qu'un réglage du dessin
 * des fiches se fasse en un seul endroit.
 *
 * Seul ce qui était VRAIMENT pareil est venu. Une fiche qui s'écarte d'un
 * pixel (le `PANNEAU` à ombre du socle, `fichecommune.jsx` ; celui du robot,
 * rembourré ; celui de l'enfant ; les `PUCE`, toutes différentes) garde le sien.
 */
import { LISERE } from './styles.js';

/* Les panneaux des maquettes : le gris --o-s3, l'arrondi du thème, sans
 * ombre — et la bordure du réglage « Liserés » (LISERE), qui vaut pour tous. */
export const PANNEAU = { background: 'var(--o-s3)', border: LISERE, borderRadius: 'var(--o-radius,18px)', boxSizing: 'border-box', minWidth: 0 };
// La tuile du robot et du distributeur : le même gris, l'arrondi fixe de 18 px ; sa marge vit dans index.css (`rb-a-tuile`), qui la change au téléphone.
export const CADRE_TUILE = { background: 'var(--o-s3)', border: LISERE, borderRadius: 18, boxSizing: 'border-box', minWidth: 0 };
// Une rangée de liste : 18 px à gauche (volet, prise, lumière, média), 16 px dans les fiches serrées (capteur, météo, plante).
export const RANGEE = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', padding: '12px 14px 12px 18px' };
export const RANGEE_SERREE = { ...RANGEE, padding: '12px 14px 12px 16px' };
// Une rangée qui se touche : un bouton sans rien du bouton.
export const EN_BOUTON = { border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--o-text)', textAlign: 'left' };
export const TITRE = { display: 'block', fontSize: 14, fontWeight: 700 };
export const SOUS = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 };
export const ALERTE = { fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)' };
