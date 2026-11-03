# Документация API

- [Создание студии](#создание-студии)
- [Панели](#панели)
- [Инструменты](#инструменты)
- [Элементы управления](#элементы-управления)
- [Меню](#меню)
- [Раскладка и сохранение](#раскладка-и-сохранение)
- [Методы экземпляра](#методы-экземпляра)
- [Логотипы](#логотипы)

## Создание студии

```js
import { createStudio } from 'uix-preparatorio';
import 'uix-preparatorio/styles.css';

const studio = await createStudio({
  id: 'example',
  mount: '#app',
  title: 'Название проекта',
  anchor: 'workspace',
  panels: [{ id: 'workspace', title: 'Рабочая область' }],
});
```

`mount` — элемент DOM или CSS-селектор. Содержимое контейнера заменяется интерфейсом. `id` задаёт пространство имён сохранённых настроек и должен начинаться с буквы; допускаются буквы, цифры, `_` и `-`. `title` отображается в верхней строке. `anchor` — id опорной панели, которую нельзя скрыть или удалить. Если `anchor` не указан, используется первая панель. Предполагается одна студия на странице.

Параметр `brand: { logo: url }` добавляет изображение перед названием. Изображение декоративное: название остаётся доступным в виде текста. Без `brand.logo` отображается только название.

## Панели

Массив `panels` содержит описания панелей:

| Поле | Назначение |
| --- | --- |
| `id`, `title` | Уникальный идентификатор и подпись вкладки. |
| `iconPath` | SVG path для значка вкладки с `viewBox="0 0 16 16"`. |
| `mode`, `ref` | Первоначальное положение относительно уже объявленной панели. |
| `hint` | Текст во второй строке заголовка. |
| `hideable` | `false` запрещает скрытие панели через API и меню. |
| `collapsible`, `collapsed` | Возможность сворачивания и начальное состояние. |
| `tools` | `true` размещает внутри панели вертикальную полосу инструментов. |
| `controls` | Массив описаний элементов управления. |
| `render(container, context)` | Функция для собственного содержимого. |

Доступные варианты `mode`: `split-left`, `split-right`, `split-top`, `split-bottom`, `tab-before`, `tab-after`. Значение `ref` — id панели. Если ссылка не задана, используется опорная панель. Не более одной панели может содержать `tools: true`.

`render` вызывается при создании панели до завершения инициализации, поэтому `context.studio` в момент вызова ещё не доступен. В обработчиках событий, вызванных после инициализации, это свойство возвращает экземпляр студии.

## Инструменты

```js
{
  id: 'settings',
  label: 'Настройки',
  iconPath: 'M2 4h12 M2 8h12 M2 12h12',
  controls: [{ type: 'text', text: 'Содержимое раздела' }],
}
```

По умолчанию инструмент появляется в боковой полосе. `iconPath` задаёт SVG-значок; если он не указан, можно передать текстовый `glyph`. `rail: false` создаёт вложенный блок в первом разделе. Для инструментов нужны уникальные id, не совпадающие с id панелей. Поддерживаются `controls` и `render`, как для панелей.

Инструмент можно отделить через меню или перетащить в док. Перемещается существующий DOM-узел: поля и обработчики остаются живыми. Положение вынесенных инструментов восстанавливается, если они объявлены в конфигурации при следующем запуске.

## Элементы управления

| `type` | Основные поля | Событие |
| --- | --- | --- |
| `heading` | `label` | — |
| `text` | `text` | — |
| `input` | `label`, `value`, `inputType`, `placeholder` | `onChange(value, context)` |
| `select` | `label`, `value`, `options` | `onChange(value, context)` |
| `custom-select` | `label`, `value`, `options` или `groups`, `disabled`, `id` | `onChange(value, context)` |
| `checkbox` | `label`, `value` | `onChange(checked, context)` |
| `range` | `label`, `min`, `max`, `step`, `value` | `onChange(number, context)` при вводе |
| `button` | `label` | `onClick(event, context)` |
| `node` | `node` — существующий DOM-узел | — |

В `select.options` допустимы строки или объекты `{ label, value }`. Текстовые данные вставляются как текст, а не как HTML. Неизвестный тип элемента вызывает ошибку. Валидация и сохранение пользовательских значений относятся к приложению.

### Список с описаниями

`custom-select` создаёт стилизованное поле со своим всплывающим списком. У каждой опции может быть описание; выбранное описание также показывается под полем. Опции можно объединять в группы:

```js
{
  type: 'custom-select',
  id: 'category',
  label: 'Категория',
  value: 'standard',
  groups: [
    { label: 'Основные', options: [
      { value: 'standard', label: 'Стандартная', description: 'Для большинства задач' },
      { value: 'extended', label: 'Расширенная', description: 'Дополнительные настройки' },
    ] },
    { label: 'Другие', options: [
      { value: 'custom', label: 'Пользовательская', description: 'Свои параметры' },
    ] },
  ],
  onChange: value => console.log(value),
}
```

Вместо `groups` можно указать плоский массив `options` со строками или объектами `{ value, label, description?, disabled? }`. Значения приводятся к строкам и должны быть уникальными. При отсутствии или неверном начальном значении выбирается первая доступная опция. `disabled: true` отключает весь список; опции также можно отключать по отдельности. Для совместимости прежний `type: 'select'` остаётся нативным полем.

Список управляется мышью и клавиатурой: стрелки, Home/End, Enter, Escape и Tab. Попап отображается поверх панелей и подстраивается под границы окна.

Компонент можно использовать отдельно от конфигурации:

```js
import { createCustomSelect } from 'uix-preparatorio';
import 'uix-preparatorio/styles.css';

const select = createCustomSelect({
  label: 'Режим',
  options: [{ value: 'basic', label: 'Базовый', description: 'Основные функции' }],
  onChange: value => console.log(value),
});
document.querySelector('#settings').append(select.element);
select.setValue('basic'); // по умолчанию без вызова onChange
// select.setValue('basic', { notify: true }); — уведомить при изменении
// select.setOptions({ options: [...] }); — заменить варианты
// select.setDisabled(true); select.open(); select.close();
// select.destroy(); — удалить компонент и его обработчики
```

Контроллер также содержит `value`, `selectedOption`, `trigger`, `description` и `menu`. Для созданного через `renderControls` элемента можно получить контроллер через `getCustomSelect(element)`; при переданном `id` элемент отмечен атрибутом `data-control-id`. `destroy()` студии освобождает созданные ею компоненты автоматически.

## Меню

```js
menus: [{
  label: 'Файл',
  items: [
    { label: 'Сохранить', onClick: studio => saveDocument(studio) },
    { separator: true },
    { label: 'Закрыть', onClick: () => closeDocument() },
  ],
}]
```

Меню «Инструменты» создаётся автоматически. Его подпись можно изменить через `toolsMenuLabel`. В нём находятся команды отделения инструментов и видимости областей, объявленных при создании студии.

## Раскладка и сохранение

При первом запуске панели располагаются согласно `mode` и `ref`. Можно передать `layout` для точного начального расположения:

```js
layout: {
  type: 'split-area', orientation: 'horizontal', sizes: [0.7, 0.3],
  children: [
    { type: 'tab-area', widgets: ['workspace'], currentIndex: 0 },
    { type: 'tab-area', widgets: ['properties'], currentIndex: 0 },
  ],
}
```

В `tab-area.widgets` перечисляются id панелей. В `split-area.children` находятся вложенные области, `sizes` задаёт их относительные размеры. Сохранённая раскладка имеет приоритет; отсутствующие в конфигурации области пропускаются, новые добавляются в док. Ключи `localStorage` изолированы по `id`: сохраняются раскладка, видимость, порядок инструментов, состояние сворачивания и высоты панелей. Содержимое полей не сохраняется автоматически.

## Методы экземпляра

- `studio.dock`, `studio.panels`, `studio.root` — док, виджеты и корневой элемент.
- `saveLayout()`, `restoreLayout()`, `resetLayout()` — сохранение, восстановление и сброс расположения.
- `setAreaVisible(id, visible)`, `isAreaVisible(id)` — видимость панели.
- `createToolWidget(id)`, `returnTool(id)`, `isToolDocked(id)`, `activateTool(id)` — работа с отделяемыми инструментами. `createToolWidget` создаёт виджет, но не помещает его в док автоматически.
- `addPanel(descriptor)`, `removePanel(id)` — добавить или удалить простую панель во время работы. Чтобы восстановить её после перезагрузки, объявите её в `panels`. Сворачиваемые панели и контейнер инструментов должны быть объявлены при инициализации. Динамически добавленные панели не появляются в меню видимости автоматически.
- `destroy()` — снять основные глобальные обработчики и удалить интерфейс.

Для интеграции с существующей разметкой также доступны `AreaWidget`, `createDetachedWidget`, `serializeConfig`, `resolveConfig`, `initToolMenu`, `installVirtualDockSizing`, `installCompactDockSizing`, `renderControls`, `createCustomSelect`, `getCustomSelect` и `disposeCustomSelects`.

## Логотипы

В пакете доступны два SVG: `uix-preparatorio/logo.svg` — знак на подложке и `uix-preparatorio/mark.svg` — знак на прозрачном фоне. Например:

```js
import mark from 'uix-preparatorio/mark.svg';

await createStudio({
  id: 'my-editor', mount: '#app', title: 'Мой редактор',
  brand: { logo: mark },
  panels: [{ id: 'workspace', title: 'Рабочая область' }],
});
```

Адрес изображения может указывать и на собственный логотип приложения.
