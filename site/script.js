(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Nav background on scroll, via IntersectionObserver sentinel
     (no scroll listeners). */
  var nav = document.getElementById('siteNav');
  var sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  sentinel.style.position = 'absolute';
  sentinel.style.top = '0';
  sentinel.style.height = '1px';
  sentinel.style.width = '1px';
  document.body.prepend(sentinel);

  if (nav && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        nav.classList.toggle('is-scrolled', !entry.isIntersecting);
      });
    }).observe(sentinel);
  }

  /* Which nav link is "current", by which section fills the middle of the
     viewport — the same sentinel-based approach as the scrolled state, just
     one observer per section instead of a scroll listener doing the math. */
  if (nav && 'IntersectionObserver' in window) {
    var navLinks = nav.querySelectorAll('.nav-links a[href^="#"]');
    var sectionObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          navLinks.forEach(function (link) {
            link.classList.toggle(
              'is-active',
              link.getAttribute('href') === '#' + entry.target.id,
            );
          });
        });
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    navLinks.forEach(function (link) {
      var id = link.getAttribute('href').slice(1);
      var section = document.getElementById(id);
      if (section) sectionObserver.observe(section);
    });
  }

  /* A number counting up to its real value, not a fabricated one — it still
     has to land on exactly what the stat tile says. */
  function animateCount(el) {
    var to = Number(el.getAttribute('data-count-to'));
    if (!isFinite(to)) return;
    if (prefersReducedMotion) {
      el.textContent = to.toLocaleString('en-IN');
      return;
    }
    var duration = 900;
    var start = null;
    function step(timestamp) {
      if (start === null) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * to).toLocaleString('en-IN');
      if (progress < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  /* Scroll reveal for elements with .reveal, counting up any stat inside
     the moment it reveals. */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            var counter = entry.target.querySelector('[data-count-to]');
            if (counter) animateCount(counter);
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    revealEls.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add('is-visible');
      var counter = el.querySelector('[data-count-to]');
      if (counter) animateCount(counter);
    });
  }

  /* Seat map demo */
  var ROW_SIZE = 8;
  var SOLD_OUT_SEATS = { 'standard-2': [2, 5] };

  var rowLetters = { executive: 'A', 'standard-1': 'B', 'standard-2': 'C' };

  document.querySelectorAll('.seat-row').forEach(function (rowEl) {
    var rowKey = rowEl.getAttribute('data-row');
    var letter = rowLetters[rowKey] || '?';
    var soldOut = SOLD_OUT_SEATS[rowKey] || [];
    var tier = rowKey === 'executive' ? 'Executive' : 'Standard';
    var price = rowKey === 'executive' ? '₹320' : '₹220';

    for (var i = 0; i < ROW_SIZE; i++) {
      var seatNumber = i + 1;
      var isSoldOut = soldOut.indexOf(seatNumber) !== -1;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seat';
      btn.setAttribute('aria-pressed', 'false');

      if (isSoldOut) {
        btn.disabled = true;
        btn.setAttribute('aria-label', 'Seat ' + letter + seatNumber + ', ' + tier + ', sold out');
      } else {
        btn.setAttribute(
          'aria-label',
          'Seat ' + letter + seatNumber + ', ' + tier + ', ' + price + ', available',
        );
        btn.addEventListener('click', function (event) {
          toggleSeat(event.currentTarget);
        });
      }

      rowEl.appendChild(btn);
    }
  });

  var holdTimerEl = document.getElementById('holdTimer');
  var holdInterval = null;
  var holdSecondsLeft = 0;
  var selectedSeat = null;

  function toggleSeat(seatEl) {
    var alreadySelected = seatEl.getAttribute('aria-pressed') === 'true';

    if (selectedSeat && selectedSeat !== seatEl) {
      selectedSeat.setAttribute('aria-pressed', 'false');
    }

    if (alreadySelected) {
      seatEl.setAttribute('aria-pressed', 'false');
      selectedSeat = null;
      stopHold();
      return;
    }

    seatEl.setAttribute('aria-pressed', 'true');
    selectedSeat = seatEl;
    startHold();
  }

  function startHold() {
    stopHold();
    holdSecondsLeft = 5 * 60;
    updateHoldDisplay();
    holdInterval = window.setInterval(function () {
      holdSecondsLeft -= 1;
      if (holdSecondsLeft <= 0) {
        stopHold();
        if (selectedSeat) {
          selectedSeat.setAttribute('aria-pressed', 'false');
          selectedSeat = null;
        }
        holdTimerEl.textContent = 'Hold expired. Pick a seat to try again.';
        holdTimerEl.classList.remove('is-active', 'is-urgent');
        return;
      }
      updateHoldDisplay();
    }, 1000);
  }

  function stopHold() {
    if (holdInterval) {
      window.clearInterval(holdInterval);
      holdInterval = null;
    }
    if (!selectedSeat) {
      holdTimerEl.textContent = 'Pick a seat to start a hold.';
      holdTimerEl.classList.remove('is-active', 'is-urgent');
    }
  }

  function updateHoldDisplay() {
    var minutes = Math.floor(holdSecondsLeft / 60);
    var seconds = holdSecondsLeft % 60;
    var display = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    holdTimerEl.textContent = 'Hold expires in ' + display;
    holdTimerEl.classList.add('is-active');
    holdTimerEl.classList.toggle('is-urgent', holdSecondsLeft <= 30);
  }
})();
