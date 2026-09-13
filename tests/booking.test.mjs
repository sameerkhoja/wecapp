import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { openDatabase } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { localTime } from "../server/schema.mjs";
const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
async function setup() {
  const db = await openDatabase(":memory:");
  const app = await createApp(db, { demo: true, stripe: null });
  const login = async (role) =>
    (await request(app).post("/api/auth/demo").send({ role })).body.token;
  const customer = await login("customer"),
    operator = await login("operator"),
    admin = await login("admin");
  const venues = (await request(app).get("/api/venues?date=" + day)).body;
  return { db, app, customer, operator, admin, slot: venues[0].slots[0] };
}
const authed = (app, method, path, token) =>
  request(app)
    [method](path)
    .set("Authorization", "Bearer " + token);
async function hold(c, key = "test-booking-1") {
  return authed(c.app, "post", "/api/bookings", c.customer)
    .set("Idempotency-Key", key)
    .send({ slotId: c.slot.id, acceptedPolicy: true });
}
async function confirm(c, id) {
  return authed(c.app, "post", `/api/bookings/${id}/checkout`, c.customer).send(
    {},
  );
}
test("last-seat races never oversell; retries return the same hold", async () => {
  const c = await setup();
  try {
    await c.db.prepare("UPDATE slots SET capacity=1 WHERE id=?").run(c.slot.id);
    const results = await Promise.all([
      hold(c, "race-key-one"),
      hold(c, "race-key-two"),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const first = results.find((r) => r.status === 201);
    const key = results[0].status === 201 ? "race-key-one" : "race-key-two";
    const retry = await hold(c, key);
    assert.equal(retry.body.id, first.body.id);
    assert.equal(
      (
        await c.db
          .prepare("SELECT reserved FROM slots WHERE id=?")
          .get(c.slot.id)
      ).reserved,
      1,
    );
  } finally {
    await c.db.close();
  }
});
test("confirmation and cancellation are idempotent and release capacity once", async () => {
  const c = await setup();
  try {
    const r = await hold(c);
    assert.equal(r.status, 201);
    assert.equal(
      (await confirm(c, r.body.id)).body.booking.status,
      "confirmed",
    );
    const cancel = await authed(
      c.app,
      "post",
      `/api/bookings/${r.body.id}/cancel`,
      c.customer,
    ).send({});
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.status, "refunded");
    await authed(
      c.app,
      "post",
      `/api/bookings/${r.body.id}/cancel`,
      c.customer,
    ).send({});
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
test("expired holds release seats and cannot be paid", async () => {
  const c = await setup();
  try {
    const r = await hold(c);
    await c.db
      .prepare("UPDATE bookings SET expires_at=? WHERE id=?")
      .run(new Date(Date.now() - 1000).toISOString(), r.body.id);
    await request(c.app).get("/api/venues?date=" + day);
    assert.equal((await confirm(c, r.body.id)).status, 409);
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
test("role and ownership checks protect bookings, inventory, support and admin", async () => {
  const c = await setup();
  try {
    assert.equal((await request(c.app).get("/api/bookings")).status, 401);
    assert.equal(
      (await authed(c.app, "get", "/api/admin", c.customer)).status,
      403,
    );
    assert.equal(
      (
        await authed(
          c.app,
          "patch",
          "/api/operator/slots/" + c.slot.id,
          c.customer,
        ).send({ capacity: 5, blackout: false })
      ).status,
      403,
    );
    const r = await hold(c);
    assert.equal(
      (
        await authed(
          c.app,
          "post",
          `/api/bookings/${r.body.id}/checkout`,
          c.operator,
        ).send({})
      ).status,
      404,
    );
    await c.db
      .prepare("UPDATE venues SET owner_id=? WHERE id=?")
      .run("admin", c.slot.venue_id);
    assert.equal(
      (
        await authed(
          c.app,
          "patch",
          "/api/operator/slots/" + c.slot.id,
          c.operator,
        ).send({ capacity: 5, blackout: false })
      ).status,
      403,
    );
  } finally {
    await c.db.close();
  }
});
test("QR check-in enforces time window and prevents replay", async () => {
  const c = await setup();
  try {
    const r = await hold(c);
    const b = (await confirm(c, r.body.id)).body.booking;
    assert.equal(
      (
        await authed(c.app, "post", "/api/operator/check-in", c.operator).send({
          code: b.qr_token,
        })
      ).status,
      409,
    );
    await c.db
      .prepare("UPDATE slots SET start_at=?,end_at=? WHERE id=?")
      .run(
        new Date(Date.now() - 60000).toISOString(),
        new Date(Date.now() + 3600000).toISOString(),
        c.slot.id,
      );
    assert.equal(
      (
        await authed(c.app, "post", "/api/operator/check-in", c.operator).send({
          code: b.qr_token + "tamper",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await authed(c.app, "post", "/api/operator/check-in", c.operator).send({
          code: b.qr_token,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await authed(c.app, "post", "/api/operator/check-in", c.operator).send({
          code: b.qr_token,
        })
      ).status,
      409,
    );
  } finally {
    await c.db.close();
  }
});
test("capacity reductions cannot displace bookings; blackouts block new holds", async () => {
  const c = await setup();
  try {
    await hold(c);
    assert.equal(
      (
        await authed(
          c.app,
          "patch",
          "/api/operator/slots/" + c.slot.id,
          c.operator,
        ).send({ capacity: 0, blackout: false })
      ).status,
      409,
    );
    assert.equal(
      (
        await authed(
          c.app,
          "patch",
          "/api/operator/slots/" + c.slot.id,
          c.operator,
        ).send({ capacity: 6, blackout: true })
      ).status,
      200,
    );
    assert.equal((await hold(c, "new-blackout-hold")).status, 409);
  } finally {
    await c.db.close();
  }
});
test("policy snapshots survive operator changes and support refunds are audited", async () => {
  const c = await setup();
  try {
    const r = await hold(c);
    await confirm(c, r.body.id);
    await authed(
      c.app,
      "patch",
      "/api/operator/venues/" + c.slot.venue_id,
      c.operator,
    ).send({ policy: "New policy for future customers only." });
    const b = await c.db
      .prepare("SELECT policy FROM bookings WHERE id=?")
      .get(r.body.id);
    assert.match(b.policy, /Cancel at least 2 hours/);
    const report = await authed(c.app, "post", "/api/support", c.customer).send(
      {
        bookingId: r.body.id,
        reason: "Seat unavailable",
        notes: "There was no seat available on arrival.",
      },
    );
    assert.equal(report.status, 201);
    assert.equal(
      (
        await authed(
          c.app,
          "post",
          "/api/admin/cases/" + report.body.id + "/resolve",
          c.admin,
        ).send({ action: "refund" })
      ).status,
      200,
    );
    assert.equal(
      (
        await c.db
          .prepare("SELECT status FROM bookings WHERE id=?")
          .get(r.body.id)
      ).status,
      "refunded",
    );
    assert.ok(
      (
        await c.db
          .prepare("SELECT id FROM audit_events WHERE action='refund'")
          .all()
      ).length,
    );
  } finally {
    await c.db.close();
  }
});
test("Pacific session times follow daylight saving", () => {
  assert.equal(localTime("2026-01-15", 10), "2026-01-15T18:00:00.000Z");
  assert.equal(localTime("2026-07-15", 10), "2026-07-15T17:00:00.000Z");
  assert.equal(localTime("2026-03-08", 8), "2026-03-08T15:00:00.000Z");
});
test("reject malformed date, policy bypass and invalid promotions", async () => {
  const c = await setup();
  try {
    assert.equal(
      (await request(c.app).get("/api/venues?date=2026-02-31")).status,
      400,
    );
    assert.equal(
      (
        await authed(c.app, "post", "/api/bookings", c.customer)
          .set("Idempotency-Key", "invalid-policy")
          .send({ slotId: c.slot.id, acceptedPolicy: false })
      ).status,
      400,
    );
    assert.equal(
      (
        await authed(c.app, "post", "/api/bookings", c.customer)
          .set("Idempotency-Key", "invalid-promo")
          .send({ slotId: c.slot.id, acceptedPolicy: true, promo: "FREE" })
      ).status,
      400,
    );
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

test("new cafés stay private until approved and only their owner gains access", async () => {
  const c = await setup();
  try {
    const response = await authed(
      c.app,
      "post",
      "/api/cafe-applications",
      c.customer,
    ).send({
      name: "Neighborhood Test Café",
      address: "100 Example St, San Francisco, CA",
      neighborhood: "Mission District",
      description:
        "A quiet space with reliable seating for a productive afternoon.",
    });
    assert.equal(response.status, 201);
    const id = response.body.id;
    assert.ok(
      !(await request(c.app).get("/api/venues?date=" + day)).body.some(
        (v) => v.id === id,
      ),
    );
    assert.equal(
      (
        await authed(
          c.app,
          "patch",
          "/api/admin/venues/" + id,
          c.customer,
        ).send({ status: "approved" })
      ).status,
      403,
    );
    assert.equal(
      (
        await authed(c.app, "patch", "/api/admin/venues/" + id, c.admin).send({
          status: "approved",
        })
      ).status,
      200,
    );
    assert.ok(
      (
        await authed(c.app, "get", "/api/operator?date=" + day, c.customer)
      ).body.some((v) => v.id === id),
    );
    assert.equal(
      (
        await authed(
          c.app,
          "patch",
          "/api/operator/venues/" + id,
          c.operator,
        ).send({ paused: true })
      ).status,
      403,
    );
  } finally {
    await c.db.close();
  }
});
