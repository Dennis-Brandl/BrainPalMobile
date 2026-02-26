// Shared interface for all form element renderers.

import type { FormElementSpec } from '@brainpal/engine';

export interface ElementProps {
  /** The form element specification */
  element: FormElementSpec;
  /** Current value from formData (derived by FormElementRenderer) */
  value?: string;
  /** Change handler (derived by FormElementRenderer) */
  onChange?: (value: string) => void;
  /** Image map: filename -> base64 data URI */
  images?: Map<string, string>;
  /** Button press handler for step completion (only used by ButtonElement) */
  onButtonPress?: (outputValue: string) => void;
}
