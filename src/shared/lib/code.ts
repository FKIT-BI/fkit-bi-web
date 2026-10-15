/** Формат стабильного кода API: латиница в верхнем регистре, цифры и «_», с буквы, до 64 символов. */
export const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const MAX = 64;

// ГОСТ 7.79-2000 (схема Б), упрощённо: только A–Z, без апострофов и диакритики.
const RU: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function transliterate(text: string): string {
  return Array.from(text.toLowerCase(), (ch) => RU[ch] ?? ch).join('');
}

const cut = (code: string, max: number) => code.slice(0, max).replace(/_+$/, '');

/**
 * Код из названия: «Экструдер Э-1» → `EKSTRUDER_E_1`. Если код начинается не с буквы или пуст — добавляется `prefix`.
 * При совпадении с `taken` (без учёта регистра) добавляется суффикс `_2`, `_3`…
 */
export function makeCode(name: string, prefix: string, taken: Iterable<string> = []): string {
  let base = transliterate(name.normalize('NFC'))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!/^[A-Z]/.test(base)) base = base ? `${prefix}_${base}` : prefix;
  base = cut(base, MAX);
  const used = new Set(Array.from(taken, (c) => c.toUpperCase()));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const candidate = `${cut(base, MAX - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
