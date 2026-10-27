import { zodResolver } from '@hookform/resolvers/zod';
import { passwordSchema } from '@app/shared';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';
import { authApi } from '../api/auth';
import { Button, Text, TextField } from '../components/ui';
import { PasswordRules } from '../features/auth/password-rules';
import { authErrorMessage } from '../features/auth/auth-error';
import { AuthScaffold } from '../features/auth/auth-scaffold';
import { useSlowSubmit } from '../features/auth/use-slow-submit';
import { useTheme } from '../theme';

/**
 * Deliberately a top level route rather than one inside `(auth)`.
 *
 * That group redirects anyone already signed in to the tabs, which is right
 * for sign-in and sign-up and wrong here: a reset link can perfectly well be
 * opened on a phone that is still signed in, and bouncing it to the home
 * screen would look like the link was broken.
 */

/** Only the password is typed here; the token comes from the link. */
const formSchema = z.object({ password: passwordSchema });
type FormValues = z.infer<typeof formSchema>;

export default function ResetPassword() {
  const router = useRouter();
  const { spacing } = useTheme();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '' },
    mode: 'onTouched',
  });

  const submitHint = useSlowSubmit(isSubmitting);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authApi.resetPassword({ token: token ?? '', password: values.password });
      setDone(true);
    } catch (err) {
      setFormError(authErrorMessage(err, 'Could not reset that password. Try again.'));
    }
  });

  // Opened without a token: someone reached this screen by hand, or the link
  // was mangled on the way. Say so rather than failing on submit.
  if (!token) {
    return (
      <AuthScaffold
        title="That link is incomplete"
        subtitle="Open the reset link from your email, or ask for a new one."
        footer={
          <Text tone="muted" align="center">
            <Link href="/(auth)/forgot-password">
              <Text tone="primary">Send a new link</Text>
            </Link>
          </Text>
        }
      >
        <Link href="/(auth)/sign-in" asChild>
          <Button label="Back to sign in" variant="secondary" />
        </Link>
      </AuthScaffold>
    );
  }

  if (done) {
    return (
      <AuthScaffold
        title="Password changed"
        subtitle="Every device that was signed in has been signed out."
        footer={
          <Text tone="muted" align="center">
            You can close this and sign in again.
          </Text>
        }
      >
        <Button label="Sign in" onPress={() => router.replace('/(auth)/sign-in')} />
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold
      title="Choose a new password"
      subtitle="This link works once, and only for the next thirty minutes."
      footer={
        <Text tone="muted" align="center">
          Link expired?{' '}
          <Link href="/(auth)/forgot-password">
            <Text tone="primary">Send a new one</Text>
          </Link>
        </Text>
      }
    >
      <View style={{ gap: spacing.md }}>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <View>
              <TextField
                label="New password"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                // Same policy as sign-up, so the same checklist. The error
                // line is left for whatever the four rules cannot say.
                error={errors.password?.message}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="••••••••••"
              />
              <PasswordRules value={value ?? ''} />
            </View>
          )}
        />

        {formError ? (
          <Text tone="danger" variant="caption" accessibilityLiveRegion="polite">
            {formError}
          </Text>
        ) : null}

        {submitHint && !formError ? (
          <Text tone="muted" variant="caption" accessibilityLiveRegion="polite">
            {submitHint.message}
          </Text>
        ) : null}

        <Button label="Set new password" loading={isSubmitting} onPress={onSubmit} />
      </View>
    </AuthScaffold>
  );
}
