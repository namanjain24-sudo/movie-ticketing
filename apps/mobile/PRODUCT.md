# Product truth

**What it is.** A movie ticketing app for Indian multiplexes. Browse what is
showing, pick a showtime, choose seats on a live map, hold them, pay, and carry
a ticket to the gate.

**Who uses it.** People booking 1–4 seats on a phone, often minutes before they
leave, often on a patchy mobile connection, often while someone else is booking
the same seats.

**Mode.** Operate. The visitor is completing a task with money and a deadline
attached. Scanability, honest state, and native affordances outrank expression.
Brand lives in precise details, not in the way of the task.

**The scene.** One hand, phone held at arm's length, frequently in a dim room or
outdoors in sun. Interruptions are normal: a hold has a five-minute deadline and
the user may background the app mid-checkout.

## What must stay true

- **The seat map never lies.** Availability comes from the server. A seat lost to
  another user greys out in place; the app never guesses.
- **Time comes from the server.** Every countdown is anchored to `serverTime`,
  never the device clock.
- **Availability is a band, not a number.** The API sends `PLENTY`/`FILLING`/
  `ALMOST_FULL`/`SOLD_OUT` on purpose. Rendering "4 left" would invent precision
  that was only true one request ago.
- **No invented data.** There are no ratings, review counts, or trailers in this
  system. The app shows certification, runtime, languages, genres, formats,
  prices and availability, because those are what actually exist.

## Constraints

- React Native (Expo SDK 57), expo-router, system fonts. No native modules
  beyond what Expo Go carries.
- Both light and dark themes ship, driven by the system setting.
- Every screen must hold: loading, error, offline, empty, and the six booking
  failure states (seat taken, contended, hold expired, sales closed, payment
  declined, payment ambiguous).
