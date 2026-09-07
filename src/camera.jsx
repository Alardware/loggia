/* ── Le flux d'une camera ───────────────────────────────────────────────────
 *
 * `HaImage` rafraichit une image, `CamLive` choisit entre flux video, MJPEG et
 * instantanes selon ce que l'entite sait faire. La Securite s'en sert, la fiche
 * d'un appareil aussi, et l'Aspirateur pour voir ou il est.
 *
 * Ce dernier ne pouvait pas quitter `App.jsx` tant que la camera y restait. */
import { useState, useEffect, useRef } from 'react';
import { tr } from './i18n.js';

export function HaImage({ hass, haid, refreshMs = 2000, kind = 'camera', fit = 'cover' }) {
  const [src, setSrc] = useState(null);
  const token = hass && hass.auth && hass.auth.data ? hass.auth.data.access_token : null;
  useEffect(() => {
    if (!haid || !token) { setSrc(null); return; }
    let alive = true, last = null, tour = 0;
    const endpoint = kind === 'image' ? 'image_proxy' : 'camera_proxy';
    const fetchSnap = async () => {
      /* Chaque appel porte son numero. Sur une camera lente, la reponse d'un
       * tour ancien arrivait apres une plus recente et remontait une image
       * perimee a l'ecran ; les vignettes semblaient reculer dans le temps. */
      const mien = ++tour;
      try {
        const res = await fetch(`/api/${endpoint}/${haid}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        if (!alive || mien !== tour) return;
        const url = URL.createObjectURL(blob);
        if (last) URL.revokeObjectURL(last);
        last = url; setSrc(url);
      } catch { /* garde le fond en repli */ }
    };
    fetchSnap();
    const id = setInterval(fetchSnap, refreshMs);
    return () => { alive = false; clearInterval(id); if (last) URL.revokeObjectURL(last); };
  }, [haid, token, refreshMs, kind]);
  if (!src) return null;
  return <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit }} />;
}

/**
 * Les serveurs ICE, demandes a Home Assistant.
 *
 * Un `stun:stun.l.google.com` etait ecrit ici en dur. Sur le reseau local cela
 * ne se voyait pas : les deux extremites sont sur le meme reseau, les candidats
 * « host » suffisent et aucun serveur n'est consulte. Depuis l'exterieur, en
 * revanche, il faut traverser deux NAT — et un STUN ne sert qu'a decouvrir sa
 * propre adresse publique, il ne relaie rien. Sans TURN la negociation
 * echouait, la camera restait noire, et l'interface de Home Assistant affichait
 * pourtant le flux : elle, elle demande sa configuration.
 *
 * `camera/webrtc/get_client_config` repond ce que l'installation a de mieux —
 * chez l'auteur, les STUN de Home Assistant et de Cloudflare, et surtout deux
 * TURN avec identifiants, dont un joignable en TLS sur le port 443.
 *
 * Le tableau vide est un repli volontaire : une version de Home Assistant qui
 * ignore cette commande n'a pas de WebRTC non plus, et sur un reseau local on
 * se connecte tres bien sans aucun serveur. Coder un service public en dur
 * serait doublement fautif — le projet s'interdit toute ressource externe, et
 * cela reviendrait a annoncer l'adresse publique de l'utilisateur a un tiers
 * qu'il n'a pas choisi.
 */
async function iceServers(conn, haid) {
  if (!conn) return [];
  try {
    const r = await conn.sendMessagePromise({ type: 'camera/webrtc/get_client_config', entity_id: haid });
    const s = r && r.configuration && r.configuration.iceServers;
    return Array.isArray(s) ? s : [];
  } catch {
    return [];
  }
}

// ── Lecteur caméra LIVE (porté de V1) : WebRTC → HLS natif → MJPEG signé → snapshot ──
export function CamLive({ hass, haid, online = true }) {
  const vidRef = useRef(null);
  const imgRef = useRef(null);
  const [mode, setMode] = useState('loading'); // loading | video | mjpeg | snap | off
  const token = hass && hass.auth && hass.auth.data ? hass.auth.data.access_token : null;
  const conn = hass && hass.connection ? hass.connection : null;
  useEffect(() => {
    let cancelled = false, cleanupRtc = null;
    setMode('loading');
    if (!online || !token || !conn) { setMode('off'); return; }
    /* Un flux qui a réussi à se connecter peut mourir en route — la 5G
     * capricieuse gèle la vidéo sans la fermer, et l'image figée a l'air d'un
     * direct. Sans nouvelle frame décodée pendant trois relevés (9 s), on
     * abandonne le direct pour le repli : mieux vaut un instantané de 2 s
     * qu'un faux direct. */
    let gelIv = null;
    const armerGel = () => {
      clearInterval(gelIv);
      let vues = -1, immobiles = 0;
      gelIv = setInterval(() => {
        const v = vidRef.current;
        if (cancelled || !v) return;
        const n = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality().totalVideoFrames
          : (v.webkitDecodedFrameCount != null ? v.webkitDecodedFrameCount : null);
        if (n == null) { clearInterval(gelIv); return; } // pas de compteur : impossible de juger
        if (n === vues) {
          immobiles += 1;
          if (immobiles >= 3) {
            clearInterval(gelIv);
            if (cleanupRtc) { try { cleanupRtc(); } catch {} cleanupRtc = null; }
            startMjpeg();
          }
        } else { vues = n; immobiles = 0; }
      }, 3000);
    };
    const startMjpeg = async () => {
      if (cancelled) return;
      clearInterval(gelIv); // le direct est abandonné : plus rien à surveiller
      try {
        const r = await conn.sendMessagePromise({ type: 'auth/sign_path', path: `/api/camera_proxy_stream/${haid}`, expires: 3600 });
        if (cancelled) return;
        if (r && r.path && imgRef.current) { imgRef.current.onerror = () => { if (!cancelled) setMode('snap'); }; imgRef.current.src = r.path; setMode('mjpeg'); }
        else setMode('snap');
      } catch { setMode('snap'); }
    };
    const startHls = async () => {
      if (cancelled) return;
      const v = vidRef.current;
      const nativeHls = v && v.canPlayType && v.canPlayType('application/vnd.apple.mpegurl');
      if (nativeHls) {
        try {
          const res = await conn.sendMessagePromise({ type: 'camera/stream', entity_id: haid, format: 'hls' });
          if (cancelled) return;
          if (res && res.url && vidRef.current) { vidRef.current.srcObject = null; vidRef.current.onerror = () => { if (!cancelled) startMjpeg(); }; vidRef.current.src = res.url; setMode('video'); armerGel(); vidRef.current.play && vidRef.current.play().catch(() => {}); return; }
        } catch { /* HLS indispo → MJPEG */ }
      }
      startMjpeg();
    };
    const startRtc = async () => {
      if (typeof RTCPeerConnection === 'undefined') return false;
      let sessionId = null, gotTrack = false, unsub = null;
      /* La configuration ICE arrive du serveur : entre la demande et la reponse,
       * le composant peut avoir ete demonte. Sans cette garde, le nettoyage
       * passait alors que `cleanupRtc` valait encore `null`, puis l'execution
       * reprenait ici et ouvrait une connexion que plus personne ne fermait.
       * Changer de vue rapidement accumulait sessions et sockets. */
      const glacons = await iceServers(conn, haid);
      if (cancelled) return false;
      const pc = new RTCPeerConnection({ iceServers: glacons });
      cleanupRtc = () => { try { unsub && unsub(); } catch {} try { pc.close(); } catch {} };
      if (cancelled) { cleanupRtc(); cleanupRtc = null; return false; }
      try { pc.addTransceiver('video', { direction: 'recvonly' }); pc.addTransceiver('audio', { direction: 'recvonly' }); } catch {}
      pc.addEventListener('track', (e) => { if (cancelled) return; gotTrack = true; if (vidRef.current && e.streams && e.streams[0]) { vidRef.current.srcObject = e.streams[0]; setMode('video'); armerGel(); vidRef.current.play && vidRef.current.play().catch(() => {}); } });
      pc.addEventListener('icecandidate', (e) => { if (cancelled || !sessionId || !e.candidate) return; conn.sendMessagePromise({ type: 'camera/webrtc/candidate', entity_id: haid, session_id: sessionId, candidate: { candidate: e.candidate.candidate, sdpMLineIndex: e.candidate.sdpMLineIndex, sdpMid: e.candidate.sdpMid } }).catch(() => {}); });
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        unsub = await conn.subscribeMessage((msg) => {
          if (cancelled || !msg) return;
          if (msg.type === 'session') sessionId = msg.session_id;
          else if (msg.type === 'answer') pc.setRemoteDescription({ type: 'answer', sdp: msg.answer }).catch(() => {});
          else if (msg.type === 'candidate' && msg.candidate) { try { pc.addIceCandidate(new RTCIceCandidate(typeof msg.candidate === 'string' ? { candidate: msg.candidate, sdpMLineIndex: 0 } : msg.candidate)); } catch {} }
        }, { type: 'camera/webrtc/offer', entity_id: haid, offer: pc.localDescription.sdp });
      } catch { cleanupRtc(); cleanupRtc = null; return false; }
      /* Quatre secondes suffisent en direct, sur le reseau local. Passer par un
       * relais TURN en demande davantage : allocation aupres du relais, puis
       * chaque paquet fait un detour. On accorde donc jusqu'a douze secondes,
       * mais seulement tant qu'ICE progresse — un etat `failed` ou `closed`
       * rend la main tout de suite, sans faire attendre le repli. */
      return await new Promise((resolve) => {
        const debut = Date.now();
        const fini = (v) => { clearInterval(iv); resolve(v); };
        const iv = setInterval(() => {
          if (gotTrack) return fini(true);
          if (cancelled) return fini(false);
          const et = pc.iceConnectionState;
          if (et === 'failed' || et === 'closed') return fini(false);
          const ecoule = Date.now() - debut;
          const encours = et === 'new' || et === 'checking';
          if (ecoule > (encours ? 12000 : 4000)) return fini(false);
        }, 150);
      });
    };
    (async () => { const ok = await startRtc(); if (cancelled) return; if (!ok) { if (cleanupRtc) { try { cleanupRtc(); } catch {} cleanupRtc = null; } await startHls(); } })();
    // Captures : dans le nettoyage, `ref.current` peut avoir change.
    const vidCapture = vidRef.current;
    const imgCapture = imgRef.current;
    return () => { cancelled = true; clearInterval(gelIv); if (cleanupRtc) { try { cleanupRtc(); } catch {} } const v = vidCapture; if (v) { try { v.pause(); } catch {} try { v.srcObject = null; } catch {} v.removeAttribute('src'); try { v.load(); } catch {} } const im = imgCapture; if (im) { im.onerror = null; im.removeAttribute('src'); } };
  }, [haid, online, token, conn]);
  const cover = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };
  if (mode === 'off') return null; // repli sur le fond gradient de la tuile
  return (
    <>
      <video ref={vidRef} aria-label={tr('Flux de la caméra')} autoPlay muted playsInline style={{ ...cover, display: mode === 'video' ? 'block' : 'none' }} />
      <img ref={imgRef} alt="" style={{ ...cover, display: mode === 'mjpeg' ? 'block' : 'none' }} />
      {mode === 'snap' && <HaImage hass={hass} haid={haid} refreshMs={2000} kind="camera" />}
    </>
  );
}
