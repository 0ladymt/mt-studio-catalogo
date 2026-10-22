# Trusted storage verification worker

## Scope

The first worker is a local administrative CLI. It is intentionally separate
from the browser and uses the same streaming core that a future on-demand job
can import. It never marks a file `ready`; successful verification advances
only from `metadata_only` to `verified` through a privileged transactional RPC.

## Authorization

`npm run storage:verify -- <storage-upload-uuid>` accepts only a non-secret
upload identifier. The operator identity is derived from a short-lived
Supabase access token stored as `STORAGE_VERIFIER_ACCESS_TOKEN` in the ignored
`.env.local`. The token is validated by Supabase Auth, and PostgreSQL then
revalidates the resulting UUID against active `staff_members` with
`catalog:write`. A UUID supplied by the operator is never accepted as proof of
authorization. The service-role and storage credentials stay in the private
environment and are never command-line arguments.

For normal application operation, `STORAGE_PROVIDER=disabled` remains the
default. A controlled verification run must enable the provider only in its
private process environment. Output contains status and sanitized failure
codes only—never credentials, signed URLs, object keys, tokens or hashes.

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
core and job RPCs. It needs shared private environment variables and the same
short-lived/managed worker identity model; it must not embed an operator UUID.
Multipart/resumable upload, automated staging cleanup, `verified` to `ready`,
customer downloads and product publication are outside this phase.
