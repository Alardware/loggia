/* Le type d’écran : sa largeur (`useWide`) et son pointeur (`useCoarse`).
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useEffect } from 'react';

function useWide(bp) {
  const [w, setW] = useState(() => { try { return window.matchMedia('(min-width:' + bp + 'px)').matches; } catch { return false; } });
  useEffect(() => {
    let mq; try { mq = window.matchMedia('(min-width:' + bp + 'px)'); } catch { return; }
    const on = () => setW(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
  }, [bp]);
  return w;
}
/* Le TYPE d'appareil, pas la largeur — la meme regle que la classe
 * `loggia-tactile`. Un ecran de 1180 px peut etre une tablette posee sur une
 * table ou un moniteur : seul `pointer: coarse` les separe. */
function useCoarse() {
  const [c, setC] = useState(() => { try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; } });
  useEffect(() => {
    let mq; try { mq = window.matchMedia('(pointer: coarse)'); } catch { return; }
    const on = () => setC(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
  }, []);
  return c;
}

export { useWide, useCoarse };
