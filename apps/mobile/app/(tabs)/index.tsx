import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '@brainpal/ui';
import { useWorkflowStore, type MasterWorkflow } from '../../src/stores/workflow-store';
import { useEnvironmentStore } from '../../src/stores/environment-store';

function WorkflowCard({ workflow }: { workflow: MasterWorkflow }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{workflow.local_id}</Text>
        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>v{workflow.version}</Text>
        </View>
      </View>
      {workflow.description && (
        <Text style={styles.cardDescription}>{workflow.description}</Text>
      )}
      {workflow.package_file_name && (
        <Text style={styles.cardMeta}>{workflow.package_file_name}</Text>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const { masterWorkflows } = useWorkflowStore();
  const { properties } = useEnvironmentStore();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>BrainPal Mobile</Text>

            {/* Workflows section */}
            <Text style={styles.sectionTitle}>
              {masterWorkflows.length} workflow(s) available
            </Text>
          </>
        }
        data={masterWorkflows}
        keyExtractor={(item) => item.oid}
        renderItem={({ item }) => <WorkflowCard workflow={item} />}
        ListFooterComponent={
          <>
            {/* Environment properties section */}
            <Text style={styles.sectionTitle}>Environment Properties</Text>
            {properties.length === 0 ? (
              <Text style={styles.emptyText}>No environment properties</Text>
            ) : (
              properties.map((prop) => (
                <View
                  key={`${prop.environment_oid}-${prop.property_name}`}
                  style={styles.card}
                >
                  <Text style={styles.cardTitle}>{prop.property_name}</Text>
                  {prop.entries.map((entry, i) => (
                    <View key={i} style={styles.entryRow}>
                      <Text style={styles.entryName}>{entry.name}</Text>
                      <Text style={styles.entryValue}>{entry.value}</Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Import a .WFmasterX package to get started
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.subheading,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    ...typography.subheading,
    color: colors.textPrimary,
    flex: 1,
  },
  versionBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 4,
  },
  versionText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  cardDescription: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  entryName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  entryValue: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
    textAlign: 'right',
  },
});
