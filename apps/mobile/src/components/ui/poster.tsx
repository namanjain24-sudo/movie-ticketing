import { Image, type ImageContentFit } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { Text } from './text';

/**
 * A film poster, with something worth looking at while it is not there yet.
 *
 * Three things are going on here beyond drawing an image.
 *
 * **The fallback.** Artwork comes off a public CDN and on a slow connection it
 * can be seconds away. A blank grey rectangle for those seconds reads as a
 * broken image; a card carrying the film's own initials reads as a poster that
 * has not arrived. The same card is the permanent answer when it never does.
 *
 * **The backing.** Poster sources vary wildly in resolution — a TMDB file is
 * 780px wide, a Wikipedia fair-use file is often under 300 — and the low ones
 * have to be upscaled to fill the card. Sitting that upscale directly on a flat
 * grey makes every soft edge obvious. A heavily blurred copy of the same image
 * underneath gives it a field of its own colours to blend into, which is the
 * difference between "low resolution" and "slightly soft".
 *
 * **The sheen.** A single highlight down the top-left, because a poster in a
 * dark room is a lit object and a perfectly matte rectangle is not one.
 */
export function Poster({
  uri,
  title,
  style,
  rounded = 14,
  contentFit = 'cover',
  /** Drawn over the artwork, bottom-aligned: a rating pill, a format badge. */
  overlay,
  /** Suppresses the sheen where a poster sits behind other content anyway. */
  sheen = true,
  priority = 'normal',
}: {
  uri: string | null | undefined;
  title: string;
  style?: ViewStyle;
  rounded?: number;
  contentFit?: ImageContentFit;
  overlay?: ReactNode;
  sheen?: boolean;
  priority?: 'low' | 'normal' | 'high';
}) {
  const { colors, spacing } = useTheme();
  const [failed, setFailed] = useState(false);

  const initials = title
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  const showImage = Boolean(uri) && !failed;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${title} poster`}
      style={[
        {
          borderRadius: rounded,
          overflow: 'hidden',
          backgroundColor: colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.sm,
        },
        style,
      ]}
    >
      <Text
        variant="title"
        style={{ color: colors.borderStrong }}
        numberOfLines={1}
        accessible={false}
      >
        {initials || '—'}
      </Text>
      <Text
        variant="caption"
        align="center"
        numberOfLines={2}
        style={{ color: colors.borderStrong, marginTop: spacing['2xs'] }}
        accessible={false}
      >
        {title}
      </Text>

      {showImage ? (
        <>
          {/* The blurred field the sharp copy sits on. Never transitions: it
              exists to be arrived at, not to be noticed arriving. */}
          <Image
            source={uri}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={28}
            cachePolicy="memory-disk"
            priority={priority}
            recyclingKey={uri ?? undefined}
            accessible={false}
          />
          <Image
            source={uri}
            style={StyleSheet.absoluteFill}
            contentFit={contentFit}
            // Keeps the decoded image at its own resolution rather than letting
            // the view size shrink it, which is what a re-used cell would
            // otherwise do to a poster on its way to a bigger slot.
            allowDownscaling={false}
            cachePolicy="memory-disk"
            priority={priority}
            // Without this, a recycled row in a long list shows the previous
            // film's poster for a frame before the new one decodes.
            recyclingKey={uri ?? undefined}
            // Long enough to read as an arrival rather than a flash, since the
            // image often lands well after the card has been on screen.
            transition={260}
            onError={() => setFailed(true)}
            accessible={false}
          />
          {sheen ? (
            <LinearGradient
              colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.7, y: 0.6 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          ) : null}
        </>
      ) : null}

      {overlay ? (
        <View style={styles.overlay} pointerEvents="box-none">
          {overlay}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
