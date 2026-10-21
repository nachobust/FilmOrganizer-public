// Names the visitor's system on the main download button and highlights its card.
(function () {
  var ua = navigator.userAgent;
  var os = /Windows/i.test(ua) ? 'windows' : /Mac OS X|Macintosh/i.test(ua) ? 'mac' : /Linux|X11/i.test(ua) ? 'linux' : '';
  var names = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };
  if (!os || /Android|iPhone|iPad/i.test(ua)) return;
  var button = document.getElementById('download-main');
  if (button) button.textContent = 'Download for ' + names[os];
  var card = document.querySelector('.card.os[data-os="' + os + '"]');
  if (card) card.classList.add('mine');
})();
