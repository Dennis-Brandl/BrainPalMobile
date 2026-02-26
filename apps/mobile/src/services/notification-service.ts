// NotificationService (mobile): Dispatches local notifications via expo-notifications.
// Platform-specific: Metro resolves this for iOS/Android. Web uses notification-service.web.ts.

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import type { SQLiteDatabase } from 'expo-sqlite';

// ---------------------------------------------------------------------------
// NotificationService
// ---------------------------------------------------------------------------

export class NotificationService {
  constructor(private readonly db: SQLiteDatabase) {}

  /**
   * Initialize notification permissions and channels.
   * Safe to call on emulator (gracefully skips if not a physical device).
   */
  async initialize(): Promise<void> {
    if (!Device.isDevice) {
      // Emulator may not support push notifications -- skip setup
      return;
    }

    // Request permissions
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('NotificationService: permission not granted');
      return;
    }

    // Set up Android notification channels
    await Notifications.setNotificationChannelAsync('step-attention', {
      name: 'Step Needs Attention',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });

    await Notifications.setNotificationChannelAsync('errors', {
      name: 'Errors',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });

    // Configure foreground notification display
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }

  /**
   * Send "Step Needs Attention" notification for user interaction / yes-no steps.
   * Checks STEP_ATTENTION preference before dispatching.
   */
  async sendStepAttention(
    workflowInstanceId: string,
    stepInstanceId: string,
    stepName: string,
  ): Promise<void> {
    const enabled = await this.isEnabled('STEP_ATTENTION');
    if (!enabled) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Step Needs Attention',
        body: stepName || 'A step requires your input',
        data: { workflowInstanceId, stepInstanceId },
      },
      trigger: { channelId: 'step-attention' }, // immediate with Android channel
    });
  }

  /**
   * Send error notification.
   * Checks ERROR preference before dispatching.
   */
  async sendError(source: string, message: string): Promise<void> {
    const enabled = await this.isEnabled('ERROR');
    if (!enabled) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Error',
        body: `${source}: ${message}`,
        data: { source },
      },
      trigger: { channelId: 'errors' }, // immediate with Android channel
    });
  }

  /**
   * Set up tap handler that navigates to the workflow execution screen.
   * Returns subscription for cleanup.
   */
  setupNotificationTapHandler(router: { push: (href: string) => void }): { remove: () => void } {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        workflowInstanceId?: string;
      } | undefined;

      if (data?.workflowInstanceId) {
        router.push(`/execution/${data.workflowInstanceId}`);
      }
    });

    return subscription;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async isEnabled(notificationType: string): Promise<boolean> {
    try {
      const row = await this.db.getFirstAsync<{ enabled: number }>(
        'SELECT enabled FROM notification_preferences WHERE notification_type = ?',
        [notificationType],
      );
      // Default to enabled if no row found
      return row ? row.enabled === 1 : true;
    } catch {
      // If DB query fails, default to enabled
      return true;
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createNotificationService(db: SQLiteDatabase): NotificationService {
  return new NotificationService(db);
}
