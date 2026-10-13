import { useComputedColorScheme } from '@mantine/core';
import type { EChartsCoreOption, ECharts } from 'echarts/core';
import { useEffect, useRef } from 'react';
import { echarts } from './echarts';

type Handler = (params: any, chart: ECharts) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ChartProps {
  option: EChartsCoreOption;
  height?: number | string;
  group?: string;
  onEvents?: Record<string, Handler>;
  onBrushX?: (range: [number, number]) => void;
  ariaLabel?: string;
}

export function Chart({ option, height = 280, group, onEvents, onBrushX, ariaLabel }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const scheme = useComputedColorScheme('dark');
  const handlersRef = useRef({ onEvents, onBrushX });
  handlersRef.current = { onEvents, onBrushX };

  useEffect(() => {
    const chart = echarts.init(ref.current!, `fkit-${scheme}`, { renderer: 'canvas' });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current!);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [scheme]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const brush = handlersRef.current.onBrushX
      ? { brush: { xAxisIndex: 0, brushType: 'lineX', brushMode: 'single', throttleType: 'debounce', transformable: false, brushStyle: { color: 'rgba(120,160,255,0.15)', borderColor: 'rgba(120,160,255,0.6)' } }, toolbox: { show: false } }
      : {};
    chart.setOption({ aria: { enabled: true, label: { description: ariaLabel } }, ...option, ...brush }, { notMerge: true });
    if (handlersRef.current.onBrushX) {
      chart.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' } });
    }
  }, [option, scheme, ariaLabel]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const names = Object.keys(onEvents ?? {});
    for (const name of names) chart.on(name, (p) => handlersRef.current.onEvents?.[name]?.(p, chart));
    const onBrushEnd = (p: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const r = p?.areas?.[0]?.coordRange as [number, number] | undefined;
      chart.dispatchAction({ type: 'brush', areas: [] });
      if (r) handlersRef.current.onBrushX?.(r);
    };
    chart.on('brushEnd', onBrushEnd);
    return () => {
      for (const name of names) chart.off(name);
      chart.off('brushEnd', onBrushEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(onEvents ?? {}).join(), scheme]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !group) return;
    chart.group = group;
    echarts.connect(group);
  }, [group, scheme]);

  return <div ref={ref} style={{ width: '100%', height }} role="img" aria-label={ariaLabel} />;
}
