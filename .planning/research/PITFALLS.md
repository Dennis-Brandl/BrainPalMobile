# Pitfalls Research

**Domain:** Cross-platform runtime workflow execution engine (React Native + Expo)
**Researched:** 2026-02-24
**Confidence:** MEDIUM-HIGH (verified via official docs, GitHub issues, and multiple community sources)

## Critical Pitfalls

### Pitfall 1: expo-sqlite Transaction Scope Leakage

**What goes wrong:**
Using `withTransactionAsync()`, any query that executes while the transaction is active -- even queries issued from completely unrelated parts of the app -- silently joins that transaction. If the transaction rolls back, those unrelated writes are also rolled back. If they succeed, the transaction's atomicity guarantees are violated by including unintended mutations.

**Why it happens:**
expo-sqlite's `withTransactionAsync()` does not isolate the transaction to queries within its callback scope. Due to the nature of async/await and the single JS thread sharing one database connection, any `db.runAsync()` call that runs between the BEGIN and COMMIT of the transaction becomes part of it. This is documented but counterintuitive. Developers assume transaction boundaries match the lexical scope of the callback.

**How to avoid:**
- Use `withExclusiveTransactionAsync()` instead of `withTransactionAsync()` for ALL write transactions. Exclusive transactions ensure only queries executed on the `txn` object (passed to the callback) participate in the transaction.
- Establish a project-wide rule: never use `withTransactionAsync()`. Lint or grep for it in CI.
- Be aware that `withExclusiveTransactionAsync()` is NOT supported on web (wa-sqlite). On web, you must serialize all writes through a single queue to avoid interleaving.

**Warning signs:**
- Mysterious data loss or rollbacks in unrelated data after a failed transaction
- Intermittent data corruption that cannot be reproduced reliably
- State inconsistency between Zustand and SQLite after app restart

**Phase to address:**
Phase 1 (Foundation/Storage Layer). The database abstraction layer must be built correctly from day one. Retrofitting transaction isolation is extremely difficult.

---

### Pitfall 2: Zustand/SQLite Dual-State Desynchronization

**What goes wrong:**
The app maintains two sources of truth: Zustand (in-memory) and SQLite (persistent). After a crash, the app rehydrates from SQLite, but the SQLite state may be stale (write pending in Zustand never flushed) or inconsistent (partial write completed). The user sees a workflow that has "gone back in time" or is in an impossible state -- e.g., a step marked COMPLETED in Zustand but still RUNNING in SQLite.

**Why it happens:**
The natural pattern is: (1) update Zustand for instant UI response, (2) persist to SQLite asynchronously. This is "optimistic UI." But if the app crashes, is killed by the OS, or the async SQLite write fails, the two states diverge permanently. The project spec calls for "write-ahead semantics" (SQLite updated BEFORE in-memory state), but developers instinctively write optimistic-update code because it feels faster.

**How to avoid:**
- Enforce write-ahead discipline: SQLite write completes BEFORE Zustand state updates. Wrap every state mutation in a function that does `await db.runAsync(...)` then `store.setState(...)`.
- Create a `transactionalUpdate(sqlStatements, zustandMutation)` helper that enforces this ordering. Never bypass it.
- For crash recovery: on app startup, read the full active workflow state from SQLite and rebuild Zustand from it. Never persist Zustand to AsyncStorage as a recovery mechanism -- SQLite is the single source of truth.
- Add an integrity check on startup that validates state machine invariants (no step in both RUNNING and COMPLETED, no orphaned resources, etc.).

**Warning signs:**
- Any code that calls `store.setState()` before or without a corresponding SQLite write
- Zustand persist middleware being used alongside manual SQLite persistence (dual persistence)
- App state after a force-kill differs from state before the kill
- "It works fine unless I kill the app" reports during testing

**Phase to address:**
Phase 1 (Foundation). The state management contract (write-ahead ordering) must be established before any engine logic is built. Every subsequent phase depends on this being correct.

---

### Pitfall 3: Web Platform as Second-Class Citizen (expo-sqlite/wa-sqlite Divergence)

**What goes wrong:**
The app works on Android and iOS but fails on web in subtle ways. expo-sqlite on web uses wa-sqlite (WebAssembly-based SQLite), which has critical differences from the native implementation: WAL mode is not supported, `withExclusiveTransactionAsync()` is not supported, performance is significantly slower, and SharedArrayBuffer requires specific HTTP headers (COOP/COEP). Features tested and working on mobile silently break or degrade on web.

**Why it happens:**
Web support for expo-sqlite is in alpha. Developers build and test primarily on mobile (where SQLite is native and fast), then discover web incompatibilities late. The wa-sqlite implementation has fundamental architectural differences: it runs in a WebAssembly sandbox, communicates across the main thread/wasm boundary (which is slow), and cannot use the same concurrency primitives as native SQLite.

**How to avoid:**
- Test on web from day one. Every feature must be verified on all three platforms before marking it complete.
- Abstract the database layer behind an interface that accounts for platform differences:
  - No WAL mode on web -- use journal_mode=DELETE as fallback
  - No exclusive transactions on web -- use a JS-level write queue/mutex
  - Performance budget: web SQLite operations may be 3-10x slower than native
- Configure Docker/nginx to emit required headers from the start:
  ```
  Cross-Origin-Embedder-Policy: credentialless
  Cross-Origin-Opener-Policy: same-origin
  ```
- Configure Metro bundler to support .wasm files for web builds.
- Consider whether large queries should be paginated on web where they would not need to be on native.

**Warning signs:**
- "We'll add web support later" mentality
- No web CI/testing until a late phase
- SQLite queries that work on mobile but throw errors or hang on web
- Missing COOP/COEP headers causing SharedArrayBuffer errors in the browser console

**Phase to address:**
Phase 1 (Foundation). Web platform configuration (Docker headers, Metro wasm config, database abstraction) must be established at project inception. If deferred, every feature built on mobile-only assumptions will need rework.

---

### Pitfall 4: Monorepo Metro Bundler Resolution Failures

**What goes wrong:**
Metro bundler cannot find packages from shared workspace packages (engine, protocol, storage, ui). Builds fail with "Unable to resolve module" errors. Alternatively, builds succeed but two copies of React are loaded at runtime, causing "Invalid hook call" or "Multiple instances of React" errors that crash the app.

**Why it happens:**
Metro's module resolution historically struggled with symlinks created by workspace package managers (npm/yarn/pnpm workspaces). Shared packages in `packages/` are symlinked into each app's `node_modules`, but Metro may not follow symlinks correctly. Additionally, if React or React Native are installed as dependencies of multiple workspace packages, multiple copies get resolved, causing runtime crashes.

**How to avoid:**
- Use Expo SDK 52+ which automatically configures Metro for monorepos via `expo/metro-config`. Verify this by checking that `getDefaultConfig` from `expo/metro-config` is used in `metro.config.js`.
- Ensure React, React Native, and Expo are dependencies ONLY of the app packages (`apps/mobile`, `apps/web`), never of shared packages (`packages/*`). Shared packages should list them as `peerDependencies`.
- Add `resolutions` (yarn) or `overrides` (npm) in root `package.json` to force single versions of React and React Native across all workspaces.
- Run `npm why react-native` periodically to check for duplicate installations.
- Keep shared packages as pure TypeScript with no native dependencies. The `engine` package must have zero platform-specific imports.
- For the `ui` package, use `.web.tsx` / `.native.tsx` file extensions for platform-specific code rather than runtime `Platform.OS` checks when the differences are substantial.

**Warning signs:**
- "Unable to resolve module" errors that appear only in one app but not the other
- "Invalid hook call" errors at runtime
- Build times increasing as more packages are added
- Different behavior between `expo start` and production builds
- Symlink-related errors in Metro output

**Phase to address:**
Phase 1 (Project Setup). The monorepo structure must be validated with a "hello world" that imports from every shared package and renders on all three platforms before any feature work begins.

---

### Pitfall 5: State Machine Race Conditions Under Concurrent Step Execution

**What goes wrong:**
Two parallel branches of a workflow both attempt to trigger transitions on shared state (e.g., both try to advance past a WAIT ALL join, or both try to acquire the same resource). Without proper serialization, the state machine processes both events concurrently, resulting in: duplicate step activations, resources granted to two steps simultaneously, WAIT ALL completing before all branches have actually finished, or invalid state transitions (e.g., RUNNING -> RUNNING).

**Why it happens:**
JavaScript is single-threaded, so developers assume race conditions cannot occur. However, with async/await, multiple asynchronous operations interleave on the event loop. When Step A completes and triggers "advance to next," the scheduler evaluates the graph. If Step B completes during an `await` inside that evaluation, its completion handler also runs, seeing the same pre-mutation state. Both handlers conclude they should activate the join step, resulting in double activation.

**How to avoid:**
- Implement a serialized event queue for ALL state machine events. Every step completion, state transition, and resource operation must go through a single queue that processes events one at a time (FIFO). No concurrent processing of engine events.
- The queue should be `async` but serial: process event 1 fully (including all SQLite writes) before dequeuing event 2.
- Use a mutex/semaphore pattern around the scheduler's "evaluate next steps" logic:
  ```typescript
  class EngineEventQueue {
    private processing = false;
    private queue: EngineEvent[] = [];

    async enqueue(event: EngineEvent): Promise<void> {
      this.queue.push(event);
      if (!this.processing) {
        this.processing = true;
        while (this.queue.length > 0) {
          const next = this.queue.shift()!;
          await this.processEvent(next); // includes SQLite write
        }
        this.processing = false;
      }
    }
  }
  ```
- For resource acquisition, enforce alphabetical ordering of resource requests (as specified in the project requirements) to prevent deadlocks. A step requesting resources [B, A] must internally reorder to [A, B] before acquiring.
- Write comprehensive tests for concurrent scenarios: two steps completing simultaneously, resource contention between parallel branches, WAIT ALL with varying completion order.

**Warning signs:**
- Steps appearing in RUNNING state more than once in the active step list
- WAIT ALL completing before all incoming branches have finished
- Resources showing as acquired by two steps simultaneously
- Non-deterministic test failures in engine logic
- "It works most of the time" reports for parallel workflow features

**Phase to address:**
Phase 2 (Engine Core). The event queue architecture must be designed before implementing the scheduler. This is the single most dangerous pitfall for the engine -- it causes bugs that are nearly impossible to reproduce and diagnose.

---

### Pitfall 6: WYSIWYG Form Rendering Fidelity Across Device Types

**What goes wrong:**
Forms designed in BrainPal MD (the visual editor) use absolute positioning with a canvas coordinate system. When rendered on different device types (phone, tablet, desktop), form elements overlap, overflow the screen, render at wrong sizes, or have text truncated. A form that looks correct on a tablet is unusable on a phone. A form that works on iOS renders differently on Android due to font metrics and DPI differences. Web rendering diverges from both mobile platforms.

**Why it happens:**
Absolute positioning in a fixed canvas does not adapt to varying screen dimensions. React Native uses density-independent pixels (dp), but the mapping from canvas coordinates to dp varies by device. Font rendering differs between platforms: iOS and Android have different default font metrics, line heights, and text wrapping behavior. PixelRatio varies from 1x (low-end Android) to 3.5x (high-end Android), and font scale ranges from 0.823 (iOS minimum) to 3.0+ (iOS accessibility). The canvas scaling math must account for all of these simultaneously.

**How to avoid:**
- Implement canvas scaling as a single, well-tested transformation layer:
  1. The form layout comes from the spec as absolute positions on a known canvas size (e.g., 1024x768 for desktop)
  2. Compute a scale factor: `min(deviceWidth / canvasWidth, deviceHeight / canvasHeight)`
  3. Apply the scale factor to ALL position and dimension values uniformly
  4. Use `transform: [{ scale }]` on a container, NOT individual element repositioning
- Support three distinct canvas sizes (phone/tablet/desktop) from the spec's `form_layout_config`, selecting based on device detection. Do NOT try to "responsively reflow" absolute-positioned forms -- they are fixed layouts that must be scaled, not reflowed.
- Disable font scaling within form containers using `allowFontScaling={false}` and `maxFontSizeMultiplier={1}` to prevent system accessibility settings from breaking form layouts. Provide a separate zoom/accessibility feature for the form if needed.
- Test with extreme PixelRatio values (1x, 2x, 3x, 3.5x) and extreme font scale values (iOS Large Text accessibility mode).
- On web, be aware that React Native Web converts dp to CSS pixels, but browser zoom and OS-level DPI scaling add another layer of transformation.

**Warning signs:**
- Forms that "look fine on my device" but break on other devices
- Text truncation or overflow in form fields
- Overlapping UI elements only visible on small screens
- Form elements appearing at wrong positions on web vs. mobile
- Bug reports that include "but it looks correct in BrainPal MD"

**Phase to address:**
Phase 3 (UI/Form Rendering). The scaling algorithm should be designed and tested with multiple device form factors before building individual form element renderers. Create a test harness that renders a reference form on phone/tablet/desktop/web and visually compares to the BrainPal MD original.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using `withTransactionAsync` instead of `withExclusiveTransactionAsync` | Simpler code, works on web | Silent data corruption from scope leakage | Never -- build the web write-queue workaround from the start |
| Storing workflow state in Zustand only, persisting "later" | Fast initial development | Crash recovery impossible; data loss guaranteed | Never -- write-ahead is a core requirement |
| Hardcoding canvas scaling for one device type | Quick form rendering demo | Complete rework when testing on other devices | Only for a throw-away prototype (first 48 hours) |
| Skipping monorepo setup, building in a single app | Avoids Metro resolution issues | Impossible to share engine/storage with web app; rewrite to monorepo is painful | Never -- the architecture specifies monorepo |
| Using `Platform.OS` switches instead of `.web.tsx`/`.native.tsx` files | Fewer files, seems simpler | Growing conditional blocks, untestable platform code, bundle includes dead code for other platforms | Acceptable for small differences (< 5 lines); use file extensions for anything larger |
| Processing engine events without a queue | Works for linear workflows | Race conditions in any workflow with parallel branches | Never, once parallel execution is in scope |
| Implementing SQLite migrations without version tracking | Faster initial schema setup | Cannot add columns or tables in future versions without breaking existing installs | Never -- `PRAGMA user_version` costs minutes to implement |
| Skipping web platform testing until "later" | Faster iteration on mobile | Compounding web-incompatible code; late discovery of COOP/COEP, wa-sqlite, and RN Web issues | Only if web is explicitly deprioritized in the roadmap |

## Integration Gotchas

Common mistakes when connecting components in this architecture.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| expo-document-picker + expo-file-system (ZIP import) | Assuming the picked file is readable immediately | Always set `copyToCacheDirectory: true` in picker options; read from the cached copy, not the original URI |
| expo-document-picker on web | Calling `getDocumentAsync` programmatically (e.g., in `useEffect`) | Must be triggered by user gesture (button press); web browsers block file picker without user activation |
| expo-sqlite on web | Not configuring Metro for .wasm or missing COOP/COEP headers | Add wasm support to metro.config.js; add `Cross-Origin-Embedder-Policy: credentialless` and `Cross-Origin-Opener-Policy: same-origin` to Docker/nginx config before first web test |
| Zustand persist middleware + manual SQLite | Using `zustand/middleware/persist` with AsyncStorage alongside manual SQLite writes | Do NOT use Zustand persist middleware at all. SQLite is the single persistence layer. Zustand is ephemeral in-memory state rebuilt from SQLite on startup |
| Shared packages importing React | Shared packages (`engine`, `storage`, `protocol`) listing `react` as a direct dependency | List `react` as `peerDependency` only. Install it only in `apps/mobile` and `apps/web`. Use `resolutions`/`overrides` in root package.json |
| react-native-web + native-only components | Using components like `TouchableNativeFeedback`, `RefreshControl`, or `Alert` in shared UI code | Use platform-agnostic alternatives: `Pressable` instead of `TouchableNativeFeedback`, custom pull-to-refresh, `window.confirm` or custom modal instead of `Alert` on web |
| TextInput multiline on web | Assuming multiline TextInput auto-expands on web like it does on mobile | On web, multiline TextInput renders as a `<textarea>` that shows scrollbars instead of expanding. Set explicit height or implement auto-grow logic for web |
| Large file handling in expo-file-system | Loading entire .WFmasterX ZIP into memory before extraction | Use streaming extraction if available, or process files in chunks. expo-file-system lacks append support, so large files can cause OOM on low-end devices |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-rendering entire workflow state on every step transition | UI lag, jank when navigating between steps | Use Zustand selectors to subscribe only to the specific step/slice needed. Never subscribe to the entire workflow store | > 20 steps in a workflow |
| Storing full execution history in a single Zustand array | Growing memory consumption, slow renders | Keep history in SQLite only; load into memory on-demand (paginated). Use append-only INSERT, query with LIMIT/OFFSET | > 100 log entries per workflow |
| Rendering all form elements simultaneously (no virtualization) | Slow form load, high memory usage on complex forms | Use lazy rendering: only render elements visible in the viewport. Use `FlatList` or manual viewport checks for forms with > 50 elements | > 30-50 form elements |
| Synchronous SQLite reads on the JS thread | UI freezes during database operations | Use `getFirstAsync` / `getAllAsync` (async) rather than sync variants. Keep reads small and indexed | > 1000 rows in any table, or > 100ms query time |
| Deeply nested workflow proxy chains | Stack depth issues, slow evaluation, hard-to-debug state | Set a max nesting depth (e.g., 10 levels). Track depth in the engine. Warn or error if exceeded | > 5 nested child workflows |
| Naive graph traversal for "find next steps" | O(n^2) performance for large workflow graphs | Pre-compute adjacency lists when the workflow is imported. Cache connection lookups by step ID. Avoid scanning all connections on every transition | > 100 steps or > 200 connections |
| Unindexed SQLite queries on step/workflow lookups | Slow queries as data accumulates | Add indexes on frequently queried columns: `step.workflow_id`, `step.state`, `workflow.status`, `log.workflow_id` | > 50 workflows or > 500 steps total |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Using `db.execAsync()` for user-provided values | SQL injection -- malicious workflow content could corrupt or exfiltrate data | Always use parameterized queries (`db.runAsync('... WHERE id = ?', id)`). Reserve `execAsync` only for schema DDL with no user input |
| Storing sensitive workflow data (passwords, API keys) in plaintext SQLite | Data exposure if device is compromised or backup is accessed | expo-sqlite supports SQLCipher for encryption (requires prebuild, not available in Expo Go). For v1, document the limitation; for production, enable SQLCipher |
| Executing arbitrary expressions from workflow conditions | Code injection if workflow specs contain malicious condition expressions | The condition evaluator should whitelist the 10 specified comparison operators only. Never use `eval()`, `new Function()`, or similar dynamic code execution. Parse conditions into an AST and evaluate safely |
| Trusting .WFmasterX package contents without validation | Malformed packages could crash the app, corrupt the database, or trigger unexpected behavior | Validate package structure, schema version (must be 4.0), and all required fields before importing. Reject invalid packages with clear error messages |
| Allowing unbounded resource acquisition | Denial of service -- a malformed workflow could acquire all resources and never release them | Implement resource acquisition timeouts. Release all resources for a workflow when it is stopped, aborted, or cleared. Track resource ownership and provide a "force release" mechanism |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No feedback during long import operations | User thinks app has frozen, force-kills it, corrupting the import | Show progress indicator during ZIP extraction and database import. Process in background with periodic UI updates |
| Form elements not matching BrainPal MD appearance | User loses trust in the execution engine -- "this doesn't look right" | Prioritize visual fidelity over convenience. Match colors, fonts, borders, and spacing exactly. A pixel-perfect first impression builds confidence |
| Carousel with no position indicator | User doesn't know how many active steps exist or which one they're viewing | Show "Step 3 of 7" indicator. Show step names/labels in the carousel header |
| No confirmation before destructive actions (STOP, ABORT, DELETE) | Accidental workflow termination with no undo | Always confirm STOP/ABORT/DELETE with a modal dialog. Show what will be lost (e.g., "This will terminate 3 running steps") |
| Crash on malformed workflow without explanation | User imports a bad package and the app crashes | Validate workflows on import. Show human-readable errors: "Step 'Check Temperature' has no outgoing connections -- this workflow cannot complete" |
| No offline indication on web platform | Web user tries to use the app offline, SQLite operations fail silently | Detect online/offline status on web. Show banner when offline. Ensure all critical operations work offline (since SQLite is local) |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Workflow Import:** Often missing image extraction from ZIP -- verify all embedded images are extracted and stored alongside the workflow, not just the JSON data
- [ ] **State Machine:** Often missing HOLD/UNHOLD and ABORT/STOP/CLEAR transitions -- these are rarely exercised in happy-path testing but are required by ISA-88. Verify all 8+ state transitions work, not just IDLE -> RUNNING -> COMPLETED
- [ ] **WAIT ALL Join:** Often missing the "count completed incoming branches" logic -- verify it correctly handles cases where some branches were never activated (conditional branches that were skipped)
- [ ] **Canvas Scaling:** Often missing scroll/pan for forms larger than the viewport -- verify that forms with elements positioned beyond the screen edge can be scrolled to
- [ ] **Crash Recovery:** Often missing recovery of the step carousel position -- verify that after crash recovery, the user returns to the same active step they were viewing, not the first step
- [ ] **Resource Release on Workflow End:** Often missing automatic resource release when a workflow completes, stops, or aborts -- verify resources are freed for reuse by other workflows
- [ ] **Child Workflow Output Propagation:** Often missing output parameter propagation from completed child workflow back to parent -- verify that parent workflow Value Properties are updated after WORKFLOW PROXY step completes
- [ ] **SELECT 1 with No Matching Condition:** Often missing the "no condition matches" case -- verify behavior when none of the SELECT 1 conditions evaluate to true (should this be an error? A default path?)
- [ ] **Web File Picker:** Often missing the user-gesture requirement -- verify the import button works on web (not triggered programmatically). Also verify the correct MIME types are filtered
- [ ] **Execution Logging Timestamps:** Often missing timezone handling -- verify timestamps are stored in UTC and displayed in the user's local timezone, consistently across platforms

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Transaction scope leakage (data corruption) | HIGH | Identify affected records via execution logs. Rebuild corrupted workflow state from the append-only log if available. If log is also corrupt, workflow must be restarted from scratch. Migrate all code to `withExclusiveTransactionAsync` |
| Zustand/SQLite desync (data loss) | MEDIUM-HIGH | Implement a "rebuild from SQLite" function. On next app launch, discard Zustand state entirely and reconstruct from SQLite. If SQLite is behind, the lost state transitions cannot be recovered |
| Web platform broken late in development | HIGH | Audit all code for web-incompatible patterns. Create platform abstraction layer. Retest all features on web. Expect 2-4 weeks of rework depending on how much code was written without web testing |
| Metro resolution failures in monorepo | LOW-MEDIUM | Run `npm why <package>` to find duplicates. Add `resolutions`/`overrides`. Clear all `node_modules` and reinstall. Verify metro.config.js has correct `watchFolders` and `nodeModulesPaths` |
| State machine race conditions | HIGH | Add comprehensive logging to the event queue. Replay logs to identify interleaving. Implement the serial event queue. Retest all parallel workflow scenarios. May require rewriting scheduler internals |
| Form rendering broken on specific devices | MEDIUM | Add device-specific test cases. Fix scaling algorithm. The fix is usually in the central scaling transform, so it propagates to all forms once corrected |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Transaction scope leakage | Phase 1 - Storage Layer | Automated test: run concurrent writes during a transaction, verify isolation |
| Zustand/SQLite desync | Phase 1 - State Management | Test: force-kill app during step transition, verify state on restart matches last committed SQLite state |
| Web platform divergence | Phase 1 - Project Setup | CI pipeline builds and tests on all three platforms. No feature is "done" until it works on web |
| Monorepo Metro resolution | Phase 1 - Project Setup | Smoke test: shared package exports a function, both apps import and call it, builds succeed on all platforms |
| State machine race conditions | Phase 2 - Engine Core | Stress test: run a workflow with 10 parallel branches completing simultaneously, verify exactly correct number of join activations |
| WYSIWYG rendering fidelity | Phase 3 - Form Rendering | Visual regression test: render a reference form on 5 device types, compare screenshots to BrainPal MD output |
| Large workflow performance | Phase 4 - Optimization | Benchmark: import a 200-step workflow, execute it, measure time per step transition and memory usage |
| ZIP import on all platforms | Phase 2 - Import Pipeline | Integration test: import the same .WFmasterX package on Android, iOS, and web Docker, verify identical database contents |
| Crash recovery completeness | Phase 2 - Engine Core | Chaos test: force-kill app at random points during workflow execution, verify recovery on restart |
| Resource deadlock prevention | Phase 2 - Engine Core | Concurrent test: two workflows competing for same resources in different order, verify no deadlock within timeout |

## Sources

### Official Documentation (HIGH confidence)
- [Expo SQLite Documentation](https://docs.expo.dev/versions/latest/sdk/sqlite/) -- transaction scope warnings, web alpha status, exclusive transaction limitations
- [Expo Monorepo Guide](https://docs.expo.dev/guides/monorepos/) -- SDK 52+ auto-configuration, duplicate module warnings, peerDependency requirements
- [React Native Web Compatibility](https://necolas.github.io/react-native-web/docs/react-native-compatibility/) -- unsupported components (RefreshControl, TouchableNativeFeedback, Alert), partially supported APIs
- [Expo SDK 52 Changelog](https://expo.dev/changelog/2024-11-12-sdk-52) -- CRSQLite deprecation, push notification changes
- [SQLite WAL Documentation](https://sqlite.org/wal.html) -- checkpoint starvation, crash recovery semantics, WAL file growth

### GitHub Issues (MEDIUM-HIGH confidence)
- [Race condition in AsyncStorage sqlite/kv-store (Issue #33754)](https://github.com/expo/expo/issues/33754) -- "database is locked" crashes under high concurrency
- [TextInput multiline rich content support (Issue #1023)](https://github.com/necolas/react-native-web/issues/1023) -- web multiline TextInput does not auto-expand
- [Absolute positioning with parent padding (Issue #46392)](https://github.com/facebook/react-native/issues/46392) -- layout calculation bugs with percentage-based absolute positioning
- [Expo Downloads folder limitation (Issue #39227)](https://github.com/expo/expo/issues/39227) -- Android Scoped Storage restrictions

### Community Sources (MEDIUM confidence)
- [Setting up React Native Monorepo With Yarn Workspaces (2025)](https://dev.to/pgomezec/setting-up-react-native-monorepo-with-yarn-workspaces-2025-a29) -- hoisting pitfalls, Metro watchFolders
- [Zustand Persist with Async Storage & React Suspense](https://dev.to/finalgirl321/making-zustand-persist-play-nice-with-async-storage-react-suspense-part-12-58l1) -- hydration race conditions, isLoaded pattern
- [Expo SQLite Complete Guide](https://medium.com/@aargon007/expo-sqlite-a-complete-guide-for-offline-first-react-native-apps-984fd50e3adb) -- WAL mode best practices, batch transactions
- [React Native FlatList Optimization (2026)](https://oneuptime.com/blog/post/2026-01-15-react-native-flatlist-optimization/view) -- removeClippedSubviews, maxToRenderPerBatch tuning
- [PixelRatio Documentation](https://reactnative.dev/docs/pixelratio) -- DPI ranges, font scale ranges across platforms

### Industry Standards (HIGH confidence for domain knowledge)
- [ISA-88 Standard Overview (PLC Academy)](https://www.plcacademy.com/isa-88-s88-batch-control-explained/) -- state machine transitions, recipe/procedure/phase hierarchy
- [ISA-88 Wikipedia](https://en.wikipedia.org/wiki/ISA-88) -- batch control model, state categorization

---
*Pitfalls research for: BrainPal Mobile -- Cross-platform runtime workflow execution engine*
*Researched: 2026-02-24*
