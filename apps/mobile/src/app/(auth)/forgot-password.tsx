import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@app/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { authApi } from '../../api/auth';
import { Button, Text, TextField } from '../../components/ui';
import { authErrorMessage } from '../../features/auth/auth-error';
import { AuthScaffold } from '../../features/auth/auth-scaffold';
import { useSlowSubmit } from '../../features/auth/use-slow-submit';
import { useTheme } from '../../theme';

export default function ForgotPassword() {
  const { spacing } = useTheme();
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
    mode: 'onTouched',
  });

  const submitHint = useSlowSubmit(isSubmitting);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authApi.forgotPassword(values);
      setSentTo(values.email);
    } catch (err) {
      setFormError(authErrorMessage(err, 'Could not send that right now. Try again.'));
    }
  });

  /**
   * The confirmation says "if that address has an account", because the server
   * deliberately does not tell us whether it does. Promising mail that may
   * never arrive would be worse than saying exactly what is true.
   */
  if (sentTo) {
    return (
      <AuthScaffold
        title="Check your email"
        subtitle={`If ${sentTo} has an account, a reset link is on its way.`}
        footer={
          <Text tone="muted" align="center">
            Wrong address?{' '}
            <Link href="/(auth)/forgot-password" onPress={() => setSentTo(null)}>
              <Text tone="primary">Try another</Text>
            </Link>
          </Text>
        }
      >
        <View style={{ gap: spacing.md }}>
          <Text tone="muted">
            The link works once and stops working after thirty minutes. Nothing on your account has
            changed until you use it.
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button label="Back to sign in" variant="secondary" />
          </Link>
        </View>
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold
      title="Reset your password"
      subtitle="Tell us the address you signed up with."
      footer={
        <Text tone="muted" align="center">
          Remembered it?{' '}
          <Link href="/(auth)/sign-in">
            <Text tone="primary">Sign in</Text>
          </Link>
        </Text>
      }
    >
      <View style={{ gap: spacing.md }}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Email"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.email?.message}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              placeholder="you@example.com"
            />
          )}
        />

        {formError ? (
          <Text tone="danger" variant="caption" accessibilityLiveRegion="polite">
            {formError}
          </Text>
        ) : null}

        {submitHint && !formError ? (
          <Text tone="muted" variant="caption" accessibilityLiveRegion="polite">
            {submitHint.kind === 'waking'
              ? `Waking the server, ${submitHint.seconds}s. The free plan sleeps when nobody is using it; this takes about a minute and then it works.`
              : 'Still going. One moment.'}
          </Text>
        ) : null}

        <Button label="Send the link" loading={isSubmitting} onPress={onSubmit} />
      </View>
    </AuthScaffold>
  );
}
