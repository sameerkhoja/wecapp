import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import Stripe from "stripe";
import { openDatabase } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_local_test";
process.env.APP_URL = "https://wecapp.example.test";
const sdk = new Stripe("sk_test_local"),
  day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
async function setup() {
  const db = await openDatabase(":memory:");
  const refunds = [];
  const stripe = {
    webhooks: sdk.webhooks,
    checkout: {
      sessions: {
        create: async () => ({
          id: "cs_test",
          url: "https://checkout.stripe.com/test",
        }),
        expire: async () => ({}),
      },
    },
    refunds: {
      create: async (r, opts) => {
        refunds.push({ r, opts });
        return { id: "re_test", status: "succeeded" };
      },
    },
  };
  const app = await createApp(db, { demo: true, stripe });
  const token = (
    await request(app).post("/api/auth/demo").send({ role: "customer" })
  ).body.token;
  const venues = (await request(app).get("/api/venues?date=" + day)).body;
  const slot = venues[0].slots[0];
  await db
    .prepare("UPDATE venues SET stripe_account=? WHERE id=?")
    .run("acct_test", slot.venue_id);
  const b = (
    await request(app)
      .post("/api/bookings")
      .set("Authorization", "Bearer " + token)
      .set("Idempotency-Key", "payment-test-key")
      .send({ slotId: slot.id, acceptedPolicy: true })
  ).body;
  return { db, app, token, slot, b, refunds };
}
function send(c, event, signature = true) {
  const payload = JSON.stringify(event);
  return request(c.app)
    .post("/api/payments/webhook")
    .set("Content-Type", "application/json")
    .set(
      "stripe-signature",
      signature
        ? sdk.webhooks.generateTestHeaderString({
            payload,
            secret: process.env.STRIPE_WEBHOOK_SECRET,
          })
        : "invalid",
    )
    .send(payload);
}
const event = (c) => ({
  id: "evt_paid",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test",
      metadata: { booking_id: c.b.id },
      payment_status: "paid",
      amount_total: c.b.price,
      currency: "usd",
      payment_intent: "pi_test",
    },
  },
});
test("signed payment webhook is authoritative, duplicate-safe, and validates amount", async () => {
  const c = await setup();
  try {
    const checkout = await request(c.app)
      .post("/api/bookings/" + c.b.id + "/checkout")
      .set("Authorization", "Bearer " + c.token)
      .send({});
    assert.equal(checkout.status, 200);
    assert.equal(
      (await c.db.prepare("SELECT status FROM bookings WHERE id=?").get(c.b.id))
        .status,
      "held",
    );
    assert.equal((await send(c, event(c), false)).status, 400);
    const wrong = event(c);
    wrong.data.object.amount_total = 1;
    assert.equal((await send(c, wrong)).status, 400);
    assert.equal((await send(c, event(c))).status, 200);
    assert.equal((await send(c, event(c))).status, 200);
    assert.equal(
      (await c.db.prepare("SELECT status FROM bookings WHERE id=?").get(c.b.id))
        .status,
      "confirmed",
    );
    assert.equal(
      (
        await c.db
          .prepare("SELECT reserved FROM slots WHERE id=?")
          .get(c.slot.id)
      ).reserved,
      1,
    );
    assert.equal(
      (await c.db.prepare("SELECT * FROM webhook_events").all()).length,
      1,
    );
  } finally {
    await c.db.close();
  }
});
test("late payment after released hold is refunded without reclaiming a seat", async () => {
  const c = await setup();
  try {
    await c.db
      .prepare("UPDATE bookings SET expires_at=? WHERE id=?")
      .run(new Date(Date.now() - 1000).toISOString(), c.b.id);
    await request(c.app).get("/api/venues?date=" + day);
    assert.equal((await send(c, event(c))).status, 200);
    assert.equal((await send(c, event(c))).status, 200);
    assert.equal(c.refunds.length, 1);
    assert.equal(c.refunds[0].r.reverse_transfer, true);
    assert.equal(
      (
        await c.db
          .prepare("SELECT reserved FROM slots WHERE id=?")
          .get(c.slot.id)
      ).reserved,
      0,
    );
  } finally {
    await c.db.close();
  }
});
