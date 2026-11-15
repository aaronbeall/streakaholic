const video = document.querySelector('.demo');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (video && reduceMotion) {
  video.removeAttribute('autoplay');
  video.pause();
}

document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', event => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    const header = document.querySelector('.site-header');
    const top = target.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight + 12 : 0);
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
});
