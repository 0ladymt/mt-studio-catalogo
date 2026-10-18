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

## Known local environment limitation

On Docker Desktop for Windows, the optional Supabase `vector` container may
restart because it cannot reach Docker's internal log endpoint at
`192.168.65.254:2375`. PostgreSQL, Auth, REST, Studio, migrations, RLS tests,
and the API validation remain operational. This affects local log collection,
not authentication or database authorization.

Do not enable an unauthenticated Docker Engine TCP endpoint as a workaround.
Keep this limitation open until it can be resolved through a supported Docker
Desktop or Supabase CLI configuration.
