// Highlights the download button and card for the visitor's system; all three stay visible.
(function () {
  var ua = navigator.userAgent;
  var os = /Windows/i.test(ua) ? 'windows' : /Mac OS X|Macintosh/i.test(ua) ? 'mac' : /Linux|X11/i.test(ua) ? 'linux' : '';
  if (!os || /Android|iPhone|iPad/i.test(ua)) return;
  var button = document.querySelector('.os-button[data-os="' + os + '"]');
  if (button) button.classList.add('primary');
  var card = document.querySelector('.card.os[data-os="' + os + '"]');
  if (card) card.classList.add('mine');
})();

// Download links point straight at the installer files of the latest release. The HTML carries the
// current version's links, so downloads work without this; it only picks up newer releases.
(function () {
  var patterns = {
    'setup-exe': /-setup\.exe$/,
    msi: /\.msi$/,
    dmg: /\.dmg$/,
    appimage: /\.AppImage$/,
    deb: /\.deb$/,
  };
  if (!window.fetch) return;
  fetch('https://api.github.com/repos/nachobust/FilmOrganizer-public/releases/latest')
    .then(function (response) {
      return response.ok ? response.json() : null;
    })
    .then(function (release) {
      if (!release || !release.assets) return;
      document.querySelectorAll('[data-asset]').forEach(function (link) {
        var pattern = patterns[link.getAttribute('data-asset')];
        var asset = release.assets.find(function (a) {
          return pattern && pattern.test(a.name);
        });
        if (asset) link.href = asset.browser_download_url;
      });
      var version = document.querySelector('.release-version');
      if (version && release.tag_name) version.textContent = 'Version ' + release.tag_name.replace(/^v/, '');
    })
    .catch(function () {});
})();
