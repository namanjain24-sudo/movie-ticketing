/**
 * The live-events half of the catalogue: matches, concerts, comedy,
 * workshops and theatre.
 *
 * ## What is real here and what is not
 *
 * The venues are real places. Their stands are the names those places
 * actually use — the Sachin Tendulkar Stand and the Garware Pavilion are what
 * is written on a Wankhede ticket, not labels invented to sound plausible.
 * Capacities and coordinates are the real ones. The teams, the tournaments and
 * the comedians are real too.
 *
 * The *fixtures* are not. There is no claim here that a particular match or
 * gig is scheduled on a particular date — those are generated relative to
 * today so the demo always has something bookable, exactly as the film
 * showtimes are. This is the same bargain the film catalogue already makes:
 * real films at real cinemas, on a schedule that belongs to the demo.
 *
 * Nothing in this file should be read as announcing an event. If this were a
 * real product the fixtures would come from a rights holder's feed.
 *
 * ## Why stands are price bands rather than separate screens
 *
 * A match is one occurrence that happens to be sold in several price bands.
 * Modelling each stand as its own screen would make one match look like seven
 * different shows and would break the "one thing you are buying a seat at"
 * idea the whole booking mechanic rests on. So the bowl is one `Screen`, each
 * band is a `SeatTier`, and `ShowtimeTierPrice.label` carries the name the
 * venue actually uses. The seat map already groups by tier and prints the
 * band's price above it, so a stadium map reads as the stands do.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EventKind, PrismaClient, SeatTier, VenueKind } from '@prisma/client';

/**
 * Images, resolved from the real Wikipedia article for each subject and
 * cached by `fetch:event-images`.
 *
 * Not written out by hand. The first version of this file had poster URLs
 * typed from memory and four of five were 404s — a guessed URL is not a
 * shortcut to real data, it is a broken image that looks like real data in
 * the diff. Re-run the script to refresh them.
 */
interface EventImage {
  imageUrl: string;
  article: string;
  source: 'wikipedia' | 'placeholder';
}

const IMAGES: Record<string, EventImage> = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'event-images.json'), 'utf8'),
) as Record<string, EventImage>;

/**
 * The cached image for a slug, or an empty string.
 *
 * Empty rather than a placeholder service: `Poster` draws initials on a
 * tinted card when it has no URL, which always works, whereas the
 * placeholder host this used to point at does not resolve on every network
 * and was the only entry in the catalogue that actually failed to load.
 */
export function imageFor(slug: string): string {
  return IMAGES[slug]?.imageUrl ?? '';
}

export interface StandSpec {
  /** The price band this stand is sold in. */
  tier: SeatTier;
  /** What the venue calls it. Printed on the seat map and the ticket. */
  label: string;
  /** Rows in this stand, and seats in the widest row. */
  rows: number;
  seatsPerRow: number;
  /** Row labels are prefixed so a ticket reads "ST-C 14", not just "C 14". */
  rowPrefix: string;
  /**
   * Where this stand sits around the bowl, in degrees clockwise from the
   * sight screen end, so the map can draw it on the side it is actually on.
   *
   * Evenly spaced rather than surveyed: these are the real stands at these
   * grounds in their real order around the ring, but the exact arc each one
   * subtends is not claimed. Omitted entirely for a venue that is not a bowl
   * — an arena's blocks stack back from a stage rather than ringing a pitch,
   * and a bearing there would be a shape the building does not have.
   */
  bearing?: number;
}

/**
 * Every stand at a venue is its own price band.
 *
 * `ShowtimeTierPrice` is unique per `(showtime, tier)`, which is right — a
 * band has one price — but it means two stands cannot share a tier or one
 * would have to go unnamed. So the tiers act as band identifiers and the
 * labels carry the real names; nobody ever sees the word `STANDARD` on a
 * stadium ticket. `assertDistinctBands` below makes that a check rather than
 * something to remember.
 */
export interface VenueSpec {
  slug: string;
  kind: VenueKind;
  name: string;
  /** The operator or owner, the same field a cinema uses for its chain. */
  brand: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  amenities: string[];
  /** The seating bowl, as the venue divides it. */
  stands: StandSpec[];
}

/**
 * Real venues, real stands.
 *
 * The seating numbers are deliberately a fraction of each ground's true
 * capacity: Wankhede holds about 33,000 and Narendra Modi about 132,000, and
 * materialising a hundred thousand `ShowSeat` rows per fixture would make the
 * seed take minutes and the seat map unusable without telling anyone anything
 * new. The *shape* — which stands exist, how they are priced relative to each
 * other, what they are called — is accurate, which is the part a person reads.
 */
export const VENUES: VenueSpec[] = [
  {
    slug: 'wankhede-stadium-mumbai',
    kind: 'STADIUM',
    name: 'Wankhede Stadium',
    brand: 'Mumbai Cricket Association',
    city: 'Mumbai',
    address: 'Vinoo Mankad Road, Churchgate, Mumbai 400020',
    latitude: 18.9389,
    longitude: 72.8258,
    phone: '+91 22 2279 5500',
    amenities: ['Floodlights', 'Covered stands', 'Food courts', 'Churchgate station nearby'],
    stands: [
      // The pavilions sit square of the wicket and are the members' ends.
      { tier: 'VIP', label: 'Garware Pavilion', rows: 6, seatsPerRow: 18, rowPrefix: 'GP', bearing: 0 },
      { tier: 'GOLD', label: 'MCA Pavilion', rows: 6, seatsPerRow: 20, rowPrefix: 'MCA', bearing: 60 },
      // Sachin Tendulkar and Sunil Gavaskar stands run along the sides.
      {
        tier: 'PREMIUM',
        label: 'Sachin Tendulkar Stand',
        rows: 8,
        seatsPerRow: 22,
        rowPrefix: 'ST', bearing: 120 },
      { tier: 'SILVER', label: 'Sunil Gavaskar Stand', rows: 8, seatsPerRow: 22, rowPrefix: 'SG', bearing: 180 },
      {
        tier: 'STANDARD',
        label: 'Vijay Merchant Stand',
        rows: 7,
        seatsPerRow: 20,
        rowPrefix: 'VM', bearing: 240 },
      // The North Stand is the cheap end and the loud one.
      { tier: 'GENERAL', label: 'North Stand', rows: 10, seatsPerRow: 24, rowPrefix: 'NS', bearing: 300 },
    ],
  },
  {
    slug: 'm-chinnaswamy-stadium-bengaluru',
    kind: 'STADIUM',
    name: 'M. Chinnaswamy Stadium',
    brand: 'Karnataka State Cricket Association',
    city: 'Bengaluru',
    address: 'Cubbon Road, Shivaji Nagar, Bengaluru 560001',
    latitude: 12.9788,
    longitude: 77.5996,
    phone: '+91 80 2286 1333',
    amenities: ['Floodlights', 'Solar roof', 'Metro at Cubbon Park', 'Rain drainage system'],
    stands: [
      { tier: 'VIP', label: "President's Box", rows: 4, seatsPerRow: 14, rowPrefix: 'PB' },
      { tier: 'GOLD', label: 'Grand Stand', rows: 8, seatsPerRow: 22, rowPrefix: 'GS', bearing: 0 },
      { tier: 'SILVER', label: 'Pavilion Terrace', rows: 8, seatsPerRow: 22, rowPrefix: 'PT', bearing: 120 },
      { tier: 'GENERAL', label: 'P3 Terrace', rows: 10, seatsPerRow: 24, rowPrefix: 'P3', bearing: 240 },
    ],
  },
  {
    slug: 'eden-gardens-kolkata',
    kind: 'STADIUM',
    name: 'Eden Gardens',
    brand: 'Cricket Association of Bengal',
    city: 'Kolkata',
    address: 'Maidan, B.B.D. Bagh, Kolkata 700021',
    latitude: 22.5646,
    longitude: 88.3433,
    phone: '+91 33 2248 1430',
    amenities: ['Floodlights', 'Club House', 'Maidan metro nearby', 'Covered tiers'],
    stands: [
      { tier: 'VIP', label: 'B. C. Roy Club House', rows: 5, seatsPerRow: 16, rowPrefix: 'CH', bearing: 0 },
      { tier: 'GOLD', label: 'Block B', rows: 8, seatsPerRow: 22, rowPrefix: 'B', bearing: 90 },
      { tier: 'SILVER', label: 'Block H', rows: 9, seatsPerRow: 24, rowPrefix: 'H', bearing: 180 },
      { tier: 'GENERAL', label: 'Block L', rows: 11, seatsPerRow: 26, rowPrefix: 'L', bearing: 270 },
    ],
  },
  {
    slug: 'ma-chidambaram-stadium-chennai',
    kind: 'STADIUM',
    name: 'M. A. Chidambaram Stadium',
    brand: 'Tamil Nadu Cricket Association',
    city: 'Chennai',
    address: 'Victoria Hostel Road, Chepauk, Chennai 600005',
    latitude: 13.0627,
    longitude: 80.2792,
    phone: '+91 44 2844 4300',
    amenities: ['Floodlights', 'Cantilever roof', 'Chepauk metro nearby', 'Covered stands'],
    stands: [
      { tier: 'VIP', label: 'Pavilion Terrace', rows: 5, seatsPerRow: 16, rowPrefix: 'PV', bearing: 0 },
      { tier: 'GOLD', label: 'I Stand', rows: 8, seatsPerRow: 22, rowPrefix: 'I', bearing: 90 },
      { tier: 'SILVER', label: 'J Stand', rows: 8, seatsPerRow: 22, rowPrefix: 'J', bearing: 180 },
      { tier: 'GENERAL', label: 'K Stand', rows: 10, seatsPerRow: 24, rowPrefix: 'K', bearing: 270 },
    ],
  },
  {
    slug: 'dy-patil-stadium-navi-mumbai',
    kind: 'STADIUM',
    name: 'DY Patil Stadium',
    brand: 'D. Y. Patil Group',
    city: 'Navi Mumbai',
    address: 'Sector 7, Nerul, Navi Mumbai 400706',
    latitude: 19.0418,
    longitude: 73.0276,
    phone: '+91 22 3920 0000',
    amenities: ['Floodlights', 'Concert stage rigging', 'Nerul station nearby', 'Parking'],
    // Divided for a concert rather than for cricket: the pit is at the stage.
    stands: [
      { tier: 'VIP', label: 'Fan Pit', rows: 5, seatsPerRow: 20, rowPrefix: 'PIT', bearing: 0 },
      { tier: 'GOLD', label: 'Gold Stand', rows: 8, seatsPerRow: 24, rowPrefix: 'GD', bearing: 72 },
      { tier: 'PREMIUM', label: 'Premium Lounge', rows: 5, seatsPerRow: 16, rowPrefix: 'PL', bearing: 144 },
      { tier: 'SILVER', label: 'Silver Tier', rows: 9, seatsPerRow: 24, rowPrefix: 'SV', bearing: 216 },
      { tier: 'GENERAL', label: 'General Stand', rows: 11, seatsPerRow: 26, rowPrefix: 'GN', bearing: 288 },
    ],
  },
  {
    slug: 'jawaharlal-nehru-stadium-delhi',
    kind: 'STADIUM',
    name: 'Jawaharlal Nehru Stadium',
    brand: 'Sports Authority of India',
    city: 'New Delhi',
    address: 'Pragati Vihar, Lodhi Road, New Delhi 110003',
    latitude: 28.5829,
    longitude: 77.2336,
    phone: '+91 11 2436 8482',
    amenities: ['Floodlights', 'Athletics track', 'JLN Stadium metro', 'Covered seating'],
    stands: [
      { tier: 'VIP', label: 'Front of Stage', rows: 5, seatsPerRow: 20, rowPrefix: 'FOS', bearing: 0 },
      { tier: 'GOLD', label: 'Gold Block', rows: 8, seatsPerRow: 22, rowPrefix: 'GB', bearing: 90 },
      { tier: 'SILVER', label: 'Silver Block', rows: 9, seatsPerRow: 24, rowPrefix: 'SB', bearing: 180 },
      { tier: 'GENERAL', label: 'General Block', rows: 10, seatsPerRow: 26, rowPrefix: 'GEN', bearing: 270 },
    ],
  },
  {
    slug: 'nesco-center-mumbai',
    kind: 'ARENA',
    name: 'NESCO Center',
    brand: 'NESCO',
    city: 'Mumbai',
    address: 'Western Express Highway, Goregaon East, Mumbai 400063',
    latitude: 19.1545,
    longitude: 72.8545,
    phone: '+91 22 6678 1000',
    amenities: ['Indoor hall', 'Air conditioned', 'Goregaon station nearby', 'Parking'],
    stands: [
      { tier: 'VIP', label: 'Front Rows', rows: 5, seatsPerRow: 16, rowPrefix: 'FR' },
      { tier: 'GOLD', label: 'Middle Block', rows: 7, seatsPerRow: 18, rowPrefix: 'MB' },
      { tier: 'SILVER', label: 'Rear Block', rows: 8, seatsPerRow: 20, rowPrefix: 'RB' },
    ],
  },
  {
    slug: 'prithvi-theatre-mumbai',
    kind: 'THEATRE',
    name: 'Prithvi Theatre',
    brand: 'Prithvi Theatre',
    city: 'Mumbai',
    address: '20 Janki Kutir, Juhu Church Road, Mumbai 400049',
    latitude: 19.1075,
    longitude: 72.8263,
    phone: '+91 22 2614 9546',
    amenities: ['Intimate thrust stage', 'Prithvi Cafe', 'Air conditioned'],
    stands: [
      { tier: 'PREMIUM', label: 'Stalls', rows: 7, seatsPerRow: 14, rowPrefix: 'A' },
      { tier: 'STANDARD', label: 'Rear Stalls', rows: 6, seatsPerRow: 14, rowPrefix: 'R' },
    ],
  },
  {
    slug: 'the-habitat-mumbai',
    kind: 'STUDIO',
    name: 'The Habitat',
    brand: 'The Habitat',
    city: 'Mumbai',
    address: 'Hotel Unicontinental, Khar West, Mumbai 400052',
    latitude: 19.0707,
    longitude: 72.8339,
    phone: null,
    amenities: ['Intimate room', 'Bar', 'Khar station nearby'],
    stands: [
      { tier: 'PREMIUM', label: 'Front Section', rows: 5, seatsPerRow: 10, rowPrefix: 'F' },
      { tier: 'STANDARD', label: 'Back Section', rows: 5, seatsPerRow: 12, rowPrefix: 'B' },
    ],
  },
  {
    slug: '91springboard-bengaluru',
    kind: 'STUDIO',
    name: '91springboard Koramangala',
    brand: '91springboard',
    city: 'Bengaluru',
    address: '27th Main Road, HSR Layout, Bengaluru 560102',
    latitude: 12.9121,
    longitude: 77.6446,
    phone: null,
    amenities: ['Projector', 'Wi-Fi', 'Whiteboards', 'Tea and coffee'],
    stands: [
      { tier: 'STANDARD', label: 'Workshop Floor', rows: 5, seatsPerRow: 8, rowPrefix: 'W' },
    ],
  },
];

export interface EventSpec {
  slug: string;
  kind: EventKind;
  title: string;
  tagline: string | null;
  description: string;
  posterUrl: string;
  backdropUrl: string | null;
  durationMins: number;
  performers: string[];
  organiser: string | null;
  highlights: string[];
  tags: string[];
  minAge: number | null;
  /** Venue slugs this event plays, in order. */
  venueSlugs: string[];
  /** Price per band, in paise, for this event at these venues. */
  prices: Partial<Record<SeatTier, number>>;
  /** Hour of day the show starts, venue local. */
  startHour: number;
  startMinute?: number;
}

/**
 * The line-ups are real people and real teams. The scheduling is the demo's.
 */
export const EVENTS: EventSpec[] = [
  {
    slug: 'mumbai-indians-vs-chennai-super-kings',
    kind: 'SPORT',
    title: 'Mumbai Indians vs Chennai Super Kings',
    tagline: 'The one everybody books first',
    description:
      'Two of the most decorated sides in Indian franchise cricket, and the fixture that fills a ground faster than any other. Gates open two hours before the first ball; the North Stand is standing room in all but name by then.',
    posterUrl: '',
    backdropUrl: null,
    durationMins: 210,
    performers: ['Mumbai Indians', 'Chennai Super Kings'],
    organiser: 'Indian Premier League',
    highlights: [
      'Gates open two hours before the first ball',
      'Stand name and gate are printed on your ticket',
      'No outside food or drink; water is available inside',
      'Bags larger than a small daypack are not admitted',
    ],
    tags: ['Cricket', 'T20', 'Rivalry'],
    minAge: null,
    venueSlugs: ['wankhede-stadium-mumbai'],
    // The full Wankhede ladder, top to bottom: Garware, MCA, Sachin
    // Tendulkar, Sunil Gavaskar, Vijay Merchant, North Stand.
    prices: {
      VIP: 850_000,
      GOLD: 450_000,
      PREMIUM: 350_000,
      SILVER: 280_000,
      STANDARD: 200_000,
      GENERAL: 120_000,
    },
    startHour: 19,
    startMinute: 30,
  },
  {
    slug: 'royal-challengers-bengaluru-vs-kolkata-knight-riders',
    kind: 'SPORT',
    title: 'Royal Challengers Bengaluru vs Kolkata Knight Riders',
    tagline: 'Chinnaswamy under lights',
    description:
      'A short boundary, a quick outfield and two batting line-ups with no interest in a low score. The Chinnaswamy has the best sightlines of any ground in the country from the Grand Stand.',
    posterUrl: '',
    backdropUrl: null,
    durationMins: 210,
    performers: ['Royal Challengers Bengaluru', 'Kolkata Knight Riders'],
    organiser: 'Indian Premier League',
    highlights: [
      'Cubbon Park metro is a five minute walk to Gate 11',
      'Stand name and gate are printed on your ticket',
      'Umbrellas are not permitted inside the ground',
    ],
    tags: ['Cricket', 'T20'],
    minAge: null,
    venueSlugs: ['m-chinnaswamy-stadium-bengaluru'],
    prices: { VIP: 700_000, GOLD: 380_000, SILVER: 240_000, GENERAL: 100_000 },
    startHour: 19,
    startMinute: 30,
  },
  {
    slug: 'india-vs-australia-test-match',
    kind: 'SPORT',
    title: 'India vs Australia — Test Match, Day 1',
    tagline: 'Five days, one ground, no clock',
    description:
      'The oldest format at the oldest big ground in the country. Day one tickets, first ball at half past nine, with the Club House end taking the morning shade.',
    posterUrl: '',
    backdropUrl: null,
    durationMins: 420,
    performers: ['India', 'Australia'],
    organiser: 'Board of Control for Cricket in India',
    highlights: [
      'First ball at 9.30am; gates open at 8am',
      'A day ticket covers all three sessions',
      'Club House end is shaded in the morning',
    ],
    tags: ['Cricket', 'Test', 'International'],
    minAge: null,
    venueSlugs: ['eden-gardens-kolkata'],
    prices: { VIP: 600_000, GOLD: 300_000, SILVER: 150_000, GENERAL: 60_000 },
    startHour: 9,
    startMinute: 30,
  },
  {
    slug: 'chennai-super-kings-vs-rajasthan-royals',
    kind: 'SPORT',
    title: 'Chennai Super Kings vs Rajasthan Royals',
    tagline: 'Chepauk, full house',
    description:
      'Chepauk in yellow, which is most of the point. The I and J stands take the best of the evening breeze off the Bay.',
    posterUrl: '',
    backdropUrl: null,
    durationMins: 210,
    performers: ['Chennai Super Kings', 'Rajasthan Royals'],
    organiser: 'Indian Premier League',
    highlights: [
      'Gates open two hours before the first ball',
      'Chepauk metro is a short walk from the I Stand gate',
      'No outside food or drink',
    ],
    tags: ['Cricket', 'T20'],
    minAge: null,
    venueSlugs: ['ma-chidambaram-stadium-chennai'],
    prices: { VIP: 650_000, GOLD: 350_000, SILVER: 200_000, GENERAL: 90_000 },
    startHour: 19,
    startMinute: 30,
  },
  {
    slug: 'arijit-singh-live',
    kind: 'CONCERT',
    title: 'Arijit Singh Live',
    tagline: 'One voice, one stage, no support act',
    description:
      'Close to three hours with the playback voice of a generation, a full live band and none of the production tricks. The Fan Pit is standing, directly at the stage; everything behind it is seated.',
    posterUrl: '',
    backdropUrl: null,
    durationMins: 180,
    performers: ['Arijit Singh'],
    organiser: 'India Tour',
    highlights: [
      'Fan Pit is standing; Gold, Silver and General are seated',
      'Doors open two hours before the set',
      'No professional cameras or recording equipment',
      'Under 16s must be with an adult',
    ],
    tags: ['Playback', 'Hindi', 'Live band'],
    minAge: null,
    venueSlugs: ['dy-patil-stadium-navi-mumbai', 'jawaharlal-nehru-stadium-delhi'],
    prices: {
      VIP: 1_200_000,
      PREMIUM: 850_000,
      GOLD: 650_000,
      SILVER: 350_000,
      GENERAL: 180_000,
    },
    startHour: 19,
  },
  {
    slug: 'divine-gully-gang-live',
    kind: 'CONCERT',
    title: 'DIVINE — Gully Gang Live',
    tagline: 'Mumbai hip-hop, at home',
    description:
      'The rapper who took Mumbai street rap to a national stage, playing the city he writes about. Loud, fast, and over in ninety minutes.',
    posterUrl: '',
    backdropUrl: null,
    durationMins: 120,
    performers: ['DIVINE'],
    organiser: 'Gully Gang',
    highlights: [
      'Fan Pit is standing room at the stage',
      'Doors open ninety minutes before',
      'Over 16s only',
    ],
    tags: ['Hip-hop', 'Desi', 'Standing'],
    minAge: 16,
    venueSlugs: ['nesco-center-mumbai'],
    prices: { VIP: 500_000, GOLD: 300_000, SILVER: 180_000 },
    startHour: 20,
  },
  {
    slug: 'zakir-khan-live',
    kind: 'COMEDY',
    title: 'Zakir Khan — Live',
    tagline: 'Sakht launda, live and unedited',
    description:
      'An hour and a half of the storytelling that made him the biggest draw in Hindi stand-up. New material, no interval, phones in pouches at the door.',
    posterUrl: '',
    backdropUrl: null,
    durationMins: 90,
    performers: ['Zakir Khan'],
    organiser: 'Live Nation India',
    highlights: [
      'Phones are pouched at the door and returned after',
      'Performed in Hindi',
      'Latecomers are seated at a break in the set',
      'Over 16s only',
    ],
    tags: ['Stand-up', 'Hindi', 'Storytelling'],
    minAge: 16,
    venueSlugs: ['the-habitat-mumbai', 'nesco-center-mumbai'],
    prices: { VIP: 350_000, PREMIUM: 250_000, GOLD: 250_000, SILVER: 150_000, STANDARD: 150_000 },
    startHour: 20,
    startMinute: 30,
  },
  {
    slug: 'kanan-gill-new-hour',
    kind: 'COMEDY',
    title: 'Kanan Gill — New Hour',
    tagline: 'Work in progress, mostly working',
    description:
      'A new hour being built in front of an audience, which is the only way an hour ever gets built. English, with the occasional tangent that does not come back.',
    posterUrl: '',
    backdropUrl: null,
    durationMins: 75,
    performers: ['Kanan Gill'],
    organiser: 'The Habitat',
    highlights: ['Performed in English', 'New and unreleased material', 'Over 16s only'],
    tags: ['Stand-up', 'English', 'New material'],
    minAge: 16,
    venueSlugs: ['the-habitat-mumbai'],
    prices: { PREMIUM: 180_000, STANDARD: 120_000 },
    startHour: 21,
  },
  {
    slug: 'system-design-interview-workshop',
    kind: 'WORKSHOP',
    title: 'System Design for Interviews — Full Day',
    tagline: 'Whiteboard, not slides',
    description:
      'A full day building three systems end to end on a whiteboard: a URL shortener, a news feed, and a ticket booking system with seat locking. You design, the room argues, and the trade-offs get written down.',
    posterUrl: '',
    backdropUrl: null,
    durationMins: 480,
    performers: ['Working engineers from product companies'],
    organiser: '91springboard',
    highlights: [
      'Design a URL shortener, a news feed and a seat booking system',
      'Capacity estimation and back-of-envelope maths',
      'Where row locks beat optimistic concurrency, and where they do not',
      'Lunch and coffee included',
      'Bring a laptop; everything else is provided',
    ],
    tags: ['Engineering', 'Interview prep', 'Beginner friendly'],
    minAge: null,
    venueSlugs: ['91springboard-bengaluru'],
    prices: { STANDARD: 450_000 },
    startHour: 10,
  },
  {
    slug: 'hindustani-classical-workshop',
    kind: 'WORKSHOP',
    title: 'Hindustani Classical — An Introduction',
    tagline: 'For people who have never sung in front of anyone',
    description:
      'Three hours on what a raag actually is, how a taal is counted, and why the same note sounds different depending on what came before it. No instrument and no training needed.',
    posterUrl: '',
    backdropUrl: null,
    durationMins: 180,
    performers: ['Practising Hindustani vocalists'],
    organiser: 'Prithvi Theatre',
    highlights: [
      'What a raag is, and what it is not',
      'Counting teentaal without losing your place',
      'No instrument or prior training needed',
      'Tanpura provided',
    ],
    tags: ['Music', 'Beginner friendly', 'Hands on'],
    minAge: null,
    venueSlugs: ['prithvi-theatre-mumbai'],
    prices: { PREMIUM: 200_000, STANDARD: 140_000 },
    startHour: 11,
  },
  {
    slug: 'tughlaq-prithvi',
    kind: 'THEATRE',
    title: 'Tughlaq',
    tagline: "Girish Karnad's study of an idealist in power",
    description:
      "Karnad's 1964 play about Muhammad bin Tughlaq — a ruler whose best ideas destroyed the most. Two acts, one interval, performed on Prithvi's thrust stage with the audience on three sides.",
    posterUrl: '',
    backdropUrl: null,
    durationMins: 150,
    performers: ['Repertory cast'],
    organiser: 'Prithvi Theatre',
    highlights: [
      'Performed in Hindi',
      'Two acts with one interval',
      'Latecomers are seated at the interval',
      'Thrust stage: the audience is on three sides',
    ],
    tags: ['Drama', 'Hindi', 'Classic'],
    minAge: null,
    venueSlugs: ['prithvi-theatre-mumbai'],
    prices: { PREMIUM: 90_000, STANDARD: 60_000 },
    startHour: 18,
  },
];

/**
 * Fails loudly if a venue gives two stands the same band, which the database
 * would otherwise reject halfway through a seed with a unique violation and
 * no indication of which venue was wrong.
 */
export function assertDistinctBands(venues: VenueSpec[]): void {
  for (const venue of venues) {
    const tiers = venue.stands.map((s) => s.tier);
    const duplicate = tiers.find((t, i) => tiers.indexOf(t) !== i);
    if (duplicate) {
      throw new Error(
        `${venue.name}: two stands are both in the ${duplicate} band. Each stand needs its own, ` +
          'because a band carries one price and one label.',
      );
    }
    const prefixes = venue.stands.map((s) => s.rowPrefix);
    const dupePrefix = prefixes.find((p, i) => prefixes.indexOf(p) !== i);
    if (dupePrefix) {
      throw new Error(`${venue.name}: two stands share the row prefix ${dupePrefix}.`);
    }
  }
}

/** Row label for a stand seat: "ST-C" rather than a bare "C". */
export function standRowLabel(prefix: string, rowIndex: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const letter = alphabet[rowIndex % alphabet.length] ?? 'Z';
  return `${prefix}-${letter}`;
}

/**
 * Builds a venue, its bowl, and the seats in every stand.
 *
 * The whole bowl is one `Screen` so that a match is one occurrence rather than
 * seven. Stands are laid out one below the next in the same grid, which is how
 * the seat map already renders tier sections.
 */
export async function createVenue(prisma: PrismaClient, spec: VenueSpec): Promise<string> {
  const widest = Math.max(...spec.stands.map((s) => s.seatsPerRow));
  const totalRows = spec.stands.reduce((sum, s) => sum + s.rows, 0);

  const venue = await prisma.cinema.create({
    data: {
      slug: spec.slug,
      kind: spec.kind,
      name: spec.name,
      brand: spec.brand,
      city: spec.city,
      address: spec.address,
      latitude: spec.latitude,
      longitude: spec.longitude,
      phone: spec.phone,
      amenities: spec.amenities,
      screens: {
        create: {
          // The bowl, not a screen. The model's name is a cinema's; see the
          // note on `VenueKind` in the schema.
          name: spec.name,
          rowCount: totalRows,
          columnCount: widest,
        },
      },
    },
    select: { screens: { select: { id: true } } },
  });

  const screenId = venue.screens[0]!.id;

  const seats: {
    screenId: string;
    rowLabel: string;
    number: number;
    rowIndex: number;
    columnIndex: number;
    tier: SeatTier;
    isAccessible: boolean;
  }[] = [];

  let rowIndex = 0;
  for (const stand of spec.stands) {
    for (let r = 0; r < stand.rows; r += 1) {
      const rowLabel = standRowLabel(stand.rowPrefix, r);
      // Centred in the bowl's widest row, so narrower stands sit under the
      // middle of wider ones rather than hugging the left edge.
      const leftPad = Math.floor((widest - stand.seatsPerRow) / 2);
      for (let c = 0; c < stand.seatsPerRow; c += 1) {
        seats.push({
          screenId,
          rowLabel,
          number: c + 1,
          rowIndex,
          columnIndex: leftPad + c,
          tier: stand.tier,
          // The first two seats of each stand's back row, which is where a
          // real ground puts its accessible places: level with the concourse.
          isAccessible: r === stand.rows - 1 && c < 2,
        });
      }
      rowIndex += 1;
    }
  }

  await prisma.seat.createMany({ data: seats });
  return screenId;
}

/**
 * One occurrence of an event at one venue.
 *
 * Identical in shape to a film's showtime because it *is* one: same table,
 * same seat inventory, same holds, same payment. The only difference is which
 * of the two subject columns is set, and that each price band carries the
 * stand's real name.
 */
export async function createEventShow(
  prisma: PrismaClient,
  input: {
    eventId: string;
    screenId: string;
    venue: VenueSpec;
    prices: Partial<Record<SeatTier, number>>;
    dayOffset: number;
    hour: number;
    minute: number;
    durationMins: number;
  },
): Promise<number> {
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + input.dayOffset);
  startsAt.setHours(input.hour, input.minute, 0, 0);

  const endsAt = new Date(startsAt.getTime() + (input.durationMins + 20) * 60_000);
  // A gate closes when the thing starts, unlike a cinema that lets you in
  // late. Ten minutes of grace, the same as a film, so a late tap still works.
  const salesCloseAt = new Date(startsAt.getTime() + 10 * 60_000);

  // Only the bands this venue actually has, priced for this event.
  const bands = input.venue.stands
    .map((stand) => ({ stand, priceMinor: input.prices[stand.tier] }))
    .filter((b): b is { stand: StandSpec; priceMinor: number } => b.priceMinor !== undefined);

  if (bands.length === 0) {
    throw new Error(
      `No price given for any stand at ${input.venue.name}. ` +
        `It has ${input.venue.stands.map((s) => s.tier).join(', ')}.`,
    );
  }

  const show = await prisma.showtime.create({
    data: {
      eventId: input.eventId,
      screenId: input.screenId,
      startsAt,
      endsAt,
      salesCloseAt,
      // A match is not in 2D or 3D. The column is a film's and has a default;
      // the app reads the event's kind instead and never shows this for one.
      language: 'Live',
      tierPrices: {
        create: bands.map(({ stand, priceMinor }) => ({
          tier: stand.tier,
          priceMinor,
          label: stand.label,
          bearing: stand.bearing ?? null,
        })),
      },
    },
    select: { id: true },
  });

  // Only seats in a band this event priced go on sale. A stand with no price
  // is a stand that is not open for this fixture, which is ordinary.
  const openTiers = new Set(bands.map((b) => b.stand.tier));
  const seats = await prisma.seat.findMany({
    where: { screenId: input.screenId },
    select: { id: true, tier: true },
  });
  const onSale = seats.filter((s) => openTiers.has(s.tier));

  const priceFor = new Map(bands.map((b) => [b.stand.tier, b.priceMinor]));
  await prisma.showSeat.createMany({
    data: onSale.map((seat) => ({
      showtimeId: show.id,
      seatId: seat.id,
      priceMinor: priceFor.get(seat.tier)!,
    })),
  });

  return onSale.length;
}

/**
 * Seeds every venue and event, and gives each event a run of occurrences.
 *
 * Safe to run against a database that already has films: it only ever
 * creates, never deletes, and the venues it adds have their own slugs.
 */
export async function seedEvents(
  prisma: PrismaClient,
  options: { days?: number } = {},
): Promise<{ venues: number; events: number; shows: number; seats: number }> {
  assertDistinctBands(VENUES);

  const days = options.days ?? 10;
  const screenByVenue = new Map<string, string>();
  const venueBySlug = new Map(VENUES.map((v) => [v.slug, v]));

  for (const venue of VENUES) {
    screenByVenue.set(venue.slug, await createVenue(prisma, venue));
  }

  let shows = 0;
  let seats = 0;

  for (const spec of EVENTS) {
    const event = await prisma.event.create({
      data: {
        slug: spec.slug,
        kind: spec.kind,
        title: spec.title,
        tagline: spec.tagline,
        description: spec.description,
        posterUrl: imageFor(spec.slug),
        // The ground, where there is one: a match card reads better over
        // the stadium than over a team crest.
        backdropUrl: spec.backdropUrl ?? IMAGES[spec.venueSlugs[0] ?? '']?.imageUrl ?? null,
        durationMins: spec.durationMins,
        performers: spec.performers,
        organiser: spec.organiser,
        highlights: spec.highlights,
        tags: spec.tags,
        minAge: spec.minAge,
      },
      select: { id: true },
    });

    for (const [venueIndex, venueSlug] of spec.venueSlugs.entries()) {
      const venue = venueBySlug.get(venueSlug);
      const screenId = screenByVenue.get(venueSlug);
      if (!venue || !screenId) throw new Error(`${spec.slug} names unknown venue ${venueSlug}`);

      // A match or a gig is an occasion, not a daily listing: a handful of
      // dates spread across the window rather than one every evening.
      for (let n = 0; n < 3; n += 1) {
        const dayOffset = 1 + venueIndex * 2 + n * 3;
        if (dayOffset > days) continue;
        seats += await createEventShow(prisma, {
          eventId: event.id,
          screenId,
          venue,
          prices: spec.prices,
          dayOffset,
          hour: spec.startHour,
          minute: spec.startMinute ?? 0,
          durationMins: spec.durationMins,
        });
        shows += 1;
      }
    }
  }

  return { venues: VENUES.length, events: EVENTS.length, shows, seats };
}
