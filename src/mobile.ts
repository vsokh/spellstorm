// ═══════════════════════════════════
//     MOBILE DETECTION + RENDER TUNING
// ═══════════════════════════════════
// Zero-import module so state.ts / input.ts / main.ts can all use it
// without cycles. Everything here is a no-op on desktop.

/** True phones/tablets. Touch-screen laptops keep the desktop experience. */
export const IS_MOBILE: boolean =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse) and (hover: none)').matches;

/** Phones show a wider view of the arena (view span = screen px × zoom).
 *  Rendering-only: gameplay never reads canvas/view dimensions. */
const MOBILE_ZOOM = 1.3;
export function getRenderZoom(): number {
  return IS_MOBILE ? MOBILE_ZOOM : 1;
}

/** Phones rasterize at a fraction of the view resolution and CSS-upscale
 *  (image-rendering: pixelated) — roughly halves Canvas2D fill cost. */
const MOBILE_RENDER_RES = 0.7;
export function getRenderRes(): number {
  return IS_MOBILE ? MOBILE_RENDER_RES : 1;
}
