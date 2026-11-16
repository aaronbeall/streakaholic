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
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    const header = document.querySelector('.site-header');
    const top = target.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight + 12 : 0);
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
});

// Waitlist posts to FormSubmit, which emails support@ without a backend.
// First submission from a new domain asks that inbox to confirm once.
const WAITLIST_ENDPOINT = 'https://formsubmit.co/ajax/support@metamodernmonkey.com';
const form = document.getElementById('waitlist-form');
const statusEl = document.getElementById('waitlist-status');

const setStatus = (message, tone) => {
  if (!statusEl) return;
  statusEl.hidden = !message;
  statusEl.textContent = message;
  statusEl.dataset.tone = tone || '';
};

if (form) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const email = new FormData(form).get('email');
    const button = form.querySelector('button[type="submit"]');
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus('Enter a valid email address.', 'error');
      return;
    }

    button.disabled = true;
    setStatus('Sending…');

    try {
      const response = await fetch(WAITLIST_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          _subject: 'Streakaholic early access',
          message: 'Please notify me when Streakaholic opens for Android testing.',
          source: 'streakaholic.app waitlist',
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      form.reset();
      setStatus("You're on the list. We'll email when testing opens.", 'ok');
    } catch (error) {
      setStatus("Couldn't send just now. Email support@metamodernmonkey.com instead.", 'error');
    } finally {
      button.disabled = false;
    }
  });
}
