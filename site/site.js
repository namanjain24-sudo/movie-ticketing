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

  // --- the tutorial's chapter list -----------------------------------------
  // Clicking a chapter seeks the recording; the recording highlights whichever
  // chapter it is currently inside. `timeupdate` fires a few times a second,
  // which is the right rate for this and far cheaper than a rAF loop.

  const video = document.getElementById('tutVideo');
  const chapterButtons = [...document.querySelectorAll('.tut-chapters button')];

  if (video && chapterButtons.length) {
    const marks = chapterButtons.map((b) => Number(b.dataset.at));

    chapterButtons.forEach((b, i) => {
      b.addEventListener('click', () => {
        video.currentTime = marks[i];
        // A chapter click is a deliberate "show me this", so start it playing.
        video.play().catch(() => {});
      });
    });

    let shown = -1;
    video.addEventListener('timeupdate', () => {
      let n = 0;
      for (let i = 0; i < marks.length; i++) if (video.currentTime >= marks[i]) n = i;
      if (n === shown) return;
      shown = n;
      chapterButtons.forEach((b, i) => b.setAttribute('aria-current', String(i === n)));
    });

    // Autoplay only while it is on screen, and only when motion is welcome.
    // It is muted and loops, so this costs the reader nothing.
    if (!reduce) {
      new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) video.play().catch(() => {});
          else video.pause();
        },
        { threshold: 0.4 },
      ).observe(video);
    }
  }

  // --- the clip grid --------------------------------------------------------
  // Four phone recordings on one page is four video decoders if they all run,
  // so each is `preload="none"` and only loads and plays while it is actually
  // on screen. Off screen it pauses, which hands the decoder back.

  const clips = [...document.querySelectorAll('.clip-screen video')];
  if (clips.length) {
    if (reduce) {
      // The poster is a real frame of the same screen, so a still is not a
      // downgrade here; it is the first frame held.
      clips.forEach((v) => v.removeAttribute('autoplay'));
    } else {
      const clipObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const video = entry.target;
            if (entry.isIntersecting) {
              if (video.preload === 'none') video.preload = 'auto';
              video.play().catch(() => {
                // Autoplay can still be refused. The poster stays, which is a
                // frame of the same recording, so nothing looks broken.
              });
            } else {
              video.pause();
            }
          }
        },
        { threshold: 0.35 },
      );
      clips.forEach((v) => clipObserver.observe(v));
    }
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

  // --- wake the demo API ----------------------------------------------------

  /*
    The API runs on Render's free plan, which stops the service after fifteen
    idle minutes and takes the better part of a minute to start again. Measured
    on this deployment: 55 seconds asleep, 6 seconds awake, for the same sign
    in.

    Almost everybody who opens the app first opens this page, and then spends
    minutes downloading and installing a 54 MB APK. That is the whole cold
    start and more, sitting there unused. So the page spends it: one request on
    load, and by the time the app is installed the server is already up.

    `no-cors` on purpose. The API authorises no browser origin at all —
    `CORS_ORIGINS` is `mobileapp://`, so that a site cannot be talked into
    making credentialed calls on a visitor's behalf — and that is worth
    keeping. An opaque response is unreadable, which is fine: nothing here
    wants to read it. The request still reaches the server, and waking it is
    the entire point.

    `keepalive` so it survives the navigation when somebody lands on the page
    and immediately taps Download.
  */
  const API = 'https://boxoffice-api-i1ra.onrender.com/health/live';
  try {
    void fetch(API, { mode: 'no-cors', cache: 'no-store', keepalive: true }).catch(() => {
      // Offline, blocked, or the host is having a bad day. The app waits for
      // the server by itself; this is only ever a head start.
    });
  } catch {
    // Older browsers without fetch. Same bargain.
  }

  // --- year -----------------------------------------------------------------

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
