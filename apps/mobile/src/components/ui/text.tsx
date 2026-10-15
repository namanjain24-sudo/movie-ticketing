import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '../../theme';
import { NUMERIC, type TypographyVariant } from '../../theme/tokens';

type Tone =
  | 'default'
  | 'muted'
  | 'primary'
  | 'danger'
  | 'success'
  | 'inverse'
  | 'onChrome'
  /** Text sitting on a filled primary/danger surface — always white, in
   * either theme, unlike `inverse` which flips with the theme for the
   * opposite purpose (dark text on a light chip inside a dark screen). */
  | 'onPrimary';

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  tone?: Tone;
  align?: TextStyle['textAlign'];
  /** Tabular figures, so prices and countdowns do not jitter as digits change. */
  numeric?: boolean;
};

export function Text({
  variant = 'body',
  tone = 'default',
  align,
  numeric,
  style,
  ...rest
}: TextProps) {
  const { colors, typography } = useTheme();

  const color = {
    default: colors.text,
    muted: colors.textMuted,
    primary: colors.primary,
    danger: colors.danger,
    success: colors.success,
    inverse: colors.textInverse,
    onChrome: colors.onChrome,
    onPrimary: colors.onPrimary,
  }[tone];

  return (
    <RNText
      style={[
        typography[variant] as TextStyle,
        { color, textAlign: align },
        numeric && NUMERIC,
        style,
      ]}
      {...rest}
    />
  );
}
