import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, View } from 'react-native';
import { authApi } from '../../api/auth';
import { Button, Text, TextField } from '../../components/ui';
import { useTheme } from '../../theme';

/**
 * Closing an account.
 *
 * Reachable from the profile because both app stores require an in-app path,
 * and the DPDP Act gives the right it serves. Freezing or hiding the account
 * would not count as either.
 *
 * It says plainly what survives. The bookings and the points stay, detached
 * from the person, because they are the cinema's records as much as anybody's
 * and a business is separately obliged to keep them. Somebody deleting an
 * account deserves to know that before they do it rather than to discover it
 * afterwards, and the law that grants the erasure is the same law that
 * preserves that retention.
 */
export function DeleteAccountSheet({
  visible,
  onClose,
  onDeleted,
}: {
  visible: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const [password, setPassword] = useState('');

  const close = useMutation({
    mutationFn: () => authApi.deleteAccount(password),
    onSuccess: () => {
      setPassword('');
      onDeleted();
    },
  });

  const dismiss = () => {
    if (close.isPending) return;
    setPassword('');
    close.reset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}>
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: radius['2xl'],
            borderTopRightRadius: radius['2xl'],
            padding: spacing.xl,
            gap: spacing.lg,
          }}
        >
          <View style={{ gap: spacing.sm }}>
            <Text variant="title">Delete your account</Text>
            <Text variant="body" tone="muted">
              This cannot be undone. Your name, email, saved films and saved cinemas are removed,
              and you are signed out everywhere.
            </Text>
            <Text variant="body" tone="muted">
              Bookings you have already paid for stay in the cinema&apos;s records, without your
              name on them. They have to: a cinema has to account for the seats it sold.
            </Text>
          </View>

          <TextField
            label="Your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Confirm it is you"
            error={close.isError ? 'That password is not right.' : undefined}
          />

          <View style={{ gap: spacing.sm }}>
            {/* `danger`, not `destructive`. That prop only tints a ghost
                button's label, so on a filled one it is silently ignored, and
                the most irreversible action in the app came out wearing the
                brand colour that everywhere else means "yes, go ahead". */}
            <Button
              label="Delete my account"
              variant="danger"
              loading={close.isPending}
              disabled={password.length === 0}
              onPress={() => close.mutate()}
            />
            <Button label="Keep my account" variant="ghost" onPress={dismiss} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
