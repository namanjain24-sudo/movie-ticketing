import { REVIEW_MAX_LENGTH, type Review } from '@app/shared';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, RatingInput, Text } from '../../components/ui';
import { useTheme } from '../../theme';

/**
 * Writing, or rewriting, a review.
 *
 * The rating is required and the words are not, because most people have a
 * verdict and no essay, and forcing a paragraph out of them produces "good
 * movie" — which is worse than the star on its own. The submit button stays
 * disabled until a star is chosen, so the one required thing is the one thing
 * standing between them and done.
 */
export function ReviewComposer({
  visible,
  movieTitle,
  existing,
  submitting,
  deleting,
  error,
  onSubmit,
  onDelete,
  onClose,
}: {
  visible: boolean;
  movieTitle: string;
  /** Present when editing. Pre-fills, and unlocks the delete action. */
  existing: Review | null;
  submitting: boolean;
  deleting: boolean;
  error: string | null;
  onSubmit: (input: { rating: number; body: string | null }) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/*
        The form is mounted fresh every time the sheet opens, and again whenever
        the server's copy of the review changes underneath it.

        That remount *is* the reset. Syncing props into state from an effect
        would work too, but it renders the stale draft for one frame first and
        costs a second render every time — and the moment the draft is the
        previous film's words under a new film's title, someone posts it.
      */}
      {visible ? (
        <ComposerForm
          key={existing ? `${existing.id}:${existing.updatedAt}` : 'new'}
          movieTitle={movieTitle}
          existing={existing}
          submitting={submitting}
          deleting={deleting}
          error={error}
          onSubmit={onSubmit}
          onDelete={onDelete}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

function ComposerForm({
  movieTitle,
  existing,
  submitting,
  deleting,
  error,
  onSubmit,
  onDelete,
  onClose,
}: {
  movieTitle: string;
  existing: Review | null;
  submitting: boolean;
  deleting: boolean;
  error: string | null;
  onSubmit: (input: { rating: number; body: string | null }) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const [rating, setRating] = useState<number | null>(existing?.rating ?? null);
  const [body, setBody] = useState(existing?.body ?? '');

  const remaining = REVIEW_MAX_LENGTH - body.length;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      {/* Dismisses on tap, but is not itself a button: it wraps the sheet's
            own controls, and a control inside a control is ambiguous to a
            screen reader. The sheet carries a labelled way out. */}
      <Pressable
        accessible={false}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }}
      >
        <Pressable
          accessible={false}
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + spacing.lg,
            paddingHorizontal: spacing.lg,
            gap: spacing.lg,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.borderStrong,
            }}
          />

          <View style={{ gap: spacing.xs, alignItems: 'center' }}>
            <Text variant="title">{existing ? 'Edit your review' : 'Rate this film'}</Text>
            <Text variant="caption" tone="muted" align="center" numberOfLines={1}>
              {movieTitle}
            </Text>
          </View>

          <View style={{ alignItems: 'center', gap: spacing.xs }}>
            <RatingInput value={rating} onChange={setRating} />
            <Text variant="caption" tone="muted">
              {rating === null ? 'Tap a star' : VERDICTS[rating]}
            </Text>
          </View>

          <View style={{ gap: spacing.xs }}>
            <TextInput
              value={body}
              onChangeText={(next) => setBody(next.slice(0, REVIEW_MAX_LENGTH))}
              placeholder="Anything you want to add? (optional)"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Your review"
              style={{
                minHeight: 96,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.md,
                backgroundColor: colors.background,
                color: colors.text,
                padding: spacing.md,
                fontSize: 15,
                lineHeight: 22,
              }}
            />
            {/* Only shown once it is nearly relevant. A counter that reads
                  "1000 left" from the first keystroke is noise. */}
            {remaining < 120 ? (
              <Text variant="caption" tone={remaining === 0 ? 'danger' : 'muted'} align="right">
                {remaining} characters left
              </Text>
            ) : null}
          </View>

          {error ? (
            <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <Button
            label={existing ? 'Save changes' : 'Post review'}
            disabled={rating === null}
            loading={submitting}
            onPress={() => {
              if (rating === null) return;
              onSubmit({ rating, body: body.trim() === '' ? null : body.trim() });
            }}
          />

          {existing ? (
            <Button
              label="Delete my review"
              variant="ghost"
              destructive
              loading={deleting}
              onPress={onDelete}
            />
          ) : (
            <Button label="Not now" variant="ghost" onPress={onClose} />
          )}
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

/**
 * What each star means, said out loud. Without it the scale is whatever the
 * person happens to assume, and a three from someone who reads three as
 * "fine" is not the same number as a three from someone who reads it as "bad".
 */
const VERDICTS: Record<number, string> = {
  1: 'Terrible — do not bother',
  2: 'Weak, with moments',
  3: 'Watchable',
  4: 'Really good',
  5: 'Superb — see it on the big screen',
};
