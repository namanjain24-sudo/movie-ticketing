import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../../theme';
import { Text } from './text';

export type TextFieldProps = TextInputProps & {
  label: string;
  /** Shown in red under the field, and announced to screen readers. */
  error?: string;
  hint?: string;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, style, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors, radius, spacing } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <TextInput
        ref={ref}
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
          },
          style,
        ]}
        {...rest}
      />
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
