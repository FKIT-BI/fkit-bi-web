import { describe, expect, it } from 'vitest';
import { COMPONENT_KIND, enumLabel, enumOptions, fieldLabel, GLOSSARY, KINDS_FOR_VALUE_TYPE, MACHINE_STATE, SEMANTIC, SIGNAL_KIND, SIGNAL_SEMANTICS, TIMEZONE, VALUE_TYPE } from './dictionaries';

const RAW = /\b[A-Z]{2,}(_[A-Z]+)*\b/;

describe('словари', () => {
  it('у каждого значения есть русская подпись без сырых кодов', () => {
    for (const dict of [MACHINE_STATE, VALUE_TYPE, SIGNAL_KIND, COMPONENT_KIND, SEMANTIC, TIMEZONE]) {
      for (const [code, term] of Object.entries(dict)) {
        expect(term.label, code).toMatch(/[А-Яа-яЁё]/);
        expect(RAW.test(term.label.replace(/\(ПЛК\)|UTC/g, '')), `${code}: ${term.label}`).toBe(false);
      }
    }
  });

  it('каталог семантик полон, а рекомендуемые формат и характер совместимы', () => {
    expect(Object.keys(SEMANTIC).sort()).toEqual([...SIGNAL_SEMANTICS].sort());
    for (const [code, t] of Object.entries(SEMANTIC)) {
      if (t.valueType && t.signalKind) expect(KINDS_FOR_VALUE_TYPE[t.valueType], code).toContain(t.signalKind);
    }
  });

  it('enumLabel даёт фоллбэк на код для открытых списков', () => {
    expect(enumLabel(SEMANTIC, 'TEMPERATURE')).toBe('Температура');
    expect(enumLabel(SEMANTIC, 'MELT_INDEX')).toBe('MELT_INDEX');
    expect(enumLabel(SEMANTIC, null)).toBe('—');
    expect(enumOptions(SIGNAL_KIND, ['GAUGE'])).toEqual([{ value: 'GAUGE', label: 'Текущее измерение', hint: SIGNAL_KIND.GAUGE.hint }]);
  });

  it('путь ошибки поля превращается в подпись', () => {
    expect(fieldLabel('productionUnit')).toBe('Единица выпуска');
    expect(fieldLabel('parameters[0].unitCode')).toBe('Параметры № 1 → Единица измерения');
    expect(fieldLabel('rules[2].enterCondition.signalId')).toBe('Правила № 3 → Условие входа → Сигнал');
    expect(fieldLabel('')).toBe('Запрос');
    expect(fieldLabel('unknownField')).toBe('unknownField');
  });

  it('глоссарий покрывает ключевые термины', () => {
    const terms = GLOSSARY.map((g) => g.term);
    for (const t of ['Узел (компонент)', 'Сигнал', 'Что измеряет', 'Характер сигнала', 'Код', 'Название']) expect(terms).toContain(t);
  });
});
