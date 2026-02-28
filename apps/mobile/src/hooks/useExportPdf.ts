// useExportPdf: React hook wrapping PDF generation with isExporting loading state.
// Uses dynamic import so Metro resolves the platform-specific service file at runtime.

import { useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import type { ReportData } from '../services/pdf-report-template';

export type { ReportData, ReportStep } from '../services/pdf-report-template';

export function useExportPdf() {
  const [isExporting, setIsExporting] = useState(false);
  const busyRef = useRef(false);

  const exportReport = useCallback(async (data: ReportData) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsExporting(true);
    try {
      const { exportPdf } = await import('../services/pdf-report-service');
      await exportPdf(data);
    } catch (err) {
      console.warn('PDF export failed:', err);
      Alert.alert('Export Failed', 'Could not generate the PDF report.');
    } finally {
      busyRef.current = false;
      setIsExporting(false);
    }
  }, []);

  return { exportReport, isExporting };
}
