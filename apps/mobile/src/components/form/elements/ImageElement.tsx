// ImageElement: Displays an image from the step's stored images.
// Looks up element.src in the images Map for base64 data URI.

import React from 'react';
import { Image, Text, View, StyleSheet } from 'react-native';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import type { ElementProps } from './types';

export function ImageElement({ element, images }: ElementProps) {
  const filename = element.src ?? '';
  const dataUri = images?.get(filename);

  if (!dataUri) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Image: {filename || 'no source'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: dataUri }}
        style={styles.image}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
