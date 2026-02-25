// StateControls: Overflow menu (three-dot icon) showing context-sensitive
// workflow state actions: Pause, Resume, Stop, Abort.

import React, { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WorkflowState } from '@brainpal/engine';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StateControlsProps {
  workflowState: WorkflowState;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onAbort: () => void;
}

interface MenuItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive: boolean;
  action: () => void;
}

// ---------------------------------------------------------------------------
// Menu items per state
// ---------------------------------------------------------------------------

function getMenuItems(
  state: WorkflowState,
  props: StateControlsProps,
): MenuItem[] {
  switch (state) {
    case 'RUNNING':
      return [
        { label: 'Pause', icon: 'pause-outline', destructive: false, action: props.onPause },
        { label: 'Abort', icon: 'close-circle-outline', destructive: true, action: props.onAbort },
      ];
    case 'PAUSED':
      return [
        { label: 'Resume', icon: 'play-outline', destructive: false, action: props.onResume },
        { label: 'Stop', icon: 'stop-outline', destructive: false, action: props.onStop },
        { label: 'Abort', icon: 'close-circle-outline', destructive: true, action: props.onAbort },
      ];
    case 'STOPPED':
      return [
        { label: 'Abort', icon: 'close-circle-outline', destructive: true, action: props.onAbort },
      ];
    case 'IDLE':
      return [
        { label: 'Abort', icon: 'close-circle-outline', destructive: true, action: props.onAbort },
      ];
    // Terminal states: no actions
    case 'COMPLETED':
    case 'ABORTED':
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StateControls(props: StateControlsProps) {
  const [menuVisible, setMenuVisible] = useState(false);
  const items = getMenuItems(props.workflowState, props);

  const openMenu = useCallback(() => setMenuVisible(true), []);
  const closeMenu = useCallback(() => setMenuVisible(false), []);

  // Don't show the trigger if there are no actions
  if (items.length === 0) return null;

  return (
    <>
      {/* Three-dot trigger button */}
      <Pressable style={styles.trigger} onPress={openMenu} hitSlop={8}>
        <Ionicons name="ellipsis-vertical" size={22} color={colors.textPrimary} />
      </Pressable>

      {/* Dropdown menu modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.overlay} onPress={closeMenu}>
          <View style={styles.menuContainer}>
            {items.map((item) => (
              <Pressable
                key={item.label}
                style={styles.menuItem}
                onPress={() => {
                  closeMenu();
                  item.action();
                }}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.destructive ? colors.error : colors.textPrimary}
                />
                <Text
                  style={[
                    styles.menuLabel,
                    item.destructive && styles.menuLabelDestructive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  trigger: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: spacing.base,
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: spacing.xs,
    minWidth: 180,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  menuLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  menuLabelDestructive: {
    color: colors.error,
  },
});
