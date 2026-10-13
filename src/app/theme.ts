import { createTheme, type MantineColorsTuple } from '@mantine/core';

const dark: MantineColorsTuple = [
  '#ccccdc', '#b3b3c4', '#8e8e9e', '#6e7079', '#34373d', '#2c3235', '#22252b', '#181b1f', '#111217', '#0b0c0e',
];

export const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'sm',
  fontFamily: 'Inter, "Segoe UI", Roboto, system-ui, sans-serif',
  colors: { dark },
  components: {
    Tooltip: { defaultProps: { withArrow: true, openDelay: 200 } },
  },
});
