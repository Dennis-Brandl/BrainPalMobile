// TextElement: Renders plain text content from a form element spec.

import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import type { FormElementSpec } from '@brainpal/engine';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import type { ElementProps } from './types';

/**
 * Strips HTML tags from content string for v1 plain text rendering.
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

export function TextElement({ element }: ElementProps) {
  const rawContent = element.content?.content ?? element.content?.plainText ?? '';
  const displayText = stripHtmlTags(rawContent);

  return (
    <View style={styles.container}>
      <Text
        style={[
          styles.text,
          element.fontSize != null && { fontSize: element.fontSize },
          element.color != null && { color: element.color },
          element.align != null && { textAlign: element.align as 'left' | 'center' | 'right' },
        ]}
        numberOfLines={0}
      >
        {displayText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  text: {
    ...typography.body,
    color: colors.textPrimary,
  },
});
