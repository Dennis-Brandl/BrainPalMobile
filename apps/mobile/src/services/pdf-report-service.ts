// PDF Report Service (mobile): Generates PDF via expo-print and opens native share sheet.
// Platform-specific: Metro resolves this for iOS/Android. Web uses pdf-report-service.web.ts.

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { buildReportHtml, type ReportData } from './pdf-report-template';

export type { ReportData, ReportStep } from './pdf-report-template';

/**
 * Generate a PDF from workflow execution data and open the native share sheet.
 *
 * 1. Builds HTML report from ReportData
 * 2. Converts HTML to PDF via expo-print (native WebView rendering)
 * 3. Renames to {WorkflowName}_run-{runId}.pdf
 * 4. Opens native share sheet via expo-sharing
 */
export async function exportPdf(data: ReportData): Promise<void> {
  const html = buildReportHtml(data);

  // Generate PDF file in cache directory
  const { uri } = await Print.printToFileAsync({
    html,
    width: 595,  // A4 portrait width in points
    height: 842, // A4 portrait height in points
  });

  // Rename to convention: {WorkflowName}_run-{runId}.pdf
  const safeName = data.workflowName.replace(/[^a-zA-Z0-9]/g, '_');
  const runId = data.instanceId.slice(0, 8);
  const filename = `${safeName}_run-${runId}.pdf`;

  // Use new expo-file-system File API to move/rename
  const dest = new File(Paths.cache, filename);
  const src = new File(uri);
  src.move(dest);

  // Open native share sheet
  await Sharing.shareAsync(dest.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Share Execution Report',
  });
}
