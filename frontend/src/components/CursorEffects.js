/**
 * CursorEffects — Pointer-driven effects set up once for the whole app.
 *  - Publishes the (smoothed) cursor position as --cursor-x / --cursor-y on <html>,
 *    used by the background spotlight in AppBackground.
 *  - Sets --mx / --my on the hovered `.spotlight` card for its local glow.
 * Renders nothing itself. Disabled on touch devices and when reduced motion is preferred.
 */

import { useEffect } from 'react';

const isEnabled = () =>
  window.matchMedia('(pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function CursorEffects() {
  useEffect(() => {
    if (!isEnabled()) return;

    const root = document.documentElement;
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 3 };
    const glow = { ...target };   // trails behind the pointer, for the background
    let frame = null;

    // Animate only while the glow is catching up; an idle loop would repaint
    // the full-screen spotlight layers every frame.
    const tick = () => {
      glow.x += (target.x - glow.x) * 0.08;
      glow.y += (target.y - glow.y) * 0.08;
      const settled = Math.abs(target.x - glow.x) < 0.5 && Math.abs(target.y - glow.y) < 0.5;
      if (settled) Object.assign(glow, target);
      root.style.setProperty('--cursor-x', `${glow.x.toFixed(1)}px`);
      root.style.setProperty('--cursor-y', `${glow.y.toFixed(1)}px`);
      frame = settled ? null : requestAnimationFrame(tick);
    };

    const onMove = (e) => {
      target.x = e.clientX;
      target.y = e.clientY;
      if (frame === null) frame = requestAnimationFrame(tick);

      const card = e.target.closest?.('.spotlight');
      if (card) {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        card.style.setProperty('--my', `${e.clientY - rect.top}px`);
      }

      root.classList.remove('cursor-hidden');
    };

    const onLeave = () => root.classList.add('cursor-hidden');

    root.classList.add('cursor-fx');
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    tick();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      root.classList.remove('cursor-fx', 'cursor-hidden');
    };
  }, []);

  return null;
}
