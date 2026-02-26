// NotificationService (web): Dispatches browser notifications via the Web Notification API.
// Platform-specific: Metro resolves this .web.ts file for web platform.
// Mobile uses notification-service.ts (expo-notifications).

/// <reference lib="dom" />

import type { SQLiteDatabase } from 'expo-sqlite';

// ---------------------------------------------------------------------------
// NotificationService (Web)
// ---------------------------------------------------------------------------

export class NotificationService {
  constructor(private readonly db: SQLiteDatabase) {}

  /**
   * Initialize browser notification permissions.
   */
  async initialize(): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  /**
   * Send "Step Needs Attention" browser notification when tab is backgrounded.
   * Clicking the notification navigates to the workflow execution screen.
   */
  async sendStepAttention(
    workflowInstanceId: string,
    _stepInstanceId: string,
    stepName: string,
  ): Promise<void> {
    if (!this.canNotify()) return;

    const enabled = await this.isEnabled('STEP_ATTENTION');
    if (!enabled) return;

    // Only show browser notification when tab is backgrounded
    if (!document.hidden) return;

    const notification = new Notification('Step Needs Attention', {
      body: stepName || 'A step requires your input',
    });

    notification.onclick = () => {
      window.focus();
      window.location.href = `/execution/${workflowInstanceId}`;
    };
  }

  /**
   * Send error browser notification when tab is backgrounded.
   * Clicking the notification focuses the window.
   */
  async sendError(source: string, message: string): Promise<void> {
    if (!this.canNotify()) return;

    const enabled = await this.isEnabled('ERROR');
    if (!enabled) return;

    if (!document.hidden) return;

    const notification = new Notification('Error', {
      body: `${source}: ${message}`,
    });

    notification.onclick = () => {
      window.focus();
    };
  }

  /**
   * Notification tap handler for web.
   * On web, onclick is wired per-notification in sendStepAttention/sendError,
   * so this method returns a no-op cleanup function for consistent interface.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setupNotificationTapHandler(_router: { push: (href: any) => void }): { remove: () => void } {
    return { remove: () => {} };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private canNotify(): boolean {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    );
  }

  private async isEnabled(notificationType: string): Promise<boolean> {
    try {
      const row = await this.db.getFirstAsync<{ enabled: number }>(
        'SELECT enabled FROM notification_preferences WHERE notification_type = ?',
        [notificationType],
      );
      return row ? row.enabled === 1 : true;
    } catch {
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
