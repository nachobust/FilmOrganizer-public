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
