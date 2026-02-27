# Phase 5: Polish + PDF Export - Research

**Researched:** 2026-02-26
**Domain:** PDF generation, native sharing, UX polish (React Native / Expo SDK 54)
**Confidence:** HIGH

## Summary

This phase adds PDF export of completed workflow execution reports and production-quality UX polish. The standard approach for Expo SDK 54 is to use **expo-print** (`printToFileAsync`) to convert an HTML string to a cached PDF file on mobile, then **expo-sharing** (`shareAsync`) to open the native share sheet. On web, `printToFileAsync` only opens the browser print dialog (it does not return a file), so we need a platform-branching strategy: use the browser's native print-to-PDF capability via `window.print()` on web. The HTML template is built from runtime step data already available in the `useWorkflowHistory` hook.

For UX polish, confirmation dialogs should migrate from the current custom `ConfirmDialog` modal to native `Alert.alert` per CONTEXT.md decisions. History pagination uses standard LIMIT/OFFSET SQL queries with FlatList's `onEndReached`. Zustand selector optimization uses `useShallow` from `zustand/shallow` for multi-value selectors.

**Primary recommendation:** Use `expo-print` + `expo-sharing` for mobile PDF generation and sharing. Build a pure HTML/CSS template function that generates the report HTML from step data. On web, trigger `window.print()` with the rendered HTML in a hidden iframe or new tab. Migrate confirmation dialogs to `Alert.alert`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-print | ~14.x (SDK 54 compatible) | HTML-to-PDF conversion on mobile | Official Expo module, works in managed workflow, uses native WebView rendering |
| expo-sharing | ~13.x (SDK 54 compatible) | Native share sheet (save to Files, email, AirDrop) | Official Expo module, works with `file://` URIs from expo-print |
| expo-file-system | ~19.x (already a transitive dep) | File rename (to achieve custom filename convention) | Already in dependency tree; new File/Directory API in SDK 54 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zustand/shallow | (bundled with zustand 5.x) | `useShallow` for multi-value selector optimization | Any component selecting multiple store values into an object |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| expo-print | react-native-html-to-pdf | Requires bare workflow or custom dev client; not Expo managed compatible |
| expo-print | pdf-lib (JS-only) | Builds PDFs programmatically without HTML/CSS -- much harder to layout professional reports |
| expo-print (web) | html2pdf.js / jsPDF | Renders to image then wraps in PDF -- text not selectable, large file sizes, blurry output |
| expo-print (web) | window.print() | Native browser print-to-PDF; free, no extra deps, user controls save location. **Recommended for web.** |

**Installation:**
```bash
npx expo install expo-print expo-sharing expo-file-system
```
Note: `npx expo install` resolves SDK-54-compatible versions automatically. expo-file-system is already a transitive dependency but should be added explicitly since we use it directly.

## Architecture Patterns

### Recommended Project Structure
```
apps/mobile/src/
├── services/
│   └── pdf-report-service.ts        # HTML template builder + export orchestrator
│   └── pdf-report-service.web.ts    # Web platform variant (window.print)
├── hooks/
│   └── useHistory.ts                # EXISTING: add pagination support
│   └── useExportPdf.ts              # NEW: hook wrapping PDF generation + sharing
├── components/
│   └── execution/
│       └── ConfirmDialog.tsx         # EXISTING: remove (migrate to Alert.alert)
└── stores/
    └── execution-store.ts            # EXISTING: optimize selectors with useShallow
```

### Pattern 1: HTML Template Builder (pdf-report-service.ts)
**What:** A pure function that takes workflow history data (steps, metadata) and returns an HTML string for PDF conversion. No React rendering -- just string concatenation/template literals.
**When to use:** Always for PDF content generation.
**Why:** Keeps PDF layout separate from React components. Easy to test (input data -> output HTML string). The HTML/CSS controls exact PDF appearance including page breaks, headers, footers, tables, and color accents.

```typescript
// Source: Architecture pattern from expo-print docs
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

interface ReportData {
  workflowName: string;
  instanceId: string;
  state: string;
  startedAt: string | null;
  completedAt: string | null;
  duration: string;
  steps: HistoryStep[];
}

function buildReportHtml(data: ReportData): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4 portrait; margin: 20mm; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111827; }
    .cover { page-break-after: always; text-align: center; padding-top: 40%; }
    .step-row { border-bottom: 1px solid #E5E7EB; padding: 8px 0; }
    .outcome-pass { color: #10B981; }
    .outcome-fail { color: #EF4444; }
    footer { font-size: 10px; color: #6B7280; text-align: center; }
  </style>
</head>
<body>
  <!-- Cover page -->
  <div class="cover">
    <h1>${escapeHtml(data.workflowName)}</h1>
    <p>Execution Report</p>
    <p>Run: ${data.instanceId.slice(0, 8)}</p>
    <p>Date: ${formatDate(data.startedAt)}</p>
    <p>Outcome: ${data.state}</p>
  </div>
  <!-- Step summary table -->
  ${data.steps.map(step => buildStepRow(step)).join('')}
  <footer>Generated by BrainPal</footer>
</body>
</html>`;
}

export async function exportPdf(data: ReportData): Promise<void> {
  const html = buildReportHtml(data);
  const { uri } = await Print.printToFileAsync({
    html,
    width: 595,   // A4 portrait width in points
    height: 842,  // A4 portrait height in points
  });

  // Rename to desired filename convention
  const safeName = data.workflowName.replace(/[^a-zA-Z0-9]/g, '_');
  const runId = data.instanceId.slice(0, 8);
  const filename = `${safeName}_run-${runId}.pdf`;
  const dest = new File(Paths.cache, filename);
  const src = new File(uri);
  src.move(dest);

  await Sharing.shareAsync(dest.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Share Execution Report',
  });
}
```

### Pattern 2: Platform-Specific Web Export (pdf-report-service.web.ts)
**What:** On web, `expo-print.printToFileAsync` just opens `window.print()`, which does NOT return a file URI. Use a different strategy: render the HTML into a hidden iframe, then call `window.print()` on it, letting the user save-as-PDF from the browser print dialog.
**When to use:** Web platform only (file extension `.web.ts` auto-selects via Metro/webpack bundler).

```typescript
// Web variant: render HTML in iframe and trigger print dialog
export async function exportPdf(data: ReportData): Promise<void> {
  const html = buildReportHtml(data);
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow?.print();
  }
  // Cleanup after print dialog closes
  setTimeout(() => document.body.removeChild(iframe), 1000);
}
```

### Pattern 3: Native Alert.alert for Confirmations
**What:** Use React Native's built-in `Alert.alert()` for destructive action confirmations instead of custom modal components.
**When to use:** ABORT and delete confirmations (per CONTEXT.md).

```typescript
// Source: React Native Alert docs
import { Alert } from 'react-native';

function confirmAbort(onConfirm: () => void) {
  Alert.alert(
    'Abort Workflow',
    'Are you sure? This action cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Abort', style: 'destructive', onPress: onConfirm },
    ],
  );
}
```

### Pattern 4: Paginated History with LIMIT/OFFSET
**What:** Load history workflows in pages of N items using SQL LIMIT/OFFSET, triggered by FlatList `onEndReached`.
**When to use:** History tab with growing list of completed workflows.

```typescript
const PAGE_SIZE = 20;

export function useCompletedWorkflows() {
  const db = useSQLiteContext();
  const [workflows, setWorkflows] = useState<HistoryWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    setLoading(true);
    const rows = await db.getAllAsync<RuntimeWorkflowRow>(
      `SELECT ... FROM runtime_workflows
       WHERE workflow_state IN ('COMPLETED', 'ABORTED', 'STOPPED')
         AND parent_workflow_instance_id IS NULL
       ORDER BY completed_at DESC
       LIMIT ? OFFSET ?`,
      [PAGE_SIZE, offsetRef.current],
    );
    if (rows.length < PAGE_SIZE) setHasMore(false);
    offsetRef.current += rows.length;
    setWorkflows(prev => [...prev, ...mapRows(rows)]);
    setLoading(false);
  }, [db, hasMore, loading]);

  // ... initial load, refresh resets offset
}
```

### Pattern 5: Zustand useShallow for Multi-Value Selectors
**What:** Use `useShallow` from `zustand/shallow` when selecting multiple values into an object to prevent unnecessary re-renders.
**When to use:** Any component that extracts more than one value from a Zustand store.

```typescript
import { useShallow } from 'zustand/shallow';

// BAD: creates new object every time store updates, re-renders always
const { name, state } = useExecutionStore((s) => ({
  name: s.activeWorkflows[id]?.name,
  state: s.activeWorkflows[id]?.workflowState,
}));

// GOOD: shallow comparison prevents re-render when values haven't changed
const { name, state } = useExecutionStore(
  useShallow((s) => ({
    name: s.activeWorkflows[id]?.name,
    state: s.activeWorkflows[id]?.workflowState,
  })),
);
```

### Anti-Patterns to Avoid
- **Don't render React components to HTML for PDF:** Build HTML strings directly. React SSR adds complexity and bundle size for no benefit here.
- **Don't use `Alert.alert` on web without a fallback:** `Alert.alert` on web shows `window.confirm()` which looks terrible. Use `Alert.alert` only on native; on web, use `window.confirm()` or the existing custom dialog pattern.
- **Don't generate PDFs on the execution screen:** Only export from history detail screen (per CONTEXT.md). The execution screen shows live data; history has the final frozen state.
- **Don't use `INSERT OR REPLACE` in any new code:** Per project memory, use `INSERT INTO ... ON CONFLICT DO UPDATE` to avoid cascade deletes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML to PDF conversion | Custom PDF builder with canvas/drawing primitives | expo-print `printToFileAsync` with HTML string | HTML/CSS gives professional layout with headers, tables, page breaks; native WebView handles rendering |
| Native share sheet | Custom share UI or file save dialog | expo-sharing `shareAsync` | Handles all platforms, file types, UTI/MIME types |
| File rename for custom filename | String manipulation on URI paths | expo-file-system `File.move()` | Handles platform-specific path formats, atomic operations |
| State selector optimization | Manual memoization with useMemo | `useShallow` from zustand/shallow | Purpose-built for Zustand, handles shallow comparison correctly |
| Confirmation dialogs (native) | Custom Modal component | `Alert.alert()` with button array | Native look-and-feel on iOS/Android, zero custom UI code, matches CONTEXT.md decision |

**Key insight:** The PDF generation problem looks complex but is just HTML template building + one API call. The complexity is in the HTML/CSS template, not the generation pipeline.

## Common Pitfalls

### Pitfall 1: Extra Blank Page in expo-print PDF
**What goes wrong:** `printToFileAsync` adds an extra blank page at the end of the PDF, especially on iOS.
**Why it happens:** Content doesn't fill the page exactly, and the WebView renderer creates a trailing empty page. CSS `@page` directives are not consistently respected by iOS WKWebView.
**How to avoid:**
- Include `<!DOCTYPE html>` declaration
- Set explicit page dimensions: `width: 595, height: 842` (A4 in points) in `printToFileAsync` options
- Use CSS `body { margin: 0; }` and control margins via `@page` CSS
- Avoid `height: 100%` on body/html elements
- Test with real content on both iOS and Android
**Warning signs:** PDF page count is 1 more than expected.

### Pitfall 2: iOS WKWebView Cannot Load Local Image URIs
**What goes wrong:** Images referenced with `file://` URIs in the HTML don't render in the PDF on iOS.
**Why it happens:** iOS WKWebView has security restrictions preventing local file access from HTML content.
**How to avoid:** Inline all images as base64 data URIs in the HTML string. This project already converts package_images BLOBs to base64 data URIs (see `ExecutionScreen` image loading pattern).
**Warning signs:** Images appear on Android but are blank on iOS PDF output.

### Pitfall 3: expo-sharing Cannot Share Local Files on Web
**What goes wrong:** `Sharing.shareAsync(fileUri)` fails or does nothing on web.
**Why it happens:** Web Share API requires HTTPS and cannot share local files by URI. expo-sharing web support is extremely limited.
**How to avoid:** Use platform-specific file (`.web.ts` extension) that calls `window.print()` instead. Check `Platform.OS === 'web'` before calling sharing APIs.
**Warning signs:** Export works on mobile simulator but fails silently on web.

### Pitfall 4: ConfirmDialog vs Alert.alert Migration Risk
**What goes wrong:** Removing the custom ConfirmDialog component breaks existing screens that use it (execution abort, history delete, settings).
**Why it happens:** Three screens import and use ConfirmDialog. Must migrate all three simultaneously.
**How to avoid:**
- Migrate all usages in one plan/task
- `Alert.alert` works on iOS and Android natively
- On web, `Alert.alert` falls through to `window.confirm()` which is adequate for this app's web use case
- Files to update: `execution/[instanceId].tsx`, `(tabs)/history.tsx`, `(tabs)/settings.tsx`
**Warning signs:** Import errors after deleting ConfirmDialog component.

### Pitfall 5: expo-file-system API Change in SDK 54
**What goes wrong:** Code using legacy `FileSystem.moveAsync()` or `FileSystem.cacheDirectory` shows deprecation warnings or doesn't work.
**Why it happens:** SDK 54 introduced the new File/Directory class API. The legacy API is available via `expo-file-system/legacy` but is deprecated.
**How to avoid:** Use the new API: `new File(Paths.cache, filename)` with `file.move(destination)`. Import from `expo-file-system` (not `/legacy`).
**Warning signs:** Deprecation warnings in console mentioning `expo-file-system/legacy`.

### Pitfall 6: Offset-Based Pagination Inconsistency on Delete
**What goes wrong:** After deleting a workflow from the history list, subsequent OFFSET-based pagination may skip or duplicate items.
**Why it happens:** Deleting a row shifts all subsequent offsets. If the user deletes item at position 5, then loads page 2 starting at offset 20, the results are shifted by 1.
**How to avoid:** After a delete, reset pagination (clear list, reload from offset 0). This is simple and correct for this use case since deletes are rare.
**Warning signs:** Duplicate or missing items appearing after delete + scroll.

## Code Examples

### Complete PDF Export Hook (useExportPdf.ts)
```typescript
// Source: Derived from expo-print + expo-sharing docs
import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import type { HistoryStep } from './useHistory';

interface ExportPdfParams {
  workflowName: string;
  instanceId: string;
  state: string;
  startedAt: string | null;
  completedAt: string | null;
  duration: string;
  steps: HistoryStep[];
}

export function useExportPdf() {
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = useCallback(async (params: ExportPdfParams) => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      // Import the platform-appropriate service
      // (.web.ts on web, .ts on native via Metro bundler resolution)
      const { exportPdf: doExport } = await import('../services/pdf-report-service');
      await doExport(params);
    } catch (err) {
      console.warn('PDF export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  return { exportPdf, isExporting };
}
```

### HTML Report Template (key patterns)
```html
<!-- Cover page with page break -->
<div style="page-break-after: always; text-align: center; padding-top: 30%;">
  <h1 style="font-size: 28px; color: #111827;">Workflow Name</h1>
  <p style="font-size: 16px; color: #6B7280;">Execution Report</p>
  <table style="margin: 40px auto; border-collapse: collapse;">
    <tr><td style="padding: 8px; color: #6B7280;">Run ID:</td><td>abc12345</td></tr>
    <tr><td style="padding: 8px; color: #6B7280;">Date:</td><td>Feb 26, 2026</td></tr>
    <tr><td style="padding: 8px; color: #6B7280;">Outcome:</td>
        <td style="color: #10B981; font-weight: 600;">COMPLETED</td></tr>
    <tr><td style="padding: 8px; color: #6B7280;">Duration:</td><td>2m 45s</td></tr>
  </table>
</div>

<!-- Step detail rows -->
<h2 style="border-bottom: 2px solid #2563EB; padding-bottom: 8px;">Step Summary</h2>
<table style="width: 100%; border-collapse: collapse;">
  <thead>
    <tr style="background: #F9FAFB; text-align: left;">
      <th style="padding: 10px; border-bottom: 1px solid #E5E7EB;">Step</th>
      <th style="padding: 10px; border-bottom: 1px solid #E5E7EB;">Outcome</th>
      <th style="padding: 10px; border-bottom: 1px solid #E5E7EB;">Duration</th>
      <th style="padding: 10px; border-bottom: 1px solid #E5E7EB;">Details</th>
    </tr>
  </thead>
  <tbody>
    <!-- Rendered per step -->
  </tbody>
</table>

<!-- Footer on every page -->
<div style="position: fixed; bottom: 10mm; left: 0; right: 0; text-align: center;
            font-size: 10px; color: #6B7280;">
  Generated by BrainPal
</div>
```

### Native Alert.alert Confirmation
```typescript
// Source: React Native Alert docs (https://reactnative.dev/docs/alert)
import { Alert } from 'react-native';

export function confirmDestructiveAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
): void {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

// Usage:
confirmDestructiveAction(
  'Abort Workflow',
  'Are you sure you want to abort? This cannot be undone.',
  'Abort',
  () => runner.abort(instanceId),
);
```

### Paginated FlatList with onEndReached
```typescript
// Source: React Native FlatList docs
<FlatList
  data={workflows}
  keyExtractor={(item) => item.instanceId}
  renderItem={renderItem}
  onEndReached={loadMore}
  onEndReachedThreshold={0.5}
  ListFooterComponent={hasMore ? <ActivityIndicator /> : null}
  refreshControl={
    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
  }
/>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| expo-file-system legacy (`FileSystem.moveAsync`) | New File/Directory class API (`new File(...)`, `file.move()`) | SDK 54 (2025) | Must use new API; legacy available via `/legacy` import but deprecated |
| Zustand `shallow` import from `zustand/shallow` | `useShallow` hook from `zustand/shallow` | Zustand 4.4+ / 5.x | `useShallow` wraps selector; simpler API than passing equality fn as 2nd arg |
| Custom modal dialogs for confirmations | `Alert.alert()` (per CONTEXT.md) | User decision | Migrate 3 existing usages of ConfirmDialog component |

**Deprecated/outdated:**
- `expo-file-system` legacy API: `FileSystem.readAsStringAsync`, `FileSystem.moveAsync`, `FileSystem.cacheDirectory` -- all deprecated in SDK 54. Use `File`, `Directory`, `Paths` classes instead.
- Custom `ConfirmDialog` component: Per CONTEXT.md decision, replace with `Alert.alert` for native feel.

## Open Questions

1. **expo-print A4 page dimensions on Android**
   - What we know: Setting `width: 595, height: 842` (A4 in points) works on iOS. Android may interpret dimensions differently.
   - What's unclear: Whether Android uses the same point-based dimensions or pixel-based.
   - Recommendation: Test on both platforms. If Android differs, use `@page { size: A4; }` CSS as fallback.

2. **expo-file-system File.move() with cache URI from expo-print**
   - What we know: `printToFileAsync` returns a `uri` string (e.g., `file:///path/to/cache/Print/xxx.pdf`). New File API uses `new File(uri)` constructor.
   - What's unclear: Whether `new File(uriString)` accepts the full `file://` URI or needs a path-only string.
   - Recommendation: If the new API doesn't accept the URI directly, fall back to `expo-file-system/legacy` `moveAsync` for this one operation, or strip the `file://` prefix.

3. **Web Alert.alert behavior**
   - What we know: `Alert.alert` on web calls `window.confirm()` which returns true/false. It only supports OK/Cancel, not custom button text or destructive styling.
   - What's unclear: Whether `window.confirm()` is acceptable for web UX in this project.
   - Recommendation: Accept it -- this is a mobile-first app, web is secondary. The `window.confirm()` fallback is functional.

## Sources

### Primary (HIGH confidence)
- expo-print official docs: https://docs.expo.dev/versions/latest/sdk/print/ -- API reference for `printToFileAsync`, `FilePrintOptions`, `FilePrintResult`
- expo-sharing official docs: https://docs.expo.dev/versions/latest/sdk/sharing/ -- API reference for `shareAsync`, `SharingOptions`, platform support
- expo-file-system official docs: https://docs.expo.dev/versions/latest/sdk/filesystem/ -- New File/Directory API, Paths, SDK 54 changes
- expo-file-system blog post: https://expo.dev/blog/expo-file-system -- SDK 54 migration guide
- React Native Alert docs: https://reactnative.dev/docs/alert -- `Alert.alert` API, button styles, cross-platform behavior
- React Native Platform docs: https://reactnative.dev/docs/platform-specific-code -- `.web.ts` file extension pattern for platform-specific code
- Zustand selectors/re-rendering: https://deepwiki.com/pmndrs/zustand/2.3-selectors-and-re-rendering -- `useShallow`, selector optimization patterns

### Secondary (MEDIUM confidence)
- expo-print web implementation (GitHub source): https://github.com/expo/expo/blob/main/packages/expo-print/src/ExponentPrint.web.ts -- Confirmed `printToFileAsync` on web just calls `window.print()`
- expo-print blank page issue: https://github.com/expo/expo/issues/7435 -- Known issue with extra blank pages, workarounds
- expo-print iOS image limitation: https://github.com/expo/expo/issues/6169 -- WKWebView cannot load local file URIs
- expo SDK 54 changelog: https://expo.dev/changelog/sdk-54 -- SDK version and package compatibility

### Tertiary (LOW confidence)
- html2pdf.js for web alternative: https://ekoopmans.github.io/html2pdf.js/ -- Evaluated but NOT recommended (image-based rendering, text not selectable)
- jsPDF for web alternative: https://github.com/parallax/jsPDF -- Evaluated but NOT recommended (too low-level for HTML report layout)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - expo-print + expo-sharing is the documented, official Expo approach for PDF on mobile
- Architecture: HIGH - HTML template pattern is well-established, platform-specific files are standard React Native
- Pitfalls: HIGH - Extra blank page, iOS image restrictions, and web sharing limitations are documented in Expo GitHub issues
- Web delivery: MEDIUM - `window.print()` approach is standard browser API but web is secondary platform for this app
- expo-file-system new API: MEDIUM - SDK 54 API is documented but File.move() interaction with expo-print URIs needs runtime validation

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (30 days -- stable Expo APIs, unlikely to change)
