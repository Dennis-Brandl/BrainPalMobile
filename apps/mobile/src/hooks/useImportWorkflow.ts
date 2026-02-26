// Hook for importing .WFmasterX workflow packages from the device file system.
// Opens a document picker, validates the file extension, reads bytes,
// runs PackageImporter, and refreshes the workflow store.

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useSQLiteContext } from 'expo-sqlite';
import { PackageImporter } from '@brainpal/engine';
import {
  SqliteMasterWorkflowRepository,
  SqliteMasterEnvironmentRepository,
  SqliteMasterActionRepository,
  SqliteImageRepository,
} from '../repositories';
import { useWorkflowStore } from '../stores/workflow-store';

interface UseImportWorkflowResult {
  importWorkflow: () => Promise<void>;
  isImporting: boolean;
}

export function useImportWorkflow(): UseImportWorkflowResult {
  const db = useSQLiteContext();
  const [isImporting, setIsImporting] = useState(false);

  const importWorkflow = useCallback(async () => {
    try {
      // Open file picker (use */* because .WFmasterX is a custom extension)
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      // User cancelled
      if (pickerResult.canceled) {
        return;
      }

      const asset = pickerResult.assets[0];
      const filename = asset.name;
      const uri = asset.uri;

      // Validate file extension
      if (!filename.toLowerCase().endsWith('.wfmasterx')) {
        Alert.alert(
          'Invalid File',
          'Please select a .WFmasterX workflow package file.',
        );
        return;
      }

      setIsImporting(true);

      try {
        // Read file bytes via fetch (works with file:// URIs from document picker)
        const response = await fetch(uri);
        const arrayBuffer = await response.arrayBuffer();
        const zipData = new Uint8Array(arrayBuffer);

        // Create repository instances for the importer
        const workflowRepo = new SqliteMasterWorkflowRepository(db);
        const environmentRepo = new SqliteMasterEnvironmentRepository(db);
        const actionRepo = new SqliteMasterActionRepository(db);
        const imageRepo = new SqliteImageRepository(db);

        const importer = new PackageImporter(
          workflowRepo,
          environmentRepo,
          actionRepo,
          imageRepo,
        );

        const result = await importer.importPackage(zipData);

        if (!result.success) {
          Alert.alert('Import Failed', result.error ?? 'Unknown validation error.');
        } else {
          // Refresh the workflow store so the Library list updates
          await useWorkflowStore.getState().loadFromDb(db);
          Alert.alert(
            'Import Successful',
            'Workflow has been imported to your library.',
          );
        }
      } finally {
        setIsImporting(false);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'An unexpected error occurred.';
      Alert.alert('Import Error', message);
    }
  }, [db]);

  return { importWorkflow, isImporting };
}
