# Trusted storage verification worker

## Scope

The first worker is a local administrative CLI. It is intentionally separate
from the browser and uses the same streaming core that a future on-demand job
can import. It never marks a file `ready`; successful verification advances
only from `metadata_only` to `verified` through a privileged transactional RPC.

## Authorization

`npm run storage:verify -- <storage-upload-uuid>` accepts only a non-secret
upload identifier. The CLI generates a 256-bit secret in memory, sends only
its SHA-256 to the loopback BFF and prints a local consent URL. The operator
opens that URL and approves with the existing HttpOnly session, explicit
`catalog:write` authorization, Origin and CSRF protection. PostgreSQL binds the
short-lived approval to exactly one upload. The CLI consumes it once using the
in-memory secret. No Supabase token, cookie, service key or operator UUID is
copied into a command, browser form or terminal history.

The authorization expires after three minutes, is replay-resistant and can be
revoked before consumption. PostgreSQL revalidates active staff both on
approval and consumption. Creation and consumption are enabled only in local
development/test, reject browser Origin headers and are rate-limited. A UUID
supplied by the operator is never accepted as proof of authorization.

The CLI polls at ten-second intervals so a three-minute authorization stays
below the loopback BFF fixed-window limit. HTTP 429 and temporary connection
failures are treated as transient only until the authorization deadline; they
do not extend it, create a second authorization or bypass explicit consent.

For normal application operation, `STORAGE_PROVIDER=disabled` remains the
default. A controlled verification run must enable the provider only in its
private process environment. Output contains status and sanitized failure
codes only—never credentials, signed URLs, object keys, tokens or hashes.

If the CLI is interrupted after consumption, its job lease expires after five
minutes. A new run requires fresh browser consent and may recover the job; the
previous worker cannot finish after recovery. Heartbeats every minute keep
legitimate long operations alive. Three claims are the hard retry cap.

## Streaming and immutable finalization

Verification performs three bounded streaming passes:

1. GET staging and calculate the complete SHA-256 and byte count.
2. If both match, GET staging again and stream it into a conditional final PUT
   with `If-None-Match: *`.
3. GET final and calculate its complete SHA-256 and byte count again.

Only after the third pass succeeds is staging deleted and PostgreSQL updated.
No ETag, browser metadata or client-declared result is trusted. The normal
path uses no temporary file and keeps only stream buffers in memory.

Defaults are a 5 GiB maximum object, 30-minute timeout, one CLI verification at
a time, a five-minute renewable lease, and at most three attempts. These are
safe initial bounds for the 260 MiB pack and may be tightened per deployment.

## Recovery and concurrency

`storage_verification_jobs` records `pending`, `verifying`, `completed`,
`failed` and `expired` states, attempts, lease owner/expiry, heartbeat,
observed size/hash and a sanitized failure code. Claim and finish RPCs lock the
job row. A second worker cannot claim a live lease; an expired lease can be
recovered. A stale worker cannot finish after another worker has recovered the
job. The upload confirmation and its commercial audit remain transactional.

Interrupted reads, timeouts and integrity mismatches leave the file at
`metadata_only` and never replace a final object. Final commercial objects are
never cleanup targets. Abandoned staging cleanup and multipart uploads remain
future, separately approved work.

## Future job compatibility

An on-demand Railway worker can reuse the storage adapter, streaming integrity
core and job RPCs. In production it must use a dedicated server-side service
identity with narrowly scoped verification permission and short-lived job
credentials issued by the BFF or a trusted scheduler. That identity must be
stored in the deployment secret manager, independently revocable, bound to one
job/upload and recorded in the audit log. It must not reuse a personal browser
session, the local consent endpoint, a copied Supabase token or an embedded
operator UUID. The local CLI endpoints remain disabled outside development and
test.
Multipart/resumable upload, automated staging cleanup, `verified` to `ready`,
customer downloads and product publication are outside this phase.
