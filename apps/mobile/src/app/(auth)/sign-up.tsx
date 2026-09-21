import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@app/shared';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { ApiRequestError } from '../../api/client';
import { Button, Text, TextField } from '../../components/ui';
import { AuthScaffold } from '../../features/auth/auth-scaffold';
import { useAuthStore } from '../../features/auth/auth-store';
import { useTheme } from '../../theme';

export default function SignUp() {
  const router = useRouter();
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

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signUp(values.name, values.email, values.password);
      router.replace('/(tabs)');
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Could not create your account.');
    }
  });

  return (
    <AuthScaffold
      title="Create account"
      subtitle="It takes about thirty seconds."
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.xs, justifyContent: 'center' }}>
          <Text tone="muted">Already have an account?</Text>
          <Link href="/(auth)/sign-in">
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
            <TextField
              label="Password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
              hint="At least 10 characters, with upper case, lower case and a number."
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="••••••••••"
            />
          )}
        />

        {formError ? (
          <Text tone="danger" variant="caption" accessibilityLiveRegion="polite">
            {formError}
          </Text>
        ) : null}

        <Button label="Create account" loading={isSubmitting} onPress={onSubmit} />
      </View>
    </AuthScaffold>
  );
}
