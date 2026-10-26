let sent = false;
function sendClick(event) {
  if (event.button !== 0 || sent) return;
  sent = true;
  window.nativeInputAPI?.modelClick();
  setTimeout(() => { sent = false; }, 120);
}
window.addEventListener('pointerdown', sendClick, true);
window.addEventListener('mousedown', sendClick, true);
window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.nativeInputAPI?.desktopContextMenu();
});
