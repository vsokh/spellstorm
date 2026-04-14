export function initFullscreen(): void {
  const btn = document.getElementById('fullscreen-btn');
  if (!btn) return;

  btn.addEventListener('click', toggleFullscreen);

  // F11 keyboard shortcut
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'F11') {
      e.preventDefault();
      toggleFullscreen();
    }
  });

  // Sync button text when fullscreen state changes (e.g. user presses Escape)
  document.addEventListener('fullscreenchange', () => {
    btn.textContent = document.fullscreenElement ? '✕' : '⛶';
    btn.title = document.fullscreenElement ? 'Exit Fullscreen (F11)' : 'Fullscreen (F11)';
  });
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen().catch(() => {
      // Silently fail - some browsers block without user gesture
    });
  }
}
