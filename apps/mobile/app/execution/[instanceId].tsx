// Execution screen placeholder: will be built in subsequent plans (step renderer, lifecycle UI).

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { colors, typography, spacing } from '@brainpal/ui';
import { useExecutionStore } from '../../src/stores/execution-store';

export default function ExecutionScreen() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();
  const workflow = useExecutionStore(
    (s) => instanceId ? s.activeWorkflows[instanceId] : undefined,
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>
          {workflow?.name ?? 'Workflow Execution'}
        </Text>
        <Text style={styles.subtitle}>
          Instance: {instanceId}
        </Text>
        <Text style={styles.status}>
          State: {workflow?.workflowState ?? 'Unknown'}
        </Text>
        <Text style={styles.hint}>
          Step renderer and execution controls will be added in upcoming plans.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  status: {
    ...typography.subheading,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
