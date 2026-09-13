import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5174");
await page.getByRole("button", { name: "Sign in ↗" }).click();
await Promise.all([
  page.waitForResponse(
    (response) =>
      response.url().includes("/api/bookings") && response.status() === 200,
  ),
  page.getByRole("button", { name: "Explore as a customer" }).click(),
]);
await page
  .getByRole("button", { name: "View Ritual & Room", exact: true })
  .waitFor();
if (
  await page
    .getByRole("button", { name: "Save Ritual & Room", exact: true })
    .count()
)
  await page
    .getByRole("button", { name: "Save Ritual & Room", exact: true })
    .click();
await page.getByRole("button", { name: "SAVED SPACES", exact: true }).click();
await page.getByRole("heading", { name: "Your usual spots." }).waitFor();
await page
  .getByRole("button", { name: "View Ritual & Room", exact: true })
  .waitFor();
await page.waitForTimeout(150);
assert.equal(
  await page
    .getByRole("button", { name: /^View (Ritual|Form|Sunday|Chapter)/ })
    .count(),
  1,
);
console.log("Saved view reached");
await page
  .getByRole("button", { name: "View Ritual & Room", exact: true })
  .click();
await page.getByRole("button", { name: /WHEN/ }).click();
await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
await page.getByRole("button", { name: "Reserve this seat" }).click();
await page.getByRole("checkbox").click();
await page.getByRole("button", { name: "Confirm demo reservation" }).click();
await page.getByText("Show this pass to café staff when you arrive.").waitFor();
await page.screenshot({ path: "docs/booking-pass.png", fullPage: true });
await page
  .getByRole("button", { name: "Cancel reservation", exact: true })
  .click();
await page
  .getByRole("button", { name: "Confirm cancellation", exact: true })
  .click();
await page.getByText("REFUNDED", { exact: true }).first().waitFor();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Close dialog" }).last().click();
await page.getByRole("button", { name: "Alex ↗" }).click();
await page.getByRole("button", { name: "Switch demo role" }).click();
await page.getByRole("button", { name: "Café operator", exact: true }).click();
await page.getByRole("heading", { name: "Behind the counter." }).waitFor();
await page.getByRole("button", { name: "Pause reservations" }).click();
await page.getByRole("button", { name: "Resume reservations" }).waitFor();
await page.getByRole("button", { name: "Resume reservations" }).click();
await page.screenshot({ path: "docs/operator.png", fullPage: true });
await page.getByRole("button", { name: "Jamie ↗" }).click();
await page.getByRole("button", { name: "Switch demo role" }).click();
await page.getByRole("button", { name: "Support admin" }).click();
await page.getByRole("heading", { name: "Marketplace desk." }).waitFor();
await page.screenshot({ path: "docs/admin.png", fullPage: true });
const phone = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  deviceScaleFactor: 2,
});
phone.on("pageerror", (e) => errors.push(e.message));
await phone.goto("http://localhost:5174");
await phone
  .getByRole("button", { name: "View Ritual & Room", exact: true })
  .waitFor();
assert.ok(
  await phone.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
);
await phone.screenshot({ path: "docs/mobile-web.png", fullPage: true });
await phone.getByRole("button", { name: "Open menu" }).click();
await phone.getByRole("button", { name: "Sign in", exact: true }).click();
await phone.getByRole("button", { name: "Explore as a customer" }).click();
await phone
  .getByRole("button", { name: "View Ritual & Room", exact: true })
  .click();
await phone.getByRole("button", { name: "Reserve this seat" }).waitFor();
await phone.screenshot({ path: "docs/mobile-detail.png", fullPage: true });
assert.deepEqual(errors, []);
console.log(
  "PASS: discovery, saved venues, date change, checkout, QR pass, cancellation, operator pause, admin, mobile layout. No browser runtime errors.",
);
await browser.close();
