import { describe, expect, it } from 'vitest';
import { rateUnitError, unitOptions } from './units';

describe('единицы выпуска', () => {
  const units = [{ code: 'PCS', name: 'Штука', symbol: 'шт', quantityCode: 'COUNT' }];

  it('показывает название и обозначение, а отправляет стабильный код', () => {
    expect(unitOptions(units, '', 'Не выбрана')).toEqual([
      { value: '', label: 'Не выбрана' },
      { value: 'PCS', label: 'Штука (шт)' },
    ]);
  });

  it('не теряет текущий код, если единица больше не активна', () => {
    expect(unitOptions(units, 'OLD', 'Не выбрана').at(-1)).toEqual({ value: 'OLD', label: 'OLD (неактивна)' });
  });

  it('проверяет норму и единицу как связанную пару', () => {
    expect(rateUnitError('', '')).toEqual({});
    expect(rateUnitError(100, 'PCS')).toEqual({});
    expect(rateUnitError(0, 'PCS').nominalRate).toBeDefined();
    expect(rateUnitError(-5, 'PCS').nominalRate).toBeDefined();
    expect(rateUnitError(100, '').productionUnit).toBeDefined();
    expect(rateUnitError('', 'PCS').nominalRate).toBeDefined();
  });
});
