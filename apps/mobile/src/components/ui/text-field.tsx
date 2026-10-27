import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';
import { Text } from './text';

export type TextFieldProps = TextInputProps & {
  label: string;
  /** Shown in red under the field, and announced to screen readers. */
  error?: string;
  hint?: string;
};

/**
 * A password field you can read.
 *
 * Typing a password you cannot see is how people mistype one, and the fix
 * every app has settled on is a reveal toggle. It belongs here rather than in
 * each screen so that sign-in, sign-up and the reset form all get it, and so
 * that the next password field does too without anybody remembering.
 *
 * Toggling `secureTextEntry` is only safe because every caller is controlled:
 * the value lives in form state, so flipping the prop cannot lose what was
 * typed the way it can on an uncontrolled input.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, style, onFocus, onBlur, secureTextEntry, ...rest },
  ref,
) {
  const { colors, radius, spacing } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const canReveal = Boolean(secureTextEntry);

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <View>
      <TextInput
        ref={ref}
        secureTextEntry={canReveal && !revealed}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor,
            borderRadius: radius.md,
            color: colors.text,
            paddingHorizontal: spacing.md,
            // Room for the toggle, so a long password does not run under it.
            paddingRight: canReveal ? HIT_SIZE + spacing.sm : spacing.md,
          },
          style,
        ]}
        {...rest}
      />
      {canReveal ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          accessibilityState={{ selected: revealed }}
          onPress={() => setRevealed((v) => !v)}
          hitSlop={6}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: HIT_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={revealed ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={colors.textMuted}
          />
        </Pressable>
      ) : null}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    minHeight: 48,
    fontSize: 16,
  },
});
