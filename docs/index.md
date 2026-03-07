---
layout: home

hero:
  name: Chef
  text: Инструментарий для фронтенда на Bitrix
  tagline: Пишите современный TypeScript, собирайте, тестируйте и анализируйте расширения — одним инструментом.
  image:
    src: /logo.svg
    alt: Chef
  actions:
    - theme: brand
      text: Начало работы
      link: /guide/getting-started
    - theme: alt
      text: Документация
      link: /guide/features

features:
  - icon:
      src: /rollup.svg
    title: Быстрая сборка
    details: Rollup + Babel + PostCSS под капотом. Vue 3 SFC из коробки. Параллельная сборка до 4 расширений одновременно. Watch-режим с горячей перезагрузкой.
  - icon:
      src: /typescript.svg
    title: TypeScript из коробки
    details: Создайте расширение командой chef create — и сразу получите готовый tsconfig, алиасы путей для всех расширений проекта и типизированный конфиг сборки.
  - icon:
      src: /vue.svg
    title: Vue 3 из коробки
    details: Пишите Single File Components с TypeScript — Chef скомпилирует шаблоны, стили и скрипты. import 'vue' автоматически маппится на ui.vue3.
  - icon:
      src: /playwright.svg
    title: Тесты в браузере
    details: Unit-тесты на Mocha + Chai запускаются в реальном браузере через Playwright. E2E-тесты с автоматической авторизацией — без лишних настроек.
  - icon: 🔍
    title: Аналитика бандлов
    details: Размеры бандлов, дерево зависимостей и дубликаты — chef stat покажет всё по одному расширению или сразу по группе.
  - icon: 🚀
    title: Scaffold за секунду
    details: chef create ui.buttons создаст расширение с правильной структурой, конфигом, точкой входа и шаблонами тестов.
---

<div class="home-code">

## Попробуйте прямо сейчас

```bash
# Установка
npm install -g @bitrix/chef

# Инициализация проекта
chef init

# Создать новое расширение
chef create ui.my-feature

# Собрать
chef build ui.my-feature

# Тесты
chef test ui.my-feature
```

</div>

<style>
.home-code {
  max-width: 960px;
  margin: 0 auto;
  padding: 48px 24px 96px;
}

.home-code h2 {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 24px;
  text-align: center;
}
</style>
