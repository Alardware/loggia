/* ── L'écoute : du micro au texte ────────────────────────────────────────────
 *
 * L'assistant ne transcrit pas. Sa commande `chat` ne prend que du texte, et
 * son `identity/voice` sert aux empreintes vocales, pas aux mots. La
 * transcription vient donc de Home Assistant lui-même, par son pipeline
 * Assist — celui qui fait déjà parler les enceintes de la maison. Loggia ne
 * fait que le nourrir en son et lui reprendre la phrase.
 *
 * Ce module ne part QUE sur un appui : le micro, le contexte audio et le
 * pipeline coûtent trop pour vivre en fond de tableau de bord.
 *
 * ── Ce qu'il a fallu mesurer avant d'écrire une ligne ────────────────────────
 *
 * Le 09/09/2026, sur l'adresse locale en HTTP :
 *
 *     isSecureContext: false      navigator.mediaDevices: undefined
 *
 * Le navigateur INTERDIT la capture audio hors contexte sécurisé. Aucun code
 * n'y change rien, et `hass.connection.socket` y valait `undefined` de
 * surcroît. Sur l'adresse HTTPS, tout s'ouvre : contexte sécurisé, politique
 * de l'iframe `microphone: true`, permission déjà accordée, socket bien réel.
 *
 * D'où `voixDisponible()`, appelée avant d'afficher quoi que ce soit : un
 * bouton micro qui ne peut rien faire ment à celui qui le voit.
 */

/* Ce que le pipeline attend : mono, 16 kHz, entiers 16 bits signés. Le
 * navigateur rééchantillonne lui-même — demander ce taux au contexte audio
 * évite de le faire à la main, et mal. */
const TAUX = 16000;

/* 4096 échantillons, soit un quart de seconde : assez court pour que l'orbe
 * suive la voix sans retard visible, assez long pour ne pas noyer le socket
 * sous les trames. */
const TAILLE_BLOC = 4096;

/**
 * Ce qui manque, s'il manque quelque chose.
 *
 * Rend `{ ok: true }` ou une raison courte, faite pour être montrée : c'est
 * l'utilisateur qui doit comprendre pourquoi le micro ne répond pas, pas
 * seulement la console.
 */
export function voixDisponible() {
  if (typeof window === 'undefined') return { ok: false, raison: 'fenetre' };
  if (!window.isSecureContext) return { ok: false, raison: 'https' };
  const md = navigator.mediaDevices;
  if (!md || typeof md.getUserMedia !== 'function') return { ok: false, raison: 'micro' };
  if (!(window.AudioContext || window.webkitAudioContext)) return { ok: false, raison: 'audio' };
  return { ok: true, raison: '' };
}

/** Le message que l'on montre pour chaque raison. */
export function raisonLisible(raison, tr = (x) => x) {
  if (raison === 'https') return tr('La voix demande une adresse sécurisée (https).');
  if (raison === 'micro') return tr('Ce navigateur ne donne pas accès au micro.');
  if (raison === 'audio') return tr('Ce navigateur ne sait pas traiter le son.');
  if (raison === 'socket') return tr('Liaison à Home Assistant interrompue.');
  if (raison === 'pipeline') return tr('Aucun moteur de transcription dans Home Assistant.');
  if (raison === 'refus') return tr('Accès au micro refusé.');
  return tr('Écoute impossible.');
}

/**
 * Le pipeline qui sait transcrire.
 *
 * Le pipeline préféré n'est pas forcément équipé : sur l'installation mesurée,
 * celui qui porte le titre « Home Assistant » n'a AUCUN moteur de
 * transcription, et deux autres en ont un. Prendre le préféré sans regarder
 * aurait donné un pipeline muet et une erreur incompréhensible.
 */
async function pipelineQuiTranscrit(hass) {
  let liste;
  try {
    liste = await hass.callWS({ type: 'assist_pipeline/pipeline/list' });
  } catch {
    return undefined;                  // HA trop ancien : on laisse HA choisir seul
  }
  const tous = (liste && liste.pipelines) || [];
  const equipes = tous.filter((p) => p && p.stt_engine);
  if (!equipes.length) return null;
  const prefere = equipes.find((p) => p.id === liste.preferred_pipeline);
  if (prefere) return prefere.id;
  // À défaut, celui qui parle la langue de l'interface plutôt que le premier venu.
  const langue = String((document.documentElement && document.documentElement.lang) || 'fr').slice(0, 2);
  const meme = equipes.find((p) => String(p.language || '').slice(0, 2) === langue);
  return (meme || equipes[0]).id;
}

/**
 * Écoute, et rend de quoi arrêter.
 *
 * `onNiveau` reçoit l'amplitude entre 0 et 1 — c'est elle qui fait respirer
 * l'orbe au rythme de la voix. `onEtape` suit la progression du pipeline, pour
 * qui veut afficher autre chose pendant la transcription.
 *
 * L'objet rendu porte `texte`, une promesse qui se résout sur la phrase
 * entendue. Elle se résout SEULE quand Home Assistant détecte la fin de la
 * parole : on n'est pas obligé d'appuyer une seconde fois.
 */
export async function ecouter(hass, { onNiveau, onEtape } = {}) {
  const dispo = voixDisponible();
  if (!dispo.ok) throw new Error(dispo.raison);

  const socket = hass && hass.connection && hass.connection.socket;
  if (!socket || socket.readyState !== 1) throw new Error('socket');

  const pipeline = await pipelineQuiTranscrit(hass);
  if (pipeline === null) throw new Error('pipeline');

  let flux;
  try {
    flux = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    throw new Error('refus');
  }

  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx({ sampleRate: TAUX });
  const source = ctx.createMediaStreamSource(flux);
  /* `createScriptProcessor` est déprécié, et c'est pourtant lui qu'on emploie.
   * `AudioWorklet` demande un second fichier chargé par URL — un module de plus
   * à publier, à versionner et à retrouver depuis le composant. Pour un quart
   * de seconde de son toutes les 250 ms, le nœud déprécié suffit et vit dans
   * ce fichier. */
  const noeud = ctx.createScriptProcessor(TAILLE_BLOC, 1, 1);

  let idBinaire = null;
  let vivant = true;
  const enAttente = [];               // le son capté avant que HA n'ouvre son canal

  const emettre = (bloc) => {
    const trame = new Uint8Array(1 + bloc.byteLength);
    trame[0] = idBinaire;
    trame.set(new Uint8Array(bloc.buffer, bloc.byteOffset, bloc.byteLength), 1);
    try { socket.send(trame); } catch { /* liaison coupée : la promesse le dira */ }
  };

  noeud.onaudioprocess = (e) => {
    if (!vivant) return;
    const entree = e.inputBuffer.getChannelData(0);
    // Amplitude efficace, pour l'orbe. Le facteur monte une parole ordinaire
    // vers le haut de l'échelle sans saturer au moindre souffle.
    if (onNiveau) {
      let somme = 0;
      for (let i = 0; i < entree.length; i += 1) somme += entree[i] * entree[i];
      onNiveau(Math.min(1, Math.sqrt(somme / entree.length) * 7));
    }
    const bloc = new Int16Array(entree.length);
    for (let i = 0; i < entree.length; i += 1) {
      const v = Math.max(-1, Math.min(1, entree[i]));
      bloc[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    if (idBinaire === null) {
      // Le canal n'est pas encore ouvert. On garde une seconde de son, pas
      // plus : au-delà, ce n'est plus le début de la phrase, c'est du retard.
      enAttente.push(bloc);
      while (enAttente.length > 4) enAttente.shift();
      return;
    }
    emettre(bloc);
  };

  source.connect(noeud);
  /* Le nœud doit aboutir quelque part pour que le navigateur le fasse tourner.
   * Un gain à zéro : il travaille, et rien ne sort des haut-parleurs. */
  const muet = ctx.createGain();
  muet.gain.value = 0;
  noeud.connect(muet);
  muet.connect(ctx.destination);

  let resoudre;
  let rejeter;
  const texte = new Promise((ok, ko) => { resoudre = ok; rejeter = ko; });

  let desabonner = null;
  const ranger = () => {
    if (!vivant) return;
    vivant = false;
    try { noeud.onaudioprocess = null; noeud.disconnect(); source.disconnect(); muet.disconnect(); } catch { /* déjà détaché */ }
    try { flux.getTracks().forEach((t) => t.stop()); } catch { /* déjà arrêté */ }
    try { ctx.close(); } catch { /* déjà fermé */ }
    if (onNiveau) onNiveau(0);
  };

  const surEvenement = (ev) => {
    const quoi = ev && ev.type;
    if (onEtape) onEtape(quoi);
    if (quoi === 'run-start') {
      const rd = (ev.data && ev.data.runner_data) || {};
      idBinaire = rd.stt_binary_handler_id;
      if (idBinaire != null) { enAttente.forEach(emettre); enAttente.length = 0; }
      return;
    }
    if (quoi === 'stt-end') {
      const dit = ((ev.data || {}).stt_output || {}).text || '';
      ranger();
      resoudre(dit.trim());
      return;
    }
    if (quoi === 'error') {
      ranger();
      rejeter(new Error((ev.data || {}).message || 'pipeline'));
      return;
    }
    if (quoi === 'run-end' && vivant) { ranger(); resoudre(''); }
  };

  try {
    desabonner = await hass.connection.subscribeMessage(surEvenement, {
      type: 'assist_pipeline/run',
      start_stage: 'stt',
      end_stage: 'stt',
      input: { sample_rate: TAUX },
      ...(pipeline ? { pipeline } : {}),
    });
  } catch (e) {
    ranger();
    throw e;
  }

  texte.catch(() => {}).then(() => { if (desabonner) { try { desabonner(); } catch { /* déjà clos */ } } });

  return {
    texte,
    /** Ferme le robinet du son. Home Assistant transcrit ce qu'il a reçu. */
    arreter() {
      if (!vivant) return;
      // Une trame VIDE — l'identifiant seul — dit « c'est fini » au pipeline.
      // Sans elle, il attendrait sa propre détection de silence.
      if (idBinaire != null) { try { socket.send(new Uint8Array([idBinaire])); } catch { /* liaison coupée */ } }
      try { noeud.onaudioprocess = null; } catch { /* déjà détaché */ }
      try { flux.getTracks().forEach((t) => t.stop()); } catch { /* déjà arrêté */ }
      if (onNiveau) onNiveau(0);
    },
    /** Tout jeter sans rien transcrire — on a changé d'avis. */
    annuler() {
      ranger();
      resoudre('');
    },
  };
}
