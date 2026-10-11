import { Stack, Text, Title } from '@mantine/core';
import { useTranslation } from '@/shared/i18n';

export default function AdminPage() {
  const { t } = useTranslation();
  return (
    <Stack p="xl" align="center" gap="xs">
      <Title order={3}>{t('nav.admin')}</Title>
      <Text c="dimmed">{t('stub.soon')}</Text>
      <Text c="dimmed" size="sm">
        Предприятия, линии и машины, конфигурация OPC-тегов, справочник причин
      </Text>
    </Stack>
  );
}
