import { describe, expect, it } from 'vitest';
import { CODE_PATTERN, makeCode, transliterate } from './code';

describe('makeCode', () => {
  it('транслитерирует название в стабильный код', () => {
    expect(makeCode('Экструдер Э-1', 'M')).toBe('EKSTRUDER_E_1');
    expect(makeCode('Линия экструзии №2', 'LINE')).toBe('LINIYA_EKSTRUZII_2');
    expect(makeCode('Щётка, «чистка»', 'C')).toBe('SHCHYOTKA_CHISTKA');
    expect(makeCode('Температура зоны 1 (°C)', 'S')).toBe('TEMPERATURA_ZONY_1_C');
  });

  it('добавляет префикс, если код не начинается с буквы или пуст', () => {
    expect(makeCode('1-я смена', 'SHIFT')).toBe('SHIFT_1_YA_SMENA');
    expect(makeCode('  ', 'LINE')).toBe('LINE');
    expect(makeCode('№ 5', 'M')).toBe('M_5');
  });

  it('уникализирует суффиксом без учёта регистра', () => {
    expect(makeCode('День', 'SHIFT', ['DEN'])).toBe('DEN_2');
    expect(makeCode('День', 'SHIFT', ['den', 'DEN_2'])).toBe('DEN_3');
  });

  it('не длиннее 64 символов и всегда проходит формат API', () => {
    const long = 'Очень длинное название машины '.repeat(5);
    const code = makeCode(long, 'M');
    expect(code.length).toBeLessThanOrEqual(64);
    expect(CODE_PATTERN.test(code)).toBe(true);
    const next = makeCode(long, 'M', [code]);
    expect(next.length).toBeLessThanOrEqual(64);
    expect(next.endsWith('_2')).toBe(true);
    for (const name of ['', '___', 'Ёжик', 'abc', 'ПЛК-1200', 'Pump №3']) expect(CODE_PATTERN.test(makeCode(name, 'X'))).toBe(true);
  });

  it('оставляет латиницу как есть', () => {
    expect(transliterate('Pump A')).toBe('pump a');
    expect(makeCode('Pump A', 'C')).toBe('PUMP_A');
  });
});
