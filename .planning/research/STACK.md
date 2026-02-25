# Stack Research

**Domain:** Cross-platform runtime workflow execution engine
**Researched:** 2026-02-24
**Confidence:** HIGH (core stack pre-decided; supporting libraries verified against current docs)

---

## Decision Context

The core technology decisions are already made per the project specification:
- React Native + Expo (managed workflow)
- TypeScript
- Zustand for state management
- expo-sqlite for local database
- Monorepo with 4 shared packages + 2 apps

This research focuses on **specific versions, supporting libraries, tooling decisions, and compatibility verification** for the chosen stack.

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Expo SDK | ~54.0 | App framework | Latest stable SDK (Sep 2025). React Native 0.81 + React 19.1. New Architecture enabled by default. Precompiled iOS builds (120s -> 10s). Last SDK where legacy arch can be disabled as fallback. | HIGH |
| React Native | 0.81.x | Cross-platform runtime | Bundled with Expo SDK 54. Targets Android 16 (edge-to-edge), iOS 26. New Architecture stable. | HIGH |
| React | 19.1.x | UI library | Bundled with RN 0.81. Suspense support, concurrent features. | HIGH |
| TypeScript | ~5.8.x | Type safety | Current stable (GA Feb 2026). Improved type narrowing, erasableSyntaxOnly flag, performance gains in watch mode. Compatible with Expo SDK 54. | HIGH |
| expo-router | ~6.0.x | File-based routing | Bundled with SDK 54. Tab navigation via JS tabs (extends Bottom Tabs Navigator v7) or native tabs (alpha). File-based routing for web + mobile. | HIGH |

**SDK Version Rationale:** The project specifies "SDK 52+" but SDK 54 is the current stable release (SDK 52 was Nov 2024, now 15 months old). SDK 54 provides React 19.1, precompiled iOS builds, stable New Architecture, and the new expo-file-system API. There is no reason to target an older SDK for a greenfield project.

**Why not SDK 55?** SDK 55 is in beta (Feb 2026). It forces New Architecture with no opt-out. For a greenfield project starting now, SDK 54 is the safe choice; upgrade to 55 once it stabilizes (likely Q2 2026).

### State Management

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Zustand | ~5.0.x | App state management | Pre-decided. v5.0.11 is current. Requires React 18+ (we have 19.1). Uses native useSyncExternalStore. Tiny bundle (~1KB). Works with React Native + Hermes + Fabric. | HIGH |

**Zustand persist middleware:** Zustand's `persist` middleware can use any storage backend via `createJSONStorage()`. For this project, do NOT use persist for critical workflow state -- that goes directly to SQLite with write-ahead semantics per the spec. Use persist only for lightweight UI preferences (theme, notification settings) with `expo-sqlite/kv-store` as the storage adapter, which provides synchronous localStorage-compatible APIs.

### Database

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| expo-sqlite | ~16.0.x | Local SQLite database | Pre-decided. v16.0.10 is current for SDK 54. Sync + async APIs. Prepared statements. Transaction support (withTransactionAsync, withExclusiveTransactionAsync). React hooks (SQLiteProvider + useSQLiteContext). Web support (alpha, requires WASM + COOP/COEP headers). | HIGH |

**Key APIs for this project:**
- `openDatabaseSync()` / `openDatabaseAsync()` -- database initialization
- `runAsync()` / `runSync()` -- write operations (INSERT, UPDATE)
- `getAllAsync()` / `getFirstAsync()` -- read operations
- `withExclusiveTransactionAsync()` -- write-ahead semantics for crash recovery
- `execAsync()` -- schema migrations (DDL statements)

**Web support caveat:** expo-sqlite web support is alpha and requires:
1. Metro bundler WASM configuration
2. HTTP headers: `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin`
3. SharedArrayBuffer support in the browser

This is a **MEDIUM risk** item for the web/Docker target. Test early.

### File System & Document Handling

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| expo-file-system | ~19.0.x | File operations | v19.0.21 current. New object-oriented API stable in SDK 54 (import from `expo-file-system`, legacy via `expo-file-system/legacy`). File/Directory classes. `pickFileAsync()` on iOS. SAF URI support on Android. | HIGH |
| expo-document-picker | ~14.0.x | .WFmasterX file import | v14.0.8 current. System file picker UI. Use with `copyToCacheDirectory: true` so expo-file-system can read immediately. Cross-platform (iOS, Android, web). | HIGH |

**File import strategy:** Use `expo-document-picker` for the file selection UI (works everywhere), then read the file bytes with `expo-file-system` for processing by the ZIP library.

### ZIP Processing

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| fflate | ~0.8.2 | ZIP extraction | **Recommended over JSZip.** Pure JavaScript, zero dependencies, 8KB minified. Works in Node.js, browser, and React Native without polyfills. Async via Worker threads (non-blocking). Uint8Array-based API (no stream/Buffer polyfills needed). 40x faster than JSZip in benchmarks. | MEDIUM |

**Why NOT JSZip (despite being in the project brief):**
1. JSZip requires `stream` and `buffer` polyfills in React Native/Expo -- Metro config hacking
2. JSZip v3.10.1 was last published ~4 years ago (2022) -- effectively unmaintained
3. JSZip's "async" still blocks the main thread (fake async)
4. Known Android issues in Expo: `getBinaryContent` returns zero bytes
5. Only works in Expo with custom dev builds (not Expo Go during development)

**Why fflate:**
1. Pure JavaScript -- works in Node.js (engine package testing), React Native (mobile), and browser (web) without polyfills
2. True async via Web/Node Workers (non-blocking decompression)
3. Zero dependencies
4. Works with Uint8Array directly (modern API)
5. Actively used (though last release was ~2 years ago, it is stable and complete)

**Risk:** fflate is also not frequently updated (v0.8.2, ~2 years old). However, ZIP format is stable and fflate's scope is complete. The critical advantage is zero polyfill requirements. If fflate proves problematic, JSZip with polyfills is the fallback.

**Alternative fallback:** `react-native-zip-archive` for native ZIP handling, but this is a native module (requires dev builds) and cannot be used in the pure TypeScript engine package.

### PDF Generation

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| expo-print | ~14.0.x | PDF from HTML | Bundled with Expo. `printToFileAsync()` generates PDF from HTML string and saves to cache. Works on iOS, Android. On web, prints the page HTML. Base64 output supported. | HIGH |
| expo-sharing | ~14.0.x | Share/export PDFs | v14.0.8 current. System share sheet for exporting generated PDFs. | HIGH |

**PDF strategy:** Generate an HTML template string for execution reports, pass to `expo-print.printToFileAsync()`, then use `expo-sharing` to share/save. This approach requires no additional dependencies and works cross-platform.

**Web caveat:** On web, `expo-print` prints the current page rather than custom HTML. For the Docker/web target, generate the HTML directly and use `window.print()` or offer the HTML as a download. This is a minor platform divergence to handle.

### SVG & Graph Rendering

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| react-native-svg | ~15.11.x | SVG rendering | v15.15.3 is latest, but use ~15.11.x for SDK 54 compatibility. Built into Expo (no native module setup). Supports all SVG elements: Rect, Circle, Line, Path, G, Text, etc. Works on iOS, Android, web. | HIGH |

**Graph rendering approach:** Build workflow graph visualizations directly with react-native-svg primitives (Rect for nodes, Path/Line for edges, Text for labels, G for grouping). Do NOT use a charting library -- the workflow graph is a custom directed graph, not a standard chart type.

**Why not react-native-svg-charts or victory-native:** These are for statistical charts (bar, line, pie), not directed workflow graphs. Custom SVG composition with react-native-svg gives full control over node layout, edge routing, and interaction handling.

### Form Rendering (WYSIWYG)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| React Native core | (bundled) | Form controls | View, Text, TextInput, ScrollView, Switch for basic form elements. Absolute positioning via `style={{ position: 'absolute', left, top, width, height }}`. | HIGH |
| react-native-svg | ~15.11.x | Canvas scaling | Use SVG viewBox for coordinate-space scaling (maps design coordinates to device pixels). Wrap form in Svg with viewBox matching the design canvas dimensions. | MEDIUM |

**WYSIWYG rendering strategy:**
The .WFmasterX forms use absolute positioning with a fixed canvas size (varies by device type: phone/tablet/desktop). Two approaches for scaling:

1. **Transform-based scaling (RECOMMENDED):** Wrap the form in a View, calculate scale factor = `deviceWidth / canvasWidth`, apply `transform: [{ scale }]`. Simpler, uses standard React Native layout.

2. **SVG viewBox scaling:** Use `<Svg viewBox="0 0 canvasW canvasH">` with `<ForeignObject>` for form elements. More complex, ForeignObject support may be inconsistent across platforms.

Recommend approach 1 (transform scaling) for simplicity and reliability.

### Navigation & UI

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| expo-router | ~6.0.x | Navigation | File-based routing. Bottom tabs via `(tabs)` layout. Stack navigation within tabs. Web + mobile from same route structure. | HIGH |
| react-native-safe-area-context | ~5.6.x | Safe area insets | v5.6.2 current. Required since React Native deprecated its built-in SafeAreaView in RN 0.81. | HIGH |
| react-native-gesture-handler | ~2.28.x | Gesture handling | Bundled with SDK 54. Required by expo-router and navigation. Carousel swipe gestures. | HIGH |
| react-native-reanimated | ~4.1.x | Animations | v4.1.5+ for SDK 54. New Architecture only (v4 dropped legacy arch). Requires react-native-worklets as peer dependency. Smooth carousel transitions, state change animations. | HIGH |

### Notifications

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| expo-notifications | ~0.32.x | Local notifications | v0.32.16 current. Local (in-app) notifications for step attention, state transitions, errors, timeouts. Scheduling support for timeouts. Works in Expo Go. | HIGH |

### Development Tools

| Tool | Version | Purpose | Notes | Confidence |
|------|---------|---------|-------|------------|
| Turborepo | ~2.8.x | Monorepo task runner | v2.8.10 current. Caches task results, parallel execution, works with npm workspaces. NOT required but recommended for build orchestration. | HIGH |
| Vitest | ~4.0.x | Package testing (engine, protocol, storage) | v4.0.18 current. For pure TypeScript packages that run in Node.js. 10x faster than Jest. Native ESM + TypeScript. Use for `packages/engine`, `packages/protocol`, `packages/storage`. | HIGH |
| Jest + jest-expo | ~30.x / ~54.x | App testing (mobile, web) | Jest is required for React Native component testing (Vitest cannot test RN). jest-expo provides iOS/Android/web/node presets. Use `jest-expo/universal` for cross-platform snapshots. Use for `apps/mobile`, `apps/web`, `packages/ui`. | HIGH |
| ESLint | ~9.x | Linting | Flat config format. Use with `@typescript-eslint/parser` and Expo's eslint config. | MEDIUM |
| Prettier | ~3.x | Code formatting | Standard formatting. Configure in root of monorepo. | MEDIUM |

**Testing split rationale:**
- **Vitest for packages:** The engine, protocol, and storage packages are pure TypeScript with no React Native dependencies. Vitest is dramatically faster (10x), has native ESM support, and doesn't need the React Native transform pipeline.
- **Jest for apps/UI:** React Native components require jest-expo's transform pipeline (Babel, Metro resolver). Vitest cannot replace Jest here -- this is a hard constraint of the React Native ecosystem.

---

## Monorepo Configuration

### Structure

```
brainpal-mobile/
  apps/
    mobile/          # Expo app (iOS, Android)
    web/             # Expo web app (Docker target)
  packages/
    engine/          # Pure TypeScript - workflow execution, state machine, scheduler
    protocol/        # Pure TypeScript - data model types, serialization
    storage/         # Platform-bridged - SQLite operations (uses expo-sqlite types)
    ui/              # React Native - shared UI components
  package.json       # Root: workspaces config
  turbo.json         # Turborepo pipeline config
  tsconfig.base.json # Shared TypeScript config
```

### Package Manager: npm workspaces

| Option | Recommendation | Rationale |
|--------|---------------|-----------|
| npm workspaces | **RECOMMENDED** | Pre-decided in project context. Expo officially supports npm workspaces (SDK 52+). Metro auto-configures for npm workspaces. No workspace: protocol (use "*" for local refs). Simplest setup. |
| pnpm workspaces | Alternative | Faster installs, strict hoisting. But adds complexity (pnpm-workspace.yaml, phantom dependency issues with Metro). |
| Yarn Berry | Not recommended | Plug'n'Play has known issues with React Native Metro bundler. |

**Root package.json workspaces config:**
```json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

**Internal package naming:** Use `@brainpal/` namespace prefix (e.g., `@brainpal/engine`, `@brainpal/protocol`) to avoid npm registry conflicts.

### Turborepo Pipeline

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

---

## Installation

```bash
# Initialize Expo project with SDK 54
npx create-expo-app@latest brainpal-mobile --template tabs

# Core Expo packages (use npx expo install for version compatibility)
npx expo install expo-sqlite expo-file-system expo-document-picker expo-print expo-sharing expo-notifications

# Navigation (bundled, but ensure versions)
npx expo install expo-router react-native-safe-area-context react-native-gesture-handler react-native-reanimated react-native-worklets react-native-screens

# SVG
npx expo install react-native-svg

# State management
npm install zustand

# ZIP processing (pure JS, no expo install needed)
npm install fflate

# Dev dependencies (root of monorepo)
npm install -D turbo vitest @vitest/coverage-v8 typescript

# App-level dev dependencies
npm install -D jest jest-expo @testing-library/react-native @testing-library/jest-native

# Linting
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-config prettier
```

**CRITICAL:** Always use `npx expo install` for Expo SDK packages. It resolves the correct version for your SDK. Using `npm install` directly risks version mismatches.

---

## Alternatives Considered

| Category | Recommended | Alternative | When to Use Alternative |
|----------|-------------|-------------|-------------------------|
| ZIP library | fflate | JSZip 3.10.1 | If fflate has compatibility issues with a specific platform. Requires stream/buffer polyfills in Metro config. |
| ZIP library | fflate | react-native-zip-archive | If native-speed ZIP processing is needed for very large files. Requires dev builds (no Expo Go). Cannot be used in pure TS engine package. |
| State management | Zustand 5 | Jotai | If you prefer atomic state. Zustand is pre-decided and better suited for the complex workflow state model (single store with slices). |
| Navigation | expo-router 6 | React Navigation 7 (direct) | If file-based routing causes issues. expo-router wraps React Navigation, so the underlying APIs are available. |
| Testing (packages) | Vitest 4 | Jest 30 | If maintaining two test runners is too much overhead. Use jest-expo for everything, but accept slower test runs for pure TS packages. |
| PDF generation | expo-print | react-native-html-to-pdf | For bare React Native projects. Not needed with Expo managed workflow. |
| Form rendering | Transform scaling | react-native-web View | For web-only. Transform scaling works cross-platform. |
| Monorepo | npm workspaces + Turborepo | Nx | If you need more advanced dependency graph analysis, affected commands, or distributed caching. Heavier setup. |
| Monorepo | npm workspaces + Turborepo | Plain npm workspaces | If Turborepo's caching/parallelism isn't needed. Works fine for smaller teams. Add Turborepo later if builds slow down. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| JSZip (as primary) | Requires stream/buffer polyfills in RN. Last release 4 years ago. Known Android issues. Fake async (blocks main thread). | fflate -- zero polyfills, true async, pure JS |
| AsyncStorage | Deprecated in favor of expo-sqlite/kv-store. Slower. No SQL query capability. | expo-sqlite (full DB) or expo-sqlite/kv-store (key-value) |
| Redux / Redux Toolkit | Massive boilerplate for workflow state. Zustand does the same with 90% less code. | Zustand 5 (pre-decided) |
| react-native-sqlite-storage | Third-party SQLite with known Expo compatibility issues. Not maintained for New Architecture. | expo-sqlite (first-party, maintained by Expo team) |
| Yarn Berry (PnP mode) | Plug'n'Play has known Metro bundler incompatibilities. | npm workspaces |
| react-native-zip-archive | Native module -- cannot be used in pure TS engine package. Requires dev builds. | fflate for engine, expo-file-system for file I/O |
| WatermelonDB | Over-engineered for this use case. Adds ORM complexity. The project needs direct SQL control for write-ahead semantics. | expo-sqlite with raw SQL |
| NativeWind / Tailwind | Adds build complexity. The WYSIWYG form renderer needs absolute positioning, not utility classes. | React Native StyleSheet with computed styles |
| Expo Go (for development) | Several packages (notifications, document-picker on some platforms) require dev builds. Expo Go restrictions will slow development. | EAS development builds from day one |
| react-native-webview (for forms) | Tempting for WYSIWYG rendering but adds bridge overhead, complicates state management, and breaks crash recovery semantics. | Native React Native views with absolute positioning |

---

## Version Compatibility Matrix

| Package | SDK 54 Compatible Version | Notes |
|---------|---------------------------|-------|
| expo | ~54.0.33 | Current latest |
| react-native | 0.81.x | Bundled with SDK 54 |
| react | 19.1.x | Bundled with RN 0.81 |
| expo-router | ~6.0.23 | v6 for SDK 54 |
| expo-sqlite | ~16.0.10 | Web support alpha |
| expo-file-system | ~19.0.21 | New API stable in SDK 54 |
| expo-document-picker | ~14.0.8 | |
| expo-print | ~14.0.x | |
| expo-sharing | ~14.0.8 | |
| expo-notifications | ~0.32.16 | |
| react-native-svg | ~15.11.x | Use SDK-bundled version |
| react-native-reanimated | ~4.1.5 | Requires react-native-worklets |
| react-native-gesture-handler | ~2.28.x | SDK 54 bundled version |
| react-native-safe-area-context | ~5.6.x | |
| zustand | ~5.0.11 | npm install (not expo install) |
| fflate | ~0.8.2 | npm install (pure JS) |
| typescript | ~5.8.x | Dev dependency |
| vitest | ~4.0.18 | Dev dependency (packages only) |
| jest | ~30.x | Dev dependency (apps + ui package) |
| jest-expo | ~54.x | Matches SDK version |
| turbo | ~2.8.x | Dev dependency (root) |

---

## Stack Patterns by Variant

**If pure TypeScript package (engine, protocol):**
- Test with Vitest
- No React/React Native imports
- Use fflate for ZIP (works in Node.js)
- Types only from protocol package (no runtime platform deps)
- Build with `tsc` or `tsup` to dist/

**If platform-bridged package (storage):**
- Test with Vitest for logic, Jest for integration
- Import expo-sqlite types but abstract behind interfaces
- Platform-specific implementations injected at app level
- Define Storage interface in protocol, implement in storage package

**If React Native package (ui):**
- Test with Jest + jest-expo + @testing-library/react-native
- Can import from react-native, react-native-svg, etc.
- Shared components used by both mobile and web apps

**If Expo app (mobile, web):**
- Test with Jest + jest-expo
- Wire up dependency injection (storage impl, platform APIs)
- Configure expo-router layouts
- Handle platform-specific code with `.ios.ts` / `.android.ts` / `.web.ts` extensions

---

## Sources

### Official Documentation (HIGH confidence)
- [Expo SDK 54 Changelog](https://expo.dev/changelog/sdk-54) -- SDK 54 features, React Native 0.81, New Architecture
- [Expo SQLite Documentation](https://docs.expo.dev/versions/latest/sdk/sqlite/) -- API reference, web support status, sync/async methods
- [Expo Monorepo Guide](https://docs.expo.dev/guides/monorepos/) -- npm/pnpm/yarn workspace support, Metro auto-config
- [Expo Print Documentation](https://docs.expo.dev/versions/latest/sdk/print/) -- PDF generation from HTML
- [Expo FileSystem Documentation](https://docs.expo.dev/versions/latest/sdk/filesystem/) -- New API in SDK 54, pickFileAsync
- [Expo Router Documentation](https://docs.expo.dev/versions/latest/sdk/router/) -- v6 tab navigation
- [TypeScript 5.8 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html)

### NPM Package Pages (HIGH confidence for version numbers)
- [expo npm](https://www.npmjs.com/package/expo) -- v54.0.33
- [zustand npm](https://www.npmjs.com/package/zustand) -- v5.0.11
- [fflate npm](https://www.npmjs.com/package/fflate) -- v0.8.2
- [react-native-svg npm](https://www.npmjs.com/package/react-native-svg) -- v15.15.3
- [vitest npm](https://www.npmjs.com/package/vitest) -- v4.0.18
- [turbo npm](https://www.npmjs.com/package/@turbo/workspaces) -- v2.8.10

### Community / Verified Sources (MEDIUM confidence)
- [JSZip Expo Issue #521](https://github.com/Stuk/jszip/issues/521) -- JSZip compatibility problems with Expo
- [fflate GitHub](https://github.com/101arrowz/fflate) -- Pure JS, zero deps, performance benchmarks
- [Vitest vs Jest 2026](https://www.sitepoint.com/vitest-vs-jest-2026-migration-benchmark/) -- Performance comparison, RN limitation noted
- [Expo SDK 54 Upgrade Guide](https://medium.com/@shanavascruise/upgrading-to-expo-54-and-react-native-0-81-a-developers-survival-story-2f58abf0e326) -- Real-world upgrade experience

---
*Stack research for: BrainPal Mobile -- Cross-platform workflow execution engine*
*Researched: 2026-02-24*
