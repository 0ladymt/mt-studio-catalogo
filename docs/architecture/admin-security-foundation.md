# MT Studio — administrative security foundation

This phase adds authorization and audit foundations only. It does not expose
catalog mutations, connect the draft panel, upload files, or grant a real user
administrative access.

## Authorization boundary

Every protected administrative request is authorized independently:

1. The existing `SessionManager` validates the HttpOnly session.
2. The BFF derives the UUID from that validated identity.
3. A server-only Supabase client reads `staff_members` by that UUID.
4. The reusable `requireStaff` middleware requires an active membership and
   all permissions declared by the route.
5. Missing, disabled, revoked, or insufficient memberships are denied by
   default.

Client parameters, headers, profile names and editable Auth metadata are never
authorization inputs. The service-role key is optional for public/auth-only API
startup, but administrative authorization fails closed when it is absent. It
must exist only in the private BFF environment and must never be bundled into
browser code, logged, committed, or returned by an endpoint.

## Permission matrix

| Permission | owner | admin | catalog_manager | support |
| --- | --- | --- | --- | --- |
| `admin:access` | yes | yes | yes | yes |
| `staff:manage` | yes | no | no | no |
| `catalog:read` | yes | yes | yes | no |
| `catalog:write` | yes | yes | yes | no |
| `catalog:publish` | yes | yes | yes | no |
| `support:read` | yes | yes | no | yes |
| `audit:read` | yes | yes | no | no |

This matrix is server code. Future routes must list their required permissions;
merely reaching `#admin` never grants access. Future staff-management routes
must require `staff:manage`, which is intentionally owner-only. They must also
prevent an owner from removing the last active owner.

## Audit trail

`admin_audit_log` is append-only and private from `anon` and `authenticated`.
The server role can only select and insert; a trigger rejects updates and
deletes. Future commercial mutations must write a sanitized audit record in the
same database transaction as the protected operation.

Audit snapshots must never contain passwords, OTPs, access or refresh tokens,
OAuth codes, service keys, complete private storage keys, or raw pack contents.
The historical actor UUID is not a foreign key so deleting an Auth account
cannot erase or block preservation of its audit trail.

## Controlled first-owner bootstrap

No application startup, signup, OAuth callback, profile trigger, seed, or UI
action grants staff membership. Bootstrap is a manual per-environment operation:

1. Stop and confirm the intended environment (development, staging, or
   production). Never infer it from a browser session.
2. In the trusted Supabase administration surface, locate the confirmed Auth
   user and compare its UUID with the UUID shown by the authenticated BFF
   session. Do not use e-mail alone as authority.
3. Obtain explicit owner approval for that exact UUID and environment.
4. In a transaction, verify there is no existing staff row, insert one
   `staff_members` row with `role = 'owner'`, `status = 'active'`, and
   `created_by = null`, then insert a sanitized bootstrap audit record using a
   fresh request UUID.
5. Query both records, commit only if the UUID and role are exact, then test
   `GET /api/admin/access` in a fresh request.
6. Record the operational approval outside the repository. Never paste a
   service-role key or user session token into documentation or chat.

The bootstrap SQL is intentionally not automated or embedded in a migration.
Subsequent staff changes require the future owner-only BFF workflow and its
transactional audit record.

## Production limitations

- Local and production service-role keys must be different and independently
  rotated.
- Deployment logs and error monitoring must redact authorization and cookie
  headers.
- Administrative rate limits need shared atomic storage before horizontal
  scaling.
- Audit retention, export and monitoring policies still require an operational
  decision.
- Product CRUD and publication should use database transactions or restricted
  server-only functions so state changes and audit inserts cannot diverge.
