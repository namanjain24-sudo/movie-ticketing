import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SupportTurn } from '@app/shared';
import { ApiRequestError } from '../api/client';
import { supportApi } from '../api/support';
import { AppBar, Text } from '../components/ui';
import { ChatBubble, type ChatMessage } from '../features/support/chat-bubble';
import { TypingDots } from '../features/support/typing-dots';
import { tapFeedback } from '../lib/haptics';
import { useTheme } from '../theme';
import { HIT_SIZE } from '../theme/tokens';

/**
 * Openers, not a menu.
 *
 * Chosen from what this agent can actually answer well — every one of them is
 * covered by the facts the server grounds the prompt in — so the first thing
 * a customer taps cannot be the thing it has to decline.
 */
const OPENERS = [
  'How do I cancel a booking?',
  'What have I booked?',
  'How long are my seats held?',
  'How do loyalty points work?',
];

const GREETING: ChatMessage = {
  id: 'greeting',
  role: 'assistant',
  text:
    'Hi — I can help with bookings, cancellations and refunds, promo codes, loyalty points, ' +
    'and getting into a show. What do you need?',
};

/** Said once, under the first answer the server had to produce by itself. */
const FALLBACK_NOTE = 'Answered from the help notes — the assistant is unavailable right now.';

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The support chat.
 *
 * The phone never talks to a model. It posts to this project's API, which
 * assembles a context out of the database — this account's bookings, the real
 * policy numbers — and asks Groq to answer from that and nothing else. So an
 * answer here cannot invent a booking reference or a refund rule, and the key
 * stays on the server where `unzip`ping the APK cannot find it.
 */
export default function SupportScreen() {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notedFallback, setNotedFallback] = useState(false);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInput>(null);

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || sending) return;

      tapFeedback();
      setDraft('');
      setSending(true);

      // The history sent is what was on screen *before* this question, minus
      // the greeting, which the server wrote nothing of and should not be
      // asked to reason about.
      const history: SupportTurn[] = messages
        .filter((m) => m.id !== 'greeting' && !m.failed)
        .map((m) => ({ role: m.role, content: m.text }));

      setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: message }]);

      try {
        const answer = await supportApi.ask(message, history);
        const fallback = answer.source !== 'model';
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            text: answer.text,
            // Only on the first one. Repeating it under every reply turns a
            // useful disclosure into noise.
            note: fallback && !notedFallback ? FALLBACK_NOTE : undefined,
          },
        ]);
        if (fallback) setNotedFallback(true);
      } catch (err) {
        const offline = err instanceof ApiRequestError && err.isNetworkError;
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            failed: true,
            text: offline
              ? "I can't reach the server right now. Your tickets are still saved on this phone — open one from Tickets."
              : err instanceof ApiRequestError
                ? err.message
                : 'Something went wrong. Try asking again.',
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [messages, notedFallback, sending],
  );

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <AppBar title="Help" subtitle="Ask about your bookings" onBack={() => router.back()} />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => <ChatBubble message={item} />}
        ListFooterComponent={
          sending ? (
            <Animated.View entering={FadeIn.duration(160)}>
              <TypingDots />
            </Animated.View>
          ) : null
        }
      />

      {/* The openers disappear the moment a real conversation starts, rather
          than sitting under it as a permanent menu. */}
      {messages.length === 1 ? (
        <Animated.View
          entering={FadeInDown.delay(120).duration(260)}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.sm,
          }}
        >
          {OPENERS.map((opener) => (
            <Pressable
              key={opener}
              accessibilityRole="button"
              onPress={() => void send(opener)}
              style={({ pressed }) => ({
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: radius.full,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
              })}
            >
              <Text variant="caption">{opener}</Text>
            </Pressable>
          ))}
        </Animated.View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.sm,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about a booking…"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Your question"
          multiline
          // The server takes a thousand characters; stopping here means a long
          // question is trimmed while it is still being typed rather than
          // rejected after it has been sent.
          maxLength={1_000}
          onSubmitEditing={() => void send(draft)}
          style={{
            flex: 1,
            minHeight: HIT_SIZE,
            // Four or five lines, then it scrolls. Growing without a ceiling
            // eventually eats the conversation it belongs to.
            maxHeight: 120,
            paddingHorizontal: spacing.md,
            paddingTop: spacing.sm + 2,
            paddingBottom: spacing.sm + 2,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
            color: colors.text,
            fontSize: 15,
          }}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={() => void send(draft)}
          style={({ pressed }) => ({
            width: HIT_SIZE,
            height: HIT_SIZE,
            borderRadius: radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: canSend
              ? pressed
                ? colors.primarySolidPressed
                : colors.primarySolid
              : colors.surfaceMuted,
          })}
        >
          <Ionicons name="arrow-up" size={20} color={canSend ? '#FFFFFF' : colors.textMuted} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
