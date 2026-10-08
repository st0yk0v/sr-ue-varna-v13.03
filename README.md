<div align="center">

<p>
  <img src="public_html/assets/science-logo.png" alt="Научноизследователска дейност" height="100" align="middle"/>
  &nbsp;&nbsp;&nbsp;
  <img src="public_html/assets/uev-social-logo.png" alt="Икономически университет – Варна" height="100" align="middle"/>
</p>

# UEV-ERP v13.03

### Система за управление на научноизследователска дейност
**Икономически университет – Варна · University of Economics – Varna**

[![Version](https://img.shields.io/badge/release-v13.01-159379?style=flat-square)](#)
[![PHP](https://img.shields.io/badge/PHP-8.5-777BB4?style=flat-square&logo=php&logoColor=white)](#)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat-square&logo=mysql&logoColor=white)](#)
[![React](https://img.shields.io/badge/React-18.2.0%20UMD-61DAFB?style=flat-square&logo=react&logoColor=white)](#)
[![GAS](https://img.shields.io/badge/GAS%20backend-web--app-4285F4?style=flat-square&logo=google&logoColor=white)](#)
[![WCAG](https://img.shields.io/badge/WCAG-2.1%20AA-5b48d8?style=flat-square)](#)
[![License](https://img.shields.io/badge/license-EUPL--1.2-003399?style=flat-square)](LICENSE.txt)

</div>

---

## Преглед

**UEV-ERP** е браузър-базирана ERP система за управление на пълния жизнен цикъл на
научноизследователските проекти в Икономически университет – Варна: от обявяване на
конкурс и приемане на проектни предложения, през рецензиране и класиране от Централната
конкурсна комисия (ЦКК), до подписване на договори, изпълнение, отчитане и архивиране.

Този репозиторий е **production docroot-ът** (`public_html/`), който се качва директно
в Hostinger. Кодът е в реална експлоатация на **https://sr-ue-varna.com** — всички
връзки (MySQL, Google Apps Script reverse-sync, Google Sign-In) са активни и се поддържат.

**Архитектура:** три-tier хибридна:

```
Браузър (React 18 UMD)
   │  three-tier SWR кеш: localStorage → PHP/MySQL → GAS/Sheets
   ▼
PHP API (Hostinger, PHP 8.5)  ◄──► MySQL 8.0  (fast read replica, real-time версии)
   │  dual-write / reverse-sync
   ▼
Google Apps Script web-app  ◄──► Google Sheets + Drive  (authoritative store)
```

**Език на интерфейса:** български (институционално изискване) с моментално BG ⇄ EN
превключване.

---

## Структура на репозитория (действителна, v3.39)

```
uev v 3.39x1/
├── package.json              # Node dev-tooling (dev server, lint, pack-deploy)
├── .gitignore                # изключва .env, node_modules, deploy артефакти
├── scripts/                  # dev/CI помощни скриптове (Node + PHP)
│   ├── lint-php.mjs          # php -l през целия репо
│   ├── health-check.mjs      # статична проверка за файлове/тайни/версии
│   ├── test-db.php           # MySQL connectivity smoke test
│   └── pack-deploy.mjs       # чист deploy докрут в deploy-dist/
└── public_html/              # ← Hostinger docroot (това се качва)
    ├── index.html            # React 18 UMD bootstrap, boot orchestration, GDPR consent
    ├── styles.css            # ~5200 реда — brand палитра, анимации, WCAG media queries
    ├── sw.js                 # Service Worker (offline cache, proxy bypass)
    ├── .htaccess             # gzip, cache-control, security headers
    ├── robots.txt
    ├── LICENSE.txt           # EUPL-1.2
    ├── assets/               # лога и изображения (science, UEV)
    ├── database/             # PHP/MySQL backend
    │   ├── api.php           # ~6600 реда — 90+ API handlers, batchapi, GZIP, timing
    │   ├── config.php        # PDO singleton, query cache, camelizeKeys, .env loader
    │   ├── sql_service.php    # SQL бизнес-логика (getInitialData, docSQL операции)
    │   ├── action_map.php     # action → handler рутиране
    │   ├── _v18_bridge.php    # v18 съвместимост / bridge слой
    │   ├── _v18_handlers.php  # v18 handlers
    │   ├── sync_worker.php    # GAS → MySQL sync worker с retry
    │   ├── schema_migration_v18_complete.sql   # схема + triggers за data versioning
    │   ├── .env.example       # ШАБЛОН без тайни (копирайте в .env)
    │   └── .env              # ⚠ реални креденшъли — .gitignored, само на сървъра
    └── js/                    # Frontend source
        ├── app.js            # App shell, session restore, view router
        ├── main.js           # analytics, session verify, cookie banner
        ├── config.js         # ERP_CONFIG, PROJECT_TYPES, PRIORITY_AREAS
        ├── config-secrets.js # .gitignored override за GAS URL
        ├── gas-proxy.js      # GAS URL decode (spliced shards / encoded blob)
        ├── hostinger-config.js / hostinger-config-laravel.js
        ├── laravel-bridge.js # опционален Laravel bridge
        ├── utils.js          # API helper (multi-backend, SWR, priority queue), toast
        ├── data-layer.js     # three-tier cache, version polling с jitter, batch warm
        ├── router.js         # multi-proxy pool с health tracking, failover
        ├── i18n.js           # BG ⇄ EN превод (MutationObserver)
        ├── workflow.js       # state machines + RBAC
        ├── core-bundle.js / views-bundle.js  # споделени константи, view fallbacks
        ├── components.js     # споделен UI: модали, портали, wizard, редактори
        ├── calcbudget.js     # бюджетни изчисления/валидация
        ├── compliance.js     # GDPR / съответствие
        ├── services/         # изнесен data слой
        │   ├── api.js        # unified HTTP клиент (dedup, circuit breaker, SQL routes)
        │   ├── cache.js      # кеш примитиви
        │   ├── storage.js    # localStorage обвивка
        │   ├── sync.js       # sync логика
        │   └── documents.js  # документни операции
        ├── processors/       # events.js, search.js, validator.js
        ├── types/            # documents.ts (типови дефиниции)
        ├── views/            # 12 view модула (dashboard, competitions, documents,
        │                     #   forms-admin, reviews, reports, settings, …)
        └── features/
            └── proposal-wizard/          # модулен 3-стъпков wizard
                ├── WizardShell.js
                ├── api/proposalsApi.js
                ├── shared/ (types.js, UI компоненти)
                └── steps/
                    ├── Step1BasicInfo/   # Обща информация + schema
                    ├── Step2Documents/   # Документи + schema
                    └── Step3Budget/      # Бюджет + schema
```

---

## Ключови възможности

| Домейн | Описание |
|--------|----------|
| **Конкурси** | Пълен CRUD, календарен изглед, срокове, направления, оценъчни критерии |
| **Проектни предложения** | Модулен 3-стъпков wizard (Обща информация → Документи → Бюджет), 30+ статуса, оптимистичен UI, авто-проверка за допустимост |
| **Моите документи** | Персонално пространство по проектни предложения, шаблони, качени файлове, оптимистично прикачване |
| **Генериране на документи** | Автоматично копиране на шаблони по тип проект (ФНИ/ПНИ/ДНП/НПФ), мигновено показване в Step 2 |
| **Рецензиране** | Назначаване на рецензенти, рубрика 100 т., конфиденциални оценки |
| **Подписване** | Canvas подпис + Email OTP 2FA |
| **Бюджет** | Вграден редактор с валидация по тип проект, лимити, BGN⇄EUR |
| **Отчетност** | Проектни отчети + МОН отчети + KPI dashboard |
| **Реално-времеви обновления** | MySQL `data_version` triggers → polling с jitter → мигновена инвалидация на кеша |
| **Multi-backend resilience** | PHP/MySQL → GAS/Sheets автоматичен failover; dual-write sync с queue fallback |
| **WCAG 2.1 AA** | aria модали, focus-trap, prefers-reduced-motion, high-contrast |
| **i18n** | BG ⇄ EN превключване с MutationObserver |

---

## Видове проекти

| Код | Тип | Макс. бюджет | Срок |
|-----|-----|-----:|-----:|
| **ФНИ** | Фундаментални научни изследвания | 12 000 € | 12-36 мес. |
| **ПНИ** | Приложни научни изследвания | 12 000 € | 12-36 мес. |
| **ДНП** | Докторантски научни проекти | 5 000 € | 12 мес. |
| **НПФ** | Научни публични форуми | 5 115 € / 10 000 лв. | 1-3 мес. |

---

## Роли и права на достъп

| Роля | Достъп |
|------|--------|
| **Кандидат** | Подава предложения, „Моите документи" с editor достъп до неговите папки |
| **Рецензент** | Вижда само възложените форми, попълва рубрика (100 т.) |
| **Администратор** | Пълен достъп: конкурси, форми, рецензенти, отчетност, библиотека |
| **ЦКК** | Класиране, назначаване на рецензенти, финализиране (блокирани от подаване) |

---

## Instant-loading SQL data layer

Слоят за данни е проектиран за **мигновено зареждане** с вдъхновение от GAS backend-а
(`code.gs` / `gs.js`). Три нива на кеширане и агрегиране:

- **Tier 1 — localStorage (0 ms):** синхронно четене → мигновен първи рендер, последван
  от фонов refresh (SWR).
- **Tier 2 — PHP/MySQL (~200 ms):** бърза локална реплика; агрегирани endpoint-и
  свеждат N заявки до 1 round-trip:
  - `getinitialdata` — forms + competitions + versions в един отговор (RBAC на сървъра)
  - `getcompetitionpanel` — competitions + applications + reviewers в 3 SQL заявки
    (огледало на GAS `getCompetitionPanel`)
  - `batchapi` — до 10 read-only action-а в един POST (огледало на GAS `batchApi`)
- **Tier 3 — GAS/Sheets (authoritative):** automatic failover; GAS отговорите се
  записват обратно в PHP кеша (fire-and-forget warming).

**Real-time версии:** MySQL `data_version` таблица + triggers; `getdataversion` използва
`MAX()` aggregate + 5 s edge cache; клиентът poll-ва с ±30 % jitter и adaptive интервал
(15 s видим / 45 s скрит / 60 s max backoff), като изчиства само засегнатите per-table кешове.

**Cache warming:** `ERP_DATA.warm([...])` предварително зарежда критичните endpoint-и
(`getmyforms`, `getforms`, `listdocuments`, `getcompetitions`) на `requestIdleCallback`
чрез `batchapi` — един HTTP round-trip вместо N.

---

## Разработка

**Изисквания:** Node ≥ 18, PHP ≥ 8.0 (тестван с 8.5), MySQL 8.0. **Не е нужен билд** —
статични файлове + React 18 UMD от CDN.

```bash
# 1. Инсталирай dev-tooling
npm install

# 2. Локален dev сървър (public_html на http://localhost:8000)
npm run dev

# 3. Провери синтаксиса на целия PHP backend
npm run lint:php

# 4. Статична readiness проверка (файлове, тайни, версии)
npm run health

# 5. MySQL connectivity smoke test (изисква валиден .env)
npm run test:db

# 6. Пакетирай чист deploy докрут → deploy-dist/
npm run build
```

> `npm run dev` изисква Google Sign-In origin — работи зад static server на localhost.

---

## Деплой към Hostinger

```bash
npm run build      # създава deploy-dist/ без .env, примерни и dev артефакти
```

Качете **съдържанието на `deploy-dist/`** в hPanel → File Manager → `public_html`.
След това създайте `database/.env` на сървъра (копирайте от `.env.example` и попълнете
реалните креденшъли). `.env` **никога** не се commit-ва и не се качва през git.

**Деплой към Google Apps Script:** отворете GAS проекта, свържете съответния spreadsheet,
Deploy → New deployment → Web app → Execute as: Me, Access: Anyone with Google account,
копирайте `/exec` URL-а в `GAS_REAL_URL` (сървър) и в кодираната конфигурация (клиент).

---

## Конфигурация

`window.ERP_CONFIG` се инжектира в `index.html` преди зареждане на `js/`:

```js
window.ERP_CONFIG = {
  GAS_URL:          'https://script.google.com/macros/s/.../exec',
  GOOGLE_CLIENT_ID: '...apps.googleusercontent.com',
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,   // 10 MB
  PROJECT_TYPES:    [...],                  // ФНИ, ПНИ, ДНП, НПФ
  PRIORITY_AREAS:   [...],                  // направления — Конкурсна сесия 2026
  CKK_MEMBERS:      '...',                  // имейли (блокирани от подаване)
  PARENT_ORIGIN:    'https://www.sr-ue-varna.com',
  LOGO_URL:         'assets/science-logo.png',
  UEV_LOGO_URL:     'assets/uev-logo.jpg'
};
```

**Защита на GAS URL:** реалният `/exec` URL не стига до браузъра в plain text — съхранява
се кодиран (spliced shards / encoded blob) и се декодира при boot от `gas-proxy.js`.
`config-secrets.js` е `.gitignored` и служи само за overrides.

**Backend `.env`:** MySQL креденшъли, `GAS_REAL_URL`, upload лимити. Файлът е
`.gitignore`-нат; в git присъства само `.env.example` с placeholder-и.

---

## Сигурност

- **Domain allowlist** — само `@ue-varna.bg` имейли
- **Google Sign-In** + **Email OTP 2FA** за подписване
- **Canvas подпис** с прикачен документ
- **SHA-256 hash-chain** одит на мутациите
- **Drive sharing** — `DOMAIN_WITH_LINK`, view-only под оценяване
- **GDPR** — чл. 15-17, PII маскиране, self-service изтриване
- **Тайни само в `.env`** — никакви production креденшъли в git

---

## Технологичен стек

| Компонент | Версия |
|-----------|--------|
| Frontend | React 18.2.0 (UMD) |
| Backend (PHP) | PHP 8.5 |
| Backend (GAS) | Google Apps Script web-app |
| Database | MySQL 8.0 |
| Dev tooling | Node ≥ 18 (http-server, eslint, rimraf) |
| WCAG | 2.1, ниво AA |

---

## Лиценз

Разпространява се под **EUPL-1.2**. Виж [`LICENSE.txt`](LICENSE.txt).

Copyright © 2025-2026 **Yoni Stoykov** 
Икономически университет – Варна.
