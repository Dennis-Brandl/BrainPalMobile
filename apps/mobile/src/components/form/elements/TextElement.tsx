// TextElement: Renders rich text content (HTML) from a form element spec.
// Supports bold, italic, underline, inline styles, and parameter chip substitution.

import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { replaceParamChips } from '../../../utils/resolve-param-chips';
import type { ElementProps } from './types';

export function TextElement({ element, resolvedParams }: ElementProps) {
  const { width } = useWindowDimensions();
  const rawHtml = element.content?.content ?? element.content?.plainText ?? '';

  // Substitute parameter chips with resolved values
  const html = resolvedParams
    ? replaceParamChips(rawHtml, resolvedParams)
    : rawHtml;

  const baseStyle: Record<string, unknown> = {
    ...typography.body,
    color: element.color ?? colors.textPrimary,
    ...(element.fontSize != null && { fontSize: element.fontSize }),
    ...(element.align != null && { textAlign: element.align }),
  };

  return (
    <View style={styles.container}>
      <RenderHtml
        source={{ html }}
        contentWidth={width}
        baseStyle={baseStyle}
        tagsStyles={{
          p: { margin: 0, padding: 0 },
          body: { margin: 0, padding: 0 },
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
