(() => {
  "use strict";

  const DATA = window.CATALOG_DATA_V2;
  const app = document.getElementById("app");
  const searchInput = document.getElementById("global-search");
  const searchBox = searchInput.closest(".global-search");
  const suggestions = document.getElementById("search-suggestions");
  const searchClear = document.getElementById("search-clear");
  const toast = document.getElementById("toast");
  const categoryById = new Map(DATA.categories.map((category) => [category.id, category]));
  const categoryByUrl = new Map(DATA.categories.map((category) => [category.url, category]));
  const projectById = new Map(DATA.projects.map((project) => [project.id, project]));
  let toastTimer = null;
  let pendingHomeTarget = "";

  const defaultConfig = () => ({
    step: 1,
    projectIds: [],
    materials: [],
    scale: "home",
    power: "any",
    choices: {},
    selectedProducts: {},
  });

  function loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem("tool-solution-configurator-v3") || "null");
      if (!saved || !Array.isArray(saved.projectIds)) return defaultConfig();
      return { ...defaultConfig(), ...saved, choices: saved.choices || {}, selectedProducts: saved.selectedProducts || {} };
    } catch {
      return defaultConfig();
    }
  }

  let config = loadConfig();
  let activeCategoryDrawer = null;

  function saveConfig() {
    try { localStorage.setItem("tool-solution-configurator-v3", JSON.stringify(config)); } catch { /* storage can be disabled */ }
  }

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const normalize = (value) => String(value || "").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").trim();
  const unique = (items) => [...new Set(items)];
  const hashFor = (...parts) => `#/${parts.map((part) => encodeURIComponent(String(part))).join("/")}`;

  function routeParts() {
    return window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map((part) => {
      try { return decodeURIComponent(part); } catch { return part; }
    });
  }

  function plural(number, one, few, many) {
    const n = Math.abs(number) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function breadcrumbs(items) {
    return `<nav class="breadcrumbs" aria-label="Хлебные крошки">${items.map((item, index) => {
      const value = item.href ? `<a href="${item.href}">${escapeHtml(item.name)}</a>` : `<span aria-current="page">${escapeHtml(item.name)}</span>`;
      return `${index ? '<span class="crumb-separator">›</span>' : ""}${value}`;
    }).join("")}</nav>`;
  }

  function iconSvg(key) {
    const paths = {
      type1: '<rect x="17" y="11" width="30" height="42" rx="6"/><path d="M26 7h12v4M23 33h18M32 20v9M27.5 24.5h9"/>',
      type2: '<path d="M20 9v15M44 9v15M16 24h32v7a16 16 0 0 1-16 16v8M25 17h14"/>',
      type3: '<path d="M11 46h42M16 46V24h32v22M22 24l4-12h12l4 12M23 34h18M32 24v22"/>',
      type4: '<path d="M13 48 48 13l5 5-35 35zM31 30l5 5M38 23l5 5M20 41l5 5"/><circle cx="18" cy="18" r="7"/>',
      stage1: '<path d="M10 44h44M14 44l6-26h24l6 26M22 28h20M19 36h26M32 10v8"/>',
      stage2: '<path d="m13 47 26-26M31 13l20 20M36 18l8-8 10 10-8 8M10 50l7 4 6-6-7-7z"/>',
      stage3: '<path d="M9 18h46v30H9zM9 30h46M9 42h46M24 18v12M42 18v12M17 30v12M35 30v12M49 30v12"/>',
      stage4: '<path d="M32 7 19 30h11l-3 27 18-31H34zM10 14h8M46 14h8M9 51h10M45 51h10"/>',
      stage5: '<path d="M10 45h29M17 45V25h22v20M22 25l4-11h10l3 11M44 35h10M49 30v10"/>',
      stage6: '<path d="M13 42h38l4 9H9zM17 42l5-26h20l5 26M22 27h20M19 35h26"/>',
      stage7: '<path d="M15 11h27v13H15zM42 17h7v19H31v17M31 53h-8v-9h8"/>',
      stage8: '<path d="M11 42h23l5 10H8zM17 42l3-24h14l3 24M23 18V9h8v9m19 16 5 5 10-13"/>',
      stage9: '<circle cx="32" cy="32" r="10"/><path d="M32 8v8M32 48v8M8 32h8M48 32h8M15 15l6 6M43 43l6 6M49 15l-6 6M21 43l-6 6"/>',
      kit: '<path d="M15 19h34l-3 35H18zM24 19v-5a8 8 0 0 1 16 0v5M25 31h14M32 24v14"/>',
    };
    return `<svg viewBox="0 0 64 64" aria-hidden="true">${paths[key] || paths.kit}</svg>`;
  }

  function countLeaves(nodes) {
    return nodes.reduce((sum, node) => sum + (node.children?.length ? countLeaves(node.children) : 1), 0);
  }

  function isDnsUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && (parsed.hostname === "dns-shop.ru" || parsed.hostname === "www.dns-shop.ru");
    } catch {
      return false;
    }
  }

  function categoryActions(category, compact = false) {
    if (!isDnsUrl(category?.url)) return '<span class="dns-link-unavailable">Ссылка DNS недоступна</span>';
    return `<div class="category-actions${compact ? " compact" : ""}">
      <a class="dns-category-link" href="${escapeHtml(category.url)}" target="_blank" rel="noopener">${compact ? "В DNS" : "Открыть товары в DNS"}<span aria-hidden="true">↗</span></a>
      <a class="category-context-link" href="${hashFor("category", category.id)}">Где используется</a>
    </div>`;
  }

  function categoryTile(category, detail = "") {
    return `<article class="category-tile">
      <div><span class="category-group-label">${escapeHtml(category.group)}</span><h3>${escapeHtml(category.name)}</h3>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>
      ${categoryActions(category, true)}
    </article>`;
  }

  function typeCard(block) {
    return `<a class="type-card" href="${hashFor("type", block.id)}">
      <h3>${escapeHtml(block.name)}</h3>
      <p>${block.groups.length} ${plural(block.groups.length, "раздел", "раздела", "разделов")} · ${countLeaves(block.groups)} конечных страниц</p>
      <span class="card-action">Открыть структуру</span>
      <span class="type-visual">${iconSvg(`type${block.id}`)}</span>
    </a>`;
  }

  function stageCard(stage) {
    const operations = stage.works.reduce((sum, work) => sum + work.operations.length, 0);
    return `<a class="stage-card" href="${hashFor("stage", stage.id)}">
      <div><div class="stage-number">Этап ${stage.id}</div><h3>${escapeHtml(stage.name)}</h3><p>${escapeHtml(stage.description)}</p>
      <div class="stage-meta"><span>${stage.works.length} ${plural(stage.works.length, "вид", "вида", "видов")} работ</span><span>${operations} операций</span><span>${stage.categoryCount} категорий</span></div></div>
      <span class="stage-visual">${iconSvg(`stage${stage.id}`)}</span>
    </a>`;
  }

  function assortmentGroups() {
    const groups = new Map();
    for (const category of DATA.categories) {
      if (!groups.has(category.group)) groups.set(category.group, []);
      groups.get(category.group).push(category);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }

  function renderHome() {
    document.title = `${DATA.meta.title} — каталог по типам, этапам и задачам`;
    app.innerHTML = `<div class="page-shell">
      ${breadcrumbs([{ name: "Каталог", href: hashFor() }, { name: DATA.meta.title }])}
      <header class="home-hero"><div><h1 class="page-heading">${escapeHtml(DATA.meta.title)}</h1><p class="page-lead">Два способа навигации: по знакомому типу инструмента или по задаче, которую нужно решить.</p></div><div class="hero-stats"><strong>${DATA.meta.categoryCount}</strong><span>конечных категорий<br>с прямыми ссылками DNS</span></div></header>

      <div class="catalog-switch" aria-label="Способ навигации"><button class="active" type="button" data-action="show-types">По типу инструмента</button><button type="button" data-action="show-stages">По этапам работ</button></div>

      <section class="kit-promo">
        <div class="kit-promo-copy"><span class="kit-promo-label">Подбор от потребности</span><h2>Не знаете, какой инструмент нужен?</h2><p>Выберите понятную задачу — например, «повесить телевизор» или «уложить плитку». Подбор покажет основные решения, альтернативные способы и всю ширину подходящих категорий.</p><ul class="kit-promo-points"><li>Не нужно знать названия инструмента</li><li>Можно сравнить способы выполнения</li></ul></div>
        <div class="kit-promo-action"><span class="kit-promo-icon">${iconSvg("kit")}</span><a class="catalog-button catalog-button-large" href="${hashFor("configurator")}">Подобрать решение →</a></div>
      </section>

      <section class="section" id="types-section"><div class="section-head"><div><h2>По типу инструмента</h2><p>Текущая структура DNS для пользователей, которые уже знают нужный товар.</p></div><span class="section-count">4 основных раздела</span></div><div class="type-grid">${DATA.typeBlocks.map(typeCard).join("")}</div></section>

      <section class="section" id="stages-section"><div class="section-head"><div><h2>По этапам работ</h2><p>Последовательная структура ремонта — от подготовки до уборки и мастерской.</p></div><span class="section-count">${DATA.stages.length} этапов</span></div><div class="stage-grid">${DATA.stages.map(stageCard).join("")}</div></section>

      <section class="section"><div class="section-head"><div><h2>Ширина ассортимента</h2><p>Все категории разделены по роли в работе; объединённые названия раскрыты до конечных страниц.</p></div><span class="section-count">${DATA.meta.categoryCount} категорий</span></div>
        <div class="assortment-grid">${assortmentGroups().map(([group, categories]) => `<a class="assortment-card" href="${hashFor("assortment", group)}"><span>${categories.length}</span><h3>${escapeHtml(group)}</h3><p>${categories.slice(0, 3).map((item) => escapeHtml(item.name)).join(" · ")}</p><strong>Смотреть все →</strong></a>`).join("")}</div>
      </section>

      <section class="section"><div class="section-head"><div><h2>Популярные категории</h2><p>Прямой переход в финальные разделы DNS.</p></div></div><div class="category-tile-grid">${DATA.popular.map((id) => categoryTile(categoryById.get(id))).join("")}</div></section>
    </div>`;
  }

  function renderType(typeId) {
    const block = DATA.typeBlocks.find((item) => String(item.id) === String(typeId));
    if (!block) return renderNotFound();
    document.title = `${block.name} — ${DATA.meta.title}`;
    app.innerHTML = `<div class="page-shell">
      ${breadcrumbs([{ name: "Каталог", href: hashFor() }, { name: DATA.meta.title, href: hashFor() }, { name: block.name }])}
      <header class="route-head route-head-row"><div><h1 class="page-heading">${escapeHtml(block.name)}</h1><p class="page-lead">Структура сохранена по типу инструмента. Конечные пункты открывают соответствующие страницы DNS.</p></div><span class="route-icon">${iconSvg(`type${block.id}`)}</span></header>
      <div class="route-toolbar"><a class="back-link" href="${hashFor()}">← На главную</a></div>
      <div class="group-grid">${block.groups.map((group) => `<a class="group-card" href="${hashFor("type", block.id, "group", group.name)}"><span class="group-count">${countLeaves([group])}</span><h2>${escapeHtml(group.name)}</h2><div class="group-card-list">${(group.children || []).slice(0, 6).map((child) => `<span>${escapeHtml(child.name)}</span>`).join("")}</div><div class="group-more">Открыть раздел →</div></a>`).join("")}</div>
    </div>`;
  }

  function treeNode(node, depth = 0) {
    const children = node.children || [];
    if (!children.length) {
      const canonical = categoryByUrl.get(node.url);
      const link = isDnsUrl(node.url)
        ? `<a href="${escapeHtml(node.url)}" target="_blank" rel="noopener"><span>${escapeHtml(canonical?.name || node.name)}</span><small>DNS ↗</small></a>`
        : `<span class="tree-disabled-link">${escapeHtml(canonical?.name || node.name)}</span>`;
      return `<div class="tree-leaf-row">${link}${canonical ? `<a class="tree-info" href="${hashFor("category", canonical.id)}">Где используется</a>` : ""}</div>`;
    }
    return `<details class="tree-branch"${depth < 1 ? " open" : ""}><summary><span>${escapeHtml(node.name)}</span><small>${countLeaves(children)} категорий</small><i></i></summary><div class="tree-branch-children">${children.map((child) => treeNode(child, depth + 1)).join("")}</div></details>`;
  }

  function renderGroup(typeId, groupName) {
    const block = DATA.typeBlocks.find((item) => String(item.id) === String(typeId));
    const group = block?.groups.find((item) => item.name === groupName);
    if (!block || !group) return renderNotFound();
    document.title = `${group.name} — ${DATA.meta.title}`;
    app.innerHTML = `<div class="page-shell">
      ${breadcrumbs([{ name: "Каталог", href: hashFor() }, { name: block.name, href: hashFor("type", block.id) }, { name: group.name }])}
      <header class="route-head"><h1 class="page-heading">${escapeHtml(group.name)}</h1><p class="page-lead">${countLeaves([group])} конечных страниц в текущей структуре DNS.</p></header>
      <div class="route-toolbar"><a class="back-link" href="${hashFor("type", block.id)}">← Назад к разделу</a></div>
      <div class="tree-list">${treeNode(group)}</div>
    </div>`;
  }

  function renderStage(stageId, selectedWork = "") {
    const stage = DATA.stages.find((item) => String(item.id) === String(stageId));
    if (!stage) return renderNotFound();
    document.title = `${stage.name} — ${DATA.meta.title}`;
    const works = stage.works.map((work, index) => `<section class="work-panel${!selectedWork || selectedWork === work.name || index === 0 ? " open" : ""}" data-work-panel>
      <button class="work-summary" type="button" data-action="toggle-work" aria-expanded="${!selectedWork || selectedWork === work.name || index === 0}"><span class="work-summary-copy"><span class="work-index">${index + 1}</span><span><h2>${escapeHtml(work.name)}</h2><small>${work.operations.length} ${plural(work.operations.length, "операция", "операции", "операций")}</small></span></span><span class="chevron"></span></button>
      <div class="work-content"><div class="operation-grid">${work.operations.map((operation) => `<article class="operation-card" data-filter-text="${escapeHtml(normalize(`${work.name} ${operation.name} ${operation.categoryIds.map((id) => categoryById.get(id)?.name).join(" ")}`))}"><h3>${escapeHtml(operation.name)}</h3><div class="stage-category-list">${operation.categoryIds.map((id) => {
        const category = categoryById.get(id);
        return `<div class="stage-category">${isDnsUrl(category.url) ? `<a href="${escapeHtml(category.url)}" target="_blank" rel="noopener">${escapeHtml(category.name)} <span>↗</span></a>` : `<span>${escapeHtml(category.name)}</span>`}<a href="${hashFor("category", category.id)}" aria-label="Где используется ${escapeHtml(category.name)}">i</a></div>`;
      }).join("")}</div></article>`).join("")}</div></div>
    </section>`).join("");
    app.innerHTML = `<div class="page-shell">
      ${breadcrumbs([{ name: "Каталог", href: hashFor() }, { name: DATA.meta.title, href: hashFor() }, { name: `Этап ${stage.id}` }])}
      <header class="route-head route-head-row"><div><span class="route-kicker">Этап ${stage.id} из ${DATA.stages.length}</span><h1 class="page-heading">${escapeHtml(stage.name)}</h1><p class="page-lead">${escapeHtml(stage.description)}</p></div><span class="route-icon">${iconSvg(`stage${stage.id}`)}</span></header>
      <div class="route-toolbar"><a class="back-link" href="${hashFor()}">← Все этапы</a><div class="route-actions"><label class="local-filter"><span class="visually-hidden">Фильтр операций</span><input type="search" data-local-filter placeholder="Найти операцию или категорию"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 4 4"></path></svg></label><a class="catalog-button" href="${hashFor("configurator")}">Подобрать решение</a></div></div>
      <div class="work-stack">${works}</div><div class="empty-state stage-filter-empty" hidden><strong>Ничего не найдено</strong>Измените запрос.</div>
    </div>`;
  }

  function renderAssortment(groupName) {
    const categories = DATA.categories.filter((category) => category.group === groupName);
    if (!categories.length) return renderNotFound();
    document.title = `${groupName} — ширина ассортимента`;
    app.innerHTML = `<div class="page-shell">
      ${breadcrumbs([{ name: "Каталог", href: hashFor() }, { name: "Ширина ассортимента", href: hashFor() }, { name: groupName }])}
      <header class="route-head"><h1 class="page-heading">${escapeHtml(groupName)}</h1><p class="page-lead">${categories.length} ${plural(categories.length, "конечная категория", "конечные категории", "конечных категорий")} DNS.</p></header>
      <div class="route-toolbar"><a class="back-link" href="${hashFor()}">← На главную</a></div>
      <div class="category-tile-grid">${categories.map((category) => categoryTile(category)).join("")}</div>
    </div>`;
  }

  function renderCategory(categoryId) {
    const category = categoryById.get(categoryId);
    if (!category) return renderNotFound();
    const related = DATA.categories.filter((item) => item.group === category.group && item.id !== category.id).slice(0, 8);
    document.title = `${category.name} — ${DATA.meta.title}`;
    app.innerHTML = `<div class="page-shell">
      ${breadcrumbs([{ name: "Каталог", href: hashFor() }, { name: DATA.meta.title, href: hashFor() }, { name: category.name }])}
      <section class="category-hero"><span class="category-label">${escapeHtml(category.group)}</span><h1>${escapeHtml(category.name)}</h1><p>Конечная товарная категория из выгрузки DNS. Ниже показаны задачи и этапы, в которых она применяется.</p>${category.name !== category.dnsName ? `<div class="dns-original-name">Название в DNS: ${escapeHtml(category.dnsName)}</div>` : ""}<div class="category-primary-action">${isDnsUrl(category.url) ? `<a class="catalog-button catalog-button-large" href="${escapeHtml(category.url)}" target="_blank" rel="noopener">Открыть товары в DNS ↗</a>` : '<span class="dns-link-unavailable">Ссылка DNS недоступна</span>'}</div></section>
      <div class="route-toolbar"><a class="back-link" href="${hashFor()}">← Вернуться в каталог</a><button class="secondary-button" type="button" data-action="copy-url" data-url="${escapeHtml(category.url)}">Скопировать ссылку DNS</button></div>
      <section class="section"><div class="section-head"><div><h2>Где используется</h2><p>Пути внутри каталога по этапам работ.</p></div><span class="section-count">${category.placements.length} сценариев</span></div>${category.placements.length ? `<div class="paths-grid">${category.placements.map((placement) => `<article class="path-card"><span>Этап ${placement.stageId}</span><h3>${escapeHtml(placement.work)}</h3><p>${escapeHtml(placement.operation)}</p><a class="card-action" href="${hashFor("stage", placement.stageId, "work", placement.work)}">Перейти к этапу</a></article>`).join("")}</div>` : '<div class="empty-state"><strong>Дополнительная категория</strong>Добавлена для раскрытия ширины решения в подборе.</div>'}</section>
      <section class="section"><div class="section-head"><div><h2>Другие категории группы</h2></div></div><div class="category-tile-grid">${related.map((item) => categoryTile(item)).join("")}</div></section>
    </div>`;
  }

  function findItems(query) {
    const term = normalize(query);
    if (!term) return [];
    const categories = DATA.categories.filter((category) => normalize(`${category.name} ${category.dnsName}`).includes(term)).map((item) => ({ type: "category", item }));
    const projects = DATA.projects.filter((project) => normalize(`${project.title} ${project.description}`).includes(term)).map((item) => ({ type: "project", item }));
    return [...projects, ...categories].slice(0, 40);
  }

  function renderSearch(query) {
    const results = findItems(query);
    document.title = `Поиск: ${query} — ${DATA.meta.title}`;
    searchInput.value = query;
    searchBox.classList.toggle("has-value", Boolean(query));
    app.innerHTML = `<div class="page-shell">${breadcrumbs([{ name: "Каталог", href: hashFor() }, { name: "Результаты поиска" }])}<header class="route-head"><h1 class="page-heading">Результаты поиска</h1><p class="page-lead">По запросу «${escapeHtml(query)}»: ${results.length}</p></header><div class="route-toolbar"><a class="back-link" href="${hashFor()}">← В каталог</a></div>${results.length ? `<div class="search-results">${results.map(({ type, item }) => type === "project" ? `<a class="search-result" href="${hashFor("configurator", item.id)}"><span><strong>${escapeHtml(item.title)}</strong><small>Готовая задача · ${escapeHtml(item.description)}</small></span><span>Подобрать →</span></a>` : `<article class="search-result"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.group)}</small></span>${categoryActions(item, true)}</article>`).join("")}</div>` : '<div class="empty-state"><strong>Ничего не найдено</strong>Попробуйте сформулировать задачу проще.</div>'}</div>`;
  }

  function selectedProjects() { return config.projectIds.map((id) => projectById.get(id)).filter(Boolean); }
  function slotKey(projectId, slotIndex) { return `${projectId}|${slotIndex}`; }

  function preferenceScore(category) {
    const name = normalize(category.name);
    const materials = new Set(config.materials);
    let score = 0;
    if (materials.has("concrete") && /перфорат|бур|алмаз|корон|штроб/.test(name)) score += 8;
    if (materials.has("wood") && /шуруп|лобзик|дисков|торцов|рубан|фрез|дерев|стамес/.test(name)) score += 7;
    if (materials.has("metal") && /ушм|отрез|лепест|сабель|сверл|штанген|металл/.test(name)) score += 7;
    if (materials.has("tile") && /алмаз|корон|сверл|ушм/.test(name)) score += 8;
    if (materials.has("drywall") && /шуруп|аккумуляторн.*отвертк|специализированн.*нож|уровн/.test(name)) score += 7;
    if (materials.has("plaster") && /миксер|шпател|кельм|нивелир|стен и потол/.test(name)) score += 7;
    if (config.scale === "pro" && /станк|лазер|компрессор|пневмо|стружкоотсос/.test(name)) score += 3;
    if (config.scale === "small" && /ручн|отвертк|ножов|рулет|уровн/.test(name)) score += 2;
    if (config.power === "battery" && /аккумулятор/.test(name)) score += 4;
    return score;
  }

  function orderedSlotIds(slot) {
    return slot.categoryIds.slice().sort((a, b) => preferenceScore(categoryById.get(b)) - preferenceScore(categoryById.get(a)));
  }

  function ensureChoices() {
    for (const project of selectedProjects()) {
      project.slots.forEach((slot, index) => {
        const key = slotKey(project.id, index);
        const available = orderedSlotIds(slot);
        config.choices[key] = (config.choices[key] || []).filter((id) => available.includes(id));
      });
    }
    const selected = new Set(Object.values(config.choices).flat());
    for (const id of Object.keys(config.selectedProducts)) {
      if (!selected.has(id)) delete config.selectedProducts[id];
    }
    saveConfig();
  }

  function configMetrics() {
    ensureChoices();
    const projects = selectedProjects();
    const allSlots = projects.flatMap((project) => project.slots.map((slot, index) => ({ project, slot, index })));
    const breadth = unique(allSlots.flatMap((item) => item.slot.categoryIds));
    const selected = unique(allSlots.flatMap((item) => config.choices[slotKey(item.project.id, item.index)] || []));
    return { projects, allSlots, breadth, selected };
  }

  function configStepper() {
    const labels = ["Задача", "Материалы", "Условия", "Решение"];
    return `<ol class="config-stepper">${labels.map((label, index) => {
      const number = index + 1;
      const state = number < config.step ? "done" : number === config.step ? "active" : "";
      return `<li class="${state}"><span>${number < config.step ? "✓" : number}</span><strong>${label}</strong></li>`;
    }).join("")}</ol>`;
  }

  function configSummary() {
    const metrics = configMetrics();
    return `<aside class="config-summary"><span class="config-summary-label">Ваше решение</span><h3>${metrics.projects.length ? `${metrics.projects.length} ${plural(metrics.projects.length, "задача", "задачи", "задач")}` : "Задача не выбрана"}</h3><ul><li><span>Ширина выбора</span><strong>${metrics.breadth.length}</strong></li><li><span>Добавлено</span><strong>${metrics.selected.length}</strong></li></ul>${metrics.projects.length ? `<div class="config-summary-stages">${metrics.projects.map((project) => `<span>${escapeHtml(project.title)}</span>`).join("")}</div>` : ""}<button class="text-button" type="button" data-action="config-reset">Начать заново</button></aside>`;
  }

  function configProjectStep() {
    const groups = unique(DATA.projects.map((project) => project.group));
    return `<div class="config-step-content"><span class="config-kicker">Шаг 1</span><h2>Что вы хотите сделать?</h2><p>Выбирайте обычную задачу, а не инструмент. Можно отметить несколько работ для одного проекта.</p><div class="project-groups">${groups.map((group) => `<section><h3>${escapeHtml(group)}</h3><div class="project-grid">${DATA.projects.filter((project) => project.group === group).map((project) => {
      const selected = config.projectIds.includes(project.id);
      return `<button class="project-card${selected ? " selected" : ""}" type="button" data-action="config-project" data-project-id="${project.id}" aria-pressed="${selected}"><span class="project-check">${selected ? "✓" : "+"}</span><strong>${escapeHtml(project.title)}</strong><small>${escapeHtml(project.description)}</small><em>${unique(project.slots.flatMap((slot) => slot.categoryIds)).length} вариантов категорий</em></button>`;
    }).join("")}</div></section>`).join("")}</div></div>`;
  }

  function configMaterialStep() {
    const relevant = new Set(["unsure", ...selectedProjects().flatMap((project) => project.materials)]);
    return `<div class="config-step-content"><span class="config-kicker">Шаг 2</span><h2>С чем предстоит работать?</h2><p>Выберите материал самостоятельно. Можно отметить несколько вариантов или указать, что материал пока неизвестен.</p><div class="material-grid">${DATA.materials.filter((material) => relevant.has(material.id)).map((material) => {
      const selected = config.materials.includes(material.id);
      return `<button class="material-card${selected ? " selected" : ""}" type="button" data-action="config-material" data-material-id="${material.id}" aria-pressed="${selected}"><span>${selected ? "✓" : "+"}</span><strong>${escapeHtml(material.name)}</strong><small>${escapeHtml(material.description)}</small></button>`;
    }).join("")}</div></div>`;
  }

  function configConditionStep() {
    const option = (action, value, selected, title, description) => `<button class="config-option${selected ? " selected" : ""}" type="button" data-action="${action}" data-value="${value}" aria-pressed="${selected}"><span>${selected ? "✓" : ""}</span><strong>${title}</strong><small>${description}</small></button>`;
    return `<div class="config-step-content"><span class="config-kicker">Шаг 3</span><h2>Какой объём и условия работы?</h2><p>Это меняет порядок рекомендаций, но не скрывает альтернативы.</p><section class="config-preference-section"><h3>Масштаб задачи</h3><div class="config-options-grid">${option("config-scale", "small", config.scale === "small", "Разовая работа", "Минимальный достаточный набор")}${option("config-scale", "home", config.scale === "home", "Ремонт дома", "Баланс возможностей и удобства")}${option("config-scale", "pro", config.scale === "pro", "Регулярная работа", "Профессиональные способы и оборудование")}</div></section><section class="config-preference-section"><h3>Нужна мобильность?</h3><div class="config-options-grid">${option("config-power", "battery", config.power === "battery", "Да, без розетки", "Сначала покажем аккумуляторные решения")}${option("config-power", "network", config.power === "network", "Есть доступ к сети", "Подойдут сетевые решения")}${option("config-power", "any", config.power === "any", "Не принципиально", "Не ограничивать варианты")}</div></section><div class="auto-complete-note"><strong>Вы сами собираете итог</strong><p>На следующем шаге ничего не будет добавлено автоматически: откройте нужную категорию и выберите пример товара.</p></div></div>`;
  }

  function priorityLabel(priority) {
    if (priority === "core") return "Основное решение";
    if (priority === "recommended") return "Дополнительные возможности";
    return "Защита и комфорт";
  }

  function mockProducts(category) {
    const seed = [...category.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const base = 2490 + (seed % 12) * 510;
    const variants = [
      { code: "Start", badge: "Популярный выбор", description: "Для разовых домашних работ и знакомства с категорией." },
      { code: "Home", badge: "Для ремонта", description: "Сбалансированный вариант для регулярных задач дома." },
      { code: "Pro", badge: "Расширенные возможности", description: "Пример решения для высокой нагрузки и частой работы." },
    ];
    return variants.map((variant, index) => ({
      id: `${category.id}-${variant.code.toLowerCase()}`,
      name: `${category.name} ${variant.code} ${18 + (seed + index * 7) % 62}`,
      badge: variant.badge,
      description: variant.description,
      price: `${(base + index * 2800).toLocaleString("ru-RU")} ₽`,
      rating: (4.6 + ((seed + index) % 4) / 10).toFixed(1),
    }));
  }

  function closeCategoryDrawer() {
    document.querySelector(".category-drawer-backdrop")?.remove();
    document.body.classList.remove("category-drawer-open");
    activeCategoryDrawer = null;
  }

  function invoiceItems() {
    return configMetrics().selected.map((id) => ({
      category: categoryById.get(id),
      product: config.selectedProducts[id],
    })).filter((item) => item.category && item.product);
  }

  function invoiceTotal(items = invoiceItems()) {
    return items.reduce((sum, item) => sum + Number(String(item.product.price).replace(/\D/g, "")), 0);
  }

  function closeInvoiceModal() {
    document.querySelector(".invoice-modal-backdrop")?.remove();
    document.body.classList.remove("invoice-modal-open");
  }

  function renderInvoiceModal() {
    closeInvoiceModal();
    const items = invoiceItems();
    if (!items.length) {
      showToast("Сначала добавьте товары в итоговый список");
      return;
    }
    const total = invoiceTotal(items);
    document.body.insertAdjacentHTML("beforeend", `<div class="invoice-modal-backdrop" data-action="config-close-invoice"><section class="invoice-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-modal-title"><header class="invoice-modal-head"><div><span>Оформление заказа</span><h2 id="invoice-modal-title">Заявка на выставление счёта</h2><p>Заполните контактные данные. Заявка будет сохранена файлом для передачи менеджеру.</p></div><button class="invoice-modal-close" type="button" data-action="config-close-invoice" aria-label="Закрыть">×</button></header><form class="invoice-form" id="invoice-form"><div class="invoice-form-fields"><label><span>ФИО или контактное лицо *</span><input name="customer" required autocomplete="name" placeholder="Иван Иванов"></label><label><span>Телефон *</span><input name="phone" type="tel" required autocomplete="tel" placeholder="+7 999 000-00-00"></label><label><span>Электронная почта *</span><input name="email" type="email" required autocomplete="email" placeholder="name@company.ru"></label><label><span>Компания</span><input name="company" autocomplete="organization" placeholder="Название организации"></label><label><span>ИНН</span><input name="inn" inputmode="numeric" pattern="[0-9]{10}|[0-9]{12}" placeholder="10 или 12 цифр"></label><label class="invoice-comment"><span>Комментарий</span><textarea name="comment" rows="3" placeholder="Укажите условия доставки или другие пожелания"></textarea></label></div><section class="invoice-order"><header><div><strong>Состав заказа</strong><small>${items.length} ${plural(items.length, "позиция", "позиции", "позиций")}</small></div><strong>${total.toLocaleString("ru-RU")} ₽</strong></header><div>${items.map((item) => `<article><div><strong>${escapeHtml(item.product.name)}</strong><small>${escapeHtml(item.category.name)}</small></div><span>${escapeHtml(item.product.price)}</span></article>`).join("")}</div><p>Цены демонстрационные. Финальную стоимость и наличие подтверждает менеджер.</p></section><footer class="invoice-form-actions"><button class="secondary-button" type="button" data-action="config-close-invoice">Отмена</button><button class="catalog-button invoice-submit" type="submit">Скачать заявку</button></footer></form></section></div>`);
    document.body.classList.add("invoice-modal-open");
    document.querySelector("#invoice-form input")?.focus({ preventScroll: true });
  }

  function downloadInvoiceRequest(form) {
    const items = invoiceItems();
    const data = new FormData(form);
    const requestNumber = `DNS-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-6)}`;
    const lines = [
      `ЗАЯВКА НА ВЫСТАВЛЕНИЕ СЧЁТА № ${requestNumber}`,
      `Дата: ${new Date().toLocaleString("ru-RU")}`,
      "",
      `Контактное лицо: ${data.get("customer")}`,
      `Телефон: ${data.get("phone")}`,
      `Электронная почта: ${data.get("email")}`,
      `Компания: ${data.get("company") || "не указана"}`,
      `ИНН: ${data.get("inn") || "не указан"}`,
      `Комментарий: ${data.get("comment") || "нет"}`,
      "",
      "СОСТАВ ЗАКАЗА:",
      ...items.map((item, index) => `${index + 1}. ${item.product.name} — ${item.product.price}\n   Категория: ${item.category.name}\n   ${item.category.url}`),
      "",
      `Предварительная сумма: ${invoiceTotal(items).toLocaleString("ru-RU")} ₽`,
      "Цены демонстрационные. Финальную стоимость и наличие подтверждает менеджер.",
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `zayavka-${requestNumber}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    closeInvoiceModal();
    showToast("Заявка на счёт скачана");
  }

  function renderCategoryDrawer(context = activeCategoryDrawer) {
    document.querySelector(".category-drawer-backdrop")?.remove();
    if (!context) return;
    const category = categoryById.get(context.categoryId);
    if (!category) return;
    activeCategoryDrawer = context;
    const selectedProduct = config.selectedProducts[category.id];
    const initials = category.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("ru-RU");
    const products = mockProducts(category);
    const dnsAction = isDnsUrl(category.url) ? `<a href="${escapeHtml(category.url)}" target="_blank" rel="noopener">Вся категория в DNS ↗</a>` : "";
    document.body.insertAdjacentHTML("beforeend", `<div class="category-drawer-backdrop" data-action="config-close-category"><section class="category-drawer" role="dialog" aria-modal="true" aria-labelledby="category-drawer-title"><header class="category-drawer-head"><div><span>Пример выбора товара</span><h2 id="category-drawer-title">${escapeHtml(category.name)}</h2><p>Демонстрационная витрина: характеристики и цены приведены только для примера сценария.</p></div><button class="category-drawer-close" type="button" data-action="config-close-category" aria-label="Закрыть">×</button></header><div class="category-drawer-tools"><label><span>⌕</span><input type="search" placeholder="Поиск по товарам" aria-label="Поиск по демонстрационным товарам"></label><div><span>Для дома</span><span>В наличии</span><span>С высоким рейтингом</span></div></div><div class="category-drawer-body"><aside class="category-drawer-filters"><strong>Быстрые фильтры</strong><label><input type="checkbox" checked disabled> В наличии</label><label><input type="checkbox" checked disabled> Рейтинг 4 и выше</label><label><input type="checkbox" disabled> Профессиональные</label><div><small>Категория</small><span>${escapeHtml(category.group)}</span></div>${dnsAction}</aside><div class="category-drawer-products">${products.map((product) => {
      const added = selectedProduct?.id === product.id;
      return `<article class="drawer-product"><div class="drawer-product-visual"><span>${escapeHtml(initials)}</span><small>пример</small></div><div class="drawer-product-info"><span>${escapeHtml(product.badge)}</span><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description)}</p><div><strong>★ ${product.rating}</strong><span>Демонстрационные характеристики</span></div></div><div class="drawer-product-buy"><strong>${escapeHtml(product.price)}</strong><small>пример цены</small><button class="${added ? "added" : ""}" type="button" data-action="config-add-product" data-choice-key="${escapeHtml(context.choiceKey)}" data-choice-mode="${escapeHtml(context.mode)}" data-category-id="${category.id}" data-product-id="${escapeHtml(product.id)}" data-product-name="${escapeHtml(product.name)}" data-product-price="${escapeHtml(product.price)}"${added ? " disabled" : ""}>${added ? "Добавлено ✓" : selectedProduct ? "Заменить" : "Добавить"}</button></div></article>`;
    }).join("")}</div></div></section></div>`);
    document.body.classList.add("category-drawer-open");
    document.querySelector(".category-drawer-close")?.focus({ preventScroll: true });
  }

  function slotCard(project, slot, index) {
    const key = slotKey(project.id, index);
    const selected = new Set(config.choices[key] || []);
    const ordered = orderedSlotIds(slot);
    return `<article class="solution-slot"><header><div><span class="priority priority-${slot.priority}">${priorityLabel(slot.priority)}</span><h4>${escapeHtml(slot.title)}</h4></div><span>${ordered.length} ${plural(ordered.length, "вариант", "варианта", "вариантов")}</span></header><div class="solution-options">${ordered.map((id, optionIndex) => {
      const category = categoryById.get(id);
      const active = selected.has(id);
      return `<div class="solution-option${active ? " selected" : ""}"><button type="button" data-action="config-open-category" data-choice-key="${escapeHtml(key)}" data-choice-mode="${slot.mode}" data-category-id="${id}" aria-pressed="${active}" aria-haspopup="dialog"><span>${active ? "✓" : optionIndex + 1}</span><strong>${escapeHtml(category.name)}</strong>${active ? "<em>Добавлено в итоговый список</em>" : optionIndex === 0 ? "<em>Открыть рекомендуемые товары</em>" : "<em>Посмотреть товары</em>"}</button>${isDnsUrl(category.url) ? `<a href="${escapeHtml(category.url)}" target="_blank" rel="noopener">Открыть в DNS ↗</a>` : '<span class="dns-link-unavailable">Нет ссылки</span>'}</div>`;
    }).join("")}</div></article>`;
  }

  function configResultStep() {
    const metrics = configMetrics();
    return `<div class="config-step-content config-result-content"><span class="config-kicker">Готовое решение</span><div class="config-result-hero"><div><h2>Подходящие способы и категории</h2><p>Откройте интересующую категорию, посмотрите пример товаров и нажмите «Добавить». До этого момента итоговый список останется пустым.</p></div><div class="result-metrics"><span><strong>${metrics.selected.length}</strong> добавлено</span><span><strong>${metrics.breadth.length}</strong> доступно</span></div></div><div class="result-legend"><span><i class="core"></i>Основное решение</span><span><i class="recommended"></i>Дополнительные возможности</span><span><i class="support"></i>Защита и комфорт</span></div><div class="config-result-toolbar"><button class="catalog-button invoice-button" type="button" data-action="config-invoice"${metrics.selected.length ? "" : " disabled"}>Выставить счёт</button><button class="secondary-button" type="button" data-action="config-copy"${metrics.selected.length ? "" : " disabled"}>Скопировать список</button><button class="secondary-button" type="button" data-action="config-print"${metrics.selected.length ? "" : " disabled"}>Распечатать</button></div><div class="solution-projects">${metrics.projects.map((project) => `<section class="solution-project"><header><div><span>${escapeHtml(project.group)}</span><h3>${escapeHtml(project.title)}</h3><p>${escapeHtml(project.description)}</p></div><strong>${unique(project.slots.flatMap((slot) => slot.categoryIds)).length} категорий</strong></header><div class="solution-slots">${project.slots.map((slot, index) => slotCard(project, slot, index)).join("")}</div></section>`).join("")}</div><section class="selected-kit"><header><div><h3>Ваш итоговый список</h3><p>Здесь автоматически появляются категории, в которых вы добавили товар.</p></div><span>${metrics.selected.length}</span></header><div>${metrics.selected.length ? metrics.selected.map((id) => {
      const category = categoryById.get(id);
      const product = config.selectedProducts[id];
      return `<article class="selected-kit-item"><div><strong>${escapeHtml(category.name)}</strong>${product ? `<small>${escapeHtml(product.name)} · ${escapeHtml(product.price)}</small>` : ""}</div>${isDnsUrl(category.url) ? `<a href="${escapeHtml(category.url)}" target="_blank" rel="noopener">DNS ↗</a>` : '<span class="dns-link-unavailable">Нет ссылки</span>'}<button type="button" data-action="config-remove-selection" data-category-id="${id}">Удалить</button></article>`;
    }).join("") : '<div class="selected-kit-empty"><strong>Пока ничего не добавлено</strong><span>Откройте категорию выше и выберите демонстрационный товар.</span></div>'}</div></section></div>`;
  }

  function renderConfigurator(preselectedProject = "") {
    if (preselectedProject && projectById.has(preselectedProject)) {
      config = defaultConfig();
      config.projectIds = [preselectedProject];
      config.step = 2;
      saveConfig();
    }
    document.title = `Подобрать решение — ${DATA.meta.title}`;
    const content = config.step === 1 ? configProjectStep() : config.step === 2 ? configMaterialStep() : config.step === 3 ? configConditionStep() : configResultStep();
    const canNext = config.step === 1 ? config.projectIds.length > 0 : config.step === 2 ? config.materials.length > 0 : true;
    const navigation = `<div class="config-top-navigation">${config.step > 1 ? '<button class="secondary-button" type="button" data-action="config-back">← Назад</button>' : `<a class="secondary-button" href="${hashFor()}">← В каталог</a>`}${config.step < 4 ? `<button class="catalog-button catalog-button-large" type="button" data-action="config-next"${canNext ? "" : " disabled"}>${config.step === 3 ? "Показать решение" : "Продолжить"} →</button>` : '<button class="catalog-button" type="button" data-action="config-reset">Новый подбор</button>'}</div>`;
    app.innerHTML = `<div class="page-shell config-page">${breadcrumbs([{ name: "Каталог", href: hashFor() }, { name: "Подобрать решение" }])}<header class="route-head config-head"><span class="config-head-icon">${iconSvg("kit")}</span><div><h1 class="page-heading">Подбор инструмента по задаче</h1><p class="page-lead">От понятной потребности — к полному набору категорий и альтернативным способам выполнения.</p></div></header>${configStepper()}${navigation}<div class="config-layout"><main class="config-main">${content}</main>${configSummary()}</div></div>`;
  }

  function copyConfigList() {
    const metrics = configMetrics();
    const lines = [`Подбор инструмента: ${metrics.projects.map((project) => project.title).join("; ")}`, ""];
    for (const id of metrics.selected) {
      const category = categoryById.get(id);
      const product = config.selectedProducts[id];
      lines.push(`• Добавлено: ${category.name}${product ? ` — ${product.name}, ${product.price}` : ""}`);
      if (isDnsUrl(category.url)) lines.push(`  ${category.url}`);
    }
    return lines.join("\n");
  }

  function renderNotFound() {
    app.innerHTML = `<div class="page-shell">${breadcrumbs([{ name: "Каталог", href: hashFor() }, { name: "Страница не найдена" }])}<div class="empty-state"><strong>Раздел не найден</strong><p>Вернитесь в каталог и выберите другой путь.</p><a class="card-action" href="${hashFor()}">Открыть каталог</a></div></div>`;
  }

  function render() {
    closeCategoryDrawer();
    const parts = routeParts();
    suggestions.hidden = true;
    if (!parts.length) renderHome();
    else if (parts[0] === "type" && parts[2] === "group") renderGroup(parts[1], parts[3]);
    else if (parts[0] === "type") renderType(parts[1]);
    else if (parts[0] === "stage") renderStage(parts[1], parts[2] === "work" ? parts[3] : "");
    else if (parts[0] === "assortment") renderAssortment(parts[1]);
    else if (parts[0] === "category") renderCategory(parts[1]);
    else if (parts[0] === "configurator") renderConfigurator(parts[1] || "");
    else if (parts[0] === "search") renderSearch(parts[1] || "");
    else renderNotFound();
    window.scrollTo({ top: 0, behavior: "auto" });
    app.focus({ preventScroll: true });
    if (!parts.length && pendingHomeTarget) {
      const target = pendingHomeTarget;
      pendingHomeTarget = "";
      requestAnimationFrame(() => scrollHome(target));
    }
  }

  function scrollHome(target) {
    document.getElementById(target === "stages" ? "stages-section" : "types-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelectorAll(".catalog-switch button").forEach((button) => button.classList.toggle("active", button.dataset.action === (target === "stages" ? "show-stages" : "show-types")));
  }

  function openHomeTarget(target) {
    if (routeParts().length) { pendingHomeTarget = target; window.location.hash = hashFor(); } else scrollHome(target);
  }

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) { if (!event.target.closest(".global-search")) suggestions.hidden = true; return; }
    const action = target.dataset.action;
    if (action === "home-types" || action === "show-types") openHomeTarget("types");
    if (action === "show-stages") openHomeTarget("stages");
    if (action === "toggle-work") {
      const panel = target.closest(".work-panel");
      panel.classList.toggle("open");
      target.setAttribute("aria-expanded", String(panel.classList.contains("open")));
    }
    if (action === "copy-url") {
      try { await navigator.clipboard.writeText(target.dataset.url); showToast("Ссылка DNS скопирована"); } catch { showToast("Не удалось скопировать ссылку"); }
    }
    if (action === "config-project") {
      const id = target.dataset.projectId;
      config.projectIds = config.projectIds.includes(id) ? config.projectIds.filter((item) => item !== id) : [...config.projectIds, id];
      config.materials = [];
      config.choices = {};
      config.selectedProducts = {};
      saveConfig(); renderConfigurator();
    }
    if (action === "config-material") {
      const id = target.dataset.materialId;
      if (id === "unsure") config.materials = config.materials.includes(id) ? [] : [id];
      else {
        const withoutUnsure = config.materials.filter((item) => item !== "unsure");
        config.materials = withoutUnsure.includes(id) ? withoutUnsure.filter((item) => item !== id) : [...withoutUnsure, id];
      }
      config.choices = {};
      config.selectedProducts = {};
      saveConfig(); renderConfigurator();
    }
    if (action === "config-scale" || action === "config-power") {
      config[action === "config-scale" ? "scale" : "power"] = target.dataset.value;
      config.choices = {};
      config.selectedProducts = {};
      saveConfig(); renderConfigurator();
    }
    if (action === "config-next") {
      if ((config.step === 1 && !config.projectIds.length) || (config.step === 2 && !config.materials.length)) return;
      config.step = Math.min(4, config.step + 1); saveConfig(); renderConfigurator(); window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (action === "config-back") { config.step = Math.max(1, config.step - 1); saveConfig(); renderConfigurator(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    if (action === "config-reset") { config = defaultConfig(); saveConfig(); renderConfigurator(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    if (action === "config-open-category") {
      renderCategoryDrawer({ categoryId: target.dataset.categoryId, choiceKey: target.dataset.choiceKey, mode: target.dataset.choiceMode });
    }
    if (action === "config-close-category") {
      if (!target.classList.contains("category-drawer-backdrop") || event.target === target) closeCategoryDrawer();
    }
    if (action === "config-add-product") {
      const key = target.dataset.choiceKey;
      const id = target.dataset.categoryId;
      const current = config.choices[key] || [];
      if (target.dataset.choiceMode === "one") {
        const displaced = current.filter((item) => item !== id);
        config.choices[key] = [id];
        const stillSelected = new Set(Object.values(config.choices).flat());
        displaced.filter((item) => !stillSelected.has(item)).forEach((item) => delete config.selectedProducts[item]);
      } else {
        config.choices[key] = current.includes(id) ? current : [...current, id];
      }
      config.selectedProducts[id] = { id: target.dataset.productId, name: target.dataset.productName, price: target.dataset.productPrice };
      saveConfig();
      renderConfigurator();
      renderCategoryDrawer(activeCategoryDrawer);
      showToast("Категория добавлена в итоговый список");
    }
    if (action === "config-remove-selection") {
      const id = target.dataset.categoryId;
      for (const key of Object.keys(config.choices)) config.choices[key] = config.choices[key].filter((item) => item !== id);
      delete config.selectedProducts[id];
      saveConfig(); renderConfigurator();
    }
    if (action === "config-copy") {
      try { await navigator.clipboard.writeText(copyConfigList()); showToast("Список скопирован"); } catch { showToast("Не удалось скопировать список"); }
    }
    if (action === "config-print") window.print();
    if (action === "config-invoice") renderInvoiceModal();
    if (action === "config-close-invoice") {
      if (!target.classList.contains("invoice-modal-backdrop") || event.target === target) closeInvoiceModal();
    }
  });

  document.addEventListener("submit", (event) => {
    if (!event.target.matches("#invoice-form")) return;
    event.preventDefault();
    downloadInvoiceRequest(event.target);
  });

  document.addEventListener("input", (event) => {
    if (!event.target.matches("[data-local-filter]")) return;
    const query = normalize(event.target.value);
    const cards = [...document.querySelectorAll(".operation-card")];
    cards.forEach((card) => { card.hidden = Boolean(query) && !card.dataset.filterText.includes(query); });
    document.querySelectorAll("[data-work-panel]").forEach((panel) => {
      const visible = [...panel.querySelectorAll(".operation-card")].some((card) => !card.hidden);
      panel.hidden = !visible;
      if (visible && query) panel.classList.add("open");
    });
    document.querySelector(".stage-filter-empty").hidden = cards.some((card) => !card.hidden);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeCategoryDrawer) closeCategoryDrawer();
    if (event.key === "Escape" && document.querySelector(".invoice-modal-backdrop")) closeInvoiceModal();
  });

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim();
    searchBox.classList.toggle("has-value", Boolean(query));
    if (!query) { suggestions.hidden = true; return; }
    const results = findItems(query).slice(0, 8);
    suggestions.innerHTML = results.length ? `${results.map(({ type, item }) => type === "project" ? `<a class="suggestion-link" href="${hashFor("configurator", item.id)}"><span>${escapeHtml(item.title)}</span><small>Подобрать</small></a>` : `<a class="suggestion-link" href="${hashFor("category", item.id)}"><span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.group)}</small></a>`).join("")}<a class="suggestion-link" href="${hashFor("search", query)}"><strong>Все результаты</strong><small>→</small></a>` : '<div class="suggestion-empty">Совпадений нет</div>';
    suggestions.hidden = false;
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); window.location.hash = hashFor("search", searchInput.value.trim()); searchInput.blur(); }
    if (event.key === "Escape") suggestions.hidden = true;
  });
  searchInput.addEventListener("focus", () => { if (searchInput.value.trim()) searchInput.dispatchEvent(new Event("input")); });
  searchClear.addEventListener("click", () => { searchInput.value = ""; searchBox.classList.remove("has-value"); suggestions.hidden = true; searchInput.focus(); });
  window.addEventListener("hashchange", render);
  render();
})();
