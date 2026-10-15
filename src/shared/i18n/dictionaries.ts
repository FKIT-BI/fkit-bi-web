import type {
  ComparisonOperator,
  ComponentKind,
  ConfigStatus,
  EvaluationQuality,
  Freshness,
  MachineState,
  SignalKind,
  SignalValueType,
  StateSource,
  TelemetryQuality,
} from '@/shared/api';
import { ru } from './ru';

/**
 * Русские подписи и пояснения для перечислений API (спецификация онбординга, раздел 8).
 * Словари закрытых enum типизированы `Record<Enum, …>`: новое значение в API без перевода не соберётся.
 */
export interface Term {
  label: string;
  hint?: string;
}

type Dict<K extends string> = Record<K, Term>;

/** Подпись значения; для открытых списков (семантика, часовой пояс) — сам код, если перевода нет. */
type AnyDict = { readonly [code: string]: Term | undefined };

export function enumLabel(dict: AnyDict, code: string | null | undefined, fallback = '—'): string {
  if (code == null || code === '') return fallback;
  return dict[code]?.label ?? code;
}

export function enumHint(dict: AnyDict, code: string | null | undefined): string | undefined {
  return code ? dict[code]?.hint : undefined;
}

/** Опции для Select: подпись, пояснение и код (поиск работает по всем трём). */
export interface EnumOption {
  value: string;
  label: string;
  hint?: string;
}

export function enumOptions(dict: AnyDict, codes?: readonly string[]): EnumOption[] {
  const keys = codes ?? Object.keys(dict);
  return keys.map((value) => ({ value, label: enumLabel(dict, value), hint: enumHint(dict, value) }));
}

// ---------- Состояния машины ----------

export const MACHINE_STATE: Dict<MachineState> = {
  RUN: { label: ru.state.RUN, hint: 'Машина выпускает продукцию — полезное время.' },
  IDLE: { label: ru.state.IDLE, hint: 'Машина включена, но не работает без плановой причины: ожидание, нет материала, нет оператора. Неплановая потеря.' },
  DOWN: { label: ru.state.DOWN, hint: 'Машина остановлена из-за неисправности. Неплановая потеря.' },
  SETUP: { label: ru.state.SETUP, hint: 'Плановая смена оснастки, формы или продукта.' },
  PLANNED_STOP: { label: ru.state.PLANNED_STOP, hint: 'Обед, ТО, нет плана выпуска. Не снижает доступность.' },
  OFFLINE: { label: ru.state.OFFLINE, hint: 'Система не получает данные. Ставится автоматически, выбрать в правилах нельзя.' },
};

/** Состояния, которые пользователь может выбрать в правилах (без «Нет данных»). */
export const USER_STATES = ['RUN', 'IDLE', 'DOWN', 'SETUP', 'PLANNED_STOP'] as const;

// ---------- Статусы ----------

export const CONFIG_STATUS: Dict<ConfigStatus> = {
  ACTIVE: { label: 'Активно', hint: 'Участвует в мониторинге и расчётах.' },
  DISABLED: { label: 'Отключено', hint: 'Сохранено, но не используется. Удаления нет — объект можно включить снова.' },
};

/** Статус машины: «отключена» для неё означает «не в мониторинге». */
export const MACHINE_STATUS: Dict<ConfigStatus> = {
  ACTIVE: { label: 'В мониторинге', hint: 'Машина подключена: по ней считаются состояния, простои и показатели.' },
  DISABLED: { label: 'Не подключена', hint: 'Машина не участвует в мониторинге. Подключите её после настройки сигналов и правил состояния.' },
};

// ---------- Сигналы ----------

export const VALUE_TYPE: Dict<SignalValueType> = {
  DOUBLE: { label: 'Дробное число', hint: 'Температура, давление, скорость: 72.5' },
  LONG: { label: 'Целое число', hint: 'Счётчики, коды режимов: 1520' },
  BOOLEAN: { label: 'Да / нет', hint: 'Флаги: «в работе», «авария»' },
  STRING: { label: 'Текст', hint: 'Текстовые коды состояний: "AUTO", "MANUAL"' },
};

export const SIGNAL_KIND: Dict<SignalKind> = {
  GAUGE: { label: 'Текущее измерение', hint: 'Значение в каждый момент: температура, скорость. Для него считаются мин/макс/среднее.' },
  COUNTER: { label: 'Накопительный счётчик', hint: 'Значение только растёт: изделия, циклы, кВт·ч. Важна разница за период.' },
  STATE: { label: 'Состояние / код', hint: 'Дискретное значение: да/нет, режим, код. Важна длительность каждого значения.' },
};

/** Какие характеры сигнала допустимы для формата значения (signal-model.md). */
export const KINDS_FOR_VALUE_TYPE: Record<SignalValueType, SignalKind[]> = {
  DOUBLE: ['GAUGE', 'COUNTER'],
  LONG: ['GAUGE', 'COUNTER', 'STATE'],
  BOOLEAN: ['STATE'],
  STRING: ['STATE'],
};

export interface SemanticTerm extends Term {
  /** Типичная единица — для подсказки и подбора из справочника. */
  unit?: string;
  valueType?: SignalValueType;
  signalKind?: SignalKind;
}

export const SIGNAL_SEMANTICS = [
  'TEMPERATURE', 'PRESSURE', 'FLOW_RATE', 'LEVEL', 'HUMIDITY', 'ROTATIONAL_SPEED', 'LINEAR_SPEED', 'VIBRATION', 'VOLTAGE', 'CURRENT', 'POWER', 'ENERGY', 'TORQUE',
  'FORCE', 'POSITION', 'DISTANCE', 'PRODUCTION_COUNT', 'SCRAP_COUNT', 'CYCLE_COUNT', 'OPERATING_FLAG', 'READY_FLAG', 'ALARM_FLAG', 'MACHINE_MODE', 'QUALITY_CODE',
  'LOAD_PERCENT', 'CUSTOM',
] as const;
export type SignalSemantic = (typeof SIGNAL_SEMANTICS)[number];

export const SEMANTIC: Record<SignalSemantic, SemanticTerm> = {
  TEMPERATURE: { label: 'Температура', hint: 'Температура узла, материала или среды', unit: '°C', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  PRESSURE: { label: 'Давление', hint: 'Давление в гидро-, пневмосистеме, расплаве', unit: 'бар, МПа', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  FLOW_RATE: { label: 'Расход', hint: 'Расход жидкости, газа, материала', unit: 'м³/ч, л/мин, кг/ч', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  LEVEL: { label: 'Уровень', hint: 'Уровень в бункере или ёмкости', unit: '%, мм', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  HUMIDITY: { label: 'Влажность', hint: 'Относительная влажность', unit: '%', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  ROTATIONAL_SPEED: { label: 'Частота вращения', hint: 'Обороты вала, шпинделя, шнека', unit: 'об/мин', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  LINEAR_SPEED: { label: 'Линейная скорость', hint: 'Скорость ленты, линии, подачи', unit: 'м/мин', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  VIBRATION: { label: 'Вибрация', hint: 'Виброскорость или виброускорение', unit: 'мм/с', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  VOLTAGE: { label: 'Напряжение', hint: 'Электрическое напряжение', unit: 'В', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  CURRENT: { label: 'Ток', hint: 'Потребляемый ток (часто — признак нагрузки)', unit: 'А', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  POWER: { label: 'Мощность', hint: 'Текущая потребляемая мощность', unit: 'кВт', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  ENERGY: { label: 'Энергия', hint: 'Накопленное энергопотребление', unit: 'кВт·ч', valueType: 'DOUBLE', signalKind: 'COUNTER' },
  TORQUE: { label: 'Крутящий момент', hint: 'Момент на валу', unit: 'Н·м', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  FORCE: { label: 'Усилие', hint: 'Усилие пресса, натяжение', unit: 'кН', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  POSITION: { label: 'Положение', hint: 'Координата, угол, ход', unit: 'мм, °', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  DISTANCE: { label: 'Расстояние', hint: 'Пробег, длина выпущенного материала', unit: 'м', valueType: 'DOUBLE', signalKind: 'COUNTER' },
  PRODUCTION_COUNT: { label: 'Выпуск продукции', hint: 'Счётчик годных или всех изделий', unit: 'шт', valueType: 'LONG', signalKind: 'COUNTER' },
  SCRAP_COUNT: { label: 'Брак', hint: 'Счётчик забракованных изделий', unit: 'шт', valueType: 'LONG', signalKind: 'COUNTER' },
  CYCLE_COUNT: { label: 'Циклы', hint: 'Счётчик рабочих циклов (ходов, впрысков)', unit: 'шт', valueType: 'LONG', signalKind: 'COUNTER' },
  OPERATING_FLAG: { label: 'Признак «в работе»', hint: 'Да — машина работает', valueType: 'BOOLEAN', signalKind: 'STATE' },
  READY_FLAG: { label: 'Признак «готова»', hint: 'Да — машина готова к пуску', valueType: 'BOOLEAN', signalKind: 'STATE' },
  ALARM_FLAG: { label: 'Признак аварии', hint: 'Да — активна авария', valueType: 'BOOLEAN', signalKind: 'STATE' },
  MACHINE_MODE: { label: 'Режим работы', hint: 'Код режима: авто, ручной, наладка', valueType: 'LONG', signalKind: 'STATE' },
  QUALITY_CODE: { label: 'Код качества', hint: 'Код результата контроля изделия', valueType: 'LONG', signalKind: 'STATE' },
  LOAD_PERCENT: { label: 'Загрузка', hint: 'Загрузка машины в процентах', unit: '%', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  CUSTOM: { label: 'Другое', hint: 'Своя величина: укажите её название, код сформируется сам' },
};

// ---------- Узлы машины ----------

export interface ComponentKindTerm extends Term {
  group: string;
}

export const COMPONENT_KIND: Record<ComponentKind, ComponentKindTerm> = {
  LOGICAL_GROUP: { group: 'Структура', label: 'Логическая группа', hint: 'Условная группа узлов без физического смысла' },
  ASSEMBLY: { group: 'Структура', label: 'Сборочная единица' },
  MODULE: { group: 'Структура', label: 'Модуль' },
  MECHANISM: { group: 'Структура', label: 'Механизм' },
  MOTOR: { group: 'Привод и передача', label: 'Электродвигатель' },
  DRIVE: { group: 'Привод и передача', label: 'Привод', hint: 'Частотный преобразователь, сервопривод' },
  GEARBOX: { group: 'Привод и передача', label: 'Редуктор' },
  SPINDLE: { group: 'Привод и передача', label: 'Шпиндель' },
  BEARING: { group: 'Привод и передача', label: 'Подшипник' },
  COUPLING: { group: 'Привод и передача', label: 'Муфта' },
  ACTUATOR: { group: 'Привод и передача', label: 'Исполнительный механизм', hint: 'Цилиндр, соленоид, актуатор' },
  PUMP: { group: 'Перемещение среды', label: 'Насос' },
  COMPRESSOR: { group: 'Перемещение среды', label: 'Компрессор' },
  FAN: { group: 'Перемещение среды', label: 'Вентилятор' },
  BLOWER: { group: 'Перемещение среды', label: 'Воздуходувка' },
  VALVE: { group: 'Перемещение среды', label: 'Клапан / задвижка' },
  HEATER: { group: 'Технологические', label: 'Нагреватель' },
  COOLER: { group: 'Технологические', label: 'Охладитель' },
  MIXER: { group: 'Технологические', label: 'Смеситель' },
  DOSER: { group: 'Технологические', label: 'Дозатор' },
  CONVEYOR: { group: 'Технологические', label: 'Конвейер' },
  FEEDER: { group: 'Технологические', label: 'Питатель', hint: 'Подача материала или заготовок' },
  ROBOT: { group: 'Робототехника и оснастка', label: 'Робот' },
  MANIPULATOR: { group: 'Робототехника и оснастка', label: 'Манипулятор' },
  TOOL: { group: 'Робототехника и оснастка', label: 'Инструмент' },
  FIXTURE: { group: 'Робототехника и оснастка', label: 'Оснастка / приспособление' },
  SENSOR: { group: 'Автоматика и измерения', label: 'Датчик' },
  INSTRUMENT: { group: 'Автоматика и измерения', label: 'Измерительный прибор' },
  CONTROLLER: { group: 'Автоматика и измерения', label: 'Контроллер (ПЛК)' },
  SAFETY_DEVICE: { group: 'Автоматика и измерения', label: 'Устройство безопасности' },
  POWER_SUPPLY: { group: 'Автоматика и измерения', label: 'Электропитание' },
  LUBRICATION_SYSTEM: { group: 'Системы', label: 'Система смазки' },
  HYDRAULIC_SYSTEM: { group: 'Системы', label: 'Гидросистема' },
  PNEUMATIC_SYSTEM: { group: 'Системы', label: 'Пневмосистема' },
  COOLING_SYSTEM: { group: 'Системы', label: 'Система охлаждения' },
  OTHER: { group: 'Прочее', label: 'Другое' },
};

export const COMPONENT_KINDS = Object.keys(COMPONENT_KIND) as ComponentKind[];

// ---------- Условия правил ----------

export const OPERATOR: Dict<ComparisonOperator> = {
  EQ: { label: 'равно' },
  NE: { label: 'не равно' },
  GT: { label: 'больше' },
  GTE: { label: 'не меньше (≥)' },
  LT: { label: 'меньше' },
  LTE: { label: 'не больше (≤)' },
  BETWEEN: { label: 'в диапазоне', hint: 'От … до …, включительно' },
  IN: { label: 'одно из значений' },
};

export const CONDITION_TYPE: Dict<'ALL' | 'ANY' | 'NOT' | 'COMPARE'> = {
  ALL: { label: 'Выполняются все условия (И)' },
  ANY: { label: 'Выполняется любое из условий (ИЛИ)' },
  NOT: { label: 'Не выполняется' },
  COMPARE: { label: 'Сравнение сигнала со значением' },
};

// ---------- Данные и расчёт ----------

export const FRESHNESS: Dict<Freshness> = {
  NO_DATA: { label: 'Нет данных', hint: 'Значение ни разу не приходило' },
  FRESH: { label: 'Актуально' },
  STALE: { label: 'Устарело', hint: 'Новое значение не пришло за время «Считать устаревшим через»' },
};

export const TELEMETRY_QUALITY: Dict<TelemetryQuality> = {
  GOOD: { label: 'Хорошее' },
  UNCERTAIN: { label: 'Сомнительное', hint: 'Например, значение вне допустимого диапазона' },
  BAD: { label: 'Плохое' },
};

export const EVALUATION_QUALITY: Dict<EvaluationQuality> = {
  COMPLETE: { label: 'Полный расчёт' },
  DEGRADED: { label: 'Неполные данные', hint: 'Часть сигналов отсутствовала или устарела' },
};

export const STATE_SOURCE: Dict<StateSource> = {
  CALCULATED: { label: 'Автоматически', hint: 'По правилам состояния' },
  MANUAL: { label: 'Вручную', hint: 'Из зарегистрированного инцидента' },
};

export const SEVERITY: Dict<'ERROR' | 'WARNING'> = {
  ERROR: { label: 'Ошибка' },
  WARNING: { label: 'Предупреждение' },
};

// ---------- Часовые пояса ----------

export const TIMEZONE: Record<string, Term> = {
  'Europe/Kaliningrad': { label: 'Калининград (UTC+2)' },
  'Europe/Moscow': { label: 'Москва (UTC+3)' },
  'Europe/Samara': { label: 'Самара (UTC+4)' },
  'Asia/Yekaterinburg': { label: 'Екатеринбург (UTC+5)' },
  'Asia/Omsk': { label: 'Омск (UTC+6)' },
  'Asia/Novosibirsk': { label: 'Новосибирск (UTC+7)' },
  'Asia/Krasnoyarsk': { label: 'Красноярск (UTC+7)' },
  'Asia/Irkutsk': { label: 'Иркутск (UTC+8)' },
  'Asia/Yakutsk': { label: 'Якутск (UTC+9)' },
  'Asia/Vladivostok': { label: 'Владивосток (UTC+10)' },
  'Asia/Magadan': { label: 'Магадан (UTC+11)' },
  'Asia/Kamchatka': { label: 'Камчатка (UTC+12)' },
};

// ---------- Единицы измерения ----------

/** Русские названия и символы единиц справочника (backend отдаёт их по-английски). Неизвестный код — данные сервера. */
export const UNIT: Record<string, Term & { symbol: string }> = {
  PCS: { label: 'Штука', symbol: 'шт' },
  METER: { label: 'Метр', symbol: 'м' },
  KILOGRAM: { label: 'Килограмм', symbol: 'кг' },
  LITER: { label: 'Литр', symbol: 'л' },
  CELSIUS: { label: 'Градус Цельсия', symbol: '°C' },
  PERCENT: { label: 'Процент', symbol: '%' },
  RPM: { label: 'Обороты в минуту', symbol: 'об/мин' },
  BAR: { label: 'Бар', symbol: 'бар' },
};

/** Символ единицы для показа: «CELSIUS» → «°C»; неизвестный код остаётся как есть. */
export const unitLabel = (code: string | null | undefined) => (code ? (UNIT[code]?.symbol ?? code) : '');

/** Какая величина справочника единиц (`quantityCode`) подходит семантике сигнала. */
export const SEMANTIC_QUANTITY: Partial<Record<SignalSemantic, string>> = {
  TEMPERATURE: 'TEMPERATURE',
  PRESSURE: 'PRESSURE',
  ROTATIONAL_SPEED: 'ROTATIONAL_SPEED',
  LEVEL: 'RATIO',
  HUMIDITY: 'RATIO',
  LOAD_PERCENT: 'RATIO',
  PRODUCTION_COUNT: 'COUNT',
  SCRAP_COUNT: 'COUNT',
  CYCLE_COUNT: 'COUNT',
  DISTANCE: 'LENGTH',
};

// ---------- Поля форм (для ошибок сервера по fieldErrors[].path) ----------

const FIELD: Record<string, string> = {
  code: 'Код',
  name: 'Название',
  description: 'Описание',
  timezone: 'Часовой пояс',
  startLocalTime: 'Начало смены',
  endLocalTime: 'Конец смены',
  validFrom: 'Действует с',
  validTo: 'Действует до',
  sortOrder: 'Порядок',
  category: 'Категория',
  color: 'Цвет',
  lineId: 'Линия',
  machineType: 'Тип машины',
  inventoryNo: 'Инвентарный номер',
  manufacturer: 'Производитель',
  model: 'Модель',
  commissioningYear: 'Год ввода',
  nominalRate: 'Норма выпуска',
  productionUnit: 'Единица выпуска',
  parameters: 'Параметры',
  parentComponentId: 'Родительский узел',
  kind: 'Вид узла',
  componentId: 'Узел',
  valueType: 'Формат значения',
  signalKind: 'Характер сигнала',
  semanticCode: 'Что измеряет',
  customSemanticCode: 'Своя величина',
  unitCode: 'Единица измерения',
  expectedIntervalMs: 'Значение приходит раз в',
  staleAfterMs: 'Считать устаревшим через',
  validMin: 'Допустимый минимум',
  validMax: 'Допустимый максимум',
  featured: 'Показывать на карточке',
  displayOrder: 'Порядок отображения',
  defaultState: 'Состояние по умолчанию',
  offlineAfterMs: '«Нет данных» через',
  rules: 'Правила',
  priority: 'Важность',
  targetState: 'Состояние',
  enterCondition: 'Условие входа',
  exitCondition: 'Условие выхода',
  activationDelayMs: 'Задержка включения',
  releaseDelayMs: 'Задержка выхода',
  signalId: 'Сигнал',
  operator: 'Оператор',
  value: 'Значение',
  tolerance: 'Допуск',
  phases: 'Фаза',
  machineTargets: 'Машина сценария',
  baseBehaviors: 'Поведение сигнала',
  behaviorOverrides: 'Изменение поведения',
  behavior: 'Поведение',
  durationMs: 'Длительность',
  expectedState: 'Ожидаемое состояние',
  cycleMode: 'Повтор фаз',
  machineId: 'Машина',
  scenarioId: 'Сценарий',
  randomSeed: 'Начальное число',
  scheduledStartAt: 'Время старта',
  from: 'Начало',
  to: 'Конец',
  lossReasonId: 'Причина',
  stateOverride: 'Состояние',
  comment: 'Комментарий',
  author: 'Автор',
};

/** «parameters[0].unitCode» → «Параметры № 1 → Единица измерения». Неизвестные части остаются как есть. */
export function fieldLabel(path: string | null | undefined): string {
  if (!path) return 'Запрос';
  return path
    .split('.')
    .map((part) => {
      const m = /^([A-Za-z]+)(?:\[(\d+)\])?$/.exec(part);
      if (!m) return part;
      const name = FIELD[m[1]] ?? m[1];
      return m[2] != null ? `${name} № ${Number(m[2]) + 1}` : name;
    })
    .join(' → ');
}

// ---------- Глоссарий ----------

export interface GlossaryEntry {
  term: string;
  text: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  { term: 'Предприятие', text: 'Завод или площадка. Задаёт часовой пояс, смены и справочник причин потерь.' },
  { term: 'Смена', text: 'Рабочий интервал суток (например, 08:00–20:00). По сменам строятся отчёты и хронометраж. Смена может переходить через полночь.' },
  { term: 'Причина потерь', text: 'Почему машина стояла: поломка, нет материала, переналадка… Оператор выбирает её при разборе простоя.' },
  { term: 'Линия', text: 'Группа машин, работающих вместе. Используется для группировки на обзоре и в отчётах.' },
  { term: 'Машина', text: 'Единица оборудования, по которой считаются работа, простои и OEE.' },
  { term: 'Узел (компонент)', text: 'Необязательная часть машины: двигатель, насос, шнек. Нужен, чтобы сигналы группировались по узлам. Узлы могут быть вложенными.' },
  { term: 'Сигнал', text: 'Значение, которое машина передаёт: температура, скорость, «в работе да/нет», счётчик изделий.' },
  { term: 'Что измеряет', text: 'Физический смысл сигнала. По нему система понимает, что это за величина, и предлагает правила состояния.' },
  { term: 'Формат значения', text: 'Как записано значение: дробное число, целое число, да/нет или текст.' },
  { term: 'Характер сигнала', text: 'Как значение ведёт себя во времени: текущее измерение, накопительный счётчик или состояние/код.' },
  { term: 'Единица измерения', text: '°C, бар, шт, м/мин… Выбирается из справочника.' },
  { term: 'Главный сигнал', text: 'Показывается на карточке машины в мониторинге.' },
  { term: 'Значение приходит раз в', text: 'Как часто ожидаются новые данные. Нужно для контроля качества данных.' },
  { term: 'Считать устаревшим через', text: 'Если новое значение не пришло за это время, старое перестаёт учитываться в правилах.' },
  { term: 'Допустимый диапазон', text: 'Физически возможные минимум и максимум. Значения вне диапазона сохраняются, но помечаются как сомнительные.' },
  { term: 'Норма выпуска', text: 'Сколько продукции машина выпускает в час при нормальной работе. Нужна для расчёта производительности и OEE.' },
  { term: 'Состояние машины', text: 'Итог по правилам: Работа, Простой, Авария, Переналадка, Плановая остановка или Нет данных.' },
  { term: 'Правило состояния', text: '«Если условие по сигналам выполняется дольше N секунд — машина в состоянии X».' },
  { term: 'Важность (приоритет)', text: 'Если сработало несколько правил, побеждает более важное.' },
  { term: 'Задержка включения', text: 'Сколько условие должно держаться, чтобы состояние сменилось. Защищает от кратких всплесков.' },
  { term: 'Задержка выхода', text: 'Сколько должно пройти после пропадания условия, чтобы выйти из состояния.' },
  { term: 'Состояние по умолчанию', text: 'Если ни одно правило не сработало. Обычно «Простой».' },
  { term: '«Нет данных» через', text: 'Через сколько без новых данных машина считается «Нет данных» (нет связи).' },
  { term: 'Код', text: 'Технический идентификатор латиницей для интеграций, генератора и выгрузок. Создаётся автоматически из названия, после создания не меняется.' },
  { term: 'Название', text: 'Как объект видят люди. Можно менять в любой момент.' },
  { term: 'Активно / Отключено', text: 'Активные объекты участвуют в мониторинге и расчётах, отключённые сохраняются, но не используются. Удаления нет.' },
];

/** Короткие пояснения к полям форм (ⓘ и description). */
export const HINT = {
  code: 'Заполняется автоматически из названия. Меняйте, только если код нужен для интеграции. После создания изменить нельзя.',
  timezone: 'Нужен, чтобы смены и сутки считались по местному времени завода.',
  nominalRate: 'Сколько продукции машина выпускает в час при нормальной работе. Нужна для производительности и OEE. Можно не заполнять.',
  machineType: 'Свободный текст: экструдер, пресс, упаковочная машина…',
  component: 'Необязательная часть машины, где установлен датчик. Если не уверены — оставьте «Вся машина».',
  componentKind: 'Что это за узел. Влияет только на подписи и группировку.',
  semantic: 'Физический смысл сигнала: по нему система понимает величину и предлагает правила.',
  valueType: 'Как записано одно значение сигнала.',
  signalKind: 'Как значение ведёт себя во времени.',
  unit: 'Единица из справочника. Для да/нет и текстовых сигналов не нужна.',
  expectedInterval: 'Как часто ожидаются новые данные от источника.',
  staleAfter: 'Если новое значение не пришло за это время, старое перестаёт учитываться в правилах. Обязательно для сигналов в правилах.',
  validRange: 'Физически возможные значения. Выход за диапазон не удаляет данные, а помечает их как сомнительные.',
  featured: 'Показывать сигнал на карточке машины в мониторинге.',
  defaultState: 'Если ни одно правило не сработало. Обычно «Простой» — неплановая потеря времени.',
  offlineAfter: 'Через сколько без новых данных машина считается «Нет данных».',
} as const;
