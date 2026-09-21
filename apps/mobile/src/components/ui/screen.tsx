import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';

type ScreenProps = {
  children: ReactNode;
  /** Wraps content in a ScrollView. Turn off for screens that own a FlatList. */
  scroll?: boolean;
  /** Adds bottom padding for the home indicator. Off inside tab screens. */
  edges?: { top?: boolean; bottom?: boolean };
  contentStyle?: ViewStyle;
};

export function Screen({ children, scroll = false, edges, contentStyle }: ScreenProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const padding: ViewStyle = {
    paddingHorizontal: spacing.lg,
    paddingTop: edges?.top ? insets.top + spacing.lg : spacing.lg,
    paddingBottom: edges?.bottom ? insets.bottom + spacing.lg : spacing.lg,
  };

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padding, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, padding, contentStyle]}>{children}</View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {body}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
