// SelectElement: Dropdown/select input.
// For v1, renders as a TextInput with dropdown icon. If element has options,
// renders a simple pressable list picker via a modal.

import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';
import type { ElementProps } from './types';

function normalizeOption(option: unknown): { label: string; value: string } {
  if (typeof option === 'string') return { label: option, value: option };
  const obj = option as { label?: string; value?: string };
  return { label: obj.label ?? '', value: obj.value ?? '' };
}

export function SelectElement({ element, value, onChange }: ElementProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const options = (element.options ?? []).map(normalizeOption);
  const placeholder = element.content?.plainText ?? 'Select...';

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value ?? '';

  const handleSelect = (optionValue: string) => {
    onChange?.(optionValue);
    setModalVisible(false);
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.selectButton} onPress={() => setModalVisible(true)}>
        <Text
          style={[styles.selectText, !selectedLabel && styles.placeholder]}
          numberOfLines={1}
        >
          {selectedLabel || placeholder}
        </Text>
        <Text style={styles.arrow}>{'\u25BC'}</Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{placeholder}</Text>
            {options.length > 0 ? (
              <FlatList
                data={options}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => (
                  <Pressable
                    style={[
                      styles.optionRow,
                      item.value === value && styles.optionRowSelected,
                    ]}
                    onPress={() => handleSelect(item.value)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        item.value === value && styles.optionTextSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                )}
              />
            ) : (
              <Text style={styles.noOptions}>No options available</Text>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  selectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  selectText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  placeholder: {
    color: colors.textSecondary,
  },
  arrow: {
    fontSize: 10,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.base,
    minWidth: 250,
    maxHeight: 400,
  },
  modalTitle: {
    ...typography.subheading,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  optionRow: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 4,
  },
  optionRowSelected: {
    backgroundColor: colors.primaryLight,
  },
  optionText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  noOptions: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.base,
  },
});
