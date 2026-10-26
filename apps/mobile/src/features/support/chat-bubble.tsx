import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Only on an assistant turn, and only when it was not the model. */
  note?: string;
  failed?: boolean;
}

/**
 * One turn.
 *
 * The customer's own turns are a filled primary bubble pinned right, the
 * agent's an outlined surface pinned left — the arrangement every messaging
 * app has trained people to read without being told. The bubble stops at 85%
 * of the width so the alignment itself stays legible; a full-width bubble on
 * both sides is just two paragraphs.
 */
export function ChatBubble({ message }: { message: ChatMessage }) {
  const { colors, radius, spacing } = useTheme();
  const mine = message.role === 'user';

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}
    >
      <View
        style={{
          maxWidth: '85%',
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.md + 2,
          borderRadius: radius.lg,
          // The corner nearest the speaker is tucked in. A uniform radius on
          // all four reads as a card rather than as speech.
          borderBottomRightRadius: mine ? radius.sm : radius.lg,
          borderBottomLeftRadius: mine ? radius.lg : radius.sm,
          backgroundColor: mine ? colors.primarySolid : colors.surface,
          borderWidth: mine ? 0 : 1,
          borderColor: message.failed ? colors.danger : colors.border,
        }}
      >
        <Text
          tone={mine ? 'onPrimary' : 'default'}
          style={{ lineHeight: 21 }}
          selectable={!mine}
          accessibilityLabel={`${mine ? 'You said' : 'The assistant said'}: ${message.text}`}
        >
          {message.text}
        </Text>
      </View>

      {message.note ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            marginTop: spacing.xs,
            maxWidth: '85%',
          }}
        >
          <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            {message.note}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}
