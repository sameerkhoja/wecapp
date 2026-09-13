export async function migrate(db) {
  await db.exec(`
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer');
CREATE TABLE IF NOT EXISTS auth_sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS venues (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, neighborhood TEXT NOT NULL, address TEXT NOT NULL, description TEXT NOT NULL, image TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL, amenities TEXT NOT NULL, noise TEXT NOT NULL, calls INTEGER NOT NULL, accessible INTEGER NOT NULL, wifi INTEGER NOT NULL, walk INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'approved', paused INTEGER NOT NULL DEFAULT 0, policy TEXT NOT NULL, policy_version INTEGER NOT NULL DEFAULT 1, stripe_account TEXT, verified_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, venue_id TEXT NOT NULL REFERENCES venues(id), hour INTEGER NOT NULL, duration INTEGER NOT NULL, capacity INTEGER NOT NULL, price INTEGER NOT NULL, credit INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS slots (id TEXT PRIMARY KEY, venue_id TEXT NOT NULL REFERENCES venues(id), start_at TEXT NOT NULL, end_at TEXT NOT NULL, capacity INTEGER NOT NULL, reserved INTEGER NOT NULL DEFAULT 0, price INTEGER NOT NULL, credit INTEGER NOT NULL, blackout INTEGER NOT NULL DEFAULT 0, CHECK(reserved >= 0 AND reserved <= capacity));
CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), slot_id TEXT NOT NULL REFERENCES slots(id), status TEXT NOT NULL, price INTEGER NOT NULL, fee INTEGER NOT NULL, credit INTEGER NOT NULL, policy TEXT NOT NULL, policy_version INTEGER NOT NULL, code TEXT UNIQUE NOT NULL, token TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, checked_at TEXT, stripe_checkout TEXT, payment_intent TEXT, refund_id TEXT, request_key TEXT NOT NULL, UNIQUE(user_id,request_key));
CREATE TABLE IF NOT EXISTS saved (user_id TEXT REFERENCES users(id), venue_id TEXT REFERENCES venues(id), PRIMARY KEY(user_id,venue_id));
CREATE TABLE IF NOT EXISTS waitlist (user_id TEXT REFERENCES users(id), slot_id TEXT REFERENCES slots(id), created_at TEXT NOT NULL, PRIMARY KEY(user_id,slot_id));
CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, booking_id TEXT UNIQUE REFERENCES bookings(id), rating INTEGER NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS support_cases (id TEXT PRIMARY KEY, booking_id TEXT REFERENCES bookings(id), user_id TEXT REFERENCES users(id), reason TEXT NOT NULL, notes TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, target_id TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS slots_venue_start ON slots(venue_id,start_at);
CREATE INDEX IF NOT EXISTS bookings_slot_status ON bookings(slot_id,status);
`);
}
export const cafes = [
  [
    "ritual",
    "Ritual & Room",
    "Mission District",
    "1026 Valencia St, San Francisco, CA",
    "A sunlit corner, a carefully pulled espresso, and room to get into your flow. Settle into the communal oak table or find a quiet window seat.",
    "photo-1501339847302-ac426a4a7cbb",
    37.7563,
    -122.4211,
    "Fast Wi-Fi,Every seat has power,Drink included",
    "Quiet",
    0,
    1,
    120,
    4,
    900,
    500,
  ],
  [
    "form",
    "Form Coffee",
    "Mission District",
    "1800 15th St, San Francisco, CA",
    "A minimal neighborhood coffee bar for a clear head. Warm wood, soft music, and a dedicated work counter make the afternoon yours.",
    "photo-1442512595331-e89e73853f31",
    37.766,
    -122.423,
    "Fast Wi-Fi,Power at counter,Drink included",
    "Low hum",
    1,
    1,
    85,
    8,
    1200,
    600,
  ],
  [
    "sunday",
    "Sunday Standard",
    "Hayes Valley",
    "400 Hayes St, San Francisco, CA",
    "Your slow-morning feeling, any day of the week. Bright tables, house-roasted coffee, and a little space to think.",
    "photo-1554118811-1e0d58224f24",
    37.7768,
    -122.4241,
    "Fast Wi-Fi,Window seats,Drink included",
    "Lively",
    0,
    1,
    95,
    12,
    1000,
    500,
  ],
  [
    "chapter",
    "Chapter House",
    "Mission District",
    "3036 24th St, San Francisco, CA",
    "Books on the shelves, plants in the windows, and a calm back room reserved for the work you have been meaning to do.",
    "photo-1445116572660-236099ec97a0",
    37.7522,
    -122.4143,
    "Fast Wi-Fi,Every seat has power,Drink included",
    "Quiet",
    0,
    0,
    100,
    9,
    800,
    400,
  ],
];
export async function seed(db) {
  for (const [id, email, name, role] of [
    ["customer", "alex@example.test", "Alex Morgan", "customer"],
    ["operator", "cafe@example.test", "Jamie Chen", "operator"],
    ["admin", "admin@example.test", "Sam Rivera", "admin"],
  ]) {
    await db
      .prepare(
        "INSERT INTO users(id,email,name,role) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING",
      )
      .run(id, email, name, role);
  }
  for (const [
    id,
    name,
    neighborhood,
    address,
    description,
    photo,
    lat,
    lng,
    amenities,
    noise,
    calls,
    access,
    wifi,
    walk,
    price,
    credit,
  ] of cafes) {
    await db
      .prepare(
        "INSERT INTO venues(id,owner_id,name,neighborhood,address,description,image,latitude,longitude,amenities,noise,calls,accessible,wifi,walk,policy,verified_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
      )
      .run(
        id,
        "operator",
        name,
        neighborhood,
        address,
        description,
        `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=1400&q=85`,
        lat,
        lng,
        amenities,
        noise,
        calls,
        access,
        wifi,
        walk,
        "One seat for your selected session. A drink credit is included. Headphones required; calls only where permitted. Cancel at least 2 hours before arrival for a full refund. Late cancellations are non-refundable. Venue failures may be reported for a full refund.",
        new Date().toISOString(),
      );
    for (const hour of [8, 10, 12, 14, 16])
      await db
        .prepare(
          "INSERT INTO templates(id,venue_id,hour,duration,capacity,price,credit) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
        )
        .run(`${id}-${hour}`, id, hour, 120, 6, price, credit);
  }
}
// Convert a cafe's local wall time to UTC using Intl, including daylight-saving transitions.
export function localTime(day, hour, zone = "America/Los_Angeles") {
  let stamp = Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
  for (let n = 0; n < 3; n++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(stamp)
        .map((p) => [p.type, p.value]),
    );
    const interpreted = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
    );
    stamp +=
      Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00Z`) -
      interpreted;
  }
  return new Date(stamp).toISOString();
}
export async function materialize(db, day) {
  for (const t of await db.prepare("SELECT * FROM templates").all()) {
    const start = localTime(day, t.hour),
      end = new Date(Date.parse(start) + t.duration * 60000).toISOString();
    await db
      .prepare(
        "INSERT INTO slots(id,venue_id,start_at,end_at,capacity,price,credit) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
      )
      .run(
        `${t.id}-${day}`,
        t.venue_id,
        start,
        end,
        t.capacity,
        t.price,
        t.credit,
      );
  }
}
