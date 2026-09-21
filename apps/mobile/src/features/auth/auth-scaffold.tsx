import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';

/**
 * The shell both auth screens sit in.
 *
 * A bare form on an empty page is the weakest first impression an app can make,
 * and this one is the very first screen. The dark band is the same chrome the
 * rest of the app wears, so signing in already looks like the product rather
 * than like a gate in front of it.
 */
export function AuthScaffold({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.chrome }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View
          style={{
            paddingTop: insets.top + spacing['2xl'],
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing['2xl'],
            gap: spacing.lg,
          }}
        >
          <SeatMotif />
          <View style={{ gap: spacing.xs }}>
            <Text variant="display" tone="onChrome">
              {title}
            </Text>
            <Text style={{ color: colors.onChromeMuted }}>{subtitle}</Text>
          </View>
        </View>

        {/* The form arrives on a sheet that rises out of the chrome, which is
            the same move the seat-count and city sheets make elsewhere. */}
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xl,
            paddingBottom: insets.bottom + spacing.xl,
            gap: spacing.xl,
          }}
        >
          {children}
          {footer}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * A row of seats with one of them taken — the product in a single glyph, drawn
 * from the same geometry the seat map uses rather than borrowed from an icon
 * set.
 */
function SeatMotif() {
  const { colors, radius, spacing } = useTheme();
  const seats = [0, 1, 2, 3, 4];

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          width: 92,
          height: 3,
          borderRadius: 2,
          backgroundColor: colors.onChromeMuted,
          opacity: 0.5,
        }}
      />
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        {seats.map((i) => {
          const chosen = i === 2;
          return (
            <View
              key={i}
              style={{
                width: 22,
                height: 22,
                borderTopLeftRadius: radius.sm,
                borderTopRightRadius: radius.sm,
                borderBottomLeftRadius: 3,
                borderBottomRightRadius: 3,
                borderWidth: 1.5,
                borderColor: chosen ? colors.primary : colors.onChromeMuted,
                backgroundColor: chosen ? colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {chosen ? <Ionicons name="checkmark" size={13} color={colors.onPrimary} /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Gradient-backed scrim used behind the motif on taller devices. */
export function ChromeFade() {
  return (
    <LinearGradient
      colors={['rgba(0,0,0,0.25)', 'transparent']}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 120 }}
    />
  );
}
