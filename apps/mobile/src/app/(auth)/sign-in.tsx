import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@app/shared';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { Button, Text, TextField } from '../../components/ui';
import { authErrorMessage } from '../../features/auth/auth-error';
import { useSlowSubmit } from '../../features/auth/use-slow-submit';
import { AuthScaffold } from '../../features/auth/auth-scaffold';
import { useAuthStore } from '../../features/auth/auth-store';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';

export default function SignIn() {
  const router = useRouter();
  const { spacing } = useTheme();
  const signIn = useAuthStore((s) => s.signIn);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const submitHint = useSlowSubmit(isSubmitting);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
      router.replace('/(tabs)');
    } catch (err) {
      setFormError(authErrorMessage(err, 'Could not sign in. Please try again.'));
    }
  });

  return (
    <AuthScaffold
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.xs, justifyContent: 'center' }}>
          <Text tone="muted">New here?</Text>
          <Link href="/(auth)/sign-up">
            <Text tone="primary" variant="label">
              Create an account
            </Text>
          </Link>
        </View>
      }
    >
      <View style={{ gap: spacing.lg }}>
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
            <TextField
              label="Password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              placeholder="••••••••••"
              onSubmitEditing={onSubmit}
              returnKeyType="go"
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

        <Button label="Sign in" loading={isSubmitting} onPress={onSubmit} />

        <Link href="/(auth)/forgot-password" asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Forgot your password"
            hitSlop={HIT_SIZE / 3}
            style={{ alignSelf: 'center', minHeight: HIT_SIZE, justifyContent: 'center' }}
          >
            <Text tone="primary" variant="label">
              Forgot your password?
            </Text>
          </Pressable>
        </Link>
      </View>
    </AuthScaffold>
  );
}
