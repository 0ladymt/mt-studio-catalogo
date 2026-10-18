# MT Studio — authentication foundation (phase 1)

This phase is deliberately isolated from the approved public website. It adds a
versioned database foundation and a small BFF without adding login screens,
checkout, Google OAuth, Pix, downloads, or production configuration.

## Trust boundaries

- Supabase Auth owns passwords, identities, access tokens, and refresh tokens.
- `public.profiles` stores non-secret profile information only.
- The API derives the user ID from a verified access token. It never accepts a
  client-provided user ID as authorization.
- The publishable key is used with the user's token so PostgreSQL RLS remains
  active. Privileged keys are not required by this phase.
- Future privileged operations must use a separate server-only client and must
  never be imported by browser code.

## Local commands

Docker Desktop is required by the Supabase CLI local stack.

```text
npm run db:start
npm run db:reset
npm run test:db
npm run typecheck
npm run test:api
npm run test:site
```

Copy `.env.example` to `.env.local` only after the local stack prints its local
URL and publishable key. `.env.local` is ignored by Git.

## Environments

Development, staging, and production must use separate Supabase projects,
secrets, OAuth callbacks, API deployments, and databases. Migrations progress in
that order. Production data and credentials must never be used by automated
tests.

## Future cookie sessions

The current middleware accepts a Bearer token to make the authorization boundary
testable without adding a login UI. The next auth phase will exchange verified
auth callbacks for `HttpOnly`, `Secure`, appropriately `SameSite` cookies in a
same-origin BFF. No refresh token should be exposed to page JavaScript.

## Cookie session core (phase 2.1)

The BFF owns access and refresh tokens in host-only `HttpOnly` cookies scoped to
`/api`. A separate non-HttpOnly CSRF cookie is checked against the
`X-CSRF-Token` header with a constant-time comparison for mutating requests.
Allowed origins are explicit and credentialed CORS never reflects an unknown
origin.

Cookies use `SameSite=Lax`; `Secure` is required in staging and production and
disabled only for local HTTP development. Refresh rotation is serialized per
refresh-token hash inside an API process so concurrent requests do not perform
multiple rotations. A distributed deployment will need a shared single-flight
or session store before horizontal scaling. Completed rotations remain in the
single-process cache for five seconds to cover requests that began with the old
cookie immediately after another request rotated it.

`GET /api/auth/session` reports only authentication state and the verified user
ID. `POST /api/auth/logout` requires both an allowed Origin and valid CSRF proof,
revokes the Supabase session, and clears all cookies. The existing Bearer path
on `GET /api/profile` remains temporarily available for compatibility with
foundation tests; browser-facing authentication uses cookies only.

## Known local environment limitation

On Docker Desktop for Windows, the optional Supabase `vector` container may
restart because it cannot reach Docker's internal log endpoint at
`192.168.65.254:2375`. PostgreSQL, Auth, REST, Studio, migrations, RLS tests,
and the API validation remain operational. This affects local log collection,
not authentication or database authorization.

Do not enable an unauthenticated Docker Engine TCP endpoint as a workaround.
Keep this limitation open until it can be resolved through a supported Docker
Desktop or Supabase CLI configuration.

## Email signup core (phase 2.2)

Traditional signup is handled only by the BFF. It normalizes email addresses,
enforces a 12–128 character password with upper- and lowercase letters, a
number, and a symbol, and returns the same accepted response for new and
already-known accounts. No session cookie is issued before email confirmation.

Local confirmation uses a six-digit OTP delivered to Mailpit and submitted by
`POST`, avoiding auth tokens in application URLs and preventing link-prefetch
software from consuming the confirmation. Successful verification sessions are
immediately revoked; the customer must use the future login endpoint.

`GET /api/auth/csrf` returns a non-secret double-submit proof and sets the
matching `mt_csrf` cookie. Its `/api` path is unchanged. Future pages keep the
returned proof in memory and send it in `X-CSRF-Token` with
`credentials: include`; access and refresh cookies remain inaccessible to
JavaScript.

Signup and resend throttles are intentionally in-memory for the single-process
local phase. A shared, atomic rate-limit store plus trusted proxy IP handling is
required before horizontal scaling or production deployment.

The local Supabase email and Auth limits are raised only to keep integration
tests deterministic and its minimum email interval is one second. Hosted
environments must define independent provider limits; the local values are not
a production recommendation. BFF limits remain active during local tests.

## Password login core (phase 2.3)

`POST /api/auth/login` validates and normalizes credentials, then authenticates
server-side with Supabase Auth. Successful sessions are passed to the existing
`SessionManager`, which rotates the CSRF proof and emits the established
HttpOnly cookies. Tokens are never returned in JSON.

Unknown accounts and wrong passwords share the `invalid_credentials` response.
An unconfirmed account is reported only after Supabase validates the matching
credentials. Existing valid cookie sessions are not replaced, preventing login
from being used to overwrite an active identity.

Identical concurrent login attempts are single-flighted by a SHA-256 hash of
the normalized email and password. The in-memory login rate limits are eight
attempts per email and sixty total attempts per 15 minutes for this single API
process. A shared atomic limiter is required before production scaling.

## Password recovery (phase 2.5)

Recovery uses a six-digit Supabase recovery OTP instead of a session-bearing
URL. The BFF accepts the email and OTP, updates the password server-side and
immediately performs a global Supabase logout. No recovery session or token is
returned to the browser.

Global logout revokes the account's refresh-token family. Already issued JWT
access tokens remain valid until their short configured expiry because they are
stateless. Immediate access-token invalidation would require a server-side
session/version registry and is a production hardening decision.

Recovery requests return the same accepted response for existing and missing
accounts. Local in-memory limits allow three requests per email and thirty
globally per 15 minutes; reset attempts allow five per email per 15 minutes.
Production requires an atomic shared limiter.
