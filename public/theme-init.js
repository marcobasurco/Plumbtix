// Runs synchronously before first paint to prevent theme flash.
// External file (not inline) so the enforced CSP 'script-src self' allows it.
(function () {
  var t = localStorage.getItem('plumbtix-theme');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();
