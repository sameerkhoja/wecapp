import express from "express";
import {
  randomUUID,
  randomBytes,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { z } from "zod";
import { migrate, seed, materialize } from "./schema.mjs";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const now = () => new Date().toISOString();
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    "Invalid date",
  );
const isoDay = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const money = (n) => Math.round(n * 0.17);
export async function createApp(
  db,
  {
    demo = process.env.NODE_ENV !== "production",
    stripe = process.env.STRIPE_SECRET_KEY
      ? new Stripe(process.env.STRIPE_SECRET_KEY)
      : null,
  } = {},
) {
  await migrate(db);
  if (demo) await seed(db);
  const secret =
    process.env.SESSION_SECRET ||
    (demo ? "wecapp-local-development-only-key" : null);
  if (!secret) throw new Error("SESSION_SECRET is required");
  const app = express();
  app.disable("x-powered-by");
  const supabase =
    process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY
      ? createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_PUBLISHABLE_KEY,
          { auth: { persistSession: false } },
        )
      : null;
  const audit = async (tx, actor, action, target, detail = {}) =>
    tx
      .prepare(
        "INSERT INTO audit_events(id,actor_id,action,target_id,detail,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(randomUUID(), actor, action, target, JSON.stringify(detail), now());
  const sign = (token) =>
    `${token}.${createHmac("sha256", secret).update(token).digest("base64url")}`;
  const valid = (token) => {
    const [t, s] = String(token).split(".");
    const expected = sign(t).split(".")[1];
    return s &&
      s.length === expected.length &&
      timingSafeEqual(Buffer.from(s), Buffer.from(expected))
      ? t
      : null;
  };
  async function expire(tx) {
    const stale = await tx
      .prepare("SELECT * FROM bookings WHERE status='held' AND expires_at<=?")
      .all(now());
    for (const b of stale) {
      const changed = await tx
        .prepare(
          "UPDATE bookings SET status='expired' WHERE id=? AND status='held'",
        )
        .run(b.id);
      if (changed.changes)
        await tx
          .prepare("UPDATE slots SET reserved=reserved-1 WHERE id=?")
          .run(b.slot_id);
    }
    await tx
      .prepare(
        "UPDATE bookings SET status='completed' WHERE status='checked_in' AND slot_id IN(SELECT id FROM slots WHERE end_at<=?)",
      )
      .run(now());
  }
  async function booking(id, tx = db) {
    return tx
      .prepare(
        "SELECT b.*,s.venue_id,s.start_at,s.end_at,v.name venue_name,v.address,v.image,v.stripe_account,v.owner_id FROM bookings b JOIN slots s ON s.id=b.slot_id JOIN venues v ON v.id=s.venue_id WHERE b.id=?" +
          (tx.dialect === "postgres" ? " FOR UPDATE OF b" : ""),
      )
      .get(id);
  }
  async function publicBooking(b) {
    const {
      token,
      request_key,
      stripe_account,
      owner_id,
      payment_intent,
      ...out
    } = b;
    return {
      ...out,
      qr: await QRCode.toDataURL(sign(token), { margin: 2, width: 220 }),
      qr_token: sign(token),
    };
  }
  async function refund(tx, b, actor, reason) {
    if (
      b.status === "refunded" ||
      b.status === "cancelled" ||
      b.status === "refund_pending"
    )
      return;
    if (
      !["confirmed", "checked_in", "completed", "refund_pending"].includes(
        b.status,
      )
    )
      fail(409, "This booking cannot be refunded");
    let id = "demo-refund";
    if (b.payment_intent) {
      if (!stripe) fail(503, "Payment provider unavailable");
      const r = await stripe.refunds.create(
        {
          payment_intent: b.payment_intent,
          reverse_transfer: true,
          refund_application_fee: true,
        },
        { idempotencyKey: `refund-${b.id}` },
      );
      id = r.id;
      if (r.status !== "succeeded") {
        await tx
          .prepare(
            "UPDATE bookings SET status='refund_pending',refund_id=? WHERE id=?",
          )
          .run(id, b.id);
        await audit(tx, actor, "refund_pending", b.id, { reason });
        return;
      }
    }
    await tx
      .prepare("UPDATE bookings SET status='refunded',refund_id=? WHERE id=?")
      .run(id, b.id);
    await tx
      .prepare("UPDATE slots SET reserved=reserved-1 WHERE id=?")
      .run(b.slot_id);
    await audit(tx, actor, "refund", b.id, { amount: b.price, reason });
  }
  app.use((req, res, next) => {
    req.correlationId = randomUUID();
    res.setHeader("X-Request-ID", req.correlationId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    const origin = req.headers.origin;
    const allowed = [
      process.env.APP_URL,
      "http://localhost:5173",
      "http://localhost:5174",
    ].filter(Boolean);
    if (origin && allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Idempotency-Key",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PATCH,DELETE,OPTIONS",
      );
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.post(
    "/api/payments/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET)
        return res.sendStatus(503);
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          req.headers["stripe-signature"],
          process.env.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        return res.status(400).json({ error: "Invalid webhook signature" });
      }
      await db.transaction(async (tx) => {
        const inserted = await tx
          .prepare(
            "INSERT INTO webhook_events(id,created_at) VALUES(?,?) ON CONFLICT(id) DO NOTHING",
          )
          .run(event.id, now());
        if (!inserted.changes) return;
        const object = event.data.object;
        if (
          event.type === "checkout.session.completed" &&
          object.payment_status === "paid"
        ) {
          const b = await booking(object.metadata?.booking_id, tx);
          if (!b) fail(400, "Unknown booking");
          if (object.amount_total !== b.price || object.currency !== "usd")
            fail(400, "Payment amount mismatch");
          if (b.stripe_checkout && b.stripe_checkout !== object.id)
            fail(400, "Checkout mismatch");
          if (
            b.status === "confirmed" ||
            b.status === "checked_in" ||
            b.status === "completed" ||
            b.status === "refunded"
          )
            return;
          if (b.status !== "held") {
            await stripe.refunds.create(
              {
                payment_intent: object.payment_intent,
                reverse_transfer: true,
                refund_application_fee: true,
              },
              { idempotencyKey: `late-${b.id}` },
            );
            await audit(tx, null, "late_payment_refunded", b.id);
            return;
          }
          await tx
            .prepare(
              "UPDATE bookings SET status='confirmed',payment_intent=?,stripe_checkout=? WHERE id=?",
            )
            .run(object.payment_intent, object.id, b.id);
          await audit(tx, b.user_id, "payment_confirmed", b.id);
        }
        if (event.type === "checkout.session.expired") {
          const b = await booking(object.metadata?.booking_id, tx);
          if (b?.status === "held") {
            await tx
              .prepare("UPDATE bookings SET status='expired' WHERE id=?")
              .run(b.id);
            await tx
              .prepare("UPDATE slots SET reserved=reserved-1 WHERE id=?")
              .run(b.slot_id);
          }
        }
        if (event.type === "refund.updated" && object.status === "succeeded") {
          const b = await tx
            .prepare(
              "SELECT * FROM bookings WHERE refund_id=? AND status='refund_pending'",
            )
            .get(object.id);
          if (b) {
            await tx
              .prepare("UPDATE bookings SET status='refunded' WHERE id=?")
              .run(b.id);
            await tx
              .prepare("UPDATE slots SET reserved=reserved-1 WHERE id=?")
              .run(b.slot_id);
            await audit(tx, null, "refund_completed", b.id);
          }
        }
      });
      res.json({ received: true });
    },
  );
  app.use(express.json({ limit: "32kb" }));
  // Small per-process abuse guard. Use a shared ingress limiter when horizontally scaling.
  const limits = new Map();
  app.use("/api", (req, res, next) => {
    const key = req.ip;
    const entry = limits.get(key) || { count: 0, until: Date.now() + 60000 };
    if (entry.until < Date.now()) {
      entry.count = 0;
      entry.until = Date.now() + 60000;
    }
    entry.count++;
    limits.set(key, entry);
    if (limits.size > 10000)
      for (const [k, v] of limits) if (v.until < Date.now()) limits.delete(k);
    if (entry.count > 240)
      return res
        .status(429)
        .json({ error: "Too many requests. Please wait a minute." });
    next();
  });
  app.get("/api/config", (_req, res) =>
    res.json({
      demo,
      payments: !!stripe,
      supabaseUrl: process.env.SUPABASE_URL || null,
      supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || null,
    }),
  );
  app.get("/api/health", async (_req, res) => {
    await db.prepare("SELECT 1 AS ok").get();
    res.json({ ok: true });
  });
  app.post("/api/auth/demo", async (req, res) => {
    if (!demo) fail(404, "Not found");
    const role = z
      .enum(["customer", "operator", "admin"])
      .parse(req.body.role || "customer");
    const user = await db.prepare("SELECT * FROM users WHERE id=?").get(role);
    const token = randomBytes(32).toString("base64url");
    await db
      .prepare(
        "INSERT INTO auth_sessions(hash,user_id,expires_at) VALUES(?,?,?)",
      )
      .run(hash(token), user.id, new Date(Date.now() + 86400000).toISOString());
    res.json({ token, user });
  });
  app.use("/api", async (req, res, next) => {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (token) {
      req.user = await db
        .prepare(
          "SELECT u.* FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>?",
        )
        .get(hash(token), now());
      if (!req.user && supabase) {
        const { data, error } = await supabase.auth.getUser(token);
        if (!error && data.user?.email) {
          await db
            .prepare(
              "INSERT INTO users(id,email,name,role) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING",
            )
            .run(
              data.user.id,
              data.user.email,
              data.user.user_metadata?.name || data.user.email.split("@")[0],
              (process.env.ADMIN_EMAILS || "")
                .split(",")
                .map((e) => e.trim().toLowerCase())
                .includes(data.user.email.toLowerCase())
                ? "admin"
                : "customer",
            );
          req.user = await db
            .prepare("SELECT * FROM users WHERE id=?")
            .get(data.user.id);
        }
      }
    }
    next();
  });
  const auth = (req, res, next) => {
    if (!req.user) fail(401, "Sign in to continue");
    next();
  };
  const roles =
    (...rs) =>
    (req, res, next) => {
      if (!req.user) fail(401, "Sign in to continue");
      if (!rs.includes(req.user.role))
        fail(
          403,
          "This action requires an authorized café operator or administrator",
        );
      next();
    };
  app.get("/api/me", auth, (req, res) => res.json(req.user));
  app.post("/api/auth/logout", auth, async (req, res) => {
    const token = req.headers.authorization?.slice(7);
    if (token)
      await db
        .prepare("DELETE FROM auth_sessions WHERE hash=?")
        .run(hash(token));
    res.json({ ok: true });
  });
  app.get("/api/venues", async (req, res) => {
    const day = daySchema.parse(req.query.date || isoDay());
    if (Math.abs(Date.parse(day) - Date.now()) > 32 * 86400000)
      fail(400, "Choose a date within the next 30 days");
    await db.transaction(async (tx) => {
      await expire(tx);
      await materialize(tx, day);
    });
    const venues = await db
      .prepare(
        "SELECT v.*,(SELECT MIN(t.price) FROM templates t WHERE t.venue_id=v.id) starting_price,(SELECT MIN(t.credit) FROM templates t WHERE t.venue_id=v.id) starting_credit FROM venues v WHERE v.status='approved'",
      )
      .all();
    const slots = await db
      .prepare(
        "SELECT * FROM slots WHERE start_at>=? AND start_at<? ORDER BY start_at",
      )
      .all(
        `${day}T00:00:00.000Z`,
        new Date(Date.parse(day) + 2 * 86400000).toISOString(),
      );
    const saved = req.user
      ? await db
          .prepare("SELECT venue_id FROM saved WHERE user_id=?")
          .all(req.user.id)
      : [];
    res.json(
      venues.map((v) => {
        const { stripe_account, owner_id, ...out } = v;
        return {
          ...out,
          saved: saved.some((s) => s.venue_id === v.id),
          slots: slots
            .filter(
              (s) =>
                s.venue_id === v.id && s.id.endsWith(day) && s.start_at > now(),
            )
            .map((s) => ({
              ...s,
              available: v.paused || s.blackout ? 0 : s.capacity - s.reserved,
            })),
        };
      }),
    );
  });
  app.post("/api/cafe-applications", auth, async (req, res) => {
    const b = z
      .object({
        name: z.string().min(2).max(100),
        address: z.string().min(10).max(200),
        neighborhood: z.string().min(2).max(80),
        description: z.string().min(20).max(1000),
      })
      .parse(req.body);
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx
        .prepare(
          "INSERT INTO venues(id,owner_id,name,neighborhood,address,description,image,latitude,longitude,amenities,noise,calls,accessible,wifi,walk,status,policy,verified_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          req.user.id,
          b.name,
          b.neighborhood,
          b.address,
          b.description,
          "",
          0,
          0,
          "Amenities awaiting operator verification",
          "Low hum",
          0,
          0,
          0,
          0,
          "pending",
          "One seat for a two-hour session. Cancel at least 2 hours before arrival for a full refund. Drink credit is included. Respect the café house rules.",
          now(),
        );
      for (const hour of [8, 10, 12, 14, 16])
        await tx
          .prepare(
            "INSERT INTO templates(id,venue_id,hour,duration,capacity,price,credit) VALUES(?,?,?,?,?,?,?)",
          )
          .run(id + "-" + hour, id, hour, 120, 4, 900, 500);
      await audit(tx, req.user.id, "cafe_application", id);
    });
    res.status(201).json({ id });
  });
  app.post("/api/saved/:id", auth, async (req, res) => {
    if (
      !(await db.prepare("SELECT id FROM venues WHERE id=?").get(req.params.id))
    )
      fail(404, "Café not found");
    const active = z.boolean().parse(req.body.saved);
    if (active)
      await db
        .prepare(
          "INSERT INTO saved(user_id,venue_id) VALUES(?,?) ON CONFLICT DO NOTHING",
        )
        .run(req.user.id, req.params.id);
    else
      await db
        .prepare("DELETE FROM saved WHERE user_id=? AND venue_id=?")
        .run(req.user.id, req.params.id);
    res.json({ saved: active });
  });
  app.post("/api/waitlist", auth, async (req, res) => {
    const id = z.string().parse(req.body.slotId);
    if (!(await db.prepare("SELECT id FROM slots WHERE id=?").get(id)))
      fail(404, "Session not found");
    await db
      .prepare(
        "INSERT INTO waitlist(user_id,slot_id,created_at) VALUES(?,?,?) ON CONFLICT DO NOTHING",
      )
      .run(req.user.id, id, now());
    res.json({
      ok: true,
      message:
        "Added to this session’s waitlist. Check back for availability; email delivery is not configured in local demo.",
    });
  });
  app.post("/api/bookings", auth, async (req, res) => {
    const { slotId, acceptedPolicy, promo } = z
      .object({
        slotId: z.string(),
        acceptedPolicy: z.literal(true),
        promo: z.string().max(30).optional(),
      })
      .parse(req.body);
    const key = z
      .string()
      .min(8)
      .max(100)
      .parse(req.headers["idempotency-key"]);
    const b = await db.transaction(async (tx) => {
      await expire(tx);
      if (tx.dialect === "postgres")
        await tx
          .prepare("SELECT id FROM users WHERE id=? FOR UPDATE")
          .get(req.user.id);
      const previous = await tx
        .prepare(
          "SELECT id,slot_id FROM bookings WHERE user_id=? AND request_key=?",
        )
        .get(req.user.id, key);
      if (previous) {
        if (previous.slot_id !== slotId)
          fail(409, "Request key was already used for another session");
        return booking(previous.id, tx);
      }
      const s = await tx
        .prepare(
          "SELECT s.*,v.policy,v.policy_version,v.paused,v.status venue_status FROM slots s JOIN venues v ON v.id=s.venue_id WHERE s.id=?",
        )
        .get(slotId);
      if (!s) fail(404, "Session not found");
      if (
        s.start_at <= now() ||
        s.paused ||
        s.blackout ||
        s.venue_status !== "approved"
      )
        fail(409, "This session is no longer available");
      if (promo && promo.toUpperCase() !== "FIRSTCUP")
        fail(400, "Promo code not recognized");
      if (promo) {
        const old = await tx
          .prepare(
            "SELECT id FROM bookings WHERE user_id=? AND status IN('held','confirmed','checked_in','completed','refunded')",
          )
          .get(req.user.id);
        if (old) fail(400, "FIRSTCUP is for your first booking");
      }
      const claim = await tx
        .prepare(
          "UPDATE slots SET reserved=reserved+1 WHERE id=? AND reserved<capacity AND blackout=0",
        )
        .run(slotId);
      if (!claim.changes)
        fail(409, "The last seat was just reserved. Try another time.");
      const id = randomUUID(),
        price = promo ? Math.max(100, s.price - 200) : s.price;
      await tx
        .prepare(
          "INSERT INTO bookings(id,user_id,slot_id,status,price,fee,credit,policy,policy_version,code,token,expires_at,created_at,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          req.user.id,
          slotId,
          "held",
          price,
          money(price),
          s.credit,
          s.policy,
          s.policy_version,
          randomBytes(4).toString("hex").toUpperCase(),
          randomBytes(24).toString("base64url"),
          new Date(Date.now() + 31 * 60000).toISOString(),
          now(),
          key,
        );
      await audit(tx, req.user.id, "hold_created", id);
      return booking(id, tx);
    });
    res.status(201).json(await publicBooking(b));
  });
  app.post("/api/bookings/:id/checkout", auth, async (req, res) => {
    const b = await booking(req.params.id);
    if (!b || b.user_id !== req.user.id) fail(404, "Booking not found");
    if (b.status !== "held" || b.expires_at <= now())
      fail(409, "This reservation hold is no longer active");
    if (demo && !stripe) {
      await db.transaction(async (tx) => {
        const change = await tx
          .prepare(
            "UPDATE bookings SET status='confirmed' WHERE id=? AND status='held' AND expires_at>?",
          )
          .run(b.id, now());
        if (!change.changes) fail(409, "Hold expired");
        await audit(tx, req.user.id, "demo_payment", b.id);
      });
      return res.json({
        demo: true,
        booking: await publicBooking(await booking(b.id)),
      });
    }
    if (!stripe || !b.stripe_account)
      fail(
        503,
        "This café is not ready to accept payments. No payment was taken.",
      );
    const base = process.env.APP_URL;
    if (!base || !base.startsWith("https://"))
      fail(503, "Secure checkout URL is not configured");
    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: b.price,
              product_data: {
                name: `${b.venue_name} · 2-hour workspace`,
                description: `Includes $${(b.credit / 100).toFixed(2)} drink credit`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: { booking_id: b.id },
        payment_intent_data: {
          application_fee_amount: b.fee,
          transfer_data: { destination: b.stripe_account },
        },
        expires_at: Math.floor(Date.parse(b.created_at) / 1000) + 30 * 60,
        success_url: `${base}/?booking=${b.id}`,
        cancel_url: `${base}/?booking=${b.id}&checkout=cancelled`,
      },
      { idempotencyKey: `checkout-${b.id}` },
    );
    await db
      .prepare("UPDATE bookings SET stripe_checkout=? WHERE id=?")
      .run(checkout.id, b.id);
    res.json({ url: checkout.url });
  });
  app.get("/api/bookings", auth, async (req, res) => {
    await db.transaction(expire);
    const rows = await db
      .prepare(
        "SELECT id FROM bookings WHERE user_id=? ORDER BY created_at DESC",
      )
      .all(req.user.id);
    res.json(
      await Promise.all(
        rows.map(async (r) => publicBooking(await booking(r.id))),
      ),
    );
  });
  app.post("/api/bookings/:id/cancel", auth, async (req, res) => {
    await db.transaction(async (tx) => {
      const b = await booking(req.params.id, tx);
      if (!b || b.user_id !== req.user.id) fail(404, "Booking not found");
      if (["cancelled", "refunded", "expired"].includes(b.status)) return;
      if (b.status === "held") {
        if (b.stripe_checkout) {
          if (!stripe) fail(503, "Payment provider unavailable");
          await stripe.checkout.sessions.expire(b.stripe_checkout);
        }
        await tx
          .prepare("UPDATE bookings SET status='cancelled' WHERE id=?")
          .run(b.id);
        await tx
          .prepare("UPDATE slots SET reserved=reserved-1 WHERE id=?")
          .run(b.slot_id);
        await audit(tx, req.user.id, "hold_cancelled", b.id);
        return;
      }
      if (b.status !== "confirmed")
        fail(409, "Only upcoming bookings can be cancelled");
      if (Date.parse(b.start_at) - Date.now() < 2 * 3600000)
        fail(
          409,
          "The refund window has closed. Report an issue if the café cannot honor your session.",
        );
      await refund(tx, b, req.user.id, "Customer cancellation");
    });
    res.json(await publicBooking(await booking(req.params.id)));
  });
  app.post("/api/support", auth, async (req, res) => {
    const body = z
      .object({
        bookingId: z.string(),
        reason: z.enum([
          "Seat unavailable",
          "Café closed",
          "Missing drink credit",
          "Amenity issue",
          "Other",
        ]),
        notes: z.string().min(5).max(2000),
      })
      .parse(req.body);
    const b = await booking(body.bookingId);
    if (!b || b.user_id !== req.user.id) fail(404, "Booking not found");
    const id = randomUUID();
    await db
      .prepare(
        "INSERT INTO support_cases(id,booking_id,user_id,reason,notes,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(id, b.id, req.user.id, body.reason, body.notes, now());
    res.status(201).json({ id });
  });
  app.post("/api/feedback", auth, async (req, res) => {
    const body = z
      .object({
        bookingId: z.string(),
        rating: z.number().int().min(1).max(5),
        notes: z.string().max(1000),
      })
      .parse(req.body);
    const b = await booking(body.bookingId);
    if (!b || b.user_id !== req.user.id) fail(404, "Booking not found");
    if (b.status !== "completed")
      fail(409, "Feedback opens after your session finishes");
    await db
      .prepare(
        "INSERT INTO feedback(id,booking_id,rating,notes,created_at) VALUES(?,?,?,?,?) ON CONFLICT(booking_id) DO UPDATE SET rating=excluded.rating,notes=excluded.notes",
      )
      .run(randomUUID(), b.id, body.rating, body.notes, now());
    res.json({ ok: true });
  });
  app.get("/api/operator", roles("operator", "admin"), async (req, res) => {
    const date = daySchema.parse(req.query.date || isoDay());
    await db.transaction(async (tx) => {
      await expire(tx);
      await materialize(tx, date);
    });
    const venues =
      req.user.role === "admin"
        ? await db.prepare("SELECT * FROM venues").all()
        : await db
            .prepare("SELECT * FROM venues WHERE owner_id=?")
            .all(req.user.id);
    const data = [];
    for (const v of venues) {
      const slots = await db
        .prepare("SELECT * FROM slots WHERE venue_id=? ORDER BY start_at")
        .all(v.id);
      const arrivals = await db
        .prepare(
          "SELECT b.id,b.code,b.status,b.price,b.fee,b.credit,s.start_at,s.end_at,u.name customer FROM bookings b JOIN slots s ON s.id=b.slot_id JOIN users u ON u.id=b.user_id WHERE s.venue_id=? AND b.status IN('confirmed','checked_in','completed','refund_pending') ORDER BY s.start_at",
        )
        .all(v.id);
      data.push({
        ...v,
        slots: slots.filter((s) => s.id.endsWith(date)),
        arrivals: arrivals.filter(
          (b) =>
            new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Los_Angeles",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(b.start_at)) === date,
        ),
        templates: await db
          .prepare("SELECT * FROM templates WHERE venue_id=? ORDER BY hour")
          .all(v.id),
      });
    }
    res.json(data);
  });
  async function own(req, id, tx = db) {
    const v = await tx.prepare("SELECT * FROM venues WHERE id=?").get(id);
    if (!v || (req.user.role !== "admin" && v.owner_id !== req.user.id))
      fail(403, "You do not manage this café");
    return v;
  }
  app.patch(
    "/api/operator/venues/:id",
    roles("operator", "admin"),
    async (req, res) => {
      const b = z
        .object({
          paused: z.boolean().optional(),
          description: z.string().min(10).max(1000).optional(),
          policy: z.string().min(10).max(2000).optional(),
          noise: z.enum(["Quiet", "Low hum", "Lively"]).optional(),
          calls: z.boolean().optional(),
          accessible: z.boolean().optional(),
          image: z.string().url().startsWith("https://").optional(),
          amenities: z.string().min(3).max(500).optional(),
          wifi: z.number().int().min(0).max(10000).optional(),
        })
        .strict()
        .parse(req.body);
      await db.transaction(async (tx) => {
        const v = await own(req, req.params.id, tx);
        await tx
          .prepare(
            "UPDATE venues SET paused=?,description=?,policy=?,policy_version=?,noise=?,calls=?,accessible=?,verified_at=? WHERE id=?",
          )
          .run(
            b.paused === undefined ? v.paused : Number(b.paused),
            b.description ?? v.description,
            b.policy ?? v.policy,
            v.policy_version + (b.policy && b.policy !== v.policy ? 1 : 0),
            b.noise ?? v.noise,
            b.calls === undefined ? v.calls : Number(b.calls),
            b.accessible === undefined ? v.accessible : Number(b.accessible),
            now(),
            v.id,
          );
        await tx
          .prepare("UPDATE venues SET image=?,amenities=?,wifi=? WHERE id=?")
          .run(
            b.image ?? v.image,
            b.amenities ?? v.amenities,
            b.wifi ?? v.wifi,
            v.id,
          );
        await audit(tx, req.user.id, "venue_updated", v.id, b);
      });
      res.json({ ok: true });
    },
  );
  app.patch(
    "/api/operator/slots/:id",
    roles("operator", "admin"),
    async (req, res) => {
      const b = z
        .object({
          capacity: z.number().int().min(0).max(100),
          blackout: z.boolean(),
        })
        .parse(req.body);
      await db.transaction(async (tx) => {
        const s = await tx
          .prepare("SELECT * FROM slots WHERE id=?")
          .get(req.params.id);
        if (!s) fail(404, "Session not found");
        await own(req, s.venue_id, tx);
        const changed = await tx
          .prepare(
            "UPDATE slots SET capacity=?,blackout=? WHERE id=? AND reserved<=?",
          )
          .run(b.capacity, Number(b.blackout), s.id, b.capacity);
        if (!changed.changes)
          fail(409, "Capacity cannot be below existing reservations");
        await audit(tx, req.user.id, "inventory_updated", s.id, b);
      });
      res.json({ ok: true });
    },
  );
  app.patch(
    "/api/operator/templates/:id",
    roles("operator", "admin"),
    async (req, res) => {
      const b = z
        .object({
          capacity: z.number().int().min(0).max(100),
          price: z.number().int().min(100).max(100000),
          credit: z.number().int().min(0).max(100000),
        })
        .refine((b) => b.credit <= b.price, "Drink credit cannot exceed price")
        .parse(req.body);
      await db.transaction(async (tx) => {
        const t = await tx
          .prepare("SELECT * FROM templates WHERE id=?")
          .get(req.params.id);
        if (!t) fail(404, "Template not found");
        await own(req, t.venue_id, tx);
        await tx
          .prepare(
            "UPDATE templates SET capacity=?,price=?,credit=? WHERE id=?",
          )
          .run(b.capacity, b.price, b.credit, t.id);
        await audit(tx, req.user.id, "template_updated", t.id, b);
      });
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/operator/check-in",
    roles("operator", "admin"),
    async (req, res) => {
      const { code } = z
        .object({ code: z.string().min(4).max(200) })
        .parse(req.body);
      const checked = await db.transaction(async (tx) => {
        const token = code.includes(".") ? valid(code) : null;
        const row = token
          ? await tx.prepare("SELECT id FROM bookings WHERE token=?").get(token)
          : await tx
              .prepare("SELECT id FROM bookings WHERE code=?")
              .get(code.trim().toUpperCase());
        if (!row) fail(404, "Booking code not found");
        const b = await booking(row.id, tx);
        await own(req, b.venue_id, tx);
        if (b.status !== "confirmed")
          fail(
            409,
            b.status === "checked_in"
              ? "This pass has already been used"
              : "This booking is not valid for check-in",
          );
        if (
          Date.parse(b.start_at) - Date.now() > 15 * 60000 ||
          b.end_at <= now()
        )
          fail(
            409,
            "Check-in opens 15 minutes before the session and closes when it ends",
          );
        const changed = await tx
          .prepare(
            "UPDATE bookings SET status='checked_in',checked_at=? WHERE id=? AND status='confirmed'",
          )
          .run(now(), b.id);
        if (!changed.changes) fail(409, "Pass already used");
        await audit(tx, req.user.id, "checked_in", b.id);
        return b.id;
      });
      res.json({ ok: true, id: checked });
    },
  );
  app.post(
    "/api/operator/connect",
    roles("operator", "admin"),
    async (req, res) => {
      const id = z.string().parse(req.body.venueId);
      const v = await own(req, id);
      if (!stripe) fail(503, "Stripe Connect is not configured");
      const base = process.env.APP_URL;
      if (!base?.startsWith("https://"))
        fail(503, "Configure a secure APP_URL first");
      let account = v.stripe_account;
      if (!account) {
        const a = await stripe.accounts.create(
          {
            type: "express",
            capabilities: {
              card_payments: { requested: true },
              transfers: { requested: true },
            },
            metadata: { venue_id: id },
          },
          { idempotencyKey: `venue-${id}` },
        );
        account = a.id;
        await db
          .prepare("UPDATE venues SET stripe_account=? WHERE id=?")
          .run(account, id);
      }
      const link = await stripe.accountLinks.create({
        account,
        refresh_url: `${base}/?view=operator`,
        return_url: `${base}/?view=operator`,
        type: "account_onboarding",
      });
      res.json({ url: link.url });
    },
  );
  app.get("/api/admin", roles("admin"), async (req, res) => {
    const venues = await db.prepare("SELECT * FROM venues").all();
    const cases = await db
      .prepare(
        "SELECT c.*,u.name customer,v.name venue_name FROM support_cases c JOIN users u ON u.id=c.user_id JOIN bookings b ON b.id=c.booking_id JOIN slots s ON s.id=b.slot_id JOIN venues v ON v.id=s.venue_id ORDER BY c.created_at DESC",
      )
      .all();
    const audit = await db
      .prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 100")
      .all();
    const transactions = await db
      .prepare(
        "SELECT b.id,b.price,b.fee,b.status,b.created_at,v.name venue_name,u.name customer FROM bookings b JOIN users u ON u.id=b.user_id JOIN slots s ON s.id=b.slot_id JOIN venues v ON v.id=s.venue_id ORDER BY b.created_at DESC LIMIT 200",
      )
      .all();
    res.json({ venues, cases, audit, transactions });
  });
  app.patch("/api/admin/venues/:id", roles("admin"), async (req, res) => {
    const status = z
      .enum(["approved", "suspended", "pending"])
      .parse(req.body.status);
    await db.transaction(async (tx) => {
      const v = await tx
        .prepare("SELECT id FROM venues WHERE id=?")
        .get(req.params.id);
      if (!v) fail(404, "Café not found");
      await tx
        .prepare("UPDATE venues SET status=? WHERE id=?")
        .run(status, v.id);
      if (status === "approved")
        await tx
          .prepare(
            "UPDATE users SET role='operator' WHERE id=(SELECT owner_id FROM venues WHERE id=?) AND role='customer'",
          )
          .run(v.id);
      await audit(tx, req.user.id, "venue_status", v.id, { status });
    });
    res.json({ ok: true });
  });
  app.post("/api/admin/cases/:id/resolve", roles("admin"), async (req, res) => {
    const action = z.enum(["refund", "close"]).parse(req.body.action);
    await db.transaction(async (tx) => {
      const c = await tx
        .prepare("SELECT * FROM support_cases WHERE id=?")
        .get(req.params.id);
      if (!c) fail(404, "Case not found");
      if (c.status !== "open") return;
      if (action === "refund")
        await refund(
          tx,
          await booking(c.booking_id, tx),
          req.user.id,
          c.reason,
        );
      await tx
        .prepare("UPDATE support_cases SET status=? WHERE id=?")
        .run(action === "refund" ? "refund_requested" : "closed", c.id);
      await audit(tx, req.user.id, "case_resolved", c.id, { action });
    });
    res.json({ ok: true });
  });
  app.get("/api/admin/export", roles("admin"), async (req, res) => {
    const rows = await db
      .prepare(
        "SELECT id,status,price,fee,refund_id,payment_intent,created_at FROM bookings ORDER BY created_at",
      )
      .all();
    const cell = (s) => '"' + String(s ?? "").replace(/"/g, '""') + '"';
    res
      .type("text/csv")
      .send(
        [
          "id,status,amount_cents,fee_cents,refund_id,payment_intent,created_at",
          ...rows.map((r) =>
            [
              r.id,
              r.status,
              r.price,
              r.fee,
              r.refund_id,
              r.payment_intent,
              r.created_at,
            ]
              .map(cell)
              .join(","),
          ),
        ].join("\n"),
      );
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof z.ZodError ? 400 : error.status || 500;
    if (status >= 500)
      console.error(
        JSON.stringify({ requestId: req.correlationId, error: error.name }),
      );
    res
      .status(status)
      .json({
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => i.message).join("; ")
            : status >= 500
              ? "The request could not be completed. Please retry."
              : error.message,
        requestId: req.correlationId,
      });
  });
  return app;
}
