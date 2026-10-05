/* ── Lire la configuration d'une carte Lovelace ─────────────────────────────
 *
 * On colle du YAML, parce que c'est ce que donnent la documentation des cartes
 * et l'éditeur de Home Assistant. Pas de bibliothèque : le paquet versionné
 * pèse déjà un mégaoctet, et une configuration de carte n'emploie qu'un coin
 * du langage.
 *
 * CE QU'ON LIT : des clés `a: b`, l'imbrication par indentation, les listes à
 * tiret, les scalaires (texte, nombre, booléen, nul), les guillemets simples ou
 * doubles, les commentaires `#`, et le JSON — qui passe par `JSON.parse`.
 *
 * CE QU'ON NE LIT PAS : les ancres (`&`/`*`), les blocs `|` et `>`, plusieurs
 * documents, les clés complexes. C'est volontaire et c'est DIT : `lireConfig`
 * rend une erreur nommée plutôt que de deviner de travers. Une configuration
 * mal comprise donnerait une carte fausse, ce qui est pire qu'un refus.
 *
 * Aucun React ici : tout se teste à la main.
 */

/** Un scalaire YAML : nombre, booléen, nul, ou texte. */
export function lireScalaire(brut) {
  const v = String(brut == null ? '' : brut).trim();
  if (!v) return null;
  // Entre guillemets, c'est du texte — même « true », même « 12 ».
  if ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'")) {
    return v.slice(1, -1);
  }
  if (v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === 'no' || v === 'off') return false;
  if (v === 'null' || v === '~') return null;
  // Un nombre, et seulement s'il se relit à l'identique : « 1.2.3 » et
  // « 08:00 » sont du texte, pas des nombres tronqués.
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  // Une liste en ligne : `[a, b]`.
  if (v[0] === '[' && v[v.length - 1] === ']') {
    const dedans = v.slice(1, -1).trim();
    return dedans ? dedans.split(',').map(x => lireScalaire(x)) : [];
  }
  return v;
}

/* Une ligne utile : son indentation, et ce qu'elle porte. Les commentaires et
 * les lignes vides disparaissent ici — sauf un `#` dans une chaîne citée. */
function lignesUtiles(texte) {
  const out = [];
  for (const brute of String(texte || '').split('\n')) {
    const sansFin = brute.replace(/\t/g, '  ');
    let dedans = null, coupe = -1;
    for (let i = 0; i < sansFin.length; i += 1) {
      const c = sansFin[i];
      if (dedans) { if (c === dedans) dedans = null; continue; }
      if (c === '"' || c === "'") { dedans = c; continue; }
      if (c === '#' && (i === 0 || /\s/.test(sansFin[i - 1]))) { coupe = i; break; }
    }
    const ligne = (coupe >= 0 ? sansFin.slice(0, coupe) : sansFin).replace(/\s+$/, '');
    if (!ligne.trim()) continue;
    out.push({ creux: ligne.length - ligne.replace(/^ +/, '').length, texte: ligne.trim() });
  }
  return out;
}

/* Le bloc qui suit la ligne `i`, c'est-à-dire toutes les lignes plus creuses. */
function bloc(lignes, i) {
  const creux = lignes[i].creux;
  let f = i + 1;
  while (f < lignes.length && lignes[f].creux > creux) f += 1;
  return [i + 1, f];
}

function analyser(lignes, debut, fin) {
  if (debut >= fin) return null;
  const creux = lignes[debut].creux;
  // Une liste : toutes ses entrées commencent par un tiret, au même creux.
  if (lignes[debut].texte[0] === '-') {
    const out = [];
    for (let i = debut; i < fin; i += 1) {
      if (lignes[i].creux !== creux) continue;
      const t = lignes[i].texte;
      if (t[0] !== '-') throw new Error('liste');
      const reste = t.slice(1).trim();
      const [d, f] = bloc(lignes, i);
      const sous = Math.min(f, fin);
      if (reste && reste.indexOf(':') > 0) {
        /* `- type: tile` : la première paire est sur la ligne du tiret, les
         * suivantes en dessous. On recompose l'objet des deux — en donnant à
         * la première le creux des autres, sans quoi elle les adopterait comme
         * enfants au lieu de les tenir pour ses sœurs. */
        const suite = lignes.slice(d, sous);
        const creuxFreres = suite.length ? suite[0].creux : creux + 2;
        out.push(analyser([{ creux: creuxFreres, texte: reste }, ...suite], 0, 1 + suite.length));
      } else if (reste) {
        out.push(lireScalaire(reste));
      } else {
        out.push(analyser(lignes, d, sous));
      }
    }
    return out;
  }
  // Sinon un objet.
  const out = {};
  for (let i = debut; i < fin; i += 1) {
    if (lignes[i].creux !== creux) continue;
    const t = lignes[i].texte;
    const sep = t.indexOf(':');
    if (sep < 0) throw new Error('paire');
    const cle = t.slice(0, sep).trim().replace(/^["']|["']$/g, '');
    const valeur = t.slice(sep + 1).trim();
    const [d, f] = bloc(lignes, i);
    const sous = Math.min(f, fin);
    out[cle] = valeur ? lireScalaire(valeur) : (d < sous ? analyser(lignes, d, sous) : null);
  }
  return out;
}

/**
 * La configuration que porte un texte : `{ ok, config }` ou `{ ok: false, raison }`.
 *
 * `raison` vaut 'vide', 'syntaxe' ou 'objet' — jamais une exception qui
 * remonterait jusqu'à la vue.
 */
export function lireConfig(texte) {
  const t = String(texte || '').trim();
  if (!t) return { ok: false, raison: 'vide' };
  // Du JSON d'abord : c'est aussi du YAML, et `JSON.parse` le fait mieux.
  if (t[0] === '{' || t[0] === '[') {
    try {
      const j = JSON.parse(t);
      return (j && typeof j === 'object' && !Array.isArray(j)) ? { ok: true, config: j } : { ok: false, raison: 'objet' };
    } catch { return { ok: false, raison: 'syntaxe' }; }
  }
  let v = null;
  try {
    const l = lignesUtiles(t);
    v = analyser(l, 0, l.length);
  } catch { return { ok: false, raison: 'syntaxe' }; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, raison: 'objet' };
  return { ok: true, config: v };
}
