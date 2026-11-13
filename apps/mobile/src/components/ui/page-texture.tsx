import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../../theme';
import { textureMarks } from '../../theme/texture';
import { textureOpacity } from '../../theme/tokens';

/**
 * A field of very faint doodles over a plain page.
 *
 * The reference is the wallpaper behind a WhatsApp conversation: something
 * for a flat surface to be, at a strength you only notice when you go
 * looking. Here the doodles are the things a cinema has - a ticket, a reel, a
 * star - drawn from the same icon set as the rest of the app rather than from
 * a picture somebody would have had to fetch and licence.
 *
 * Behind everything and deaf to touch. It is measured from its own layout
 * rather than from the window, so it covers exactly the surface it was put
 * on and nothing drifts when that surface is a scrolling list.
 */
export function PageTexture() {
  const { colors, isDark } = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={onLayout}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {textureMarks(size.width, size.height).map((mark) => (
        <Ionicons
          key={mark.key}
          name={mark.icon}
          size={mark.size}
          color={colors.text}
          style={{
            position: 'absolute',
            left: mark.x,
            top: mark.y,
            opacity: isDark ? textureOpacity.dark : textureOpacity.light,
            transform: [{ rotate: `${mark.rotate}deg` }],
          }}
        />
      ))}
    </View>
  );
}
