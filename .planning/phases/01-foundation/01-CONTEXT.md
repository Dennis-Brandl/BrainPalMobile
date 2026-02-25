# Phase 1: Foundation - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Monorepo scaffold with engine, protocol, storage, ui packages + mobile and web apps. SQLite database initialized with WAL mode, full schema v1, and write-ahead persistence pattern. Zustand stores configured as read-through cache of SQLite state. Cross-platform baseline verified on Android emulator, Android physical device, iOS simulator, and web browser.

Requirements: FNDTN-01, FNDTN-02, FNDTN-03, FNDTN-04, PERS-01, PERS-05

</domain>

<decisions>
## Implementation Decisions

### Schema strategy
- Full schema upfront — all 15+ tables from StorageSpec.md created in Phase 1, even if Phase 1 only reads/writes a subset
- Drop and recreate during v1 development — no migration scripts, no version tracking table. Wipe DB on schema change.
- Dev seed script that populates master data only (sample master workflow + environment). Runtime data comes from the engine in Phase 2.

### Web deployment baseline
- Docker timing: Claude's discretion — decide based on when COOP/COEP headers and wa-sqlite pitfalls need addressing
- Web architecture: Claude's discretion — pure SPA vs Express server based on Phase 1 scope needs
- Browser support: All modern browsers (Chrome, Firefox, Safari, Edge) tested from Phase 1
- Web SQLite fallback: Claude's discretion — if wa-sqlite proves too unstable, choose between IndexedDB fallback or accepting known limitations

### App shell content
- Placeholder tab bar with 5 tabs (Home, Execute, Overview, History, Settings) visible from Phase 1 completion
- Each tab shows a placeholder screen — whether it displays seed data or static text is Claude's discretion (whatever best validates the persistence layer)
- Basic theme established: clean neutral color palette (blues/grays, professional), typography set up. Not polished, but establishes the design system foundation.

### Claude's Discretion
- Docker vs expo web timing for Phase 1
- Express server vs pure SPA for web target
- wa-sqlite fallback strategy if alpha support proves problematic
- Whether placeholder screens show live seed data or static text
- Exact color palette and typography choices (within "clean neutral" direction)
- Development workflow (Expo Go vs dev builds) — not discussed, Claude handles

</decisions>

<specifics>
## Specific Ideas

- User specifically requires Android physical device testing (USB/WiFi) in Phase 1 — not just emulator
- iOS simulator testing required (no physical iOS device mentioned)
- All modern browsers must work — not Chrome-only
- Seed script provides something real to verify against on each platform without depending on the import pipeline

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-24*
