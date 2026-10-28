import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@app/shared';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { Button, Text, TextField } from '../../components/ui';
import { PasswordRules } from '../../features/auth/password-rules';
import { authErrorMessage } from '../../features/auth/auth-error';
import { useSlowSubmit } from '../../features/auth/use-slow-submit';
import { AuthScaffold } from '../../features/auth/auth-scaffold';
import { useAuthStore } from '../../features/auth/auth-store';
import { useTheme } from '../../theme';

export default function SignUp() {
  /** Carried through from sign-in, so the trip ends where it started. */
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { spacing } = useTheme();
  const signUp = useAuthStore((s) => s.signUp);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
    mode: 'onTouched',
  });

  const submitHint = useSlowSubmit(isSubmitting);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signUp(values.name, values.email, values.password);
      // No navigation here. `(auth)/_layout` redirects the moment the store
      // says somebody is signed in, and two of them racing is how `next` got
      // lost.
    } catch (err) {
      setFormError(authErrorMessage(err, 'Could not create your account. Please try again.'));
    }
  });

  return (
    <AuthScaffold
      title="Create account"
      subtitle="It takes about thirty seconds."
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.xs, justifyContent: 'center' }}>
          <Text tone="muted">Already have an account?</Text>
          <Link href={{ pathname: '/(auth)/sign-in', params: next ? { next } : {} }}>
            <Text tone="primary" variant="label">
              Sign in
            </Text>
          </Link>
        </View>
      }
    >
      <View style={{ gap: spacing.lg }}>
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Name"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.name?.message}
              autoComplete="name"
              textContentType="name"
              placeholder="Naman"
            />
          )}
        />

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
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <View>
              <TextField
                label="Password"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                // The checklist below carries the rules, so the error line is
                // left for things it cannot show — a password the server
                // rejected for a reason that is not one of the four.
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

        <Button label="Create account" loading={isSubmitting} onPress={onSubmit} />
      </View>
    </AuthScaffold>
  );
}
