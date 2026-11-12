// Runs before the app paints, so there is no flash of the wrong theme.
// Daylight (light) is the default — the device's dark-mode setting is not
// followed. Dark is shown only when the signed-in person chose it; that choice
// is remembered here while they are signed in and cleared on sign-out
// (see src/lib/theme.ts).
(function () {
  try {
    if (localStorage.getItem('proroto-theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) { /* storage blocked: stay in daylight */ }
})();
