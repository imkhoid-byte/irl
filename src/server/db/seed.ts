import { id, one, run, tx, type Db } from "./index";
import { hashPassword } from "../services/auth";
import { ensureDemoInventory } from "../services/discovery";
import { hashTerms } from "../services/dates";
import { addHours, cityParts, cityTimeToUtc, addDaysYmd, now } from "@/lib/time";
import { POLICY, cancellationDeadline } from "@/lib/policy";

export const DEMO_PASSWORD = "showup-demo";
export const DEMO_USERS = {
  ava: "ava@demo.once.date",
  ben: "ben@demo.once.date",
  admin: "admin@demo.once.date",
} as const;

const NEIGHBORHOODS: [string, string, number, number][] = [
  ["greenpoint", "Greenpoint", 40.73, -73.954],
  ["williamsburg", "Williamsburg", 40.7081, -73.9571],
  ["east-village", "East Village", 40.7265, -73.9815],
  ["west-village", "West Village", 40.7358, -74.0036],
  ["lower-east-side", "Lower East Side", 40.715, -73.9843],
  ["soho", "SoHo", 40.7233, -74.003],
  ["chelsea", "Chelsea", 40.7465, -74.0014],
  ["fort-greene", "Fort Greene", 40.6892, -73.9742],
  ["park-slope", "Park Slope", 40.671, -73.9814],
  ["carroll-gardens", "Carroll Gardens", 40.6795, -73.9991],
  ["dumbo", "DUMBO", 40.7033, -73.9881],
  ["upper-west-side", "Upper West Side", 40.787, -73.9754],
  ["harlem", "Harlem", 40.8116, -73.9465],
  ["astoria", "Astoria", 40.7644, -73.9235],
];

// All venues are fictional demo venues. ONCE has no venue partnerships in demo mode.
const VENUES = [
  { key: "marginalia", name: "Marginalia Books & Coffee", type: "Bookshop café", hood: "greenpoint", address: "118 Franklin St (demo address)", access: "Step-free entrance; accessible restroom.", dietary: "Oat, almond and soy milk; gluten-free pastries." },
  { key: "ninth", name: "The Ninth Hole Club", type: "Indoor mini golf", hood: "williamsburg", address: "61 Kent Ave (demo address)", access: "Step-free; all holes reachable from a wheelchair.", dietary: "Zero-proof drinks menu." },
  { key: "eleven", name: "Table Eleven", type: "Chef's counter", hood: "west-village", address: "11 Perry St (demo address)", access: "Counter seating with two lowered places on request.", dietary: "Vegetarian menu; most allergies with 48h notice." },
  { key: "halfway", name: "Gallery Halfway", type: "Gallery with a small bar", hood: "lower-east-side", address: "94 Orchard St (demo address)", access: "Ground floor gallery; bar has one step.", dietary: "Alcoholic and zero-proof options." },
  { key: "copper", name: "The Copper Pot Studio", type: "Cooking school", hood: "chelsea", address: "230 W 19th St (demo address)", access: "Elevator access; adjustable-height stations.", dietary: "Egg-free and gluten-free pasta on request." },
  { key: "harbor", name: "Harbor Steps & Gelato", type: "Waterfront walk + gelateria", hood: "dumbo", address: "Meet at 1 Water St (demo address)", access: "Flat, paved waterfront path.", dietary: "Dairy-free sorbets available." },
  { key: "lowceiling", name: "Low Ceiling", type: "Jazz listening room", hood: "east-village", address: "27 Avenue B (demo address)", access: "Down 12 stairs; no elevator.", dietary: "Bar snacks; zero-proof cocktails." },
  { key: "clear", name: "Clear Spirit", type: "Zero-proof cocktail bar", hood: "fort-greene", address: "740 Fulton St (demo address)", access: "Step-free entrance.", dietary: "Fully alcohol-free menu." },
  { key: "clay", name: "Common Clay", type: "Ceramics studio", hood: "park-slope", address: "402 7th Ave (demo address)", access: "Ground floor; seated wheels available.", dietary: "Tea and water provided." },
  { key: "rally", name: "Rally Room", type: "Ping-pong hall", hood: "astoria", address: "31-10 Broadway (demo address)", access: "Step-free; seating along every table.", dietary: "Vegetable dumplings available." },
];

const SAT = 6, SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5;

const EXPERIENCES = [
  {
    slug: "coffee-and-a-bookstore", title: "Coffee & a bookstore", category: "coffee", venue: "marginalia", total: 2400, duration: 90, indoor: 1,
    atmosphere: "Quiet, sunlit, a little bookish.",
    description: "Meet at the counter, order whatever you like, then wander the shelves together. Each of you picks a book for the other — no pressure to buy, but the credit is there if you do.",
    includes: ["One drink each", "A $3 book credit each", "A reserved table by the window"],
    dress: "Come as you are.", arrival: "Ask for the ONCE table at the counter. Your host will seat you both.",
    hours: [{ days: [SAT, SUN], time: "11:00" }, { days: [WED], time: "18:30" }], cancel: 24,
  },
  {
    slug: "a-little-friendly-competition", title: "A little friendly competition", category: "games", venue: "ninth", total: 7000, duration: 90, indoor: 1,
    atmosphere: "Playful, a bit loud, very easy to laugh.",
    description: "Nine holes of beautifully over-designed indoor mini golf. Nothing breaks the ice like a windmill. Loser picks the next date — if there is one.",
    includes: ["Nine holes for two", "One drink each (zero-proof available)", "Scorecard and a very small trophy"],
    dress: "Comfortable shoes.", arrival: "Check in at the front desk with your first name. Clubs are provided.",
    hours: [{ days: [FRI], time: "19:00" }, { days: [SAT], time: "16:00" }], cancel: 24,
  },
  {
    slug: "dinner-without-the-small-talk", title: "Dinner without the small talk", category: "dinner", venue: "eleven", total: 12000, duration: 120, indoor: 1,
    atmosphere: "Intimate, candle-lit, unhurried.",
    description: "A chef-selected three-course menu at a twelve-seat counter. Optional question cards on the table if you'd rather skip “so, what do you do?”",
    includes: ["Three-course chef's menu", "Still and sparkling water", "Optional conversation cards", "Tax and gratuity"],
    dress: "Smart casual.", arrival: "Arrive five minutes early. The counter seats at exactly the booked time.",
    hours: [{ days: [THU, SAT], time: "19:30" }], cancel: 48,
  },
  {
    slug: "art-then-a-drink", title: "Art, then a drink", category: "art", venue: "halfway", total: 5000, duration: 105, indoor: 1,
    atmosphere: "Thoughtful, low-lit, easy silences.",
    description: "A short guided walk through the current show, then a drink at the gallery's tiny bar to argue about what you just saw.",
    includes: ["Guided walk-through (30 min)", "One drink each — alcoholic or zero-proof"],
    dress: "Anything goes.", arrival: "The gallery door is unmarked — look for the brass number. Tell the host you're with ONCE.",
    hours: [{ days: [SUN], time: "15:00" }, { days: [WED], time: "18:00" }], cancel: 24,
  },
  {
    slug: "make-pasta-then-eat-it", title: "Make pasta, then eat it", category: "cooking", venue: "copper", total: 13000, duration: 150, indoor: 1,
    atmosphere: "Hands-on, warm, flour everywhere.",
    description: "A small-group class where you'll each make fresh pasta from scratch, then sit down together to eat what you made. Teamwork is optional but encouraged.",
    includes: ["All ingredients and aprons", "Hands-on instruction", "Dinner of your own pasta with salad", "Recipe card to take home"],
    dress: "Something you don't mind getting flour on.", arrival: "Take the elevator to the 4th floor. Class starts promptly.",
    hours: [{ days: [TUE], time: "19:00" }, { days: [SUN], time: "13:00" }], cancel: 48,
  },
  {
    slug: "sunset-walk-and-gelato", title: "Sunset walk & gelato", category: "outdoors", venue: "harbor", total: 1600, duration: 75, indoor: 0,
    atmosphere: "Breezy, golden-hour, skyline views.",
    description: "Meet at the gelateria, pick a flavour each, then take the waterfront path while the light goes orange. Simple and very hard to get wrong.",
    includes: ["Two scoops each", "A suggested 2 km waterfront route"],
    dress: "Bring a layer — it's windy by the water.", arrival: "Meet inside the gelateria. In heavy rain your date moves to the indoor counter.",
    hours: [{ days: [SAT, SUN], time: "17:30" }, { days: [WED], time: "18:30" }], cancel: 12,
  },
  {
    slug: "front-row-jazz", title: "Front-row jazz, second set", category: "music", venue: "lowceiling", total: 6000, duration: 90, indoor: 1,
    atmosphere: "Dim, close, a little smoky (it isn't).",
    description: "A reserved two-top right by the stage for the late set. Talk between songs; listen during them.",
    includes: ["Reserved seats for the second set", "One drink each (zero-proof available)"],
    dress: "Evening casual.", arrival: "Doors open 20 minutes before the set. Give your first name at the door.",
    hours: [{ days: [FRI, SAT], time: "21:00" }, { days: [THU], time: "20:00" }], cancel: 24,
  },
  {
    slug: "zero-proof-tasting-flight", title: "Zero-proof tasting flight", category: "drinks", venue: "clear", total: 5600, duration: 75, indoor: 1,
    atmosphere: "Bright, curious, completely clear-headed.",
    description: "Four tasting-size cocktails with no alcohol and a lot of ideas, explained by the bartender as you go. Score them together.",
    includes: ["Four-drink tasting flight each", "Small plate to share"],
    dress: "Come as you are.", arrival: "Sit at the bar — your seats will have a ONCE card.",
    hours: [{ days: [TUE, THU], time: "19:00" }, { days: [SAT], time: "18:00" }], cancel: 24,
  },
  {
    slug: "wheel-throwing-for-two", title: "Get your hands dirty", category: "art", venue: "clay", total: 11000, duration: 120, indoor: 1,
    atmosphere: "Messy, focused, surprisingly romantic.",
    description: "An intro wheel-throwing session for two. You'll each make (or attempt) a cup; the studio fires and glazes them for pickup.",
    includes: ["Clay, tools and aprons", "Instructor-led session", "Firing and glazing of one piece each"],
    dress: "Short sleeves; clothes that can get muddy.", arrival: "Ring the studio bell. Shoes off at the door.",
    hours: [{ days: [SUN], time: "11:00" }, { days: [WED], time: "19:00" }], cancel: 48,
  },
  {
    slug: "ping-pong-and-dumplings", title: "Ping-pong & dumplings", category: "games", venue: "rally", total: 4400, duration: 90, indoor: 1,
    atmosphere: "Lively, competitive, very casual.",
    description: "An hour on a reserved table, then a plate of dumplings to recover. Skill level is irrelevant; enthusiasm is mandatory.",
    includes: ["One hour of table time", "Paddles and balls", "A plate of dumplings to share"],
    dress: "Trainers recommended.", arrival: "Check in at the bar; your table number will be waiting.",
    hours: [{ days: [MON, WED], time: "19:30" }], cancel: 12,
  },
] as const;

type SeedUser = {
  key: string; email: string; name: string; age: number; gender: "woman" | "man" | "nonbinary"; into: string[];
  hood: string; intention: string; interests: string[]; cats: string[]; bio: string; budget: number; radius: number; admin?: boolean;
};

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const USERS: SeedUser[] = [
  { key: "ava", email: DEMO_USERS.ava, name: "Ava", age: 31, gender: "woman", into: ["man"], hood: "greenpoint", intention: "long_term", interests: ["Bookshops", "Film photography", "Coffee"], cats: ["coffee", "art", "dinner", "games", "music", "outdoors"], bio: "Architect by day, terrible mini-golfer by night. I'll always pick the window seat and I'll always ask what you're reading.", budget: 7000, radius: 12 },
  { key: "ben", email: DEMO_USERS.ben, name: "Ben", age: 33, gender: "man", into: ["woman"], hood: "williamsburg", intention: "open_to_long_term", interests: ["Architecture", "Cycling", "Bookshops"], cats: ["coffee", "games", "art", "dinner", "outdoors", "drinks"], bio: "Bike mechanic turned product designer. Happiest somewhere with good light, strong coffee and a slightly competitive board game.", budget: 8000, radius: 12 },
  { key: "admin", email: DEMO_USERS.admin, name: "Sam", age: 38, gender: "nonbinary", into: [], hood: "chelsea", intention: "see_where_it_goes", interests: ["Design", "Running", "Coffee"], cats: ["coffee"], bio: "ONCE trust & safety (demo admin account). Not available for dates.", budget: 5000, radius: 5, admin: true },
  { key: "chloe", email: "chloe@demo.once.date", name: "Chloe", age: 29, gender: "woman", into: ["man"], hood: "east-village", intention: "long_term", interests: ["Jazz", "Cooking", "Travel"], cats: ["music", "cooking", "dinner", "coffee"], bio: "Pastry chef who still gets excited about a perfect croissant. Looking for someone who'll split dessert without negotiating.", budget: 7000, radius: 10 },
  { key: "maya", email: "maya@demo.once.date", name: "Maya", age: 34, gender: "woman", into: ["man", "woman"], hood: "fort-greene", intention: "open_to_long_term", interests: ["Museums", "Poetry", "Zero-proof cocktails"], cats: ["art", "drinks", "coffee", "music"], bio: "Museum educator. I will absolutely read every placard. Sober and curious — the best mocktail in the city is a hill I'll die on.", budget: 6000, radius: 10 },
  { key: "priya", email: "priya@demo.once.date", name: "Priya", age: 30, gender: "woman", into: ["man"], hood: "carroll-gardens", intention: "long_term", interests: ["Tennis", "Science", "Board games"], cats: ["games", "coffee", "outdoors"], bio: "Research scientist, weekend tennis player, ruthless at Codenames. Let's do something where we can keep score.", budget: 5000, radius: 10 },
  { key: "noor", email: "noor@demo.once.date", name: "Noor", age: 28, gender: "nonbinary", into: ["woman", "man", "nonbinary"], hood: "lower-east-side", intention: "see_where_it_goes", interests: ["Ceramics", "Vinyl", "Design"], cats: ["art", "music", "coffee"], bio: "Graphic designer who throws (slightly wonky) pots. I collect records and opinions about fonts.", budget: 6000, radius: 8 },
  { key: "jordan", email: "jordan@demo.once.date", name: "Jordan", age: 35, gender: "man", into: ["woman"], hood: "park-slope", intention: "long_term", interests: ["Hiking", "Cooking", "History"], cats: ["outdoors", "cooking", "dinner", "games"], bio: "Teacher, home cook, reluctant runner. I make a very good ragù and a very bad first impression — come find out which wins.", budget: 7000, radius: 12 },
  { key: "leo", email: "leo@demo.once.date", name: "Leo", age: 32, gender: "man", into: ["woman"], hood: "williamsburg", intention: "open_to_long_term", interests: ["Jazz", "Film photography", "Cinema"], cats: ["music", "art", "drinks", "coffee"], bio: "Sound engineer. I know where every good small venue in Brooklyn is and I'm tired of going alone.", budget: 6000, radius: 10 },
  { key: "daniel", email: "daniel@demo.once.date", name: "Daniel", age: 36, gender: "man", into: ["man"], hood: "chelsea", intention: "long_term", interests: ["Theatre", "Languages", "Yoga"], cats: ["dinner", "art", "music"], bio: "Translator (four languages, still learning to say what I mean in any of them). Dinner and a long walk is my ideal evening.", budget: 7000, radius: 8 },
  { key: "marcus", email: "marcus@demo.once.date", name: "Marcus", age: 34, gender: "man", into: ["woman"], hood: "dumbo", intention: "long_term", interests: ["Architecture", "Museums", "Running"], cats: ["art", "coffee", "outdoors"], bio: "Urban planner. I'll point out every interesting building on the walk and pretend I'm not doing it.", budget: 6000, radius: 10 },
  { key: "sofia", email: "sofia@demo.once.date", name: "Sofia", age: 27, gender: "woman", into: ["woman", "man"], hood: "astoria", intention: "see_where_it_goes", interests: ["Dancing", "Live comedy", "Travel"], cats: ["games", "music", "drinks"], bio: "Physical therapist who dances badly and laughs loudly. Will absolutely challenge you to ping-pong.", budget: 5000, radius: 12 },
  { key: "theo", email: "theo@demo.once.date", name: "Theo", age: 30, gender: "man", into: ["woman", "nonbinary"], hood: "east-village", intention: "something_casual", interests: ["Vinyl", "Climbing", "Coffee"], cats: ["coffee", "games", "music"], bio: "Climber, record collector, maker of excellent pour-overs. Low-key and always on time.", budget: 4000, radius: 8 },
  { key: "hannah", email: "hannah@demo.once.date", name: "Hannah", age: 37, gender: "woman", into: ["man"], hood: "upper-west-side", intention: "long_term", interests: ["Gardening", "Jazz", "Natural wine"], cats: ["music", "dinner", "art", "outdoors"], bio: "Lawyer with a balcony garden that's getting out of hand. I like long dinners and live music and people who ask follow-up questions.", budget: 9000, radius: 15 },
  { key: "elena", email: "elena@demo.once.date", name: "Elena", age: 32, gender: "woman", into: ["man"], hood: "williamsburg", intention: "open_to_long_term", interests: ["Cycling", "Coffee", "Design"], cats: ["coffee", "outdoors", "games", "art"], bio: "Industrial designer. Will cycle anywhere, will judge your coffee order (kindly).", budget: 6000, radius: 10 },
];

export function seedIfEmpty(db: Db) {
  const has = one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM users");
  if (has && has.n > 0) {
    ensureDemoInventory(db);
    return;
  }
  seed(db);
}

export function seed(db: Db) {
  const t = now().toISOString();
  const passwordHash = hashPassword(DEMO_PASSWORD);
  const userIds: Record<string, string> = {};
  const expIds: Record<string, string> = {};

  tx(db, () => {
    for (const [nid, name, lat, lng] of NEIGHBORHOODS) run(db, "INSERT INTO neighborhoods (id, name, city, lat, lng) VALUES (?, ?, 'New York', ?, ?)", nid, name, lat, lng);

    const venueIds: Record<string, string> = {};
    for (const v of VENUES) {
      venueIds[v.key] = id();
      run(db, "INSERT INTO venues (id, name, venue_type, neighborhood_id, address, accessibility_notes, dietary_options, is_demo, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)", venueIds[v.key], v.name, v.type, v.hood, v.address, v.access, v.dietary, t, t);
    }
    for (const e of EXPERIENCES) {
      expIds[e.slug] = id();
      run(
        db,
        `INSERT INTO date_experiences (id, slug, title, category, venue_id, description, atmosphere, includes, duration_minutes, total_price_cents, indoor, dress_code, arrival_notes, cancellation_hours, default_hours, is_demo, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
        expIds[e.slug], e.slug, e.title, e.category, venueIds[e.venue], e.description, e.atmosphere, JSON.stringify(e.includes), e.duration, e.total, e.indoor, e.dress, e.arrival, e.cancel, JSON.stringify(e.hours), t, t,
      );
    }

    const year = now().getUTCFullYear();
    for (const u of USERS) {
      const uid = id();
      userIds[u.key] = uid;
      run(db, "INSERT INTO users (id, email, password_hash, status, is_demo, onboarded_at, created_at, updated_at) VALUES (?, ?, ?, 'active', 1, ?, ?, ?)", uid, u.email, passwordHash, t, t, t);
      run(
        db,
        `INSERT INTO profiles (user_id, first_name, birth_date, gender, interested_in, age_min, age_max, bio, interests, intention, neighborhood_id, guidelines_accepted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        uid, u.name, `${year - u.age - 1}-11-14`, u.gender, JSON.stringify(u.into), 25, 45, u.bio, JSON.stringify(u.interests), u.intention, u.hood, t, t, t,
      );
      run(
        db,
        "INSERT INTO user_preferences (user_id, preferred_categories, preferred_days, preferred_times, budget_max_cents, travel_radius_km, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        uid, JSON.stringify(u.cats), JSON.stringify(ALL_DAYS), JSON.stringify(["morning", "afternoon", "evening"]), u.budget, u.radius, t,
      );
      if (u.admin) run(db, "INSERT INTO admin_roles (user_id, role, created_at) VALUES (?, 'admin', ?)", uid, t);
    }

    // History, so reliability indicators, the admin dashboard and the post-date
    // flow have something real to show. All of it is test data.
    const past = (a: string, b: string, slug: string, daysAgo: number, opts: { aSaysB?: boolean; bSaysA?: boolean; aFeedback?: boolean; bFeedback?: boolean; aYes?: boolean; bYes?: boolean } = {}) =>
      seedPastDate(db, userIds[a], userIds[b], expIds[slug], daysAgo, opts);

    past("chloe", "jordan", "make-pasta-then-eat-it", 40);
    past("chloe", "leo", "front-row-jazz", 33);
    past("maya", "jordan", "art-then-a-drink", 28);
    past("maya", "leo", "zero-proof-tasting-flight", 21);
    past("priya", "jordan", "a-little-friendly-competition", 18);
    past("chloe", "theo", "coffee-and-a-bookstore", 15);
    past("maya", "theo", "coffee-and-a-bookstore", 12);
    const disputed = past("leo", "priya", "ping-pong-and-dumplings", 6, { aSaysB: false });
    run(db, "INSERT INTO reports (id, reporter_id, reported_user_id, match_id, kind, details, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'no_show', 'Reported in post-date check-in.', 'open', ?, ?)", id(), userIds.leo, userIds.priya, disputed, t, t);
    // Ava's date with Marcus happened four days ago. Marcus has checked in (and said yes); Ava hasn't yet.
    past("marcus", "ava", "art-then-a-drink", 4, { bFeedback: false, aYes: true });

    run(db, "INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, NULL, 'demo.seeded', 'system', NULL, '{}', ?)", id(), t);
  });

  ensureDemoInventory(db);

  // A pending invitation for Ben, so his My Dates isn't empty on first login.
  const jazz = one<{ id: string }>(
    db,
    "SELECT s.id FROM availability_slots s WHERE s.experience_id = ? AND s.starts_at > ? ORDER BY s.starts_at LIMIT 1",
    expIds["front-row-jazz"], addHours(now(), 30).toISOString(),
  );
  if (jazz) {
    run(
      db,
      "INSERT INTO date_invitations (id, slot_id, from_user_id, to_user_id, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)",
      id(), jazz.id, userIds.hannah, userIds.ben, addHours(now(), POLICY.invitationTtlHours).toISOString(), t, t,
    );
    run(db, "INSERT INTO notifications (id, user_id, kind, title, body, link, created_at) VALUES (?, ?, 'invitation_received', 'Hannah invited you on a date', 'Front-row jazz, second set. Reply before it expires.', '/my-dates', ?)", id(), userIds.ben, t);
  }
}

function seedPastDate(
  db: Db, a: string, b: string, experienceId: string, daysAgo: number,
  opts: { aSaysB?: boolean; bSaysA?: boolean; aFeedback?: boolean; bFeedback?: boolean; aYes?: boolean; bYes?: boolean },
): string {
  const exp = one<{ total_price_cents: number; cancellation_hours: number; duration_minutes: number; default_hours: string }>(db, "SELECT total_price_cents, cancellation_hours, duration_minutes, default_hours FROM date_experiences WHERE id = ?", experienceId)!;
  const hours = JSON.parse(exp.default_hours) as { time: string }[];
  const ymd = addDaysYmd(cityParts(now().toISOString()).ymd, -daysAgo);
  const startsAt = cityTimeToUtc(ymd, hours[0].time).toISOString();
  const created = addHours(startsAt, -72).toISOString();
  const completed = addHours(startsAt, exp.duration_minutes / 60 + 0.5).toISOString();
  const slotId = id();
  const invId = id();
  const matchId = id();
  const share = exp.total_price_cents / 2;
  const fee = POLICY.defaultServiceFeeCents;
  const deadline = cancellationDeadline(startsAt, exp.cancellation_hours).toISOString();
  const terms = hashTerms({ experienceId, slotId, startsAt, totalPriceCents: exp.total_price_cents, shareCents: share, feeCents: fee, cancellationDeadline: deadline, lateRefundPct: POLICY.defaultLateCancelRefundPct });

  run(db, "INSERT INTO availability_slots (id, experience_id, starts_at, capacity, reserved_count, status, created_at, updated_at) VALUES (?, ?, ?, 2, 1, 'open', ?, ?)", slotId, experienceId, startsAt, created, created);
  run(db, "INSERT INTO date_invitations (id, slot_id, from_user_id, to_user_id, status, expires_at, responded_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'accepted', ?, ?, ?, ?)", invId, slotId, a, b, startsAt, created, created, created);
  run(
    db,
    `INSERT INTO matches (id, invitation_id, slot_id, experience_id, status, terms_hash, total_price_cents, share_cents, fee_cents, late_refund_pct, cancellation_deadline, commitment_expires_at, confirmed_at, completed_at, is_test, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    matchId, invId, slotId, experienceId, terms, exp.total_price_cents, share, fee, POLICY.defaultLateCancelRefundPct, deadline, addHours(created, 24).toISOString(), addHours(created, 2).toISOString(), completed, created, completed,
  );
  run(db, "INSERT INTO match_participants (match_id, user_id, role, details_confirmed_hash, details_confirmed_at, attendance_confirmed_at) VALUES (?, ?, 'inviter', ?, ?, ?)", matchId, a, terms, created, deadline);
  run(db, "INSERT INTO match_participants (match_id, user_id, role, details_confirmed_hash, details_confirmed_at, attendance_confirmed_at) VALUES (?, ?, 'invitee', ?, ?, ?)", matchId, b, terms, created, deadline);
  run(db, "INSERT INTO reservations (id, match_id, slot_id, status, provider, provider_ref, confirmation_code, is_test, created_at, updated_at) VALUES (?, ?, ?, 'secured', 'mock-venue', ?, ?, 1, ?, ?)", id(), matchId, slotId, `bk_test_${matchId.slice(0, 8)}`, `TEST-${matchId.slice(0, 6).toUpperCase()}`, created, created);
  for (const u of [a, b]) {
    const pi = id();
    run(
      db,
      `INSERT INTO payment_intents (id, match_id, user_id, provider, provider_ref, amount_cents, share_cents, fee_cents, status, idempotency_key, is_test, created_at, updated_at)
       VALUES (?, ?, ?, 'mock', ?, ?, ?, ?, 'captured', ?, 1, ?, ?)`,
      pi, matchId, u, `pi_test_seed_${pi.slice(0, 12)}`, share + fee, share, fee, `seed:${pi}`, created, created,
    );
    run(db, "INSERT INTO payment_transactions (id, payment_intent_id, kind, amount_cents, provider_event_id, is_test, created_at) VALUES (?, ?, 'authorization', ?, ?, 1, ?)", id(), pi, share + fee, `evt_seed_auth_${pi}`, created);
    run(db, "INSERT INTO payment_transactions (id, payment_intent_id, kind, amount_cents, provider_event_id, is_test, created_at) VALUES (?, ?, 'capture', ?, ?, 1, ?)", id(), pi, share + fee, `evt_seed_cap_${pi}`, created);
  }
  const feedback = (u: string, saysOther: boolean, yes: boolean) => {
    run(db, "INSERT INTO attendance_confirmations (match_id, user_id, attended, other_attended, created_at) VALUES (?, ?, 1, ?, ?)", matchId, u, saysOther ? 1 : 0, completed);
    run(db, "INSERT INTO post_date_feedback (match_id, user_id, felt_safe, open_to_another, experience_rating, venue_rating, created_at) VALUES (?, ?, 1, ?, ?, ?, ?)", matchId, u, yes && saysOther ? 1 : 0, 4 + (u.charCodeAt(0) % 2), 4 + (u.charCodeAt(1) % 2), completed);
  };
  if (opts.aFeedback !== false) feedback(a, opts.aSaysB ?? true, opts.aYes ?? false);
  if (opts.bFeedback !== false) feedback(b, opts.bSaysA ?? true, opts.bYes ?? false);
  return matchId;
}
