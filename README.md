# Wecapp

A React Native app and responsive website for reserving productive work sessions at independent cafés. Built from the supplied café marketplace proposal, renamed from CupDesk to **Wecapp**, with the local Luna baby-care repository as the architectural baseline.

**Live pilot:** https://wecapp.vercel.app · **Public source:** https://github.com/sameerkhoja/wecapp

## Try it

Requires Node 22.21+ and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:5174**. Choose **Sign in → Explore as a customer**, **Café operator**, or **Support admin**. Local demo bookings do not charge money. Four illustrative San Francisco cafés are seeded automatically. Data persists in `data/wecapp.sqlite`.

For the React Native app, keep the API running and start Expo in another terminal:

```sh
npm run mobile
# Or launch an installed simulator:
npm run ios
npm run android
```

The app automatically uses Expo's development host at port 5174. Your phone and computer must share a network. Set `EXPO_PUBLIC_WECAPP_API_URL=http://YOUR_COMPUTER_IP:5174` if automatic detection does not work. Android emulator users can use `http://10.0.2.2:5174`. This project uses Expo SDK 54, matching the Luna baseline; use a compatible development client.

## What is implemented

- Responsive editorial website and native iOS/Android screens sharing React Native components. Native bottom navigation; web marketing sections, install manifest, and offline shell.
- Neighborhood/name search, date selection, amenity filters, sorting, café details, directions, saved spaces, and availability.
- Server-priced two-hour sessions, drink credits, policy acknowledgement, first-booking promo `FIRSTCUP`, expiring inventory holds, and retry keys.
- Local simulated checkout and an optional hosted Stripe Connect checkout adapter.
- Booking history, signed QR passes, manual codes, session countdown, cancellation, full refunds, and rebooking.
- Native QR camera scanner and role-protected server check-in with time-window validation and replay prevention.
- Café applications, admin approval/suspension, operator profiles and amenity verification, recurring daily windows, day-specific capacity and blackouts, pause/resume, arrivals, and estimated gross receipts.
- Stripe Express onboarding for café payouts when configured.
- Waitlist registration, structured feedback, support cases, controlled support refunds, transaction export, and an append-only application audit trail.
- Supabase email-code authentication, server-managed roles, development-only demo accounts, and native SecureStore token storage.
- SQLite for local development and PostgreSQL for production through the database adapter adapted from Luna.

## Baseline provenance

The architectural baseline is the Luna baby-care repository.

Wecapp preserves its React website + Express API + Expo app architecture, adapts its SQLite/PostgreSQL adapter and authenticated mobile request helper, and uses its Expo 54 / React Native 0.81 / React 19.1 dependency family. The domain schema, reservation service, marketplace views, design system, and payments are new. No Swift app, baby-care database, secrets, existing deployment IDs, or Luna production endpoints are included. The baseline repository was not modified.

The website and mobile UI live in `apps/mobile/App.tsx`; shared client utilities are in `src/`. Vite resolves browser-specific modules while Metro resolves native modules. This is a genuine React Native app, not a website wrapped in a web view.

## Verification

```sh
npm run check          # TypeScript, domain/API tests, web build
npm run export:mobile  # iOS and Android Hermes bundles
npm run test:browser   # With npm run dev already running and Chrome installed
```

Automated API coverage includes last-seat contention, idempotent holds, expiration, cancellation/refund capacity, role and ownership checks, check-in time restrictions, tampered/replayed QR tokens, inventory reductions, policy snapshots, support refunds, Pacific daylight-saving time, malformed inputs, signed payment webhooks, duplicate events, amount mismatches, and late-payment refunds.

Browser verification exercises discovery, saved cafés, date changes, checkout, the QR pass, cancellation, café pause/resume, the admin view, and a 390px phone layout. Screenshots are in `docs/`.

Native bundle export verifies compilation; it is not an App Store build or a substitute for physical-device tests of the camera, secure storage, accessibility, and payment return flow. The deployed Neon PostgreSQL database has passed catalog, login, reservation, demo checkout, and refund verification. Live Stripe/Connect credentials have not been exercised.

## Configure a real environment

Copy `.env.example` to `.env` and provide Wecapp-specific values. Do not reuse Luna's credentials or deployment.

- `DATABASE_URL`: dedicated PostgreSQL database with TLS. Production refuses to start with file-based storage.
- `SESSION_SECRET`: at least 32 random characters used to sign booking passes. Keep it stable across server restarts and instances.
- `APP_URL`: the final HTTPS website origin.
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`: dedicated Supabase Auth project. Configure the email template to show the OTP token (`{{ .Token }}`). Customer accounts are created on verified sign-in.
- `ADMIN_EMAILS`: comma-separated trusted administrator email addresses. These addresses get the admin role on their first verified sign-in. Existing role changes require database administration. Customer-provided metadata never controls roles.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`: Stripe test values first. Register `/api/payments/webhook` for `checkout.session.completed`, `checkout.session.expired`, and `refund.updated` events.
- `EXPO_PUBLIC_WECAPP_API_URL`: the same HTTPS API origin when building the native release.
- `EXPO_PUBLIC_WECAPP_ENV=production`: rejects insecure native API URLs.

With hosted demo mode disabled, a new production database starts with no sample users or cafés. Sign in as an admin, have a café owner submit an application, approve it, and have the owner sign in again to access their dashboard. Configure genuine café photos, amenities, capacity, price, drink credit, and payout onboarding before accepting live bookings.

```sh
npm run build
npm start
```

Deploy the Express application and its built `dist/` directory together on a Node host. It serves both the website and API. The supplied `eas.json` supports internal and production native builds; configure your own Expo project, developer accounts, signing, and API URL before using EAS. Vercel deployment configuration is included. Payment activation and native store submission are separate release steps.

## Deliberate pilot choices and remaining launch work

This is a working pilot implementation, not a claim that every growth-stage item in the proposal is complete.

- Initial catalog is San Francisco; session times use `America/Los_Angeles`. Sessions are fixed at two hours, one seat per booking, with daily windows. Weekly recurrence rules, other timezones/cities, variable durations, and extensions are future work.
- The platform fee is 17%, rounded to integer cents; `FIRSTCUP` is a $2 discount for a first reservation. These are configurable product assumptions in server code, not commercial terms. Taxes and processing-cost allocation need business configuration before live payments.
- Stripe uses card-only hosted destination-charge checkout. Only a verified signed webhook confirms a live payment. Local demo checkout is explicitly labeled. Partial refunds, dispute automation, provider reconciliation jobs, and failed-refund recovery are not implemented.
- Confirmation and availability refresh within the app. Waitlist registration is stored, but transactional email, push notifications, waitlist promotion, reminder delivery, analytics providers, and monitoring vendors are not connected.
- Discovery uses local text and amenity filters. Walking times are labeled illustrative; directions open a maps provider. There is no live geolocation, geocoding, distance calculation, or interactive map.
- Profiles accept HTTPS photo URLs; photo upload/storage and staff invitations are not implemented. The pilot has one owner per café and a manually approved supply process.
- Capacity and booking writes are enforced on the trusted API. Configure database isolation/network access, least-privilege credentials, backups, and a shared ingress rate limiter for production. Direct client database access is not used.
- The service worker caches only the public application shell/assets. It never caches bookings, authentication, payments, or live inventory. Offline mode cannot reserve seats.
- Retention, account export/deletion workflows, production privacy terms, accessibility audit, merchant-of-record responsibility, and tax treatment remain launch work.

## Reference sources

- Expo SDK 54 compatibility: https://docs.expo.dev/versions/v54.0.0/
- React Native web support: https://docs.expo.dev/workflow/web/
- Stripe destination charges: https://docs.stripe.com/connect/destination-charges
- Demo imagery is loaded from Unsplash image URLs. It is illustrative, not actual photography or verified information about the named demo businesses. Fonts use Google Fonts on the website and system typography on native.

### Dependency audit

The build tools were audited on September 13, 2026. Compatible PostCSS and UUID fixes are pinned through npm overrides. Eight remaining high-severity audit entries trace to the same `image-size` denial-of-service advisories in Expo 54/Metro's development asset-processing chain. `npm audit` proposes an Expo major upgrade, which would depart from the requested baseline. No uploaded image parsing is exposed by this application's API. Treat an Expo upgrade and a clean dependency review as release work; do not expose the development bundler publicly.

## Vercel deployment

The public repository is https://github.com/sameerkhoja/wecapp.

`api/index.mjs` initializes the API once per warm Vercel function. `vercel.json` serves the Vite build and routes `/api/*` to that function. The project uses Node 22 and a separate persistent PostgreSQL database. Secrets are managed through Vercel environment variables and are excluded from Git.

The hosted pilot uses `WECAPP_DEMO=true`: all accounts and transactions are demonstrations shared between visitors. Do not enter personal data. This mode refuses to start when real authentication or payment services are configured. Disable it and configure production services before onboarding real customers.

GitHub Actions runs the application checks on pushes and pull requests. To deploy manually after configuring the project, run `npx vercel --prod`.
