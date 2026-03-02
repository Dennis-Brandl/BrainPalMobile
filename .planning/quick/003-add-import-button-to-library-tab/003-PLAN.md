---
phase: quick
plan: 003
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/package.json
  - apps/mobile/app/(tabs)/index.tsx
  - apps/mobile/src/hooks/useImportWorkflow.ts
autonomous: true

must_haves:
  truths:
    - "User sees an Import button when the Library sub-tab is active"
    - "Tapping Import opens a file picker filtered to .WFmasterX files"
    - "Selecting a valid .WFmasterX file imports it and the new workflow appears in the Library list"
    - "Import errors show an Alert with a meaningful message"
    - "A loading indicator is shown while the import is in progress"
  artifacts:
    - path: "apps/mobile/src/hooks/useImportWorkflow.ts"
      provides: "Import logic: file pick, read bytes, run PackageImporter, refresh store"
      min_lines: 40
    - path: "apps/mobile/app/(tabs)/index.tsx"
      provides: "Import button in header when Library tab is active"
  key_links:
    - from: "apps/mobile/src/hooks/useImportWorkflow.ts"
      to: "@brainpal/engine PackageImporter"
      via: "importPackage(zipData)"
      pattern: "importPackage"
    - from: "apps/mobile/src/hooks/useImportWorkflow.ts"
      to: "workflow-store loadFromDb"
      via: "store refresh after import"
      pattern: "loadFromDb"
    - from: "apps/mobile/app/(tabs)/index.tsx"
      to: "useImportWorkflow hook"
      via: "hook call + button onPress"
      pattern: "useImportWorkflow"
---

<objective>
Add an Import button to the Library tab on the Home screen that lets users pick a .WFmasterX file from the device, run it through the existing PackageImporter pipeline, and refresh the Library list.

Purpose: Users currently have no way to import workflow packages into the app. This is the primary entry point for getting content into BrainPal Mobile.
Output: A working import flow triggered from the Library tab header.
</objective>

<execution_context>
@C:\Users\dnbra\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\dnbra\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/mobile/app/(tabs)/index.tsx
@apps/mobile/src/stores/workflow-store.ts
@apps/mobile/src/repositories/index.ts
@apps/mobile/src/repositories/master-workflow-repository.ts
@packages/engine/src/import/package-importer.ts
@packages/engine/src/import/package-extractor.ts
@apps/mobile/src/providers/EngineProvider.tsx
@apps/mobile/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install expo-document-picker and create useImportWorkflow hook</name>
  <files>
    apps/mobile/package.json
    apps/mobile/src/hooks/useImportWorkflow.ts
  </files>
  <action>
1. Install expo-document-picker in the mobile app:
   ```
   cd apps/mobile && npx expo install expo-document-picker
   ```
   This ensures version compatibility with Expo SDK 54.

2. Create `apps/mobile/src/hooks/useImportWorkflow.ts` with the following:

   - Export a `useImportWorkflow()` hook that returns `{ importWorkflow: () => Promise<void>, isImporting: boolean }`.
   - Inside the hook:
     - Get `db` from `useSQLiteContext()` (from expo-sqlite).
     - Track `isImporting` state with `useState(false)`.
     - The `importWorkflow` function:
       a. Call `DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDir: true })` to let the user pick a file.
          NOTE: Use `type: '*/*'` because .WFmasterX is a custom extension -- MIME-based filtering won't work. The hook validates the extension itself.
       b. If the result is canceled (`result.canceled === true`), return early (no error).
       c. Extract the file URI from `result.assets[0].uri` and the filename from `result.assets[0].name`.
       d. Validate the filename ends with `.WFmasterX` (case-insensitive). If not, show `Alert.alert('Invalid File', 'Please select a .WFmasterX workflow package file.')` and return.
       e. Set `isImporting = true`.
       f. Read the file as base64 using `expo-file-system` -- actually, expo-document-picker with `copyToCacheDir: true` gives a file:// URI. Read it using `fetch(uri).then(r => r.arrayBuffer())` to get the raw bytes, then convert to `Uint8Array`. This avoids adding expo-file-system as a dependency.
       g. Create repository instances (same pattern as EngineProvider):
          ```typescript
          const workflowRepo = new SqliteMasterWorkflowRepository(db);
          const environmentRepo = new SqliteMasterEnvironmentRepository(db);
          const actionRepo = new SqliteMasterActionRepository(db);
          const imageRepo = new SqliteImageRepository(db);
          const logger = new SqliteExecutionLoggerRepository(db);
          ```
       h. Create `new PackageImporter(workflowRepo, environmentRepo, actionRepo, imageRepo, logger)`.
       i. Call `const result = await importer.importPackage(zipData)`.
       j. If `result.success === false`, show `Alert.alert('Import Failed', result.error)`.
       k. If `result.success === true`:
          - Refresh the workflow store: `useWorkflowStore.getState().loadFromDb(db)`.
          - Show `Alert.alert('Import Successful', 'Workflow has been imported to your library.')`.
       l. In the `finally` block, set `isImporting = false`.
       m. Wrap the entire try/catch so unexpected errors show `Alert.alert('Import Error', error.message || 'An unexpected error occurred.')`.

   Import from:
   - `expo-document-picker` (the library) for `getDocumentAsync`
   - `expo-sqlite` for `useSQLiteContext`
   - `@brainpal/engine` for `PackageImporter`
   - `../repositories` for the Sqlite*Repository classes
   - `../stores/workflow-store` for `useWorkflowStore`
   - `react-native` for `Alert`
   - `react` for `useState, useCallback`
  </action>
  <verify>
    Run `cd /c/BrainPalMobile && npx tsc --noEmit -p apps/mobile/tsconfig.json` (or the app typecheck script) to confirm no type errors.
    Verify `expo-document-picker` appears in apps/mobile/package.json dependencies.
  </verify>
  <done>
    Hook file exists at apps/mobile/src/hooks/useImportWorkflow.ts.
    expo-document-picker is installed. TypeScript compiles without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Import button to Library tab header on Home screen</name>
  <files>
    apps/mobile/app/(tabs)/index.tsx
  </files>
  <action>
Modify `apps/mobile/app/(tabs)/index.tsx` to show an Import button in the header area when the Library sub-tab is active:

1. Import the hook: `import { useImportWorkflow } from '../../src/hooks/useImportWorkflow';`
2. Import `ActivityIndicator` from `react-native`.
3. Import `FontAwesome` from `@expo/vector-icons/FontAwesome`.

4. In the `HomeScreen` component, call the hook:
   ```typescript
   const { importWorkflow, isImporting } = useImportWorkflow();
   ```

5. Modify the header section to include an Import button. Update the header View to use `flexDirection: 'row'` with `justifyContent: 'space-between'` and `alignItems: 'center'`:
   ```tsx
   <View style={styles.header}>
     <Text style={styles.title}>BrainPal Mobile</Text>
     {activeTab === 'library' && (
       <Pressable
         style={styles.importButton}
         onPress={importWorkflow}
         disabled={isImporting}
       >
         {isImporting ? (
           <ActivityIndicator size="small" color={colors.primary} />
         ) : (
           <>
             <FontAwesome name="download" size={16} color={colors.primary} />
             <Text style={styles.importButtonText}>Import</Text>
           </>
         )}
       </Pressable>
     )}
   </View>
   ```

6. Add styles:
   ```typescript
   header: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     paddingHorizontal: spacing.lg,
     paddingTop: spacing.lg,
     paddingBottom: spacing.sm,
   },
   importButton: {
     flexDirection: 'row',
     alignItems: 'center',
     paddingVertical: spacing.xs,
     paddingHorizontal: spacing.md,
     borderRadius: 8,
     borderWidth: 1,
     borderColor: colors.primary,
     gap: spacing.xs,
   },
   importButtonText: {
     ...typography.body,
     color: colors.primary,
     fontWeight: '600',
   },
   ```

7. The empty state hint in the Library FlatList already says "Import a .WFmasterX package to get started" -- this is consistent with the new button. No change needed there.
  </action>
  <verify>
    Run `cd /c/BrainPalMobile && npx tsc --noEmit -p apps/mobile/tsconfig.json` to confirm no type errors.
    Run `cd /c/BrainPalMobile && npx expo start` briefly to confirm the app bundles without Metro errors (ctrl+c after bundle succeeds).
  </verify>
  <done>
    The Import button appears in the Home screen header when the Library sub-tab is active.
    The button shows a download icon + "Import" text.
    While importing, it shows an ActivityIndicator and is disabled.
    TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
1. TypeScript compilation passes with no errors: `cd apps/mobile && npm run typecheck`
2. The Home screen renders with the Import button visible on the Library tab
3. Tapping Import opens the device file picker
4. Selecting a .WFmasterX file runs the import pipeline and refreshes the library list
5. Selecting a non-.WFmasterX file shows an "Invalid File" alert
6. Import errors from PackageImporter surface as alerts
7. The button shows a spinner and is disabled during import
</verification>

<success_criteria>
- expo-document-picker installed in apps/mobile
- useImportWorkflow hook created with full pipeline: pick file -> validate extension -> read bytes -> PackageImporter -> refresh store -> Alert feedback
- Import button visible in header when Library sub-tab is active
- Loading state shown during import
- Error handling for: canceled pick, wrong extension, corrupt package, unexpected errors
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/003-add-import-button-to-library-tab/003-SUMMARY.md`
</output>
