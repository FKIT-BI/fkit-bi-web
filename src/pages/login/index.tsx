import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertCircle } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, ApiError } from '@/shared/api';
import { env } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { useAuth } from '@/shared/model';

const schema = z.object({
  username: z.string().min(3).max(64).regex(/^[A-Za-z0-9._-]+$/),
  password: z.string().min(12).max(72),
});
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const { t } = useTranslation();
  const signIn = useAuth((s) => s.signIn);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { redirect?: string };
  const isMock = env.apiMode === 'mock';
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: isMock ? { username: 'demo', password: 'demo-password-1' } : { username: '', password: '' },
  });

  const login = useMutation({
    mutationFn: (v: Form) => api.login(v),
    onSuccess: (r) => {
      signIn(r.accessToken, r.user, r.expiresIn);
      void navigate({ to: search.redirect && search.redirect.startsWith('/') ? search.redirect : '/', replace: true });
    },
    onError: (e) => {
      if (e instanceof ApiError) for (const fe of e.fieldErrors) if (fe.path === 'username' || fe.path === 'password') form.setError(fe.path, { message: fe.message });
    },
  });

  const error = login.error instanceof ApiError && login.error.status === 401 ? t('auth.failed') : login.error?.message;

  return (
    <Center mih="100vh" p="md" style={{ background: 'var(--app-bg)' }}>
      <Paper w="100%" maw={380} p="lg" radius="md" style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)' }}>
        <form onSubmit={form.handleSubmit((v) => login.mutate(v))} noValidate>
          <Stack gap="sm">
            <Title order={3}>{t('auth.title')}</Title>
            {error && (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {error}
              </Alert>
            )}
            <TextInput
              label={t('auth.username')}
              autoComplete="username"
              autoFocus
              error={form.formState.errors.username?.message}
              {...form.register('username')}
            />
            <PasswordInput
              label={t('auth.password')}
              autoComplete="current-password"
              error={form.formState.errors.password?.message}
              {...form.register('password')}
            />
            <Button type="submit" loading={login.isPending} fullWidth>
              {t('auth.submit')}
            </Button>
            {isMock && (
              <Text size="xs" c="dimmed">
                {t('auth.mockHint')}
              </Text>
            )}
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
