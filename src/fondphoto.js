/* LA PHOTO DE FOND SUIT LE COMPTE (30/10, ADR 0289).
 *
 * « Le fond d'écran n'est pas synchronisé : j'ai mis une image en 5G depuis
 * l'extérieur, et en Wi-Fi local je n'ai pas d'image. » La photo ne vivait que
 * dans le localStorage — une origine par adresse (Nabu Casa, IP locale), une
 * par navigateur. Elle est désormais rangée sur Home Assistant, sous le compte
 * connecté (`/api/loggia/fond`, fond.py) ; le localStorage n'en garde qu'une
 * copie, pour l'afficher dès le démarrage et hors connexion.
 *
 * Sa version voyage dans l'apparence (`look.fondV`) : un autre écran la voit
 * changer à la synchronisation et va chercher la nouvelle. Sans jeton (la
 * démonstration), rien ne part : la photo reste celle de l'onglet. */
import { getHass } from './state.js';
import { FOND_PHOTO_CLE } from './ui.jsx';

const URL_FOND = '/api/loggia/fond';

function jeton() {
  const h = getHass();
  return (h && h.auth && h.auth.data && h.auth.data.access_token) || null;
}

const enTete = (t) => ({ Authorization: 'Bearer ' + t });

function poserCopie(data) {
  try {
    if (data) window.localStorage.setItem(FOND_PHOTO_CLE, data); else window.localStorage.removeItem(FOND_PHOTO_CLE);
  } catch { /* stockage plein ou refusé : la photo se reprendra au serveur */ }
  try { window.dispatchEvent(new CustomEvent('loggia-fond-photo')); } catch { /* hors navigateur */ }
}

const enDataUrl = (blob) => new Promise((ok, ko) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => ko(r.error);
  r.readAsDataURL(blob);
});

/** Range la photo (une dataURL JPEG) sous le compte. Rend sa version, ou null sans connexion. */
export async function envoyerFond(data) {
  const t = jeton();
  if (!t) return null;
  const corps = await (await fetch(data)).blob();
  const r = await fetch(URL_FOND, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', ...enTete(t) }, body: corps });
  if (!r.ok) throw new Error('fond ' + r.status);
  return (await r.json()).version || null;
}

/** Retire la photo du compte. */
export async function retirerFond() {
  const t = jeton();
  if (t) await fetch(URL_FOND, { method: 'DELETE', headers: enTete(t) });
}

let enCours = null;
let derniere = null; // l'ETag de la copie locale, pour un 304 sans transfert

/**
 * Remet la copie locale d'accord avec le serveur. `fondV` : la version que
 * l'apparence annonce ; `poserVersion(v)` l'écrit quand cet écran envoie la
 * photo qu'il était seul à connaître (la reprise d'avant ce correctif).
 */
export function synchroniserFond(fondV, poserVersion) {
  if (enCours) return enCours;
  enCours = (async () => {
    let t = jeton();
    // Au tout premier rendu, la connexion n'est pas encore là.
    for (let i = 0; !t && i < 20; i++) { await new Promise(r => setTimeout(r, 500)); t = jeton(); }
    if (!t) return;
    const r = await fetch(URL_FOND, { headers: { ...enTete(t), ...(derniere ? { 'If-None-Match': derniere } : {}) } });
    if (r.status === 304) return;
    if (r.ok) {
      derniere = r.headers.get('ETag');
      poserCopie(await enDataUrl(await r.blob()));
      return;
    }
    if (r.status !== 404) return;
    // Rien au serveur. Une photo que seul cet écran connaît, jamais envoyée
    // (`fondV` absent de l'apparence) : c'est elle qu'on range. Retirée
    // ailleurs (`fondV` à null), elle n'est pas renvoyée.
    let locale = null;
    try { locale = window.localStorage.getItem(FOND_PHOTO_CLE); } catch { /* rien */ }
    if (locale && fondV === undefined) {
      const v = await envoyerFond(locale);
      if (v && poserVersion) poserVersion(v);
    } else if (fondV === null) poserCopie(null);
  })().catch(() => {}).finally(() => { enCours = null; });
  return enCours;
}
