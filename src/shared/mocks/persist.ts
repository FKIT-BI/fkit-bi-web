/**
 * Сохранение мок-данных в localStorage: состояние переживает перезагрузку страницы.
 * Модули регистрируют «источники» (что сохранить и как восстановить); сохранение запускается после каждой
 * записывающей операции мок-API (см. handlers/utils.ts), восстановление — один раз при старте.
 */
export const PERSIST_KEY = 'fkit-bi:mock-db:v3';
const VERSION = 1;

interface Source {
  save: () => unknown;
  load: (value: unknown) => void;
}

const sources = new Map<string, Source>();
let loaded = false;

const storage = (): Storage | null => {
  try {
    const s = globalThis.localStorage;
    return s && typeof s.getItem === 'function' && typeof s.setItem === 'function' ? s : null;
  } catch {
    return null;
  }
};

export function registerPersisted(name: string, source: Source) {
  sources.set(name, source);
}

/** Восстанавливает сохранённое состояние (один раз). */
export function loadPersisted() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = storage()?.getItem(PERSIST_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as { version?: number; state?: Record<string, unknown> };
    if (data.version !== VERSION || !data.state) return;
    for (const [name, source] of sources) if (name in data.state) source.load(data.state[name]);
  } catch (e) {
    console.warn('[mocks] не удалось восстановить локальные данные, используем исходные', e);
  }
}

export function savePersisted() {
  try {
    const state: Record<string, unknown> = {};
    for (const [name, source] of sources) state[name] = source.save();
    storage()?.setItem(PERSIST_KEY, JSON.stringify({ version: VERSION, state }));
  } catch (e) {
    console.warn('[mocks] не удалось сохранить локальные данные', e);
  }
}

/** Забывает сохранённое и перезагружает страницу — возврат к исходным демо-данным. */
export function resetPersisted() {
  try {
    storage()?.removeItem(PERSIST_KEY);
  } catch {
    // нечего удалять
  }
  if (typeof location !== 'undefined') location.reload();
}

/** Для тестов: забыть, что восстановление уже выполнялось. */
export function __resetLoadedFlag() {
  loaded = false;
}

export const replaceArray = <T>(target: T[], value: unknown) => {
  if (Array.isArray(value)) target.splice(0, target.length, ...(value as T[]));
};
export const replaceMap = <V>(target: Map<string, V>, value: unknown) => {
  if (Array.isArray(value)) {
    target.clear();
    for (const [k, v] of value as Array<[string, V]>) target.set(k, v);
  }
};
