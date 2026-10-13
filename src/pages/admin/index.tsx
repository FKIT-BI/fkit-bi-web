import { Group, Select, Tabs, Text } from '@mantine/core';
import { useState } from 'react';
import { canAdminister, useAdminNav, useEnterpriseChoice, useUiStore } from '@/shared/model';
import { EnterprisesTab, useEnterprises } from './EnterprisesTab';
import { EquipmentSetup } from './EquipmentSetup';
import { LinesMachinesTab } from './LinesMachinesTab';
import { LossReasonsTab } from './LossReasonsTab';
import { SetupChecklist } from './SetupChecklist';
import { ShiftsTab } from './ShiftsTab';

export default function AdminPage() {
  const tab = useAdminNav((s) => s.tab);
  const setTab = useAdminNav((s) => s.setTab);
  const chosen = useEnterpriseChoice((s) => s.id);
  const [picked, setPicked] = useState<string | null>(null);
  const readOnly = !canAdminister(useUiStore((s) => s.role));
  const enterprises = useEnterprises();
  const list = enterprises.data ?? [];
  const enterpriseId = list.find((e) => e.id === picked)?.id ?? list.find((e) => e.id === chosen)?.id ?? list.find((e) => e.status === 'ACTIVE')?.id ?? list[0]?.id ?? '';
  const scoped = tab !== 'enterprises' && tab !== 'wizard';

  return (
    <Tabs value={tab} onChange={(v) => v && setTab(v)} keepMounted={false}>
      <Group justify="space-between" align="flex-end" mb="xs" wrap="wrap">
        <Tabs.List style={{ flexWrap: 'wrap' }}>
          <Tabs.Tab value="setup">Настройка</Tabs.Tab>
          <Tabs.Tab value="enterprises">Предприятия</Tabs.Tab>
          <Tabs.Tab value="equipment">Линии и машины</Tabs.Tab>
          <Tabs.Tab value="shifts">Смены</Tabs.Tab>
          <Tabs.Tab value="reasons">Причины потерь</Tabs.Tab>
          <Tabs.Tab value="wizard">Мастер настройки</Tabs.Tab>
        </Tabs.List>
        {scoped && list.length > 0 && (
          <Select size="xs" w={260} aria-label="Предприятие" allowDeselect={false} value={enterpriseId} data={list.map((e) => ({ value: e.id, label: e.status === 'ACTIVE' ? e.name : `${e.name} (отключено)` }))} onChange={setPicked} />
        )}
      </Group>
      {readOnly && tab !== 'wizard' && <Text size="xs" c="dimmed" mb="xs">Режим просмотра. Для изменений выберите роль «Администратор» (переключатель в шапке).</Text>}
      <Tabs.Panel value="setup"><SetupChecklist enterpriseId={enterpriseId} readOnly={readOnly} /></Tabs.Panel>
      <Tabs.Panel value="enterprises"><EnterprisesTab readOnly={readOnly} /></Tabs.Panel>
      <Tabs.Panel value="equipment"><LinesMachinesTab enterpriseId={enterpriseId} readOnly={readOnly} /></Tabs.Panel>
      <Tabs.Panel value="shifts"><ShiftsTab enterpriseId={enterpriseId} readOnly={readOnly} /></Tabs.Panel>
      <Tabs.Panel value="reasons"><LossReasonsTab enterpriseId={enterpriseId} readOnly={readOnly} /></Tabs.Panel>
      <Tabs.Panel value="wizard"><EquipmentSetup /></Tabs.Panel>
    </Tabs>
  );
}
