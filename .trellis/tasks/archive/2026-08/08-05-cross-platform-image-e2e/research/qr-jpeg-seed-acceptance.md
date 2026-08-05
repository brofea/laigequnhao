# Research: QR JPEG pipeline and local seed acceptance

- Query: Planning implications of changing the repository’s QR image pipeline from PNG to JPEG, including the browser `Canvas.toBlob` quality ladder (`0.90` start, `0.10` decrement, bounded attempts), purpose-specific server MIME/storage/content-type contracts, and the requirement that every planned local seed group and asset is persisted and retained.
- Scope: mixed
- Date: 2026-08-05

## Final decision update

- The product decision is now fixed: QR encoding attempts exactly three times at `0.90 → 0.80 → 0.70`; three over-limit results fail with the existing QR Toast.
- The implementation is no longer PNG-only for all assets: Logo remains alpha PNG, while QR is purpose-specific JPEG with `.jpg`, `image/jpeg`, and a 1MB limit.
- The implementation now performs a fail-closed seed readback audit. The final local run completed with `140 groups, 140 logos, 78 QRs`; D1 references/ref counts, R2 objects, public MIME/body/format/size and alpha PNG checks passed, and the state was retained.
- The previously open attempt-count, “no seed evidence,” and “current production path is PNG-only” caveats below are historical planning notes and are superseded by this decision/update.

## Findings

### Executive conclusion

The repository currently has a single final-image contract: both `logo` and `qr_code` are PNG. A QR-only JPEG change therefore cannot be implemented as a string replacement of `image/png`; it needs a purpose-discriminated contract while leaving Logo PNG behavior intact unless the product decision is broader than QR.

The highest-risk boundary is silent partial success. The current seed script plans 140 groups, but catches individual upload failures, conditionally omits missing logo/QR references from generated SQL, and prints success after the SQL command exits. A JPEG migration should make the plan manifest authoritative, fail before SQL application when any required asset is missing or invalid, and perform a post-commit D1/R2/readback audit. “The upload endpoint returned 201” or “the SQL command exited 0” is not seed acceptance.

### Current repository contract and change surface

| Boundary | Current behavior | QR-JPEG planning implication |
|---|---|---|
| Shared policy | `shared/contracts/asset.ts:12-14` exports one `ASSET_CONTENT_TYPE = "image/png"`; `assetUploadMetaSchema` and `assetInfoSchema` use a PNG literal at `:61-68,132-142`. | Make the content type a purpose-specific mapping or discriminated schema: Logo remains `image/png`, QR becomes `image/jpeg`. Do not widen the schema to any image MIME, or invalid cross-purpose combinations will pass. |
| Browser output | `src/shared/browser/image-compression.ts:264-275` calls `toBlob` once with `image/png`, then checks MIME and PNG signature; `:321-368` rejects an oversized result and creates a preview only after acceptance. | QR must call `toBlob(callback, "image/jpeg", quality)` through a bounded ladder and verify actual JPEG bytes before preview/upload. Keep the current “no preview/no upload on failure” lifecycle. |
| Admin multipart | `src/features/admin/api.ts:60-86` sends `file` plus `purpose`; QR is currently named `qr.png`, Logo `logo.png`. | QR filename and part type should become the canonical JPEG form (for example `qr.jpg` + `image/jpeg`) and tests should assert both the part declaration and returned asset metadata. Filename is not validation; server bytes still need format validation. |
| Upload route | `functions/_lib/routes/admin-assets.ts:142-152` requires the global PNG MIME and calls `validatePngUpload`. | Select the expected MIME and validator from `purpose`; reject a QR PNG and a Logo JPEG at the HTTP boundary. Preserve request/body byte limits before image decoding. |
| Image validator | `functions/_lib/services/image-validation.ts:8-35,77-217` parses PNG signature/chunks/IHDR; `:231-287` fully decodes with Photon and checks QR alpha. | Add a JPEG validation path with actual structure/decode and the same dimension/byte limits. Do not route JPEG through the PNG parser. Preserve the QR opaque/white-background invariant by checking decoded pixels if the decoder exposes RGBA. |
| D1 asset row | `migrations/0002_admin_group_management.sql:6-20` has `content_type` defaulting to PNG. | Existing PNG rows must not be relabeled as JPEG. Use the stored purpose/content type for new rows, and decide whether old QR PNG assets are grandfathered, re-encoded, or migrated before changing public behavior. |
| R2 write/key | `functions/_lib/services/asset-service.ts:110-131` hard-codes `${purpose}/${id}.png`, inserts `content_type = 'image/png'`, and uploads `ASSET_CONTENT_TYPE`; `functions/_lib/adapters/r2-adapter.ts:18-27` writes the passed content type to R2 metadata. | QR keys need one canonical suffix (`.jpg` or `.jpeg`) and the same purpose-specific content type must be used in D1 and `R2.put(..., { httpMetadata: { contentType } })`. Avoid deriving a MIME from an arbitrary client filename. |
| Public response | `functions/_lib/app.ts:45-61` serves any key but hard-codes `Content-Type: image/png`. | The route must return the correct server-owned type for a QR JPEG and a Logo PNG. Either resolve accepted key metadata from D1 or copy trusted R2 HTTP metadata with `R2Object.writeHttpMetadata()` while retaining `nosniff` and cache headers; never leave the PNG constant in this route. |
| Group adoption | `functions/_lib/routes/admin-groups.ts:188-296,367-487` validates staged Logo/QR assets and passes IDs/keys to repository operations. `functions/_lib/repositories/group-repository.ts:589-600,827-849` changes staged assets to `ready` and adjusts `ref_count` in the aggregate batch. | The adoption transaction is format-agnostic, but acceptance must assert that every planned QR asset reaches `ready`, is joined to its intended group, and has `ref_count` equal to actual references. A ready D1 row without a retained R2 object is still a failure. |

The installed `@cf-wasm/photon` is `0.4.0` (`package.json:46-49`, lockfile entry at `pnpm-lock.yaml:135,3069-3071`). Its package README documents `PhotonImage.new_from_byteslice` and `get_bytes_jpeg(quality)` for JPEG handling. A local Node smoke check using the installed package decoded a generated JPEG into the expected dimensions/RGBA byte count; production confidence still requires a Workers integration test because the code imports `@cf-wasm/photon/workerd`.

### Browser `toBlob` quality ladder

The current implementation intentionally has no quality ladder: the test at `src/shared/browser/image-compression.spec.ts:141-146` asserts that `startQuality` and `qualityStep` are absent, and the encoder is called once at `:264-275`. A QR JPEG change must replace that test contract explicitly.

Recommended behavior for the QR path:

1. Define named constants for the ladder start, decrement, lower bound, and maximum attempts. A concrete bounded default is nine candidates `0.90, 0.80, …, 0.10`; if the product wants to include legal quality `0.00`, make that an explicit ten-attempt contract rather than an accidental loop condition. Round each computed quality to two decimals so floating-point subtraction cannot produce values such as `0.799999999` in calls or logs.
2. Draw the QR canvas onto an opaque white background before encoding, as the current QR branch does at `src/shared/browser/image-compression.ts:338-348`. JPEG has no alpha channel; the white background is therefore part of the visual and QR-decoding contract, not merely a PNG workaround.
3. For each bounded attempt, call `canvas.toBlob(resolve, "image/jpeg", quality)`. Treat a thrown error, `null` callback, wrong `blob.type`, or non-JPEG byte stream as an encoding failure. Do not use PNG fallback or `toDataURL` as a hidden compatibility path.
4. The HTML Standard and MDN state that an unsupported requested type falls back to `image/png`, and that `quality` is a 0–1 value for formats such as JPEG. Therefore checking only that the callback returned a Blob is insufficient: a WebKit/Firefox regression that returns PNG would otherwise reach a JPEG-only server and fail late. Verify MIME plus actual bytes; `Blob.type` itself is not a byte-level validator.
5. Accept the first valid JPEG at or below the QR byte limit. Do not create an object URL for attempts that are over the limit; only create the preview URL for the selected final Blob. If every attempt is too large, return the existing `OUTPUT_TOO_LARGE` failure path and leave no pending QR Blob. If encoding never produces a valid JPEG, surface the existing QR compression failure message rather than uploading a PNG.
6. Keep `ImageBitmap.close()` and input object-URL cleanup in the existing `finally` path (`image-compression.ts:331-371`). A quality ladder increases asynchronous callbacks and memory pressure, so tests should assert cleanup after success, all-over-limit failure, callback `null`, wrong-format fallback, and thrown encoder errors.

The quality ladder is a size heuristic, not a QR correctness guarantee. JPEG quality can make a visually acceptable image undecodable because of ringing, chroma subsampling, or resampling. Browser tests must decode the final preview and the persisted final object with `jsQR`; a size pass alone is insufficient. If a low quality candidate is under 1 MiB but fails QR decoding, the implementation needs an explicit “continue to the next candidate / reject” policy. The current requested ladder is descending, so “first under size” should not bypass a QR decode check if machine readability is part of acceptance.

### Server MIME, storage key, and content-type contracts

The server should maintain one source of truth such as `contentTypeByPurpose = { logo: "image/png", qr_code: "image/jpeg" }`, then use it consistently at every boundary:

- Request validation: after parsing `purpose`, compare the multipart file’s declared MIME with the expected purpose MIME, then validate the bytes. The declared type is an early rejection only; MDN warns that `Blob.type` is generally not sufficient as a sole validation scheme.
- Structure/decode validation: retain the PNG parser for Logo; add a JPEG validation path for QR with actual structure/decode and the same dimension/byte limits. For JPEG, a robust accepted result should have a valid JPEG stream and decoder dimensions matching the stored metadata. A JPEG decoder’s RGBA output should be all alpha 255 if the service keeps the existing explicit opaque check.
- D1: store the actual expected `content_type` per asset row, not a global default or a client-supplied value. `AssetInfo`/admin DTO schemas need a purpose/content-type relationship so a QR response cannot claim PNG and a Logo response cannot claim JPEG.
- R2: pass the same server-derived type into `R2.put`. Cloudflare’s Workers API documents that `put` stores object metadata, `httpMetadata.contentType` is the HTTP content type field, and `writeHttpMetadata` applies stored metadata to response headers. This supports an end-to-end assertion that D1 `content_type`, R2 metadata, and the public HTTP response are identical.
- Key: choose and freeze one QR suffix (`.jpg` is a reasonable canonical choice) and update `asset-service.ts`, admin multipart filenames, seed SQL, tests, and any URL assertions together. A `.jpg` suffix is a naming convention, not validation; the content type and decoded bytes remain authoritative. Keep IDs random/unique so a failed retry cannot overwrite a previous object.
- Public serving: remove the unconditional `image/png` header in `functions/_lib/app.ts:57-60`. The response must distinguish the two accepted formats. If the route continues to avoid a D1 lookup, the accepted key namespace/purpose and R2 metadata must be covered by tests; if it uses `writeHttpMetadata`, preserve the app’s explicit cache and `X-Content-Type-Options: nosniff` headers.
- Compatibility: do not mutate old QR PNG rows or `.png` keys by changing only a constant. If old assets remain, the DTO and public route need to support their recorded PNG type until they are re-encoded/replaced. If the decision is a clean break, document the migration/reseed step and verify no old QR rows or objects remain.

The main cross-layer tests should assert the same object at multiple points: browser preview Blob, multipart file part, upload response, D1 asset row, R2 `head` metadata, public GET headers/body, and the group’s adopted reference. Existing tests already use this pattern for PNG at `tests/workers/admin-assets.spec.ts:197-249`; the JPEG tests should be purpose-aware rather than simply replacing a fixture’s extension.

### Local seed: required acceptance gate

The seed script currently states “all 140 groups have avatars” (`scripts/seed-local.mjs:9-14`) and sets `GROUP_COUNT = 140` (`:23`), but its implementation does not enforce that statement:

- `downloadAndProcess` downloads from external URLs and returns only successful images (`:219-266`). The plan uses `images.length` and cycles image indexes (`:281-326`), so the number of source images is not itself a stable 140-asset manifest.
- The QR plan is random (`:304-313`), so the QR count is not fixed. The currently generated `seed-local.sql` contains 140 group inserts, 140 Logo asset upserts, and 47 QR asset upserts; that count is a sample, not a stable contract.
- `uploadAll` catches Logo and QR upload/compression failures and continues (`:383-436`). `generateSQL` then conditionally writes Logo references (`:496-510`) and QR join methods (`:518-526`), which can create groups with missing images while still producing SQL.
- `uploadViaApi` currently sends PNG Blob/file metadata (`:347-366`), `assetUpsertSql` hard-codes `image/png` (`:440-445`), and the SQL file stores the returned staged asset key. All three must agree with the purpose-specific JPEG contract.
- `main` only checks that at least one processed image exists (`:591-595`), executes the generated SQL (`:616-631`), and prints completion. It does not verify D1 counts, asset states, R2 objects, HTTP content type, or byte retention. `assertLocalSeedTarget` checks only the group count (`:68-85`), so orphan assets in an otherwise empty `groups` table are not detected before a run.

The implementation plan should introduce a manifest-based acceptance sequence:

1. **Plan:** materialize the 140 group plan before upload. The manifest must contain 140 required Logo slots and an explicit set of QR slots. If the QR distribution remains random, compute `expectedQrCount` from this exact manifest and assert against it; preferably use a deterministic seed or checked-in local fixtures so reruns are comparable. The expected total asset count is `140 + expectedQrCount` when each group receives its own Logo and each QR group its own QR asset.
2. **Encode/validate before mutation:** produce every required Logo/QR buffer first. For QR JPEGs, use a deterministic server-side encoder (Sharp’s JPEG quality option is an integer 1–100; map the browser-style `0.90` ladder to 90, 80, etc.) or checked-in valid fixtures. Flatten to white, check max dimensions/bytes, and decode every planned QR with a real decoder if QR readability is part of the seed contract. Do not let a generic source image masquerade as a QR: the current script says QR is “same source as avatar” (`:14,403-425`), which does not guarantee QR content.
3. **Upload gate:** fail the seed immediately on any missing plan slot, failed compression, non-201 response, wrong purpose/content type, wrong key suffix, invalid dimensions/bytes, or non-staged response. Do not generate or execute group SQL after a partial upload. If partial staged objects are possible, record their IDs for cleanup/retry; do not report success.
4. **D1 gate after SQL commit:** assert all of the following, with exact values from the manifest:
   - `COUNT(groups) = 140` and the planned status distribution is 100 published, 10 pending, 10 delisted, 10 rejected, and 10 soft-deleted rejected (`seed-local.mjs:281-302`).
   - Every group has a non-null Logo key and that key joins exactly one Logo asset; `COUNT(assets WHERE purpose='logo') = 140`.
   - Every planned QR slot has one `join_methods` row with a non-null `asset_id`; `COUNT(assets WHERE purpose='qr_code') = expectedQrCount`.
   - `COUNT(assets) = 140 + expectedQrCount`; every planned asset is `ready`; no planned asset is `staged`, `delete_pending`, or `delete_failed`.
   - Each asset’s `content_type` matches purpose (`image/png` for Logo, `image/jpeg` for QR), its stored dimensions/byte length match the encoded object, and `ref_count` equals the actual Logo/group plus QR/join-method reference count. No asset is an unreferenced orphan.
5. **R2/HTTP retention gate:** for every manifest asset, `R2.head(r2_key)` must exist, have the expected `httpMetadata.contentType`, and report the expected size. Fetch the returned public URL after SQL adoption and assert `200`, correct `Content-Type`, correct body size, and actual format/decode. For QR objects, run the QR decoder against the persisted bytes. Cloudflare documents R2 writes as strongly consistent once `put` resolves, so immediate post-upload/readback is an appropriate invariant; the local test still needs to consume the body rather than trusting `head` alone.
6. **Exit behavior:** only print “seed complete” after all gates pass. Any mismatch must exit non-zero and include planned/observed counts and the offending group/asset key. The generated SQL and a manifest can remain for diagnosis, but a zero exit code must mean all planned groups and assets are persisted, adopted, readable, and retained.

This gate also protects the JPEG migration from a false positive where D1 says `image/jpeg` but the R2 object is a PNG, or where a QR asset row is `ready` but the group omitted the `asset_id`. The current aggregate adoption implementation is strong enough to preserve `ready`/`ref_count` atomically once the right asset IDs are passed, but the seed must verify the aggregate state rather than infer it from upload counts.

## Files found

- `src/shared/browser/image-compression.ts` — browser decode, canvas composition, one-shot PNG encoding, size check, and preview URL lifecycle.
- `src/shared/browser/image-compression.spec.ts` — current one-shot encoder tests, PNG signature checks, QR white-background/alpha checks, and failure cleanup cases.
- `shared/contracts/asset.ts` — global PNG MIME literal, purpose size/dimension policies, upload metadata and asset DTO schemas.
- `src/features/admin/api.ts` — admin multipart field names and current `qr.png`/`logo.png` filenames.
- `src/components/AdminEditForm.vue` — QR file input, white-background-related user copy, pending Blob handling, and exact compression failure feedback.
- `functions/_lib/routes/admin-assets.ts` — authenticated multipart upload route and global PNG MIME check.
- `functions/_lib/services/image-validation.ts` — PNG parser, size/dimension limits, Photon full decode, and QR opacity check.
- `functions/_lib/services/asset-service.ts` — staged D1 insert, `.png` storage key, R2 upload, and asset DTO mapping.
- `functions/_lib/adapters/r2-adapter.ts` — R2 `httpMetadata.contentType` write and public URL construction.
- `functions/_lib/app.ts` — public R2 route with hard-coded `Content-Type: image/png`.
- `functions/_lib/routes/admin-groups.ts` — staged Logo/QR validation and adoption input collection.
- `functions/_lib/repositories/group-repository.ts` — aggregate creation/update, `ready` state, and `ref_count` adoption transactions.
- `migrations/0002_admin_group_management.sql` — assets table and PNG default `content_type`.
- `scripts/seed-local.mjs` — 140-group plan, remote image download, Sharp PNG compression, API uploads, SQL generation, and current partial-failure behavior.
- `seed-local.sql` — current generated sample with 140 groups, 140 Logo assets, and 47 QR assets; generated output is not a stable expected QR count because the plan is random.
- `scripts/seed-local.test.mjs` — existing asset upsert/idempotency tests, currently hard-coded for PNG and only three sample assets.
- `tests/workers/admin-assets.spec.ts` — existing upload/R2 head/public GET/content-type assertions for PNG.
- `tests/workers/admin-resource-lifecycle.spec.ts` — staged/adoption/ref-count/cleanup behavior.
- `.trellis/spec/backend/api-guidelines.md` — admin asset endpoint, PNG restrictions, R2 URL and adoption contracts.
- `.trellis/spec/backend/quality-guidelines.md` — server MIME/signature/size/Workers test requirements.
- `.trellis/spec/frontend/architecture.md` — canvas/object URL browser-boundary rule.
- `.trellis/spec/frontend/quality-guidelines.md` — image E2E and failure-feedback requirements.
- `.trellis/spec/guides/testing-strategy.md` — real binary fixtures, image contract tests, R2/D1 persistence assertions, and local-only test safety.
- `.trellis/tasks/08-05-cross-platform-image-e2e/prd.md` — current task’s PNG-only scope and stated asset adoption E2E expectations.
- `.trellis/tasks/08-05-cross-platform-image-e2e/design.md` — current cross-browser E2E design, which assumes PNG and `jsQR`/pixel checks.

## Code patterns

- One-shot browser output and actual format check: `src/shared/browser/image-compression.ts:255-275,321-371`.
- QR opaque white canvas: `src/shared/browser/image-compression.ts:338-348`.
- Admin multipart names: `src/features/admin/api.ts:60-86`.
- Purpose and MIME schema coupling: `shared/contracts/asset.ts:12-14,61-68,132-142`.
- Server global PNG gate: `functions/_lib/routes/admin-assets.ts:142-152`.
- PNG-only parser and full decode: `functions/_lib/services/image-validation.ts:107-217,231-287`.
- `.png` key and D1/R2 content type coupling: `functions/_lib/services/asset-service.ts:110-131`.
- R2 metadata write: `functions/_lib/adapters/r2-adapter.ts:18-27`.
- Public response hard-coded PNG: `functions/_lib/app.ts:45-61`.
- Atomic asset adoption/ref-count update: `functions/_lib/repositories/group-repository.ts:589-600,810-849`.
- Seed’s partial-success paths: `scripts/seed-local.mjs:383-436,496-526,591-631`.
- Seed’s hard-coded PNG API/SQL contract: `scripts/seed-local.mjs:347-366,440-445`.
- Current generated asset shape: `seed-local.sql` header and footer (`140 groups, 140 logos, 47 QRs`).
- Existing R2/public-body verification pattern: `tests/workers/admin-assets.spec.ts:197-249`.

## External references

- [WHATWG HTML Standard: canvas serialization](https://html.spec.whatwg.org/multipage/canvas.html) — `toBlob` type/quality semantics; unsupported requested formats use PNG and JPEG quality is in the inclusive 0.0–1.0 range.
- [MDN: HTMLCanvasElement.toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) — browser-facing summary: `null` callback is possible, JPEG/WebP quality is 0–1, and unsupported formats fall back to PNG.
- [MDN: Blob.type](https://developer.mozilla.org/en-US/docs/Web/API/Blob/type) — MIME is not determined by reading the bytestream and must not be the sole validation mechanism.
- [IANA Media Types registry](https://www.iana.org/assignments/media-types/media-types.xhtml) — `image/jpeg` is the registered JPEG media type.
- [Cloudflare R2 Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) — `put` accepts `httpMetadata`, `contentType` is R2 HTTP metadata, `writeHttpMetadata` applies it to responses, and successful writes are strongly consistent for subsequent reads.
- [Sharp output options](https://sharp.pixelplumbing.com/api-output/) — JPEG output quality is an integer from 1–100; use 90/80/etc. when mirroring the browser-style 0.90/0.80 ladder in the local seed encoder.
- [@cf-wasm/photon package README](https://github.com/fineshopdesign/cf-wasm/tree/main/packages/photon#readme) — pinned package pattern for `PhotonImage.new_from_byteslice` and `get_bytes_jpeg(quality)`; repository uses `@cf-wasm/photon@0.4.0`.

## Related specs

- `.trellis/spec/backend/api-guidelines.md:45-57,155-172,174-220` — current PNG upload API, final size/dimension rules, URL construction, and staged/adopt resource contract.
- `.trellis/spec/backend/quality-guidelines.md:30-57` — server security review and image test requirements.
- `.trellis/spec/frontend/architecture.md:60-64` — canvas and object URL browser-boundary/cleanup requirement.
- `.trellis/spec/frontend/quality-guidelines.md:20-31,63-124` — image E2E, exact failure feedback, and three-engine PNG expectations that must be revised if this migration proceeds.
- `.trellis/spec/guides/testing-strategy.md:33-42,77-117,138-157` — image unit/component/Worker/E2E layering, real binary fixture requirement, D1/R2 assertions, and local-only environment rules.
- `.trellis/tasks/08-05-cross-platform-image-e2e/prd.md:1-17,32-66` — current task explicitly says it does not change the PNG business contract; a QR JPEG change needs a new scope/decision.
- `.trellis/tasks/08-05-cross-platform-image-e2e/design.md:3-9,29-58` — current design assumes browser PNG, PNG metadata, and PNG server validation.

## Caveats / Not Found

- The requested quality ladder specifies start and decrement but not the exact maximum attempt count or lower bound. The recommended explicit default is nine attempts through `0.10`; including `0.00` would be a separate ten-attempt contract. This must be decided and tested rather than inferred from a floating-point loop.
- JPEG cannot preserve transparency. This is harmless for the current QR path because it already paints an opaque white background, but it would be a breaking change if “PNG to JPEG” were interpreted to include transparent Logo output.
- Existing task PRD/design/spec files are PNG-specific and state that production image contracts must not change. The main session must obtain a scope/acceptance decision and update planning/spec artifacts before implementation; this research file does not change them.
- Current seed QR images are derived from the same downloaded source as Logos and are not guaranteed to contain a decodable QR code. If JPEG QR acceptance includes actual QR readability, use deterministic QR fixtures and decode every planned persisted QR.
- The local seed uses remote image downloads and `Math.random`, so exact QR asset count and byte output are not reproducible today. A manifest/deterministic RNG/local fixture strategy is needed for a reliable “all planned assets” gate.
- Photon JPEG support is documented by the pinned package and verified here with a local Node smoke check, but the production validator imports the Workerd build. Add a real Worker integration fixture before treating JPEG support as proven.
- No implementation was performed. Only the requested research directory was created and this research file was written; no code/spec/task files were modified.
