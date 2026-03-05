---
layout: home

hero:
  name: Chef
  text: CLI-инструмент для расширений Bitrix
  tagline: Сборка, тестирование и поддержка фронтенд-расширений Bitrix
  image:
    src: /logo.svg
    alt: Chef
  actions:
    - theme: brand
      text: Начать
      link: /ru/guide/getting-started
    - theme: alt
      text: Команды
      link: /ru/commands/build

features:
  - title: TypeScript First
    details: Нативная поддержка TypeScript с автоматической транспиляцией и алиасами путей для всех расширений.
  - title: Сборка
    details: Бандлер на основе Rollup с Babel, PostCSS и автоматическим обновлением зависимостей в config.php.
  - title: Тесты
    details: Unit-тесты (Mocha + Chai) в реальном браузере через Playwright и E2E-тесты.
  - title: Линтинг
    details: Интеграция с ESLint для единообразного качества кода во всех расширениях.
  - title: Шаблоны
    details: Генерация новых расширений одной командой через chef create.
  - title: Аналитика
    details: Статистика размеров бандлов и визуализация дерева зависимостей через chef stat.
---
