import * as echarts from 'echarts/core';
import { BarChart, CustomChart, GaugeChart, LineChart } from 'echarts/charts';
import {
  AriaComponent,
  BrushComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  GaugeChart,
  CustomChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  BrushComponent,
  ToolboxComponent,
  MarkLineComponent,
  DatasetComponent,
  AriaComponent,
  CanvasRenderer,
]);

export const CHART_TOKENS = {
  dark: { text: '#ccccdc', muted: '#8e8e9e', grid: '#2c3235', axis: '#464c54', tooltipBg: '#22252b', bg: 'transparent' },
  light: { text: '#24292e', muted: '#6a737d', grid: '#e4e7eb', axis: '#c7ccd1', tooltipBg: '#ffffff', bg: 'transparent' },
};

for (const [name, t] of Object.entries(CHART_TOKENS)) {
  echarts.registerTheme(`fkit-${name}`, {
    backgroundColor: t.bg,
    textStyle: { color: t.text, fontFamily: 'Inter, system-ui, sans-serif' },
    legend: { textStyle: { color: t.text }, pageTextStyle: { color: t.muted } },
    tooltip: {
      backgroundColor: t.tooltipBg,
      borderColor: t.axis,
      textStyle: { color: t.text, fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,.35); border-radius: 4px;',
    },
    categoryAxis: {
      axisLine: { lineStyle: { color: t.axis } },
      axisTick: { lineStyle: { color: t.axis } },
      axisLabel: { color: t.muted },
      splitLine: { lineStyle: { color: t.grid } },
    },
    valueAxis: {
      axisLine: { show: false, lineStyle: { color: t.axis } },
      axisLabel: { color: t.muted },
      splitLine: { lineStyle: { color: t.grid } },
    },
    timeAxis: {
      axisLine: { lineStyle: { color: t.axis } },
      axisLabel: { color: t.muted },
      splitLine: { lineStyle: { color: t.grid } },
    },
  });
}

export { echarts };
