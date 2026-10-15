import type { MeasurementUnit } from '@/shared/api';

/** Options for a unit selector: the backend catalog plus the current code if it is no longer active. */
export function unitOptions(units: MeasurementUnit[], current: string | null | undefined, emptyLabel: string) {
  const options = units.map((u) => ({ value: u.code, label: `${u.name}${u.symbol ? ` (${u.symbol})` : ''}` }));
  if (current && !units.some((u) => u.code === current)) options.push({ value: current, label: `${current} (неактивна)` });
  return [{ value: '', label: emptyLabel }, ...options];
}

/** Client-side mirror of the backend nominalRate/productionUnit pair rule. */
export function rateUnitError(rate: number | string | null | undefined, unit: string | null | undefined): { nominalRate?: string; productionUnit?: string } {
  const hasRate = rate !== '' && rate != null;
  if (hasRate && !(Number(rate) > 0)) return { nominalRate: 'Норма выпуска должна быть больше 0' };
  if (hasRate && !unit) return { productionUnit: 'Выберите единицу выпуска' };
  if (!hasRate && unit) return { nominalRate: 'Укажите норму выпуска для выбранной единицы' };
  return {};
}

/** Unit code → symbol for display («CELSIUS» → «°C»); unknown codes are shown as is. */
export function unitSymbol(units: MeasurementUnit[], code: string | null | undefined) {
  if (!code) return '';
  const u = units.find((x) => x.code === code);
  return u ? u.symbol || u.name : code;
}
