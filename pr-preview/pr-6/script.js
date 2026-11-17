const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const demos = Array.from(document.querySelectorAll('video.demo'));

const playSafe = (video) => {
  const play = video.play();
  if (play && typeof play.catch === 'function') play.catch(() => {});
};

if (reduceMotion) {
  demos.forEach(video => {
    video.removeAttribute('autoplay');
    video.pause();
  });
} else if ('IntersectionObserver' in window) {
  // Only one in-view clip should decode at a time — keeps scrolling smooth on modest devices.
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
        playSafe(video);
      } else {
        video.pause();
      }
    });
  }, { threshold: [0, 0.35, 0.6] });

  demos.forEach(video => {
    video.removeAttribute('autoplay');
    video.preload = video.classList.contains('phone-hero') || video.closest('.phone-hero')
      ? 'auto'
      : 'metadata';
    observer.observe(video);
  });
}

document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', event => {
    const href = link.getAttribute('href');
    if (href.length < 2 || link.hasAttribute('data-eo-form-toggle-id')) return;
    const target = document.querySelector(href);
    if (!target) return;
    event.preventDefault();
    const header = document.querySelector('.site-header');
    const top = target.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight + 12 : 0);
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
});
