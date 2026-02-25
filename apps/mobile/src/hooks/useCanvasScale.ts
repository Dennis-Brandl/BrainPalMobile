// useCanvasScale: Calculates uniform scale factor to fit a WYSIWYG canvas
// of known dimensions into the available screen width.

import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { spacing } from '@brainpal/ui/src/theme/spacing';

export interface CanvasScaleResult {
  /** Uniform scale factor (always <= 1, never upscales) */
  scale: number;
  /** Canvas width after scaling */
  scaledWidth: number;
  /** Canvas height after scaling */
  scaledHeight: number;
  /** Available container width (screen width minus padding) */
  containerWidth: number;
}

/**
 * Computes a uniform scale-to-fit factor for the given canvas dimensions.
 *
 * @param canvasWidth  - Original canvas width from form_layout_config
 * @param canvasHeight - Original canvas height from form_layout_config
 * @param padding      - Horizontal padding per side (default: spacing.base = 16)
 * @returns Scale factor and derived dimensions
 */
export function useCanvasScale(
  canvasWidth: number,
  canvasHeight: number,
  padding: number = spacing.base,
): CanvasScaleResult {
  const { width: screenWidth } = useWindowDimensions();

  return useMemo(() => {
    const containerWidth = screenWidth - padding * 2;

    // Never upscale: if canvas fits, scale = 1
    const scale = canvasWidth <= containerWidth
      ? 1
      : containerWidth / canvasWidth;

    return {
      scale,
      scaledWidth: canvasWidth * scale,
      scaledHeight: canvasHeight * scale,
      containerWidth,
    };
  }, [screenWidth, canvasWidth, canvasHeight, padding]);
}
