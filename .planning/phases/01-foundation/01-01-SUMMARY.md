---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [expo, monorepo, npm-workspaces, metro, react-native, typescript, design-system]

# Dependency graph
requires:
  - phase: none
    provides: first plan in project
provides:
  - Monorepo with npm workspaces (apps/*, packages/*)
  - Four shared packages (@brainpal/engine, @brainpal/protocol, @brainpal/storage, @brainpal/ui)
  - Expo SDK 54 app with expo-router 6 tab navigation (5 tabs)
  - Metro config with WASM asset support and COOP/COEP headers for web SharedArrayBuffer
  - Design system foundation (colors, typography, spacing tokens)
  - Single React version enforcement via npm overrides
affects: [01-foundation, 02-engine-core, 03-execution-ui, 04-ancillary, 05-polish]

# Tech tracking
tech-stack:
  added: [expo@54.0.33, react@19.1.0, react-native@0.81.5, expo-router@6.0.23, expo-sqlite@16.0.10, zustand@5.0.11, react-native-reanimated@4.1.1, react-native-safe-area-context@5.6.0, react-native-screens@4.16.0, react-native-web@0.21.0, turbo@2.8.x, typescript@5.9.x]
  patterns: [npm-workspaces-monorepo, expo-sdk54-metro-autoconfig, peer-deps-for-shared-packages, theme-token-export-pattern, coop-coep-middleware]

key-files:
  created: [package.json, tsconfig.base.json, turbo.json, apps/mobile/package.json, apps/mobile/app.json, apps/mobile/tsconfig.json, apps/mobile/metro.config.js, apps/mobile/app/_layout.tsx, apps/mobile/app/(tabs)/_layout.tsx, apps/mobile/app/(tabs)/index.tsx, apps/mobile/app/(tabs)/execute.tsx, apps/mobile/app/(tabs)/overview.tsx, apps/mobile/app/(tabs)/history.tsx, apps/mobile/app/(tabs)/settings.tsx, packages/engine/package.json, packages/engine/src/index.ts, packages/protocol/package.json, packages/protocol/src/index.ts, packages/storage/package.json, packages/storage/src/index.ts, packages/ui/package.json, packages/ui/src/index.ts, packages/ui/src/theme/colors.ts, packages/ui/src/theme/typography.ts, packages/ui/src/theme/spacing.ts, packages/ui/src/theme/index.ts]
  modified: []

key-decisions:
  - "Used react-native@0.81.5 (not 0.81.0) to match Expo SDK 54 internal peer override"
  - "TypeScript upgraded to ~5.9.2 per Expo SDK 54 compatibility recommendation"
  - "Shared packages point main/types directly at src/index.ts (no build step for dev)"
  - "COEP header uses 'credentialless' (not 'require-corp') for broader compatibility"
  - "@expo/vector-icons v15 used (SDK 54 default, not v14 from research)"

patterns-established:
  - "Workspace packages use peerDependencies for React/RN, never direct dependencies"
  - "Theme tokens exported as const objects from @brainpal/ui for type safety"
  - "SafeAreaView always from react-native-safe-area-context (not deprecated built-in)"
  - "Metro auto-configures monorepo resolution in SDK 54 (no manual watchFolders)"

# Metrics
duration: 8min
completed: 2026-02-25
---

# Phase 1 Plan 1: Monorepo Scaffold Summary

**npm workspaces monorepo with Expo SDK 54, 4 shared packages, 5-tab navigation, Metro COOP/COEP web config, and design system tokens**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-25T02:49:58Z
- **Completed:** 2026-02-25T02:58:20Z
- **Tasks:** 2
- **Files modified:** 33

## Accomplishments
- Monorepo with npm workspaces resolving all 4 shared packages (@brainpal/engine, protocol, storage, ui)
- Expo SDK 54 app with expo-router 6 tab navigation (Home, Execute, Overview, History, Settings)
- Metro config with WASM asset extension and COOP/COEP headers for web SharedArrayBuffer support
- Design system foundation: color palette, typography scale, and spacing tokens in @brainpal/ui
- Single React 19.1.0 instance verified across entire dependency tree (no duplicates)
- Web export validated: Metro bundles 716 modules without resolution errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create monorepo structure with npm workspaces and shared packages** - `26cf8b4` (feat)
2. **Task 2: Create expo-router tab navigation with 5 placeholder screens** - `b073cca` (feat)

## Files Created/Modified
- `package.json` - Root workspace config with npm workspaces and React/RN overrides
- `tsconfig.base.json` - Shared TypeScript config (ES2022, bundler module resolution)
- `turbo.json` - Turborepo build/typecheck pipeline
- `apps/mobile/package.json` - Expo app with SDK 54 dependencies and workspace refs
- `apps/mobile/app.json` - Expo config (name, scheme, web bundler, plugins)
- `apps/mobile/tsconfig.json` - App TypeScript config with @brainpal/* path aliases
- `apps/mobile/metro.config.js` - Metro config with WASM + COOP/COEP middleware
- `apps/mobile/app/_layout.tsx` - Root Stack layout wrapping tab group
- `apps/mobile/app/(tabs)/_layout.tsx` - Tab navigator with 5 themed tabs
- `apps/mobile/app/(tabs)/index.tsx` - Home screen with theme token imports
- `apps/mobile/app/(tabs)/execute.tsx` - Execute placeholder screen
- `apps/mobile/app/(tabs)/overview.tsx` - Overview placeholder screen
- `apps/mobile/app/(tabs)/history.tsx` - History placeholder screen
- `apps/mobile/app/(tabs)/settings.tsx` - Settings placeholder screen
- `packages/engine/src/index.ts` - Engine package stub (ENGINE_VERSION export)
- `packages/protocol/src/index.ts` - Protocol package stub (PROTOCOL_VERSION export)
- `packages/storage/src/index.ts` - Storage package stub (STORAGE_VERSION export)
- `packages/ui/src/index.ts` - UI package public API (re-exports theme)
- `packages/ui/src/theme/colors.ts` - Color palette (primary, text, background, status)
- `packages/ui/src/theme/typography.ts` - Typography scale (heading, subheading, body, caption)
- `packages/ui/src/theme/spacing.ts` - Spacing tokens (xs through xxl)
- `packages/ui/src/theme/index.ts` - Theme barrel export

## Decisions Made
- Used react-native@0.81.5 to match Expo SDK 54's internal peer dependency override (0.81.0 caused ERESOLVE conflict)
- Upgraded TypeScript to ~5.9.2 per Expo SDK 54 compatibility recommendation (5.8.x produced warning)
- Used @expo/vector-icons v15 (SDK 54 default) instead of v14 from research doc
- Shared packages point main/types at src/index.ts directly (Metro resolves .ts; no build step needed for dev)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed react-native version to 0.81.5**
- **Found during:** Task 1 (npm install)
- **Issue:** Plan specified react-native 0.81.0 but Expo SDK 54.0.33 has internal peer override requiring 0.81.5, causing ERESOLVE conflict
- **Fix:** Changed react-native from 0.81.0 to 0.81.5
- **Files modified:** apps/mobile/package.json
- **Verification:** npm install succeeds, npm ls shows no errors
- **Committed in:** 26cf8b4 (Task 1 commit)

**2. [Rule 3 - Blocking] Upgraded TypeScript to ~5.9.2**
- **Found during:** Task 2 (expo start verification)
- **Issue:** Expo warned "typescript@5.8.3 - expected version: ~5.9.2" during Metro startup
- **Fix:** Updated TypeScript from ~5.8.0 to ~5.9.2 in both root and app package.json
- **Files modified:** package.json, apps/mobile/package.json
- **Verification:** tsc --noEmit passes, Expo warning resolved
- **Committed in:** b073cca (Task 2 commit)

**3. [Rule 3 - Blocking] Used npx expo install for version pinning**
- **Found during:** Task 1 (npm install)
- **Issue:** Hardcoded Expo package versions from research doc were outdated (e.g., @expo/metro-runtime ~5.0.0 should be ~6.1.2, expo-router ~6.0.0 should be ~6.0.23)
- **Fix:** Used `npx expo install` to let Expo determine compatible versions for all SDK 54 packages
- **Files modified:** apps/mobile/package.json
- **Verification:** All packages install without conflicts
- **Committed in:** 26cf8b4 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All auto-fixes necessary to resolve version mismatches between research-phase version estimates and actual Expo SDK 54.0.33 requirements. No scope creep.

## Issues Encountered
- npm install initially produced a cryptic exit code 1 with no visible error message (only shown in verbose debug log). Required examining the ERESOLVE report to identify the react-native version conflict.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Monorepo scaffold complete, all shared packages resolve from apps/mobile
- Metro COOP/COEP headers configured for web SharedArrayBuffer (needed for wa-sqlite)
- Design system tokens established in @brainpal/ui
- Ready for Plan 01-02 (SQLite persistence layer) and Plan 01-03 (cross-platform verification)
- No blockers

---
*Phase: 01-foundation*
*Completed: 2026-02-25*
