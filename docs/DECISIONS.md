# Product and implementation decisions

The linked proposal uses the name CupDesk and recommends delaying native apps. The user's direct instruction overrides both choices: the project is Wecapp and includes a real React Native app now.

## Scope

Implemented the paid-session marketplace pilot across customer, café operator, and admin views. The website and native app share one API and React Native feature UI. The web entry adds the public marketing sections; the native entry emphasizes discovery and bottom navigation.

The baseline's Expo/React/Express approach was retained instead of introducing Next.js, so the existing local setup remains familiar. The baseline database adapter was adapted, while the baby-care domain and Swift implementation were excluded.

## Defaults chosen without requiring more decisions

- A San Francisco neighborhood pilot, Pacific local session times, and four clearly fictional café profiles.
- Two-hour sessions with one seat and a flexible drink credit.
- Fixed protected allocation, initially six seats for the demo windows.
- A 17% application fee. Server-side pricing in integer cents.
- Full cancellation refunds at least two hours before the session; later venue failures go to support.
- A 30-minute payment window plus one minute before local hold expiration. A late successful payment after capacity has been released is refunded.
- Café owners submit profiles for approval, then manage their own venue. Admins approve supply and handle support.
- Hosted Stripe Connect destination charges, pending configuration and commercial approval.

## Verification boundary

The automated suite exercises SQLite and a signature-validating mock payment provider. The PostgreSQL adapter is implemented with conditional capacity updates and row locks, but no live PostgreSQL database was available for load/concurrency validation. Native iOS/Android bundles compile; no signing, native install, production payment, email delivery, or deployment was performed.

See the README for exact remaining release work. The application's demo must not be presented as a marketplace of actual operating cafés.
