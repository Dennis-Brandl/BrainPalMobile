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
