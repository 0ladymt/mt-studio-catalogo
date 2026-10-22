# Storage upload proof of concept

## Scope

This phase prepares a local, provider-neutral upload path. It does not configure
Cloudflare R2, create buckets, expose controls in the browser UI, upload real
packs, or mark any file as `ready`.

## Boundaries

- `ObjectStorage` is the provider-neutral boundary used by the BFF.
- `StorageUploadGateway` persists authorization, association, idempotency and
  audit through PostgreSQL RPCs.
- Permanent provider credentials remain server-side. A browser receives only a
  short-lived `PUT` URL for one generated object key and the required headers.
- `product_files.storage_status` stays `metadata_only` until the BFF obtains a
  trusted full-object inspection. A successful proof advances it only to
  `verified`; delivery readiness remains a separate future operation.

## HTTP contract

`POST /api/admin/files/:fileId/uploads`

- Requires a valid session, `catalog:write`, allowed Origin and CSRF proof.
- Accepts only `{ "requestId": "uuid" }`.
- Creates or replays one database-controlled transaction.
- Returns a short-lived URL, method, required headers and expiry. It never
  returns storage credentials, the expected checksum, or a private service key.

`POST /api/admin/storage-uploads/:uploadId/confirm`

- Has the same authorization requirements and strict request shape.
- Inspects the object through the server-side adapter.
- The browser cannot submit the observed size, checksum or verification state.
- Missing, altered or untrusted objects leave the commercial file
  `metadata_only` and produce a sanitized audit event.

## Local simulator guarantees

The local simulator signs the object key, content type, byte length and expiry
with a server-only random secret. It stores bytes privately, rejects expired or
tampered requests, refuses overwrites and calculates SHA-256 directly over the
stored complete object. Its inspection is therefore trusted for local tests.

It does **not** prove Cloudflare R2 compatibility, CORS behavior, R2 checksum
semantics, billing, multipart behavior, regional latency or provider outage
handling. The production server intentionally uses `unavailableObjectStorage`
until a real provider adapter is explicitly configured.

## R2 adapter prepared for a controlled proof

`R2S3Storage` uses the AWS S3-compatible client behind `ObjectStorage`, with
credentials supplied only through server environment variables. It is disabled
by default and refuses to start in `r2` mode when any private configuration is
missing or when the endpoint is not a Cloudflare account endpoint. No storage
credential is needed or accepted by the frontend.

The browser can write only `staging/<database-controlled-final-key>`. A trusted
Node process streams that object to a temporary file while calculating SHA-256
over every byte. Only an exact size and hash match is uploaded to the final key
with `If-None-Match: *`. The adapter downloads and hashes the final object once
more, then removes staging. An existing final key is accepted only when its
complete bytes match; any different object is a hard conflict. A browser URL can
therefore never overwrite the final object, even while the staging URL remains
valid. Staging itself may be replaced while its short-lived URL is valid; it is
never a deliverable object, and each finalization verifies one complete snapshot
before writing the protected final key.

This proof intentionally reads the fictitious object through the local trusted
verifier. It must not run on Railway for commercial packs until runtime, transfer
and timeout costs are measured and an asynchronous verifier is approved. R2
ETag, browser metadata and multipart checksum semantics are never treated as the
commercial full-file SHA-256.

Multipart can later extend the adapter without changing the commercial rules:
initiate, sign individual parts, complete, inspect, verify, finalize and audit.
Incomplete multipart uploads need a short lifecycle cleanup rule.

## Cost controls for the future proof

- Use a disposable private bucket and a bucket-scoped token.
- Configure low budget alerts before uploading.
- Test with a small fictitious file only.
- Delete the object, token and bucket after the proof if the provider is not yet
  approved for production.
- Do not route pack bytes through Railway during normal upload or download.

## Private local configuration for the real proof

Copy only the storage variables from `.env.example` into the existing ignored
root `.env.local`, fill them directly on the development computer, and change
`STORAGE_PROVIDER` to `r2`. Never place these values in `supabase/.env.local`,
browser code, command arguments, screenshots or chat. Keep the provider disabled
until the owner explicitly authorizes the external test.
