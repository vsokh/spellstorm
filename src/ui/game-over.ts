export function setupGameOver(): void {
  const btn = document.getElementById('btn-restart');
  if (btn) {
    btn.addEventListener('click', () => location.reload());
  }
}
