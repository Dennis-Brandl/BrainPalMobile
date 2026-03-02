// TimerElement: Countdown/countup timer with controls and blockDone mechanism.
// State machine: RUNNING | PAUSED | STOPPED | EXPIRED
// Auto-starts on mount, writes elapsed seconds to formData via onChange.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';
import type { ElementProps } from './types';

type TimerState = 'RUNNING' | 'PAUSED' | 'STOPPED' | 'EXPIRED';

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function TimerElement({ element, onChange, onTimerBlockChange }: ElementProps) {
  const durationSeconds = element.durationSeconds ?? 0;
  const direction = element.direction ?? 'countdown';
  const blockDone = element.blockDone ?? false;

  const [elapsed, setElapsed] = useState(0);
  const [timerState, setTimerState] = useState<TimerState>('RUNNING');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Report initial block state on mount
  useEffect(() => {
    if (blockDone) {
      onTimerBlockChange?.(true);
    }
    return () => {
      // Unblock on unmount
      if (blockDone) {
        onTimerBlockChange?.(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick logic
  useEffect(() => {
    if (timerState !== 'RUNNING') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;

        // Check expiration for countdown
        if (direction === 'countdown' && next >= durationSeconds) {
          setTimerState('EXPIRED');
          if (blockDone) {
            onTimerBlockChange?.(false);
          }
          return durationSeconds;
        }

        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [timerState, direction, durationSeconds, blockDone, onTimerBlockChange]);

  // Write elapsed to formData on every change
  useEffect(() => {
    onChange?.(String(elapsed));
  }, [elapsed, onChange]);

  // Display value
  const displaySeconds =
    direction === 'countdown'
      ? Math.max(0, durationSeconds - elapsed)
      : elapsed;

  // Controls
  const handlePauseResume = useCallback(() => {
    setTimerState((prev) => (prev === 'RUNNING' ? 'PAUSED' : 'RUNNING'));
  }, []);

  const handleStop = useCallback(() => {
    setTimerState('STOPPED');
    if (blockDone) {
      onTimerBlockChange?.(false);
    }
  }, [blockDone, onTimerBlockChange]);

  const handleRestart = useCallback(() => {
    setElapsed(0);
    setTimerState('RUNNING');
    if (blockDone) {
      onTimerBlockChange?.(true);
    }
  }, [blockDone, onTimerBlockChange]);

  const isActive = timerState === 'RUNNING' || timerState === 'PAUSED';

  return (
    <View style={styles.container}>
      <Text style={styles.time}>{formatTime(displaySeconds)}</Text>

      <View style={styles.stateRow}>
        <Text style={[styles.stateLabel, timerState === 'EXPIRED' && styles.expiredLabel]}>
          {timerState}
        </Text>
      </View>

      <View style={styles.controls}>
        {isActive && (
          <Pressable style={styles.button} onPress={handlePauseResume}>
            <Ionicons
              name={timerState === 'RUNNING' ? 'pause' : 'play'}
              size={18}
              color={colors.primary}
            />
          </Pressable>
        )}

        {isActive && (
          <Pressable style={styles.button} onPress={handleStop}>
            <Ionicons name="stop" size={18} color={colors.error} />
          </Pressable>
        )}

        {(timerState === 'STOPPED' || timerState === 'EXPIRED') && (
          <Pressable style={styles.button} onPress={handleRestart}>
            <Ionicons name="refresh" size={18} color={colors.primary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  time: {
    fontFamily: 'monospace',
    fontSize: 32,
    fontWeight: '600',
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  stateRow: {
    marginTop: spacing.xs,
  },
  stateLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  expiredLabel: {
    color: colors.error,
  },
  controls: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
