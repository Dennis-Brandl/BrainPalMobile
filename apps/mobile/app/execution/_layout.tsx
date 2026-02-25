// Execution stack layout: navigates between execution screens and library detail.

import { Stack } from 'expo-router';

export default function ExecutionLayout() {
  return (
    <Stack>
      <Stack.Screen name="[instanceId]" options={{ headerShown: false }} />
      <Stack.Screen name="library/[oid]" options={{ title: 'Workflow Details' }} />
    </Stack>
  );
}
