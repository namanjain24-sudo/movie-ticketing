/* ---------------------------------------------------------------------------
   Page behaviour: scroll reveals, the sticky booking walkthrough, and the
   nav's hairline. All three are IntersectionObserver driven; nothing here
   listens to the scroll event, which would run work on every frame.
--------------------------------------------------------------------------- */

(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- reveal on entry ------------------------------------------------------

  const revealables = [...document.querySelectorAll('.reveal')];
  if (reduce) {
    revealables.forEach((el) => el.setAttribute('data-shown', 'true'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-shown', 'true');
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
    );
    // Stagger siblings within a group rather than the whole page at once.
    document.querySelectorAll('[data-stagger]').forEach((group) => {
      [...group.children].forEach((child, i) => {
        const target = child.classList.contains('reveal') ? child : child.querySelector('.reveal');
        if (target) target.style.setProperty('--i', String(i));
      });
    });
    revealables.forEach((el) => io.observe(el));
  }

  // --- nav hairline ---------------------------------------------------------

  const nav = document.getElementById('siteNav');
  const sentinel = document.getElementById('topSentinel');
  if (nav && sentinel) {
    new IntersectionObserver(
      ([entry]) => nav.setAttribute('data-stuck', String(!entry.isIntersecting)),
      { threshold: 0 },
    ).observe(sentinel);
  }

  // --- the booking walkthrough ---------------------------------------------
  // The phone is sticky; whichever step is nearest the middle of the viewport
  // owns it. A band in the centre, not the whole viewport, so the handover
  // happens at a predictable moment rather than on the way in.

  const steps = [...document.querySelectorAll('.walk-step')];
  const shots = [...document.querySelectorAll('.walk-phone img')];

  if (steps.length && shots.length) {
    const show = (n) => {
      steps.forEach((s, i) => s.setAttribute('data-active', String(i === n)));
      shots.forEach((s, i) => s.setAttribute('data-active', String(i === n)));
    };
    show(0);

    // The phone stays sticky at every width, so the handover works the same
    // on a phone as on a desktop. Only the dimming of inactive copy is
    // dropped under reduced motion, via CSS.
    const stepObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const n = steps.indexOf(entry.target);
          if (n >= 0) show(n);
        }
      },
      { rootMargin: '-42% 0px -42% 0px', threshold: 0 },
    );
    steps.forEach((s) => stepObserver.observe(s));
  }

  // --- year -----------------------------------------------------------------

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
