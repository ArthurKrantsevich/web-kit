<div align="center">

# web-kit

**Небольшие полезные веб-утилиты в виде пакетов на React + TypeScript. Всё работает в браузере.**

[![Deploy](https://github.com/ArthurKrantsevich/web-kit/actions/workflows/deploy.yml/badge.svg)](https://github.com/ArthurKrantsevich/web-kit/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-workspace-f69220?logo=pnpm&logoColor=white)

[**Демо**](https://arthurkrantsevich.github.io/web-kit/) · [Версия на Flutter](https://github.com/ArthurKrantsevich/flutter-kit) · [English](README.md)

</div>

---

## Что это

`web-kit` — набор небольших инструментов для веба: форматтеры, конвертеры, генераторы, видеоплеер и другие. Каждый инструмент — отдельный npm-пакет. Можно подключить только логику или логику вместе с готовым React-интерфейсом.

Те же инструменты есть на Flutter: [flutter-kit](https://github.com/ArthurKrantsevich/flutter-kit). Функции и внешний вид совпадают, но общего кода у наборов нет.

**Без бэкенда.** Вся обработка идёт на устройстве пользователя. Файлы и текст не покидают браузер.

## Статус

> Ранняя стадия. Монорепо, витрина и деплой готовы. Первые утилиты в работе.

## Утилиты

| Утилита | Категория | Статус |
|---|---|---|
| JSON-форматтер | data | готово |
| JSON-конвертер (YAML, CSV, XML, TypeScript) | data | готово |
| Base64 encode/decode | data | в планах |
| URL encode/decode | data | в планах |
| JWT-декодер | data | в планах |
| Генератор UUID (v4, v7) | generators | в планах |
| Генератор паролей | generators | в планах |
| Генератор хешей (SHA, MD5) | generators | в планах |
| Генератор QR-кодов | generators | в планах |
| Генератор цветовых палитр | generators | в планах |
| Конвертер изображений | media | в планах |
| Видеоплеер | media | в планах |

## Как будет выглядеть пакет

У каждой утилиты один пакет с двумя точками входа:

```ts
// Только логика. React не нужен: работает в Node, воркерах, любом фреймворке.
import { formatJson, suggestFixes } from '@web-kit/json-formatter/core'

// Логика + React UI.
import { JsonFormatter, useJsonFormatter } from '@web-kit/json-formatter'
import '@web-kit/json-formatter/styles.css'
```

Пакеты только ESM, с типами. Стили на CSS variables, их можно переопределить. `@web-kit` — рабочее имя, npm-scope выберем перед первым релизом.

## Структура репозитория

```
apps/
  dashboard/        витрина на Next.js, статический экспорт на GitHub Pages
packages/           по пакету на утилиту (скоро)
.github/workflows/  сборка, проверки, деплой
```

## Разработка

Нужны Node 22+ и pnpm (включается через `corepack`).

```bash
corepack enable
pnpm install
pnpm --filter @web-kit/dashboard dev   # dev-сервер на http://localhost:3000/web-kit
pnpm verify                             # типы, unit-тесты, проверки пакетов, e2e
```

### Добавить утилиту

```bash
pnpm turbo gen utility
```

Генератор создаёт `packages/<id>` (core + React UI + тесты) и регистрирует страницу демо в витрине.

Каждый push в `main` собирает витрину и деплоит её на GitHub Pages.

## Лицензия

[MIT](LICENSE) © Arthur Krantsevich
