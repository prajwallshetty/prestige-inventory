# Prestige Tiles — System Audit (findings before repair)

Method: read every layer (schema → services → actions → auth/middleware → UI),
queried the live Neon database for actual data state, and traced each reported
symptom to a root cause. Numbered issues are referenced by the fixes that follow.

## A. Session / authentication (root cause of several reported symptoms)

A1. `signInAction` never puts `showroomId` into the JWT. Showroom users therefore
    have `session.showroomId === undefined` for their whole session.
    Consequence: blocks are created with `showroomId: null`, and
    `/blocks` scopes showroom users with `showroomId: session.showroomId ||
    "non-existent-id"` — so **In-Charge and Staff see an empty block list**.
A2. Live data: `incharge@prestigetiles.com` has `showroomId = null`; there is no
    SHOWROOM_STAFF user at all (`staff@prestigetiles.com` is SUPER_ADMIN).
    Flow A was untestable and unusable in practice.
A3. `getSessionContext()` falls back to the **client-writable** `prestige_role`
    cookie when the signed JWT is absent/invalid. Setting
    `document.cookie = "prestige_role=SUPER_ADMIN"` escalated privilege on every
    page and server action that used it. Privilege escalation.
A4. `middleware.ts` base64-decodes the JWT **without verifying the signature**.
    A hand-crafted token passed route protection.
A5. Middleware `matcher` omits `/blocks`, `/inventory`, `/bookings`, `/dealers`,
    `/in-transit`, `/reports`, `/system`, `/warehouses` — unauthenticated users
    could load them directly.
A6. `UserRole` in `lib/session.ts` still declares retired `VIEWER`/`DEALER` and
    defaults to `"VIEWER"`, which is not one of the five roles.

## B. Block workflow

B1. Manager approval sets `APPROVED`, not `READY_TO_SHIP`. The Ship button is
    gated on `READY_TO_SHIP`, so after final approval **nothing was shippable**
    until someone found the separate "Mark Ready to Ship" button. This is the
    reported "shipping is not working".
B2. **Double-approval / double-shipping race.** `loadBlockForMutation` reads the
    block row *before* acquiring the inventory lock. Two concurrent ship calls
    both read `READY_TO_SHIP`; the second then serialises on the inventory lock
    and proceeds on a stale status — shipping the same block twice and
    decrementing physical stock twice.
B3. In-Charge approval had no showroom-scope check: an In-Charge of showroom B
    could approve a block belonging to showroom A through the server action.
B4. MANAGER could approve at the `PENDING_INCHARGE_APPROVAL` stage, silently
    skipping the In-Charge step required by Flow A.
B5. Expiry worker: `READY_TO_SHIP → EXPIRED` is not a legal transition, so
    approved-and-ready blocks could never expire (the worker threw for each).
    `PARTIALLY_SHIPPED` blocks were also selected for expiry and would have
    released the **full** quantity, including boxes already shipped.
B6. Expiry warning notifications are re-sent on every worker run — a block
    expiring in 2 hours generated a notification per cron tick.
B7. The expiry cron route is a public unauthenticated GET, and nothing schedules
    it — expiry only happened if a human hit the URL.
B8. `releaseReservedQuantity` derives the new available figure from the stored
    `availableStock` column instead of recomputing from physical stock, so any
    historical drift compounds instead of self-correcting.
B9. Shipping decremented physical stock but never populated `transitStock`, so
    "In-Transit" was always zero; delivery never cleared it either.

## C. Approval queues / UI

C1. The In-Charge sidebar links to `/blocks?status=PENDING` and
    `?status=APPROVED`. `PENDING` is not a status in the state machine, so
    **"Pending Approvals" was always empty** — the reported "block approval is
    not working".
C2. `/blocks` loads *every* block with no pagination, search, filter or sort.
C3. The Ship confirmation modal has no title case and no shipment details —
    §12 requires block number, dealer, product, quantity, showroom, destination.
C4. Sidebar has no branch for `WEAVER`, so the read-only role fell through to
    the **Super Admin** navigation (Users, Warehouses, Dealers, Audit).
C5. `InventoryClientTable` computes `isReadOnly` from the retired `VIEWER`
    role, so WEAVER was shown mutation controls that the server then refused.

## D. Stock calculation

D1. `getInventorySummary` counts blocks with status `"PENDING"`/`"APPROVED"` —
    neither reflects the real state machine, so dashboard tiles were wrong.
D2. `getInventoryList` filters embedded blocks on `status in ["APPROVED",
    "PENDING"]` — the active-block list per product was effectively empty.

## E. Authorization on server actions

E1. `adjustStockAction` — no session check, no role check, hardcoded actor
    ("Inventory Manager"). Any caller could adjust physical stock.
E2. All booking actions (`reviewBookingAction`, `confirmBookingAction`,
    `cancelBookingAction`, `allocateBookingStockAction`,
    `fulfillBookingStockAction`, `bulkApproveBookingsAction`, …) take the
    actor's name as a **client-supplied parameter** and perform no
    authorization at all.
E3. Report data actions and `globalSearchAction` have no session check.
E4. `releaseBlockAction` passed no role to the service, which defaulted to
    `role = "SUPER_ADMIN"` — any authenticated user could release any hold.

## F. Search

F1. Global search covers only product `name` + `productCode`. §18 requires
    product number/SKU/brand/category/collection/size/finish/surface, block
    number, dealer id/name and showroom.
F2. No stale-response protection anywhere: a slow "ACR" response can overwrite
    newer "BEI" results (§24).
F3. No database indexes backing the search columns; `Notification` has no
    composite `(userId, isRead)` index; `StockBlock` has none on `showroomId`
    or `createdAt`.

## G. Notifications

G1. `audienceWhere()` filters on `role = "DEALER"` and `role = "VIEWER"` —
    values absent from the `Role` enum, so those broadcasts throw at runtime.

## H. Second pass (found after the first round of repairs)

H1. **Booking and block flows double-committed the same stock.** `reviewBooking`
    reserves into `Inventory.reservedStock`, but the block flow derived
    blockable stock as `total − blocked − allocated − damaged`, ignoring
    reservations entirely. A booking could reserve 30 boxes and a block could
    then be raised against the same 30; the block's write recomputed
    `availableStock` from physical stock and silently erased the booking's hold.
    §6 explicitly requires "OTHER VALID RESERVATIONS" to be subtracted.
H2. **Booking release used the wrong counter.** `cancelBooking` and
    `releaseExpiredBookings` decremented `blockedStock` — which they never
    incremented — while leaving `reservedStock` untouched. Cancelling a booking
    therefore released stock held by an unrelated *block* and stranded its own
    reservation permanently. `allocateBookingStock` had the same defect
    (drained `blockedStock` instead of `reservedStock`).
H3. **Lost updates in every booking stock path.** `cancelBooking`,
    `releaseExpiredBookings`, `allocateBookingStock` and `fulfillBookingStock`
    read `item.product.inventory` from a pre-transaction snapshot and wrote
    absolute values back, with no row lock. A block mutation committing in
    between was overwritten.
H4. **The dashboard's approvals panel could never populate.** It queried
    `status: "PENDING"`, which is not one of the twelve block statuses. All five
    role dashboards re-export this page, so the panel was empty everywhere.
H5. **Announcement fan-out held a database transaction open across Redis I/O** —
    one `deleteCache` + `publishEvent` round trip per recipient, inside the
    transaction (§41 forbids this).
H6. Failure results were discarded by four clients: `AnnouncementsClient`,
    `DealersClient` (update + status toggle), `UsersClient` (create/update/
    deactivate) and `NotificationCenter`. Since the actions report failure in
    their return value rather than throwing, a rejected mutation rendered a
    success toast and, in `UsersClient`, reloaded the page as though it worked.
H7. **`instrumentation.ts` broke the production build.** Next compiles it for
    the Edge runtime too; the early-return `NEXT_RUNTIME` guard left the
    scheduler's dynamic imports at function-body level where the bundler still
    had to resolve `ioredis` (→ `stream`, `crypto`, `dns`, `net`) for Edge.
H8. **The service worker's offline fallback could never fire.**
    `caches.match(OFFLINE_URL) || new Response(...)` — `caches.match` returns a
    Promise, which is always truthy, so a cache miss resolved to `undefined` and
    the navigation failed with a network error instead of the offline shell.
    It also pre-cached `/manifest.json` while the app links
    `/manifest.webmanifest`.
H9. Block mutations had no offline guard (§39). Only the create-block form and
    the announcement composer checked; approve/reject/ship/deliver/cancel/
    release and the inventory adjust/quick-block modals did not, so tapping them
    offline hung until timeout — indistinguishable from a dead button.
H10. Six pages rendered private data with no page-level authorization:
    `/bookings`, `/bookings/[id]`, `/in-transit`, `/reports`, `/system/audit`,
    `/warehouses` (plus `/admin/settings`).
H11. Four tables were wrapped in `overflow-hidden` with no card alternative
    (`AnnouncementsClient`, `UsersClient`, `/in-transit`, `/system/audit`), so
    at 320–375px their right-hand columns were clipped and unreachable.
H12. The inventory table's "Blocked By" column read `blocked_by` from a select
    that no longer requested it, so the column was permanently empty.

## I. Test-harness defects (not product defects)

I1. Fixtures were tagged with a constant marker and torn down by that marker, so
    two overlapping runs deleted each other's users and showrooms mid-test
    (`AuditLog_userId_fkey` / `StockBlock_showroomId_fkey` violations). Each run
    now uses a unique marker and sweeps only fixtures older than an hour.
I2. The §11 self-approval check passed for the wrong reason: it approved a block
    already at the *Manager* stage, so it proved only that an In-Charge cannot
    act there. It now manufactures the state the guard actually defends
    (PENDING_INCHARGE_APPROVAL, created by the approving In-Charge) and asserts
    a different In-Charge can still approve it.

## J. Operational findings (environment, not code)

J1. **Database latency dominates everything.** The Neon instance is in
    `us-east-2` while the app runs from India; a single `product.count()`
    measured 8.2s on a cold connection and ~1.5s warm. A stock mutation needs
    6-8 statements while holding a row lock, so a ship/approve transaction runs
    ~9s and a *contended* one waited 26s. This is why Prisma's 5s default
    transaction timeout (still in force across all 8 BookingService
    transactions) produced random failures under load.
    Code side is now handled: one shared `STOCK_TX_OPTIONS`
    (30s timeout / 25s maxWait) in `src/lib/db.ts` applies to every
    stock-touching transaction in both services, and transaction-expiry errors
    translate to "The system is busy right now. Please try that again."
    rather than leaking `Transaction already closed: …` to the operator.
    Measured on the running production build (`SELECT 1` = one round trip):

        SELECT 1 (bare round trip)            2074 ms
        raw ILIKE '%acr%' over 1132 rows      1276 ms   (query itself ~free)
        getInventoryList(search="acr")        4141 ms   (~2 round trips)
        getInventoryList(no filter)           6392 ms
        getInventoryFacets()                  1931 ms   (~1 round trip)
        getBlockList()                        4670 ms   (~2 round trips)

    The queries are already round-trip-optimal: every figure above is a small
    multiple of the 2s network floor, and the ILIKE scan costs less than one
    round trip because the pg_trgm GIN indexes are doing their job. **No query
    rewrite can fix this** — §45's 300-500ms target is unreachable while the
    network floor alone is 2s.
    **Recommendation:** move the database to a region near the users
    (ap-south-1). That single change takes every number above down by roughly an
    order of magnitude and brings §45 into reach; the transaction timeouts in J1
    can then be tightened back down. A one-off 46s reading on a cold
    `/inventory?search=acr` was a Neon autosuspend resume, not a query cost.
J2. **Redis is not running.** Every cache call falls through to PostgreSQL, as
    designed (`isRedisAvailable` gate), so nothing is broken — but none of the
    read-caching benefit described in §20 is being realised, and the live
    notification channel (`publishEvent`) is inert. Starting Redis, or pointing
    `REDIS_URL` at a managed instance, is a pure win with no code change.
J3. **Seeded credentials were inconsistent.** Every account uses `prestige123`
    except the SHOWROOM_STAFF account created during data repair, which used
    `Prestige@2026`. Aligned, and `scripts/repair-data.ts` corrected so a rerun
    stays consistent.
J4. Two lockfiles exist (`E:\growthbridge\package-lock.json` and the project's
    own), so Next infers the wrong workspace root and warns on every build.
    Harmless today; set `outputFileTracingRoot` or remove the stray lockfile.
