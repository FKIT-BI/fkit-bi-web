import { Button, Group, Select, Tabs, Text } from '@mantine/core';
import { IconHelp } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { OnboardingWizard } from '@/features/onboarding';
import { canAdminister, useAdminNav, useEnterpriseChoice, useUiStore } from '@/shared/model';
import { HelpDrawer } from '@/shared/ui';
import { EnterprisesTab, useEnterprises } from './EnterprisesTab';
import { LinesMachinesTab } from './LinesMachinesTab';
import { LossReasonsTab } from './LossReasonsTab';
import { SetupChecklist } from './SetupChecklist';
import { ShiftsTab } from './ShiftsTab';

export default function AdminPage() {
  const tab = useAdminNav((s) => s.tab);
  const setTab = useAdminNav((s) => s.setTab);
  const chosen = useEnterpriseChoice((s) => s.id);
  const [picked, setPicked] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const readOnly = !canAdminister(useUiStore((s) => s.role));
  const enterprises = useEnterprises();
  const list = enterprises.data ?? [];
  const enterpriseId = list.find((e) => e.id === picked)?.id ?? list.find((e) => e.id === chosen)?.id ?? list.find((e) => e.status === 'ACTIVE')?.id ?? list[0]?.id ?? '';
  const scoped = tab !== 'enterprises' && tab !== 'wizard';
  // Пустой стенд: сразу ведём в мастер подключения первой машины.
  useEffect(() => {
    if (enterprises.isSuccess && !list.length && tab !== 'wizard') setTab('wizard');
  }, [enterprises.isSuccess, list.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Tabs value={tab} onChange={(v) => v && setTab(v)} keepMounted={false}>
      <Group justify="space-between" align="flex-end" mb="xs" wrap="wrap">
        <Tabs.List style={{ flexWrap: 'wrap' }}>
          <Tabs.Tab value="wizard">Подключить машину</Tabs.Tab>
          <Tabs.Tab value="setup">Готовность</Tabs.Tab>
          <Tabs.Tab value="enterprises">Предприятия</Tabs.Tab>
          <Tabs.Tab value="equipment">Линии и машины</Tabs.Tab>
          <Tabs.Tab value="shifts">Смены</Tabs.Tab>
          <Tabs.Tab value="reasons">Причины потерь</Tabs.Tab>
        </Tabs.List>
        <Group gap="xs">
          {scoped && list.length > 0 && (
            <Select size="xs" w={260} aria-label="Предприятие" allowDeselect={false} value={enterpriseId} data={list.map((e) => ({ value: e.id, label: e.status === 'ACTIVE' ? e.name : `${e.name} (отключено)` }))} onChange={setPicked} />
          )}
          <Button size="xs" variant="subtle" leftSection={<IconHelp size={14} />} onClick={() => setHelp(true)}>Справка</Button>
        </Group>
      </Group>
      {readOnly && tab !== 'wizard' && <Text size="xs" c="dimmed" mb="xs">Режим просмотра. Для изменений выберите роль «Администратор» (переключатель в шапке).</Text>}
      <Tabs.Panel value="setup"><SetupChecklist enterpriseId={enterpriseId} readOnly={readOnly} /></Tabs.Panel>
      <Tabs.Panel value="enterprises"><EnterprisesTab readOnly={readOnly} /></Tabs.Panel>
      <Tabs.Panel value="equipment"><LinesMachinesTab enterpriseId={enterpriseId} readOnly={readOnly} /></Tabs.Panel>
      <Tabs.Panel value="shifts"><ShiftsTab enterpriseId={enterpriseId} readOnly={readOnly} /></Tabs.Panel>
      <Tabs.Panel value="reasons"><LossReasonsTab enterpriseId={enterpriseId} readOnly={readOnly} /></Tabs.Panel>
      <Tabs.Panel value="wizard"><OnboardingWizard readOnly={readOnly} /></Tabs.Panel>
      <HelpDrawer opened={help} onClose={() => setHelp(false)} />
    </Tabs>
  );
}
