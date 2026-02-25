// useDeviceType: Detects device type from screen width using responsive breakpoints.

import { useWindowDimensions } from 'react-native';

export type DeviceType = 'phone' | 'tablet' | 'desktop';

export function useDeviceType(): DeviceType {
  const { width } = useWindowDimensions();
  if (width >= 1024) return 'desktop';
  if (width >= 768) return 'tablet';
  return 'phone';
}
