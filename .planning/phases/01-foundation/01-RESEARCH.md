# Phase 1: Foundation - Research

**Researched:** 2026-02-24
**Domain:** Expo monorepo scaffold, SQLite persistence (WAL + write-ahead), Zustand read-through cache, cross-platform baseline (Android, iOS, web)
**Confidence:** HIGH (core stack verified via official docs and Context7; web platform details MEDIUM due to alpha status)

## Summary

Phase 1 establishes the project's structural foundation: a monorepo with shared packages, a correctly configured SQLite persistence layer with write-ahead semantics, Zustand stores as read-through caches of SQLite state, and a placeholder app shell that runs on all three target platforms (Android, iOS, web).

The standard approach uses Expo SDK 54 with npm workspaces, expo-sqlite ~16.x for native SQLite with WAL mode, metro.config.js enhancements for web WASM/COOP/COEP support, and expo-router 6 for file-based tab navigation. The full database schema (15+ tables from StorageSpec.md) is created upfront with a drop-and-recreate strategy during v1 development.

The highest-risk element is expo-sqlite web support (alpha quality, wa-sqlite backend, OPFS file capacity limits). The recommended mitigation is to test web from day one and implement a JS-level write queue that transparently replaces `withExclusiveTransactionAsync` on web.

**Primary recommendation:** Build the monorepo scaffold with Metro auto-config (SDK 54), implement the SQLite persistence layer with platform-aware transaction handling (exclusive transactions on native, serialized write queue on web), wire Zustand as a pure read-through cache that rebuilds from SQLite on startup, and verify all five platforms (Android emulator, Android physical device, iOS simulator, Chrome, Firefox) before declaring Phase 1 complete.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Expo SDK | ~54.0 | App framework | Latest stable. React Native 0.81, React 19.1. New Architecture default. Precompiled iOS builds. Auto-configures Metro for monorepos. |
| React Native | 0.81.x | Cross-platform runtime | Bundled with SDK 54. Targets Android 16 (edge-to-edge), iOS 26. |
| React | 19.1.x | UI library | Bundled with RN 0.81. |
| TypeScript | ~5.8.x | Type safety | Current stable (Feb 2026 GA). Compatible with Expo SDK 54. |
| expo-sqlite | ~16.0.x | Local SQLite database | First-party. Sync + async APIs. Exclusive transactions (native). Web support (alpha, wa-sqlite/OPFS). |
| Zustand | ~5.0.x | State management | Pre-decided. v5.0.11 current. Tiny (~1KB). `useSyncExternalStore` based. Works with RN + Hermes + Fabric. |
| expo-router | ~6.0.x | File-based routing | Bundled with SDK 54. Bottom Tabs Navigator v7. File-based routing for mobile + web. |

**Confidence:** HIGH -- all versions verified against Expo SDK 54 changelog and npm registry.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-native-safe-area-context | ~5.6.x | Safe area insets | Always -- RN 0.81 deprecated built-in SafeAreaView |
| react-native-screens | (SDK bundled) | Native navigation screens | Required by expo-router |
| react-native-gesture-handler | ~2.28.x | Gesture handling | Required by expo-router |
| react-native-reanimated | ~4.1.x | Animations | Required for tab transitions; New Arch only in v4 |
| react-native-web | (latest compatible) | Web rendering | Required for web target; wraps react-dom primitives |
| react-dom | (latest compatible) | Web DOM rendering | Required for web target |
| @expo/metro-runtime | (SDK bundled) | Metro runtime for web | Required for web target |
| @expo/vector-icons | (SDK bundled) | Icon library | Tab bar icons |
| Turborepo | ~2.8.x | Monorepo task runner | Build orchestration, caching, parallel builds |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| npm workspaces | pnpm workspaces | Faster installs, stricter hoisting. But adds pnpm-workspace.yaml complexity and potential Metro phantom dependency issues. npm is simpler and officially supported. |
| Turborepo | Plain npm workspaces | No caching or parallel builds, but acceptable for Phase 1 scope. Add Turborepo if build times matter. |
| expo-router tabs | React Navigation direct | Loses file-based routing, requires manual navigator setup. expo-router wraps React Navigation so fallback APIs are available. |
| Expo Go (development) | EAS Development Builds | Dev builds give full native parity. But expo-sqlite works in Expo Go, and Phase 1 does not require native modules beyond what Expo Go provides. Start with Expo Go, switch to dev builds when needed (likely Phase 2 for document picker). |

**Installation:**
```bash
# Create Expo project with SDK 54 tabs template
npx create-expo-app@latest brainpal-mobile --template tabs

# Move into project and set up workspaces (manual restructure to monorepo)
# See Architecture Patterns section below for detailed steps

# Core Expo packages (use npx expo install for version pinning)
npx expo install expo-sqlite react-native-safe-area-context react-native-gesture-handler react-native-reanimated react-native-screens

# Web support
npx expo install react-dom react-native-web @expo/metro-runtime

# State management (npm, not expo install)
npm install zustand

# Dev dependencies (root)
npm install -D turbo typescript
```

## Architecture Patterns

### Recommended Project Structure

```
brainpal-mobile/
+-- apps/
|   +-- mobile/                      # Expo app (Android + iOS + web)
|   |   +-- app/                     # expo-router file-based routes
|   |   |   +-- _layout.tsx          # Root Stack layout
|   |   |   +-- (tabs)/              # Tab group
|   |   |       +-- _layout.tsx      # Tabs layout (5 tabs)
|   |   |       +-- index.tsx        # Home tab
|   |   |       +-- execute.tsx      # Execute tab
|   |   |       +-- overview.tsx     # Overview tab
|   |   |       +-- history.tsx      # History tab
|   |   |       +-- settings.tsx     # Settings tab
|   |   +-- src/
|   |   |   +-- stores/              # Zustand store definitions
|   |   |   +-- providers/           # SQLiteProvider wrapper, DB init
|   |   |   +-- db/                  # Database initialization, seed script
|   |   |   +-- theme/               # Colors, typography, spacing tokens
|   |   +-- metro.config.js          # Metro config (auto + web WASM/COOP/COEP)
|   |   +-- app.json                 # Expo config
|   |   +-- package.json
|   |
+-- packages/
|   +-- engine/                      # Pure TypeScript (NO platform deps)
|   |   +-- src/
|   |   |   +-- interfaces/          # Storage/protocol interfaces (Phase 1: stubs)
|   |   |   +-- types/               # Shared data model types
|   |   |   +-- index.ts             # Public API surface
|   |   +-- package.json
|   |   +-- tsconfig.json
|   |
|   +-- protocol/                    # Pure TypeScript (stub in Phase 1)
|   |   +-- src/
|   |   |   +-- index.ts
|   |   +-- package.json
|   |   +-- tsconfig.json
|   |
|   +-- storage/                     # SQLite via expo-sqlite
|   |   +-- src/
|   |   |   +-- database/
|   |   |   |   +-- connection.ts    # DB open, WAL pragma, foreign keys
|   |   |   |   +-- schema.ts        # All CREATE TABLE statements
|   |   |   |   +-- seed.ts          # Dev seed: master workflow + environment
|   |   |   |   +-- write-queue.ts   # Platform-aware write serialization
|   |   |   +-- repositories/        # DAO pattern (Phase 1: subset)
|   |   |   |   +-- master-workflow.repo.ts
|   |   |   |   +-- environment-value-property.repo.ts
|   |   |   +-- helpers/
|   |   |   |   +-- write-ahead.ts   # transactionalUpdate() helper
|   |   |   +-- types/
|   |   |   +-- index.ts
|   |   +-- package.json
|   |   +-- tsconfig.json
|   |
|   +-- ui/                          # Shared React Native components
|       +-- src/
|       |   +-- theme/               # Color palette, typography, spacing
|       |   |   +-- colors.ts
|       |   |   +-- typography.ts
|       |   |   +-- spacing.ts
|       |   |   +-- index.ts
|       |   +-- common/              # Buttons, cards (Phase 1: minimal)
|       |   +-- index.ts
|       +-- package.json
|       +-- tsconfig.json
|
+-- package.json                     # Root: workspaces, npm overrides
+-- tsconfig.base.json               # Shared TypeScript config
+-- turbo.json                       # Turborepo pipeline
```

**Key structural decision:** Phase 1 uses a SINGLE app (`apps/mobile`) that serves all three platforms (Android, iOS, and web via `npx expo start --web`). There is no separate `apps/web` directory. Expo's built-in web support (`react-native-web`) handles the web target from the same codebase. A separate `apps/web` with Docker/Express is only needed for production deployment with custom server-side logic -- this is deferred to when web deployment actually requires it.

### Pattern 1: Monorepo with npm Workspaces + Expo SDK 54 Auto-Config

**What:** A monorepo where the root `package.json` declares workspaces, and each app/package has its own `package.json`. Expo SDK 54 automatically configures Metro to resolve workspace packages without manual `watchFolders` or `nodeModulesPaths` configuration.

**When to use:** Always. This is the project's foundational structure.

**Key rules:**
1. React, React Native, and expo are dependencies ONLY of `apps/mobile` -- never of shared packages.
2. Shared packages list React/RN as `peerDependencies` if they use React APIs (ui package only).
3. Root `package.json` uses npm `overrides` to force single versions of React and React Native.
4. Internal packages use `@brainpal/` namespace prefix.

**Root package.json:**
```json
{
  "name": "brainpal-mobile",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "overrides": {
    "react": "$react",
    "react-native": "$react-native"
  },
  "devDependencies": {
    "turbo": "~2.8.0",
    "typescript": "~5.8.0"
  }
}
```

**Shared package package.json (e.g., @brainpal/storage):**
```json
{
  "name": "@brainpal/storage",
  "version": "0.0.1",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "expo-sqlite": "~16.0.0"
  },
  "peerDependencies": {
    "react": "*"
  }
}
```

**Note on `main` and `types`:** During development, point directly at TypeScript source (`src/index.ts`). Metro can resolve `.ts` files directly. No build step needed for shared packages during development. Add a `dist/` build output for production if needed later.

**Confidence:** HIGH -- verified against Expo monorepo guide and SDK 54 changelog.

### Pattern 2: Metro Config for Web WASM + COOP/COEP Headers

**What:** Metro configuration that enables expo-sqlite on web by adding WASM asset support and SharedArrayBuffer security headers.

**When to use:** Always. Required for expo-sqlite web target.

**Code (metro.config.js in apps/mobile):**
```javascript
// Source: Expo SQLite docs + GitHub issue #39903
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable WASM asset resolution for wa-sqlite on web
config.resolver.assetExts.push('wasm');

// Add COOP/COEP headers for SharedArrayBuffer (required by wa-sqlite)
const originalEnhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, metroServer) => {
  // Preserve any existing middleware enhancements
  if (originalEnhanceMiddleware) {
    middleware = originalEnhanceMiddleware(middleware, metroServer);
  }
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return middleware(req, res, next);
  };
};

module.exports = config;
```

**Important:** Use `credentialless` for COEP (not `require-corp`). The `require-corp` value breaks loading of cross-origin resources (CDN fonts, external images) unless each has a CORP header. `credentialless` is more permissive and sufficient for SharedArrayBuffer.

**Confidence:** HIGH -- verified via Expo SQLite docs and confirmed working configuration from GitHub issue #39903.

### Pattern 3: SQLite Initialization with WAL Mode and Full Schema

**What:** Database initialization that enables WAL mode (native only), enables foreign keys, and creates all 15+ tables from StorageSpec.md in a single `onInit` callback via `SQLiteProvider`.

**When to use:** Always. Database is initialized before the app renders.

**Code:**
```typescript
// Source: Expo SQLite documentation
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  // Enable WAL mode (native only -- wa-sqlite does not support it)
  if (Platform.OS !== 'web') {
    await db.execAsync('PRAGMA journal_mode = WAL');
  }

  // Enable foreign keys
  await db.execAsync('PRAGMA foreign_keys = ON');

  // Create all tables (drop first during v1 development)
  await db.execAsync(`
    DROP TABLE IF EXISTS offline_action_queue;
    DROP TABLE IF EXISTS sync_barriers;
    DROP TABLE IF EXISTS resource_queue;
    DROP TABLE IF EXISTS resource_pools;
    DROP TABLE IF EXISTS workflow_value_properties;
    DROP TABLE IF EXISTS environment_value_properties;
    DROP TABLE IF EXISTS state_transitions;
    DROP TABLE IF EXISTS execution_log_entries;
    DROP TABLE IF EXISTS environment_bindings;
    DROP TABLE IF EXISTS runtime_connections;
    DROP TABLE IF EXISTS runtime_steps;
    DROP TABLE IF EXISTS runtime_workflows;
    DROP TABLE IF EXISTS package_images;
    DROP TABLE IF EXISTS master_actions;
    DROP TABLE IF EXISTS master_environments;
    DROP TABLE IF EXISTS master_workflows;
    DROP TABLE IF EXISTS server_connections;
    DROP TABLE IF EXISTS notification_preferences;
  `);

  // Create all tables from StorageSpec.md
  await db.execAsync(`
    CREATE TABLE master_workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      oid TEXT NOT NULL UNIQUE,
      local_id TEXT NOT NULL,
      version TEXT NOT NULL,
      description TEXT,
      schema_version TEXT NOT NULL DEFAULT '4.0',
      last_modified_date TEXT NOT NULL,
      specification_json TEXT NOT NULL,
      downloaded_at TEXT NOT NULL,
      source_server_url TEXT,
      source_library_oid TEXT,
      package_file_name TEXT
    );
    CREATE INDEX idx_master_workflows_local_id ON master_workflows(local_id);

    -- ... (all remaining tables from StorageSpec.md)
    -- Full schema is in StorageSpec.md -- copy verbatim
  `);

  // Set schema version
  await db.execAsync('PRAGMA user_version = 1');
}

// In app root layout:
export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="brainpal_mobile.db" onInit={initializeDatabase}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </SQLiteProvider>
  );
}
```

**Confidence:** HIGH -- SQLiteProvider and onInit pattern verified from Expo SQLite docs.

### Pattern 4: Platform-Aware Write Serialization (Write Queue)

**What:** A write serialization layer that uses `withExclusiveTransactionAsync` on native platforms and a JS-level FIFO queue on web. This transparently handles the wa-sqlite limitation (no exclusive transactions on web).

**When to use:** For ALL write operations. This is the foundation of write-ahead semantics.

**Code:**
```typescript
// packages/storage/src/database/write-queue.ts
import { type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

type WriteOperation<T> = (db: SQLiteDatabase) => Promise<T>;

/**
 * Platform-aware write serialization.
 * - Native: uses withExclusiveTransactionAsync for true transaction isolation
 * - Web: uses a JS-level FIFO queue to serialize all writes
 */
export class WriteQueue {
  private queue: Array<{
    operation: WriteOperation<any>;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }> = [];
  private processing = false;

  constructor(private db: SQLiteDatabase) {}

  async execute<T>(operation: WriteOperation<T>): Promise<T> {
    if (Platform.OS !== 'web') {
      // Native: use exclusive transactions for true isolation
      return this.db.withExclusiveTransactionAsync(async (txn) => {
        return operation(txn as unknown as SQLiteDatabase);
      });
    }

    // Web: serialize through FIFO queue
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const { operation, resolve, reject } = this.queue.shift()!;
      try {
        const result = await operation(this.db);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.processing = false;
  }
}
```

**Confidence:** HIGH for native path (verified API). MEDIUM for web path (write queue is a standard pattern, but wa-sqlite alpha status means edge cases may exist).

### Pattern 5: Write-Ahead Helper (SQLite before Zustand)

**What:** A helper function that enforces the write-ahead ordering contract: SQLite write completes BEFORE Zustand state is updated. Every state mutation flows through this helper.

**When to use:** For ALL state mutations that need crash safety. In Phase 1, this is used for Environment Value Properties and any seed data operations.

**Code:**
```typescript
// packages/storage/src/helpers/write-ahead.ts
import { type SQLiteDatabase } from 'expo-sqlite';

/**
 * Enforces write-ahead semantics:
 * 1. Execute SQL write(s) against SQLite
 * 2. Only if SQL succeeds, execute the in-memory state update
 *
 * If the app crashes between steps 1 and 2, SQLite has the truth.
 * On restart, Zustand rebuilds from SQLite.
 */
export async function writeAhead<T>(
  sqliteWrite: () => Promise<T>,
  stateUpdate: (result: T) => void,
): Promise<T> {
  // Step 1: Write to SQLite (crash-safe)
  const result = await sqliteWrite();

  // Step 2: Update in-memory state (Zustand)
  stateUpdate(result);

  return result;
}
```

**Usage in a Zustand store:**
```typescript
// apps/mobile/src/stores/environment-store.ts
import { create } from 'zustand';
import { writeAhead } from '@brainpal/storage';

interface EnvironmentState {
  valueProperties: Map<string, any>;
  isLoaded: boolean;
  loadFromDb: (db: SQLiteDatabase) => Promise<void>;
  updateProperty: (db: SQLiteDatabase, envOid: string, name: string, value: any) => Promise<void>;
}

export const useEnvironmentStore = create<EnvironmentState>()((set, get) => ({
  valueProperties: new Map(),
  isLoaded: false,

  loadFromDb: async (db) => {
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM environment_value_properties'
    );
    const props = new Map<string, any>();
    for (const row of rows) {
      props.set(`${row.environment_oid}::${row.property_name}`, JSON.parse(row.entries_json));
    }
    set({ valueProperties: props, isLoaded: true });
  },

  updateProperty: async (db, envOid, name, value) => {
    const entriesJson = JSON.stringify(value);
    const now = new Date().toISOString();

    await writeAhead(
      // Step 1: SQLite write
      async () => {
        await db.runAsync(
          `INSERT OR REPLACE INTO environment_value_properties
           (environment_oid, property_name, entries_json, last_modified)
           VALUES (?, ?, ?, ?)`,
          envOid, name, entriesJson, now
        );
      },
      // Step 2: Zustand update (only runs if SQL succeeded)
      () => {
        set((state) => {
          const newProps = new Map(state.valueProperties);
          newProps.set(`${envOid}::${name}`, value);
          return { valueProperties: newProps };
        });
      },
    );
  },
}));
```

**Confidence:** HIGH -- pattern is straightforward and well-established for write-ahead systems.

### Pattern 6: Zustand Store Initialization from SQLite on App Start

**What:** On app launch (or after a crash recovery), Zustand stores rebuild their state entirely from SQLite. The stores have a `loadFromDb` action that queries SQLite and populates the store. The app waits for this initialization before rendering meaningful UI.

**When to use:** On every app launch. The app root layout initializes all stores from SQLite before rendering child routes.

**Code:**
```typescript
// apps/mobile/src/providers/StoreInitializer.tsx
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useEnvironmentStore } from '../stores/environment-store';

export function StoreInitializer({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);
  const loadEnvironment = useEnvironmentStore((s) => s.loadFromDb);

  useEffect(() => {
    async function initStores() {
      await loadEnvironment(db);
      // Add more store initializations here in later phases
      setReady(true);
    }
    initStores();
  }, [db]);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <>{children}</>;
}
```

**Confidence:** HIGH -- standard React pattern with Zustand async initialization.

### Pattern 7: Tab Navigation with expo-router 6

**What:** File-based tab navigation using the `(tabs)` directory convention in expo-router. Five tabs: Home, Execute, Overview, History, Settings.

**When to use:** For the app shell in Phase 1. Each tab shows a placeholder screen.

**Code:**
```typescript
// apps/mobile/app/(tabs)/_layout.tsx
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563EB',  // Blue-600
        tabBarInactiveTintColor: '#6B7280', // Gray-500
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E7EB',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <FontAwesome size={24} name="home" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="execute"
        options={{
          title: 'Execute',
          tabBarIcon: ({ color }) => (
            <FontAwesome size={24} name="play-circle" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="overview"
        options={{
          title: 'Overview',
          tabBarIcon: ({ color }) => (
            <FontAwesome size={24} name="sitemap" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => (
            <FontAwesome size={24} name="clock-o" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <FontAwesome size={24} name="cog" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

**Confidence:** HIGH -- verified against expo-router v6 tabs documentation.

### Anti-Patterns to Avoid

- **Zustand-first persistence:** Never update Zustand state before SQLite is written. This violates write-ahead semantics and causes data loss on crash.
- **Using `withTransactionAsync` instead of `withExclusiveTransactionAsync`:** The non-exclusive variant has scope leakage (unrelated queries silently join the transaction). Always use exclusive, or the write queue on web.
- **Duplicate React installations:** Never add React or React Native as direct dependencies of shared packages. Use `peerDependencies` and npm `overrides` in root.
- **Manual Metro watchFolders config:** SDK 54 handles this automatically. Adding manual config conflicts with auto-config. Only add web-specific WASM/COOP/COEP extensions.
- **Zustand persist middleware for runtime state:** Do NOT use the `persist` middleware for workflow/step/value property state. SQLite is the single source of truth. Zustand is ephemeral and rebuilt from SQLite on startup.
- **Separate apps/web directory in Phase 1:** Expo handles web from the same app directory via `npx expo start --web`. A separate web app is only needed for custom server-side logic (deferred).

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab navigation | Custom bottom bar component | expo-router `(tabs)` directory + `<Tabs>` layout | File-based routing, deep linking, platform-native feel, no manual navigator wiring |
| Safe area handling | Manual padding calculations | `react-native-safe-area-context` `<SafeAreaView>` | Handles notches, home indicators, dynamic insets across all devices |
| Database initialization | Custom file-based init | `<SQLiteProvider onInit={...}>` | Handles async init, blocks rendering until ready, integrates with React Suspense |
| Write serialization on web | Custom mutex/lock | WriteQueue class (see Pattern 4 above) | Needs to handle promise chaining, error propagation, and FIFO ordering correctly |
| Schema creation | Custom SQL file parser | `db.execAsync()` with inline SQL template strings | Metro bundles strings; no file system access needed |
| Monorepo resolution | Custom symlink management | npm workspaces + Expo SDK 54 auto-config | Metro auto-resolves workspace packages since SDK 52 |

**Key insight:** Phase 1 is primarily a wiring phase. Almost every component has an established solution in the Expo ecosystem. The value is in connecting them correctly (write-ahead ordering, platform-aware transactions, single-app multi-platform), not in building novel components.

## Common Pitfalls

### Pitfall 1: expo-sqlite Transaction Scope Leakage

**What goes wrong:** Using `withTransactionAsync()`, any query that executes while the transaction is active -- including queries from completely unrelated parts of the app -- silently joins that transaction. Rollbacks undo unrelated writes. Success includes unintended mutations.

**Why it happens:** `withTransactionAsync()` does not isolate queries to the callback scope. Due to async/await and the single JS thread sharing one database connection, any `db.runAsync()` call between BEGIN and COMMIT becomes part of the transaction.

**How to avoid:**
- Use `withExclusiveTransactionAsync()` for ALL write transactions on native.
- On web, use the WriteQueue (Pattern 4) since `withExclusiveTransactionAsync` is not supported.
- Establish a project-wide rule: never use `withTransactionAsync()`. Search codebase for it before any milestone.

**Warning signs:** Mysterious data loss, intermittent rollbacks of unrelated data, state inconsistency between Zustand and SQLite after restart.

### Pitfall 2: Zustand/SQLite Dual-State Desynchronization

**What goes wrong:** After a crash, SQLite state is stale because the Zustand update happened first (or SQLite write was pending). On restart, the user sees a workflow that has "gone back in time."

**Why it happens:** Developers instinctively write optimistic-update code (Zustand first, SQLite async). This feels faster but breaks crash recovery.

**How to avoid:**
- Always use the `writeAhead()` helper (Pattern 5).
- On startup, rebuild Zustand entirely from SQLite (Pattern 6). Never persist Zustand to storage as a recovery mechanism.
- Test: force-kill the app during a write operation, relaunch, verify state matches last committed SQLite state.

**Warning signs:** Any code that calls `set()` without a preceding SQLite write. "It works fine unless I kill the app."

### Pitfall 3: Web Platform as Second-Class Citizen (wa-sqlite Divergence)

**What goes wrong:** App works on Android/iOS but fails on web in subtle ways. WAL mode not supported, exclusive transactions not supported, OPFS file capacity limits (default 6 files), SharedArrayBuffer requires specific headers.

**Why it happens:** Web support for expo-sqlite is alpha. Developers build on mobile first, discover web issues late.

**How to avoid:**
- Test on web from day one. Every feature must work on at least one browser before marking complete.
- No WAL mode on web -- conditionally skip the PRAGMA.
- No exclusive transactions on web -- use WriteQueue.
- Configure Metro for WASM and COOP/COEP headers from project initialization (Pattern 2).
- Test on Chrome AND Firefox minimum (Safari may have OPFS issues in incognito).

**Warning signs:** "We'll add web support later." Missing COOP/COEP headers causing `SharedArrayBuffer is not defined` errors.

### Pitfall 4: Monorepo Metro Bundler Resolution Failures

**What goes wrong:** "Unable to resolve module" errors when importing from shared packages. Or worse: silent duplicate React loading causing "Invalid hook call" at runtime.

**Why it happens:** Metro historically struggled with workspace symlinks. Multiple React copies get resolved if shared packages list React as a direct dependency.

**How to avoid:**
- Use Expo SDK 54 auto-config (do NOT add manual `watchFolders` or `nodeModulesPaths`).
- React/RN only in `apps/mobile` dependencies. Shared packages use `peerDependencies`.
- Root `package.json` `overrides` to force single React/RN versions.
- Run `npm why react` periodically to check for duplicates.
- Validate with a smoke test: import a function from every shared package and render on all platforms.

**Warning signs:** "Invalid hook call" at runtime, duplicate React in `npm why` output, "Unable to resolve module" only in one app.

### Pitfall 5: OPFS File Capacity Limit on Web

**What goes wrong:** expo-sqlite on web uses wa-sqlite's AccessHandlePoolVFS, which defaults to a capacity of 6 files in the Origin Private File System. After exceeding this, `sqlite3_open_v2` errors occur with "cannot create file."

**Why it happens:** OPFS file handles are a limited browser resource. The pool VFS pre-allocates handles for performance but this creates a hard ceiling.

**How to avoid:**
- In Phase 1, this is unlikely to be hit (single database, low file count).
- Be aware of the limitation for later phases.
- If hit, clear OPFS data programmatically: `navigator.storage.getDirectory()` then `root.removeEntry(name, { recursive: true })`.
- In production, monitor for `sqlite3_open_v2` errors on web and provide a user-facing "clear storage" option.

**Warning signs:** `sqlite3_open_v2` errors only on web after multiple database operations. Works on localhost, fails on deployed site.

## Code Examples

### Database Connection Setup (Complete)

```typescript
// packages/storage/src/database/connection.ts
// Source: Expo SQLite docs
import { type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { SCHEMA_SQL } from './schema';
import { SEED_SQL } from './seed';

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  // WAL mode: native only (wa-sqlite does not support it)
  if (Platform.OS !== 'web') {
    await db.execAsync('PRAGMA journal_mode = WAL');
  }

  // Foreign key enforcement
  await db.execAsync('PRAGMA foreign_keys = ON');

  // Check current schema version
  const versionResult = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const currentVersion = versionResult?.user_version ?? 0;

  if (currentVersion < 1) {
    // Drop and recreate during v1 development
    await db.execAsync(SCHEMA_SQL);
    await db.execAsync('PRAGMA user_version = 1');

    // Seed with development data
    if (__DEV__) {
      await db.execAsync(SEED_SQL);
    }
  }
}
```

### Root Layout with SQLiteProvider

```typescript
// apps/mobile/app/_layout.tsx
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { initializeDatabase } from '@brainpal/storage';
import { StoreInitializer } from '../src/providers/StoreInitializer';

export default function RootLayout() {
  return (
    <SQLiteProvider
      databaseName="brainpal_mobile.db"
      onInit={initializeDatabase}
    >
      <StoreInitializer>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </StoreInitializer>
    </SQLiteProvider>
  );
}
```

### Zustand Store with Write-Ahead (Environment Value Properties)

```typescript
// apps/mobile/src/stores/environment-store.ts
import { create } from 'zustand';
import { type SQLiteDatabase } from 'expo-sqlite';

interface EnvironmentValueProperty {
  environment_oid: string;
  property_name: string;
  entries: Array<{ name: string; value: string }>;
  last_modified: string;
}

interface EnvironmentStore {
  properties: EnvironmentValueProperty[];
  isLoaded: boolean;

  // Read-through: load from SQLite on startup
  loadFromDb: (db: SQLiteDatabase) => Promise<void>;

  // Write-ahead: SQLite first, then state
  setProperty: (
    db: SQLiteDatabase,
    envOid: string,
    propName: string,
    entries: Array<{ name: string; value: string }>,
  ) => Promise<void>;

  getProperty: (envOid: string, propName: string) => EnvironmentValueProperty | undefined;
}

export const useEnvironmentStore = create<EnvironmentStore>()((set, get) => ({
  properties: [],
  isLoaded: false,

  loadFromDb: async (db) => {
    const rows = await db.getAllAsync<{
      environment_oid: string;
      property_name: string;
      entries_json: string;
      last_modified: string;
    }>('SELECT * FROM environment_value_properties');

    const properties = rows.map((row) => ({
      environment_oid: row.environment_oid,
      property_name: row.property_name,
      entries: JSON.parse(row.entries_json),
      last_modified: row.last_modified,
    }));

    set({ properties, isLoaded: true });
  },

  setProperty: async (db, envOid, propName, entries) => {
    const entriesJson = JSON.stringify(entries);
    const now = new Date().toISOString();

    // STEP 1: Write to SQLite FIRST (write-ahead)
    await db.runAsync(
      `INSERT OR REPLACE INTO environment_value_properties
       (environment_oid, property_name, entries_json, last_modified)
       VALUES (?, ?, ?, ?)`,
      envOid, propName, entriesJson, now,
    );

    // STEP 2: Update Zustand state (only if SQL succeeded)
    set((state) => {
      const existing = state.properties.findIndex(
        (p) => p.environment_oid === envOid && p.property_name === propName,
      );
      const newProp: EnvironmentValueProperty = {
        environment_oid: envOid,
        property_name: propName,
        entries,
        last_modified: now,
      };
      const newProperties = [...state.properties];
      if (existing >= 0) {
        newProperties[existing] = newProp;
      } else {
        newProperties.push(newProp);
      }
      return { properties: newProperties };
    });
  },

  getProperty: (envOid, propName) => {
    return get().properties.find(
      (p) => p.environment_oid === envOid && p.property_name === propName,
    );
  },
}));
```

### Placeholder Tab Screen (with Seed Data Display)

```typescript
// apps/mobile/app/(tabs)/index.tsx
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const [workflows, setWorkflows] = useState<any[]>([]);

  useEffect(() => {
    async function loadWorkflows() {
      const rows = await db.getAllAsync<any>(
        'SELECT oid, local_id, version, description FROM master_workflows'
      );
      setWorkflows(rows);
    }
    loadWorkflows();
  }, [db]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BrainPal Mobile</Text>
      <Text style={styles.subtitle}>
        {workflows.length > 0
          ? `${workflows.length} workflow(s) available`
          : 'No workflows loaded'}
      </Text>
      <FlatList
        data={workflows}
        keyExtractor={(item) => item.oid}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.local_id}</Text>
            <Text style={styles.cardSubtitle}>v{item.version}</Text>
            {item.description && (
              <Text style={styles.cardDescription}>{item.description}</Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Import a workflow package to get started
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#F9FAFB' },
  title: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  cardDescription: { fontSize: 14, color: '#374151', marginTop: 8 },
  empty: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 32 },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual Metro watchFolders for monorepos | Auto-config via `expo/metro-config` | SDK 52 (Nov 2024) | Remove all manual Metro monorepo config. SDK 54 further improves isolated deps. |
| `react-native-sqlite-storage` | `expo-sqlite` ~16.x | SDK 50+ | First-party, maintained by Expo team, sync+async APIs, web alpha support |
| AsyncStorage for persistence | `expo-sqlite` + raw SQL | 2024+ | AsyncStorage deprecated in favor of expo-sqlite/kv-store for KV needs |
| Zustand persist middleware with AsyncStorage | Manual SQLite write-ahead + Zustand as cache | Project-specific | Write-ahead semantics require manual control, not middleware-driven |
| SafeAreaView from react-native | `react-native-safe-area-context` | RN 0.81 (2025) | Built-in SafeAreaView deprecated in RN 0.81. Must use community package. |
| Legacy Architecture (Bridge) | New Architecture (Fabric + JSI) | SDK 54 (2025) | SDK 54 is the LAST release supporting Legacy Arch. New Arch is default. |
| expo-file-system (legacy API) | expo-file-system (new OO API) | SDK 54 (2025) | Legacy API moved to `expo-file-system/legacy`. New default is object-oriented. |

**Deprecated/outdated:**
- `withTransactionAsync`: Use `withExclusiveTransactionAsync` on native, WriteQueue on web.
- Manual Metro `watchFolders`/`nodeModulesPaths` config: Removed in SDK 52+ auto-config.
- `react-native` built-in `SafeAreaView`: Deprecated in RN 0.81.
- AsyncStorage: Deprecated. Use expo-sqlite/kv-store for key-value, expo-sqlite for structured data.

## Discretion Recommendations

These address the "Claude's Discretion" items from CONTEXT.md:

### Docker vs Expo Web Timing for Phase 1

**Recommendation: No Docker in Phase 1. Use `npx expo start --web` for all web testing.**

Rationale:
- Phase 1 web testing only needs `npx expo start --web`, which runs the Metro dev server with COOP/COEP headers configured in `metro.config.js`.
- Docker adds deployment complexity (Dockerfile, nginx.conf, docker-compose.yml) that is not needed until the web app must be deployed to a server.
- The COOP/COEP headers are handled by Metro's `enhanceMiddleware` during development.
- Docker can be introduced in a later phase when production web deployment is in scope.
- Risk: Zero. All web testing in Phase 1 uses the Metro dev server on localhost.

### Express Server vs Pure SPA for Web Target

**Recommendation: Pure SPA in Phase 1. No Express server.**

Rationale:
- Expo web with `web.output: "single"` (default) produces an SPA with a single `index.html`. No server-side rendering or API routes are needed.
- expo-sqlite on web uses wa-sqlite (client-side WASM). No server-side database access is needed.
- All Phase 1 functionality is client-side: SQLite, Zustand, tab navigation, placeholder screens.
- Express would only be needed if we needed custom server-side API routes, SSR, or auth -- none of which are in Phase 1 scope.
- When Docker is added later, a simple nginx config can serve the SPA static files with COOP/COEP headers.

### wa-sqlite Fallback Strategy

**Recommendation: Accept known limitations. No IndexedDB fallback in Phase 1.**

Rationale:
- wa-sqlite with OPFS is the default and best-performing backend for expo-sqlite on web.
- The known limitations (no WAL mode, no exclusive transactions, OPFS file capacity) are all addressed by the patterns above (conditional WAL pragma, WriteQueue, single database file).
- An IndexedDB fallback would require replacing expo-sqlite entirely on web -- the library does not expose a VFS selection API.
- If wa-sqlite proves too unstable on a specific browser, document the limitation rather than implementing a full IndexedDB alternative.
- The OPFS capacity limit (6 files) is unlikely to be hit with a single database in Phase 1.
- Monitor for issues during cross-browser testing and escalate if a browser fails to work.

### Placeholder Screens: Live Seed Data vs Static Text

**Recommendation: Home tab shows live seed data from SQLite. Other 4 tabs show static placeholder text.**

Rationale:
- The Home tab displaying seed data validates the full persistence pipeline: SQLite schema created -> seed data inserted -> Zustand store loaded from SQLite -> UI renders from store.
- This is the minimum viable validation for FNDTN-02 (SQLite initialized), FNDTN-03 (Zustand as cache), and PERS-05 (environment value properties persist).
- The other 4 tabs (Execute, Overview, History, Settings) have no Phase 1 functionality beyond being navigation targets. Static text placeholder ("Execute screen - coming in Phase 3") is sufficient.
- Over-investing in placeholder UI for tabs that will be completely rewritten in later phases wastes effort.

### Color Palette and Typography

**Recommendation: Clean neutral palette with blue accent. System fonts.**

Color palette (Tailwind-inspired for consistency):
- **Primary:** `#2563EB` (Blue-600) -- active tab, primary buttons, links
- **Primary Light:** `#DBEAFE` (Blue-100) -- selected backgrounds, highlights
- **Text Primary:** `#111827` (Gray-900) -- headings, primary text
- **Text Secondary:** `#6B7280` (Gray-500) -- subtitles, labels
- **Background:** `#F9FAFB` (Gray-50) -- screen backgrounds
- **Surface:** `#FFFFFF` (White) -- cards, modals, tab bar
- **Border:** `#E5E7EB` (Gray-200) -- card borders, dividers
- **Success:** `#10B981` (Emerald-500) -- completed states
- **Warning:** `#F59E0B` (Amber-500) -- paused/attention states
- **Error:** `#EF4444` (Red-500) -- error states, abort

Typography:
- Use system fonts (no custom font loading in Phase 1). React Native uses San Francisco on iOS, Roboto on Android, system default on web.
- Heading: 24px, weight 700
- Subheading: 16px, weight 600
- Body: 14px, weight 400
- Caption: 12px, weight 400

Spacing: 4px base unit (4, 8, 12, 16, 24, 32, 48).

### Development Workflow: Expo Go vs Dev Builds

**Recommendation: Start with Expo Go for Phase 1. Switch to dev builds for Phase 2.**

Rationale:
- expo-sqlite works in Expo Go (confirmed: it is a bundled Expo SDK package).
- Phase 1 does not require any native modules beyond what Expo Go provides (no document picker, no notifications, no custom native code).
- Expo Go provides the fastest development iteration: no build step, scan QR code, instant reload.
- Phase 2 will require expo-document-picker for .WFmasterX file import, which benefits from dev builds on some platforms. That is the natural switching point.
- For Android physical device testing: Expo Go can be installed from Google Play, then scan the QR code from `npx expo start`. No USB configuration needed for Expo Go mode.

## Open Questions

Things that could not be fully resolved:

1. **wa-sqlite reliability across all modern browsers**
   - What we know: Chrome, Firefox, Safari all have OPFS support. Chrome and Safari confirmed working. Firefox progression noted.
   - What's unclear: Exact failure modes on Firefox and Edge with OPFS. Safari incognito blocks OPFS entirely (confirmed by PowerSync research).
   - Recommendation: Test all four browsers in Phase 1. Document any browser-specific issues. Accept Safari incognito as a known limitation (users can use normal mode).

2. **expo-sqlite web performance under load**
   - What we know: wa-sqlite's OPFSCoopSyncVFS performs well for small databases but may degrade with large databases (100MB+).
   - What's unclear: Phase 1 seed data is tiny; performance characteristics with real workflow data (Phase 2+) are unknown.
   - Recommendation: Not a Phase 1 concern. Flag for Phase 2 research when real data volumes are introduced.

3. **Metro auto-config interaction with enhanceMiddleware**
   - What we know: SDK 54 auto-configures Metro for monorepos. Adding `enhanceMiddleware` for COOP/COEP is a separate concern.
   - What's unclear: Whether the auto-config preserves or conflicts with manually added middleware enhancements.
   - Recommendation: Test early. The metro.config.js pattern from the GitHub issue has been confirmed working. If auto-config conflicts, the worst case is adding back minimal manual config.

4. **Expo SDK 55 migration timeline**
   - What we know: SDK 55 is in beta, forces New Architecture (no opt-out), expected stable Q2 2026.
   - What's unclear: Whether to upgrade during the project lifecycle.
   - Recommendation: Build on SDK 54. Upgrade to 55 when it is stable AND after the core phases are complete. SDK 55 should be backward compatible for New Architecture apps.

## Sources

### Primary (HIGH confidence)
- [Expo SQLite Documentation](https://docs.expo.dev/versions/latest/sdk/sqlite/) -- WAL mode, exclusive transactions, web alpha status, SQLiteProvider API, platform differences
- [Expo SDK 54 Changelog](https://expo.dev/changelog/sdk-54) -- Monorepo improvements, expo-sqlite changes, Metro ESM, New Architecture status, breaking changes
- [Expo Monorepo Guide](https://docs.expo.dev/guides/monorepos/) -- npm workspaces setup, SDK 52+ auto-config, duplicate dependency prevention
- [Expo Router Tabs Documentation](https://docs.expo.dev/router/advanced/tabs/) -- JavaScript tabs setup, tab configuration, file structure requirements
- [Expo Web Development Guide](https://docs.expo.dev/workflow/web/) -- Web setup, react-native-web, Metro web support
- [Expo Publish Websites Guide](https://docs.expo.dev/guides/publishing-websites/) -- SPA vs static export, web.output configuration

### Secondary (MEDIUM confidence)
- [GitHub Issue #39903: expo-sqlite web support errors](https://github.com/expo/expo/issues/39903) -- Confirmed metro.config.js for WASM + COOP/COEP, OPFS capacity limit, browser compatibility
- [PowerSync: State of SQLite on Web (Nov 2025)](https://www.powersync.com/blog/sqlite-persistence-on-the-web) -- wa-sqlite VFS options, OPFS vs IndexedDB, browser support matrix, production recommendations
- [Expo Blog: Expo Go vs Development Builds](https://expo.dev/blog/expo-go-vs-development-builds) -- When to use Expo Go vs dev builds, production recommendations
- [Zustand GitHub Discussions #2873](https://github.com/pmndrs/zustand/discussions/2873) -- Async store initialization patterns

### Tertiary (LOW confidence)
- Zustand v5 `create<T>()()` double-parentheses pattern -- sourced from npm docs and community discussion; confirmed by official Zustand README but specific to v5.0.9+ behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified against SDK 54 compatibility, versions confirmed via npm registry and Expo changelog
- Architecture patterns: HIGH -- monorepo structure follows official Expo guide, write-ahead pattern is well-established, tab navigation follows expo-router docs
- Pitfalls: HIGH -- transaction scope leakage and Zustand/SQLite desync verified from official docs; web platform issues verified from GitHub issues and PowerSync deep-dive
- Discretion recommendations: MEDIUM -- based on assessment of Phase 1 scope and tradeoffs; may need revision based on implementation experience

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (30 days -- stack is stable; web alpha status may change with SDK updates)
