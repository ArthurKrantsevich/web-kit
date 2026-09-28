<div align="center">

# web-kit

**Небольшие аккуратные веб-утилиты в виде пакетов на React + TypeScript. Всё работает в браузере.**

[![Deploy](https://github.com/ArthurKrantsevich/web-kit/actions/workflows/deploy.yml/badge.svg)](https://github.com/ArthurKrantsevich/web-kit/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-workspace-f69220?logo=pnpm&logoColor=white)

[**Демо**](https://arthurkrantsevich.github.io/web-kit/) · [Версия на Flutter](https://github.com/ArthurKrantsevich/flutter-kit) · [English](README.md)

</div>

---

## Что это

`web-kit` — набор небольших инструментов для повседневной работы с данными. Каждый инструмент — отдельный пакет (в npm пока не опубликован, см. «Статус»): можно подключить только логику, которой не нужны React и DOM, или логику вместе с готовым React-интерфейсом. На [демо](https://arthurkrantsevich.github.io/web-kit/) работает каждый инструмент.

Те же инструменты запланированы на Flutter в [flutter-kit](https://github.com/ArthurKrantsevich/flutter-kit). У наборов общий дизайн, но не код.

**Без бэкенда.** Вся обработка идёт на вашем устройстве. Файлы и текст никуда не загружаются.

## Статус

Готовы восемь инструментов: четыре для JSON, Text Compare и генераторы UUID, паролей и хэшей. У них общий интерфейс из `@web-kit/ui`. Ещё семь в планах. Пакеты пока не опубликованы в npm: `@web-kit` — рабочее имя, scope выберем перед первым релизом.

## Утилиты

### Готово

| Утилита | Пакет | Что умеет |
|---|---|---|
| [JSON Formatter](https://arthurkrantsevich.github.io/web-kit/tools/json-formatter/) | `@web-kit/json-formatter` | Форматирование с отступом 2, 4 пробела или табуляцией, минификация, сортировка ключей, escape и unescape. Ошибки с точной строкой, колонкой и фрагментом кода; исправления предлагаются только после проверки (лишние и пропущенные запятые, комментарии, одинарные и типографские кавычки, ключи без кавычек, литералы Python, незакрытые скобки), и «Fix all». Подсвеченный текст или дерево с поиском и JSONPath (подмножество RFC 9535), путями и копированием; статистика. Ввод больше 1 МБ форматируется в Web Worker. |
| [JSON Convert](https://arthurkrantsevich.github.io/web-kit/tools/json-convert/) | `@web-kit/json-convert` | JSON в YAML 1.2, CSV, XML или интерфейсы TypeScript и CSV в JSON. Числа сохраняют запись; CSV читается обратно, чтобы показать, сколько строк и колонок сохранилось; вывод подсвечен по формату. |
| [JSON Diff](https://arthurkrantsevich.github.io/web-kit/tools/json-diff/) | `@web-kit/json-diff` | Каждое изменение с путём, старым и новым значением как они записаны; массивы по индексу или по ключу; числа по значению или по записи; клик по изменению выделяет его во вводе; JSON Patch (RFC 6902) для копирования и скачивания. |
| [JSON Schema Validator](https://arthurkrantsevich.github.io/web-kit/tools/json-schema-validator/) | `@web-kit/json-schema-validator` | Draft 2020-12: каждая ошибка с путём в данных и в схеме, точные числа, непроверяемые ключевые слова — предупреждения (никакого молчаливого «valid»), схема, сгенерированная по данным. Проверен официальным JSON Schema Test Suite. |
| [Text Compare](https://arthurkrantsevich.github.io/web-kit/tools/text-compare/) | `@web-kit/text-compare` | Два текста или файла рядом или одной колонкой, по строкам, словам или символам; по запросу без учёта пробелов, регистра, пустых строк и концов строк; перенос изменения на другую сторону; unified diff для `git apply`. Описан ниже. |
| [UUID Generator](https://arthurkrantsevich.github.io/web-kit/tools/uuid-generator/) | `@web-kit/uuid-generator` | UUID v1, v3, v4, v5, v6 и v7, Nil и Max, ULID и NanoID, до 1 000 за раз, строками или JSON; Inspect читает версию, variant и время любого UUID или ULID. Описан ниже. |
| [Password Generator](https://arthurkrantsevich.github.io/web-kit/tools/password-generator/) | `@web-kit/password-generator` | Пароли из символов, фразы из словаря EFF, произносимые пароли и PIN с точной энтропией, силой и временем перебора; никогда не сохраняются и не попадают в ссылки. Описан ниже. |
| [Hash Generator](https://arthurkrantsevich.github.io/web-kit/tools/hash-generator/) | `@web-kit/hash-generator` | MD5, SHA-1, SHA-2, SHA-3, BLAKE2, BLAKE3, RIPEMD-160, CRC32 и CRC32C текста или файла до 512 МБ, HMAC и Verify для контрольной суммы. Описан ниже. |

Общие пакеты: `@web-kit/json-core` (JSON-парсер и AST без потерь, исправления, пути, точное сравнение чисел, воркер для больших данных) и `@web-kit/ui` (раскладка редактора, кнопки, меню, диалоги и удобства ниже).

### В планах

| Утилита | Категория | Что будет уметь |
|---|---|---|
| Base64 | data | Кодирование и декодирование текста и файлов с корректным UTF-8. |
| URL Encoder | data | Кодирование и декодирование URL и их частей; разбор query-строки. |
| JWT Decoder | data | Заголовок, payload и срок действия токена. Подпись не проверяется, и инструмент говорит об этом. |
| QR Code Generator | generators | Текст или ссылка в QR-код, сохранение в PNG или SVG. |
| Palette Generator | generators | Палитра от одного цвета с проверкой контраста WCAG. |
| Image Converter | media | PNG, JPG и WebP, изменение размера и качества. |
| Video Player | media | Скорость, субтитры VTT, горячие клавиши, картинка в картинке. |

#### Text Compare

[`text-compare`](https://arthurkrantsevich.github.io/web-kit/tools/text-compare/) в категории data сравнивает два текста или два файла:

- рядом, в двух колонках с общей прокруткой, или одной колонкой, где удалённые строки стоят над добавленными;
- изменённые строки идут парами, изменённые слова или символы подсвечены (эмодзи и буква с ударением не разрезаются);
- опции: без учёта пробелов (как `git diff -w`), регистра, пустых строк и концов строк; результат говорит, когда тексты равны только благодаря им;
- неизменённые участки свёрнуты до трёх строк контекста, переход к предыдущему и следующему изменению (Alt+↑/↓, F7), за раз рисуется не больше 5 000 строк;
- «Use left» и «Use right» переносят изменение на другую сторону, Ctrl+Z в этом поле его отменяет. Исключение — сторона, открытая из файла с концами строк CRLF или CR: поле ввода хранит только LF, поэтому такая сторона заменяется целиком, чтобы сохранить концы строк, и Ctrl+Z этот перенос не отменяет;
- счётчики (+ добавлено, − удалено, ~ изменено строк) и unified diff для копирования или скачивания как `compare.patch`, с именами файлов. Он всегда применяется к Left через `git apply` или `patch`. Без игнорируемого он даёт ровно Right; с включёнными опциями — Right с точностью до игнорируемых различий (неизменённые строки сохраняют пробелы, регистр или концы строк Left). На записанных примерах он совпадает с `git diff --no-index -U3`, кроме `-w`: там git берёт строки контекста из правого файла;
- заметки о разных концах строк и об отсутствии перевода строки в конце; файлы открываются или перетаскиваются на сторону, до 10 МБ; тексты больше 1 МБ вместе сравниваются в Web Worker.

#### UUID Generator

[`uuid-generator`](https://arthurkrantsevich.github.io/web-kit/tools/uuid-generator/) в категории generators делает идентификаторы и разбирает их:

- UUID v4 (случайный), v7 (миллисекунды Unix, 12-битный счётчик и случайные биты: строго растёт на одной странице, даже внутри одной миллисекунды), v1 и v6 (григорианское время и случайный узел с установленным multicast-битом, никогда не ваш MAC-адрес), v3 и v5 (MD5 или SHA-1 от пространства имён DNS, URL, OID, X.500 или своего и имени: по UUID на строку имён), Nil и Max; ULID (монотонный внутри миллисекунды) и NanoID (свои длина и алфавит, без перекоса);
- от 1 до 1 000 за раз, строчными или прописными, с дефисами или без, в фигурных скобках или как URN, по одному в строке или массивом JSON; Copy и Download как `uuids.txt` или `uuids.json`; Ctrl+Enter делает новые;
- Inspect принимает любую запись UUID или ULID и показывает версию, variant, время (для v1 и v6 — до 100 нс), clock sequence и узел или время ULID и те же 128 бит как UUID; объясняет, почему ID не читается (длина, недопустимый символ, неизвестная версия);
- случайность только из `crypto.getRandomValues`; эталоны RFC 9562 проходят. Ссылка и сохранённый ввод хранят настройки, никогда не сами ID.

#### Password Generator

[`password-generator`](https://arthurkrantsevich.github.io/web-kit/tools/password-generator/) в категории generators делает от 1 до 50 за раз:

- **Characters**: от 4 до 128 строчных, прописных, цифр и 32 знаков ASCII, без похожих символов (`Il1O0o`) и без исключённых вами; Require each перегенерирует пароль, пока в нём не будет каждого выбранного набора, поэтому все допустимые пароли равновероятны;
- **Words**: от 3 до 12 слов из большого словаря EFF (7 776 слов; загружается, только когда выбран режим Words), с разделителем, заглавными и цифрой;
- **Memorable**: группы произносимых слогов, например `Bolanu-Tekiro-Vasemi`;
- **PIN**: от 4 до 12 цифр, без повторов одной цифры, последовательностей вроде 1234, повторов пары и годов;
- точная энтропия выбранного способа (подсчитанная, а не оценённая), сила и среднее время перебора при 10¹⁰ попыток в секунду; Copy для каждого и для всех, Download как `passwords.txt`, Clear их забывает.

Пароли берутся только из `crypto.getRandomValues` без перекоса по модулю. Они никогда не попадают в ссылку, сохранённый ввод и консоль: там только настройки.

#### Hash Generator

[`hash-generator`](https://arthurkrantsevich.github.io/web-kit/tools/hash-generator/) в категории generators хэширует текст или файл:

- сразу MD5, SHA-1, SHA-256, SHA-384, SHA-512 и CRC32; More algorithms добавляет SHA-224, SHA-512/256, SHA3-224/256/384/512, BLAKE2b-512, BLAKE2s-256, BLAKE3-256, RIPEMD-160 и CRC32C (загружаются только тогда);
- hex, HEX, Base64 или Base64url; Copy для каждого значения или Copy и Download всех как `hashes.txt`, по строке в стиле `sha256sum` на алгоритм;
- HMAC с SHA-1 или SHA-2 и ключом текстом или hex; ключ никогда не сохраняется и не попадает в ссылку;
- Verify: вставьте контрольную сумму (hex, Base64, с префиксом `sha256:` или SRI `sha256-`, или целую строку `sha256sum`) — совпавшая строка подсвечивается; если не совпало ничего, но в More algorithms есть алгоритм такой длины, он предлагает их посчитать;
- файлы до 512 МБ (и тексты больше 1 МБ) читаются частями по 4 МБ сразу несколькими Web Worker с прогрессом; новый файл или Clear отменяют работу. Каждый алгоритм проходит свои официальные тестовые векторы.

## Удобства во всех инструментах

- **Файлы.** Open file или перетаскивание файла на поле ввода (UTF-8, BOM убирается, до 10 МБ) и Download результата с подходящим именем (`formatted.json`, `converted.yaml`, `patch.json`, `schema.json`, `compare.patch`, `uuids.txt`, `passwords.txt`, `hashes.txt`). Hash Generator открывает любой файл до 512 МБ.
- **Загрузка по URL.** Браузер запрашивает адрес сам: только `http:` и `https:`, без cookies, до 10 МБ. Сервер должен разрешать чтение с других сайтов (CORS); прокси нет.
- **Ссылка для обмена.** Ввод и опции сжимаются в часть ссылки после `#`, которую браузер никогда не отправляет на сервер. Данные видит любой, у кого есть ссылка; инструмент предупреждает, если ссылка длиннее, чем обычно пропускают мессенджеры.
- **Сохранение ввода.** По умолчанию выключено. Если включить, ввод хранится в этом браузере для этого инструмента, пока вы не выключите или не очистите его.
- **Горячие клавиши.** Ctrl+Enter (⌘+Enter на Mac) форматирует в форматтере, меняет направление в конвертере (JSON → CSV и CSV → JSON), меняет местами Left и Right в JSON Diff и Text Compare и строит схему по данным в валидаторе; у форматтера ещё Ctrl+Shift+M (минификация) и Ctrl+Shift+F (исправить всё), у Text Compare — F7/Shift+F7 и, вне полей ввода, Alt+↓/Alt+↑ (следующее и предыдущее изменение); Ctrl+Z в поле не отменяет обмен сторон в Text Compare; в генераторах UUID и паролей Ctrl+Enter делает новые. `?` показывает список. Сочетания браузера не перехватываются.
- **Большие данные.** Форматтер обрабатывает ввод больше 1 МБ, а Text Compare — тексты больше 1 МБ вместе, в Web Worker: страница не зависает, а инструмент пишет, что работает. Hash Generator читает файлы частями сразу в нескольких воркерах и показывает прогресс.
- **Один интерфейс.** Одинаковые действия выглядят одинаково во всех инструментах: Open file и Paste в шапке каждого окна ввода, Download и Copy в шапке вывода, Sample, Clear и «More actions» на панели. У каждой кнопки есть подсказка о том, что она сделает, и ничего не сдвигается, когда меняется подпись или страница догружается.
- **Светлая и тёмная темы**, по системной настройке, пока вы не выберете сами.

## Приватность

Нет бэкенда, аккаунтов и аналитики. Сайт — статические файлы на GitHub Pages. Текст и файлы обрабатываются в вашем браузере. Сгенерированные пароли, ID и ключи HMAC никогда не сохраняются, не попадают в ссылки и в журнал консоли. Сетевые запросы с вашими данными — только те, о которых вы просите: загрузка по URL идёт из вашего браузера по этому адресу, без cookies. Ссылка для обмена хранит данные в самой ссылке.

## Как пользоваться пакетами

У каждого инструмента один пакет с двумя точками входа:

```ts
// Только логика. React не нужен: работает в Node, воркерах, любом фреймворке.
import { formatJson, suggestFixes } from "@web-kit/json-formatter/core";

// Логика + React UI.
import { JsonFormatter, useJsonFormatter } from "@web-kit/json-formatter";
import "@web-kit/json-formatter/styles.css";
```

- Только ESM, с типами; React — необязательная peer-зависимость, поэтому `/core` работает без него.
- Функции возвращают `{ ok: true, value }` или `{ ok: false, error }` и не бросают исключения на плохой ввод.
- Один CSS-файл на инструмент, на CSS-переменных (`--wk-*` из `@web-kit/tokens`), которые можно переопределить. Общие стили лежат в каскадном слое `wk-ui`, поэтому ваши правила побеждают.
- React UI работает в Next.js App Router: точка входа UI сохраняет директиву `"use client"`.

API каждого пакета описан в его README: [json-core](packages/json-core), [json-formatter](packages/json-formatter), [json-convert](packages/json-convert), [json-diff](packages/json-diff), [json-schema-validator](packages/json-schema-validator), [text-compare](packages/text-compare), [uuid-generator](packages/uuid-generator), [password-generator](packages/password-generator), [hash-generator](packages/hash-generator), [ui](packages/ui).

## Структура репозитория

```
apps/
  dashboard/          витрина на Next.js, статический экспорт на GitHub Pages
packages/
  json-core/          JSON-парсер без потерь, AST, исправления, воркер
  ui/                 общие React-компоненты всех инструментов
  tokens/             дизайн-токены (CSS-переменные) и проверка контраста
  json-formatter/     по пакету на инструмент: src/core (без React) и src/ui
  json-convert/
  json-diff/
  json-schema-validator/
  text-compare/       у core ещё есть вход воркера для больших текстов
  uuid-generator/
  password-generator/ ещё вход wordlist (большой словарь EFF)
  hash-generator/     ещё входы extra (дополнительные алгоритмы) и worker
tooling/scripts/      сборка и проверки пакетов
turbo/generators/     шаблон `pnpm turbo gen utility`
.github/workflows/    сборка, проверки, деплой
```

## Разработка

Нужны Node 22+ и pnpm (включается через `corepack`).

```bash
corepack enable
pnpm install
pnpm --filter @web-kit/dashboard dev   # dev-сервер на http://localhost:3000/web-kit
pnpm verify                            # типы, unit-тесты, проверки пакетов, e2e
pnpm test:generator                    # создаёт временный инструмент и прогоняет на нём все проверки
```

`pnpm verify` запускает для каждого пакета TypeScript, Vitest с Testing Library, publint, @arethetypeswrong, size-limit и проверку, что `/core` не импортирует React и ни один исходник не использует `Math.random`; для витрины — unit-тесты Vitest (каталог и реестр), проверку статического экспорта и тесты Playwright; и проверку контраста токенов по WCAG в обеих темах. e2e-тесты раздают экспорт на порту 4173; другой порт задаётся через `PORT`.

### Добавить утилиту

```bash
pnpm turbo gen utility
```

Генератор создаёт `packages/<id>` (core, React UI, тесты) и регистрирует страницу в витрине.

Каждый push в `main` запускает `pnpm verify`, собирает витрину и деплоит её на GitHub Pages.

## Лицензия

[MIT](LICENSE) © Arthur Krantsevich. Большой словарь EFF в `@web-kit/password-generator` — работа Electronic Frontier Foundation, лицензия CC BY 3.0 US (https://www.eff.org/dice).
