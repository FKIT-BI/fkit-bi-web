import { Grid, Skeleton } from '@mantine/core';
import { createContext, Suspense, useContext, type ComponentType } from 'react';

export type PanelContext = Record<string, string | undefined>;

export type Span = number | Partial<Record<'base' | 'xs' | 'sm' | 'md' | 'lg' | 'xl', number>>;

export interface PanelDefinition {
  type: string;
  component: ComponentType<{ ctx: PanelContext }>;
  defaultSize: { span: Span };
  settingsSchema?: unknown;
}

export interface DashboardConfig {
  id: string;
  panels: Array<{ id: string; type: string; span?: Span }>;
}

export const DASHBOARD_BREAKPOINTS = { xs: '480px', sm: '640px', md: '900px', lg: '1200px', xl: '1600px' };

const toSpan = (s: Span) => (typeof s === 'number' ? (s >= 12 ? 12 : { base: 12, md: s }) : { base: 12, ...s });

const RegistryContext = createContext<Record<string, PanelDefinition>>({});
export const DashboardRegistryProvider = RegistryContext.Provider;

export function Dashboard({ config, ctx }: { config: DashboardConfig; ctx: PanelContext }) {
  const registry = useContext(RegistryContext);
  return (
    <Grid type="container" breakpoints={DASHBOARD_BREAKPOINTS} gap={8}>
      {config.panels.map((p) => {
        const def = registry[p.type];
        if (!def) {
          return (
            <Grid.Col key={p.id} span={12} c="red">
              Неизвестный тип панели: {p.type}
            </Grid.Col>
          );
        }
        const Component = def.component;
        return (
          <Grid.Col key={p.id} span={toSpan(p.span ?? def.defaultSize.span)} miw={0}>
            <Suspense fallback={<Skeleton h={280} />}>
              <Component ctx={ctx} />
            </Suspense>
          </Grid.Col>
        );
      })}
    </Grid>
  );
}
