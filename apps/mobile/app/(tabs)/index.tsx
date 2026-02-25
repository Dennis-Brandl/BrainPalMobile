import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '@brainpal/ui';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>BrainPal Mobile</Text>
        <Text style={styles.subtitle}>No workflows loaded</Text>
        <Text style={styles.hint}>
          Import a .WFmasterX package to get started
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
  },
  subtitle: {
    ...typography.subheading,
    color: colors.textSecondary,
    marginBottom: spacing.base,
  },
  hint: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
