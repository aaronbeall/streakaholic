// Match the demo video to the visitor's light/dark setting. <picture> handles the stills on its
// own, but <video> has no reliable per-theme <source> switching across browsers.
(function () {
  var video = document.querySelector('.demo-video');
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (!video || !media) return;

  function apply() {
    var theme = media.matches ? 'dark' : 'light';
    var src = video.getAttribute('data-' + theme);
    if (!src || video.getAttribute('data-current') === src) return;
    video.setAttribute('data-current', src);
    video.poster = video.getAttribute('data-' + theme + '-poster');
    video.src = src;
    if (reduced) return;
    var played = video.play();
    if (played && played.catch) played.catch(function () { /* autoplay blocked: poster stays */ });
  }

  // Respect reduced motion: show the poster, let the visitor press play.
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    video.removeAttribute('autoplay');
    video.setAttribute('controls', '');
  }

  apply();
  if (media.addEventListener) media.addEventListener('change', apply);
})();

document.querySelectorAll('.year').forEach(function (el) {
  el.textContent = new Date().getFullYear();
});
