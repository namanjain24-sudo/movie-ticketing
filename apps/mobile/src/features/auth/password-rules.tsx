import { PASSWORD_RULES } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';

/**
 * The password rules, ticking off as somebody types.
 *
 * It replaces a sentence — "At least 10 characters, with upper case, lower
 * case and a number" — that was correct and useless: it said all four rules
 * at once, in prose, and never told you which one you were still failing.
 * You found that out by submitting.
 *
 * Read straight from `PASSWORD_RULES`, which is also what `passwordSchema` is
 * built from, so the list cannot promise a rule the server does not keep or
 * hide one it does. A checklist that disagrees with the thing checking is
 * worse than no checklist.
 *
 * Nothing is marked failed. Until somebody has finished typing, an unmet rule
 * is a rule they have not reached yet, and a column of red crosses beside a
 * half-typed password is the form telling somebody off for being mid-word.
 * Met rules go green and tick; the rest stay quiet.
 */
export function PasswordRules({ value }: { value: string }) {
  const { colors, spacing } = useTheme();
  const started = value.length > 0;

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={
        started
          ? `Password needs: ${
              PASSWORD_RULES.filter((r) => !r.test(value))
                .map((r) => r.label)
                .join(', ') || 'nothing more'
            }`
          : `Password needs ${PASSWORD_RULES.map((r) => r.label).join(', ')}`
      }
      style={{ gap: spacing['2xs'], marginTop: spacing['2xs'] }}
    >
      {PASSWORD_RULES.map((rule) => {
        const met = started && rule.test(value);
        return (
          <View
            key={rule.id}
            // The row itself is described by the summary above, so a screen
            // reader reads the state once rather than four times.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
          >
            {met ? (
              <Animated.View entering={FadeIn.duration(140)}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              </Animated.View>
            ) : (
              <Ionicons name="ellipse-outline" size={14} color={colors.textMuted} />
            )}
            <Text variant="caption" style={{ color: met ? colors.success : colors.textMuted }}>
              {rule.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
