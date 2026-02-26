---
phase: quick
plan: 003
subsystem: mobile-ui
tags: [import, document-picker, file-system, workflow-package]
completed: 2026-02-26
duration: "7 min"
tech-stack:
  added: [expo-document-picker@14.0.8]
  patterns: [custom-hook-for-async-workflow, conditional-header-button]
key-files:
  created:
    - apps/mobile/src/hooks/useImportWorkflow.ts
  modified:
    - apps/mobile/package.json
    - apps/mobile/app/(tabs)/index.tsx
decisions:
  - id: "003-01"
    description: "Use type '*/*' for document picker since .WFmasterX has no registered MIME type; validate extension in hook"
  - id: "003-02"
    description: "Read file bytes via fetch(uri).arrayBuffer() instead of adding expo-file-system dependency"
  - id: "003-03"
    description: "Create fresh repository instances per import (not shared with EngineProvider) to avoid lifecycle coupling"
---

# Quick Task 003: Add Import Button to Library Tab Summary

**Import button on Library tab triggers file picker -> PackageImporter -> store refresh pipeline using expo-document-picker and a new useImportWorkflow hook.**

## What Was Built

### Task 1: useImportWorkflow hook + expo-document-picker
- Installed `expo-document-picker` (~14.0.8) compatible with Expo SDK 54
- Created `useImportWorkflow` hook returning `{ importWorkflow, isImporting }`
- Full pipeline: open document picker -> validate .WFmasterX extension -> read bytes via fetch -> create repository instances -> run PackageImporter -> refresh workflow store -> show Alert feedback
- Error handling: cancelled pick (silent return), wrong extension (Alert), corrupt package (Alert from PackageImporter), unexpected errors (catch-all Alert)

### Task 2: Import button in Home screen header
- Added conditional Import button visible only when Library sub-tab is active
- Button shows download icon (FontAwesome) + "Import" text
- During import: shows ActivityIndicator spinner, button is disabled
- Header style updated to `flexDirection: 'row'` with `justifyContent: 'space-between'`

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | b601d62 | feat(quick-003): add useImportWorkflow hook and expo-document-picker |
| 2 | d3e188c | feat(quick-003): add Import button to Library tab header |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed copyToCacheDir -> copyToCacheDirectory**
- **Found during:** Task 1
- **Issue:** Plan specified `copyToCacheDir: true` but expo-document-picker SDK 54 types use `copyToCacheDirectory`
- **Fix:** Changed property name to match actual API
- **Files modified:** apps/mobile/src/hooks/useImportWorkflow.ts
- **Commit:** b601d62

## Verification

- [x] TypeScript compilation passes with no errors
- [x] expo-document-picker installed in apps/mobile/package.json
- [x] useImportWorkflow hook created with full import pipeline
- [x] Import button visible in header when Library sub-tab is active
- [x] Loading state shown during import (ActivityIndicator + disabled)
- [x] Error handling for all cases: cancelled, wrong extension, corrupt package, unexpected errors
