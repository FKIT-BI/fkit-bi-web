import { Button, Group, Tabs } from '@mantine/core';
import { IconWand } from '@tabler/icons-react';
import { useState } from 'react';
import { QuickGenerateModal } from '@/features/quick-generate';
import { canAdminister, useGeneratorNav, useUiStore } from '@/shared/model';
import { RunsTab } from './RunsTab';
import { ScenariosTab } from './ScenariosTab';

export default function GeneratorPage() {
  const { tab, focusRun, setTab, showRun } = useGeneratorNav();
  const admin = canAdminister(useUiStore((s) => s.role));
  const [quick, setQuick] = useState(false);
  return (
    <Tabs value={tab} onChange={(v) => v && setTab(v as 'scenarios' | 'runs')} keepMounted={false}>
      <Group justify="space-between" mb="xs" wrap="wrap">
        <Tabs.List>
          <Tabs.Tab value="scenarios">Сценарии</Tabs.Tab>
          <Tabs.Tab value="runs">Запуски</Tabs.Tab>
        </Tabs.List>
        {admin && <Button leftSection={<IconWand size={16} />} onClick={() => setQuick(true)}>Быстрая генерация</Button>}
      </Group>
      <Tabs.Panel value="scenarios"><ScenariosTab onRunCreated={showRun} /></Tabs.Panel>
      <Tabs.Panel value="runs"><RunsTab key={focusRun ?? 'none'} focusRunId={focusRun} /></Tabs.Panel>
      <QuickGenerateModal opened={quick} onClose={() => setQuick(false)} onStarted={showRun} />
    </Tabs>
  );
}
