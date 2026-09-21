# Design system

A ticketing app that reads as familiar to anyone who has booked a film in India:
a dark chrome bar, a signature red call to action, poster-forward browsing, and
a seat map organised by price tier. Familiarity is the feature — this is Operate
mode, and a booking flow is the wrong place to make someone learn a new idiom.

## Colour

One accent carries every commitment: **`#F84464`**. It marks the primary action
and nothing else, so "red means this is the thing you press" stays true.

The chrome bar is dark in **both** themes. It anchors the app, keeps posters
reading against a neutral, and matches the category.

Availability has its own three-step scale, used identically on showtime chips
and the seat legend: green `#1EA043` plenty, amber `#E8A317` filling, red
`#F84464` almost full. Sold out is never coloured — it is simply recessive.

## Type

The platform face (SF on iOS, Roboto on Android). A native booking app is not
the place for a downloaded display font: system text renders at every size,
carries Dynamic Type, and is what the rest of the phone speaks.

Scale steps are obvious rather than subtle, and prices use tabular figures so
totals line up in a column.

## Seat map

Seats are grouped into **tier sections** with the price in the header, which is
how a person actually chooses: budget first, position second. The screen is drawn
as a curve at the top so orientation needs no label beyond the word.

Geometry is a fixed pitch, so a 2,080-seat auditorium reports a known row height
and scrolls without laying anything out.

## Emphasis

The accent is spent in one place per screen, and the loudest treatment —
uppercase, tracked out — is reserved for the two actions that commit money:
**Proceed to pay** and **Pay**. Everything else, including Sign in and Save,
is a primary button in sentence case. Ghost buttons are quiet by default and
only take the danger colour when the action removes something, such as
cancelling a booking. Painting every button with the accent is how the accent
stops meaning "this is the thing you press".

## Artwork

Posters come off a public CDN and, on a slow connection, arrive seconds after
the screen does. Nothing waits on a blank rectangle: a poster that has not
landed shows a card carrying the film's own initials and title, and the same
card is the permanent answer when the image fails. The image fades in over it.

A film page needs a landscape still it does not always have. When only the
poster exists it becomes an out-of-focus wash behind the sharp poster, rather
than a second copy of the same image at full size.

## Motion

One authored moment: the seat that grows and settles when selected, and the
summary bar that rises when the first seat is chosen. The seat spring lives on
the _selected_ variant only — an unselected seat is a plain View with no
animation state at all, because six hundred of them are mounted on a full house
and at most ten are ever chosen.

Everything else is instant, because a countdown is running.

Touch feedback carries the same distinction the screen does: a light tap when a
seat goes in or out, a warning when the app had to refuse, and a success note
when seats are held and when payment confirms.
