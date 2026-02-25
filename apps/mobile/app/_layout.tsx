import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { initializeDatabase } from '@brainpal/storage';

export default function RootLayout() {
  return (
    <SQLiteProvider
      databaseName="brainpal_mobile.db"
      onInit={initializeDatabase}
    >
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </SQLiteProvider>
  );
}
