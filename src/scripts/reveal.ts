// Scroll reveal: adds .is-revealed to [data-reveal] elements as they enter the viewport.
// Children of [data-reveal-stagger] get an increasing --reveal-i so groups cascade.
// After an element has revealed, its reveal attributes are removed so its own hover transitions take over.

const MAX_STAGGER = 8;

function settle(el: HTMLElement) {
  el.removeAttribute('data-reveal');
  el.classList.remove('is-revealed');
  el.style.removeProperty('--reveal-i');
}

function init() {
  const els = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
  document.querySelectorAll<HTMLElement>('[data-reveal-stagger]').forEach((group) => {
    [...group.querySelectorAll<HTMLElement>(':scope > [data-reveal], :scope > * > [data-reveal]')].forEach((el, i) => el.style.setProperty('--reveal-i', String(Math.min(i, MAX_STAGGER))));
  });

  if (!('IntersectionObserver' in window)) {
    els.forEach(settle);
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        io.unobserve(el);
        el.classList.add('is-revealed');
        const delay = Number(el.style.getPropertyValue('--reveal-i') || 0) * 70;
        window.setTimeout(() => settle(el), delay + 1500);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  els.forEach((el) => io.observe(el));
}

init();
