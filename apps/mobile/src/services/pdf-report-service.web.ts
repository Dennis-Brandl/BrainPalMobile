// PDF Report Service (web): Renders report HTML in a hidden iframe and triggers browser print dialog.
// Platform-specific: Metro resolves this .web.ts file for web platform.
// Mobile uses pdf-report-service.ts (expo-print + expo-sharing).

/// <reference lib="dom" />

import { buildReportHtml, type ReportData } from './pdf-report-template';

export type { ReportData, ReportStep } from './pdf-report-template';

/**
 * Generate a PDF report using the browser's native print dialog.
 *
 * 1. Builds HTML report from ReportData
 * 2. Creates a hidden iframe and writes the HTML into it
 * 3. Triggers the browser print dialog (user can "Save as PDF")
 * 4. Cleans up iframe after print dialog closes
 */
export async function exportPdf(data: ReportData): Promise<void> {
  const html = buildReportHtml(data);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    // Small delay to allow content to render before triggering print
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    iframe.contentWindow?.print();
  }

  // Clean up iframe after print dialog closes
  setTimeout(() => {
    try {
      document.body.removeChild(iframe);
    } catch {
      // iframe may already be removed
    }
  }, 1000);
}
