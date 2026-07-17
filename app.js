(() => {
  "use strict";

  const DATA = window.CATALOG_DATA;
  const app = document.getElementById("app");
  const searchInput = document.getElementById("global-search");
  const searchBox = searchInput.closest(".global-search");
  const suggestions = document.getElementById("search-suggestions");
  const searchClear = document.getElementById("search-clear");
  const toast = document.getElementById("toast");
  const categoryByName = new Map(DATA.categories.map((category) => [category.name, category]));
  let pendingHomeTarget = "";
  let toastTimer = null;

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const hashFor = (...parts) => `#/${parts.map((part) => encodeURIComponent(String(part))).join("/")}`;

  function routeParts() {
    return window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map((part) => {
      try { return decodeURIComponent(part); } catch { return part; }
    });
  }

  function unique(values) { return [...new Set(values)]; }

  function normalize(value) {
    return String(value || "").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").trim();
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
    return `<nav class="breadcrumbs" aria-label="Хлебные крошки">
      ${items.map((item, index) => {
        const content = item.href
          ? `<a href="${item.href}">${escapeHtml(item.name)}</a>`
          : `<span aria-current="page">${escapeHtml(item.name)}</span>`;
        return `${index ? '<span class="crumb-separator">›</span>' : ""}${content}`;
      }).join("")}
    </nav>`;
  }

  function searchIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 4 4"></path></svg>`;
  }

  function iconSvg(key) {
    const paths = {
      type1: `<rect x="17" y="11" width="30" height="42" rx="6"/><path d="M26 7h12v4M23 33h18M32 20v9M27.5 24.5h9"/>`,
      type2: `<path d="M20 9v15M44 9v15M16 24h32v7a16 16 0 0 1-16 16v8M25 17h14"/>`,
      type3: `<path d="M11 46h42M16 46V24h32v22M22 24l4-12h12l4 12M23 34h18M32 24v22"/>`,
      type4: `<path d="M13 48 48 13l5 5-35 35zM31 30l5 5M38 23l5 5M20 41l5 5"/><circle cx="18" cy="18" r="7"/>`,
      stage1: `<path d="M10 44h44M14 44l6-26h24l6 26M22 28h20M19 36h26"/><path d="M32 10v8"/>`,
      stage2: `<path d="m13 47 26-26M31 13l20 20M36 18l8-8 10 10-8 8M10 50l7 4 6-6-7-7z"/>`,
      stage3: `<path d="M9 18h46v30H9zM9 30h46M9 42h46M24 18v12M42 18v12M17 30v12M35 30v12M49 30v12"/>`,
      stage4: `<path d="M32 7 19 30h11l-3 27 18-31H34z"/><path d="M10 14h8M46 14h8M9 51h10M45 51h10"/>`,
      stage5: `<path d="M10 45h29M17 45V25h22v20M22 25l4-11h10l3 11M44 35h10M49 30v10"/>`,
      stage6: `<path d="M13 42h38l4 9H9zM17 42l5-26h20l5 26M22 27h20M19 35h26"/>`,
      stage7: `<path d="M15 11h27v13H15zM42 17h7v19H31v17M31 53h-8v-9h8"/>`,
      stage8: `<path d="M11 42h23l5 10H8zM17 42l3-24h14l3 24M23 18V9h8v9"/><path d="m42 34 5 5 10-13"/>`,
      stage9: `<circle cx="32" cy="32" r="10"/><path d="M32 8v8M32 48v8M8 32h8M48 32h8M15 15l6 6M43 43l6 6M49 15l-6 6M21 43l-6 6"/>`,
    };
    const body = paths[key] || paths.stage9;
    return `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
  }

  function countLeaves(nodes) {
    return nodes.reduce((sum, node) => sum + (node.children?.length ? countLeaves(node.children) : 1), 0);
  }

  function categoryLink(name, className = "category-chip") {
    const category = categoryByName.get(name);
    if (category) return `<a class="${className}" href="${hashFor("category", name)}">${escapeHtml(name)}</a>`;
    return `<span class="${className}">${escapeHtml(name)}</span>`;
  }

  function externalOrCategoryLink(node, className = "tree-leaf") {
    if (categoryByName.has(node.name)) {
      return `<a class="${className}" href="${hashFor("category", node.name)}">${escapeHtml(node.name)}</a>`;
    }
    if (node.url) {
      return `<a class="${className}" href="${escapeHtml(node.url)}" target="_blank" rel="noopener">${escapeHtml(node.name)} <span class="external-mark">↗</span></a>`;
    }
    return `<span class="${className}">${escapeHtml(node.name)}</span>`;
  }

  function typeCard(block) {
    const details = block.status === "unchanged"
      ? `${block.groups.length} ${plural(block.groups.length, "раздел", "раздела", "разделов")} — текущая структура`
      : `${block.groups.length} понятных укрупнённых групп`;
    return `<a class="type-card" href="${hashFor("type", block.id)}">
      <h3>${escapeHtml(block.name)}</h3>
      <p>${escapeHtml(details)}</p>
      <span class="card-action">Смотреть разделы</span>
      <span class="type-visual">${iconSvg(`type${block.id}`)}</span>
    </a>`;
  }

  function stageCard(stage) {
    const operationCount = stage.works.reduce((sum, work) => sum + work.operations.length, 0);
    return `<a class="stage-card" href="${hashFor("stage", stage.id)}">
      <div>
        <div class="stage-number">Этап ${stage.id}</div>
        <h3>${escapeHtml(stage.name)}</h3>
        <p>${escapeHtml(stage.description)}</p>
        <div class="stage-meta">
          <span>${stage.works.length} ${plural(stage.works.length, "вид", "вида", "видов")} работ</span>
          <span>${operationCount} ${plural(operationCount, "операция", "операции", "операций")}</span>
          <span>${stage.categoryCount} категорий</span>
        </div>
      </div>
      <span class="stage-visual">${iconSvg(`stage${stage.id}`)}</span>
    </a>`;
  }

  function renderHome() {
    document.title = `${DATA.meta.title} — каталог по типам и этапам работ`;
    const popular = DATA.popular.map((name) => {
      const category = categoryByName.get(name);
      const stageCount = category ? unique(category.placements.map((item) => item.stageId)).length : 0;
      return `<a class="popular-card" href="${hashFor("category", name)}">
        <strong>${escapeHtml(name)}</strong>
        <small>${stageCount} ${plural(stageCount, "этап применения", "этапа применения", "этапов применения")}</small>
      </a>`;
    }).join("");

    app.innerHTML = `<div class="page-shell">
      ${breadcrumbs([{ name: "Каталог", href: hashFor() }, { name: DATA.meta.title }])}
      <div class="hero-row">
        <div>
          <h1 class="page-heading">${escapeHtml(DATA.meta.title)}</h1>
          <p class="page-lead">Ищите привычным способом по типу инструмента или выберите понятный этап строительных работ.</p>
        </div>
      </div>

      <div class="catalog-switch" aria-label="Способ навигации">
        <button class="active" type="button" data-action="show-types">По типу инструмента</button>
        <button type="button" data-action="show-stages">По этапам работ</button>
      </div>

      <section class="section" id="types-section">
        <div class="section-head">
          <div><h2>Каталог по типу инструмента</h2><p>Для тех, кто уже знает, какой инструмент или оборудование нужен.</p></div>
          <span class="section-count">4 основных раздела</span>
        </div>
        <div class="type-grid">${DATA.typeBlocks.map(typeCard).join("")}</div>
      </section>

      <section class="section" id="stages-section">
        <div class="section-head">
          <div><h2>Выберите этап работ</h2><p>Получите полный набор инструмента и оснастки под конкретную задачу.</p></div>
          <span class="section-count">${DATA.meta.stageCount} этапов · ${DATA.meta.categoryCount} категорий</span>
        </div>
        <div class="stage-grid">${DATA.stages.map(stageCard).join("")}</div>
      </section>

      <section class="section">
        <div class="section-head">
          <div><h2>Популярные категории</h2><p>Быстрый переход к часто используемому инструменту.</p></div>
        </div>
        <div class="popular-grid">${popular}</div>
      </section>
    </div>`;

    if (pendingHomeTarget) {
      const target = pendingHomeTarget;
      pendingHomeTarget = "";
      window.setTimeout(() => scrollHome(target), 30);
    }
  }

  function renderStage(stageId, selectedWork = "") {
    const stage = DATA.stages.find((item) => item.id === Number(stageId));
    if (!stage) return renderNotFound();
    const chosenWork = selectedWork ? stage.works.find((work) => work.name === selectedWork) : null;
    document.title = `${chosenWork ? `${chosenWork.name} — ` : ""}${stage.name} — ${DATA.meta.title}`;
    const crumbItems = [
      { name: "Каталог", href: hashFor() },
      { name: DATA.meta.title, href: hashFor() },
      { name: stage.name, href: chosenWork ? hashFor("stage", stage.id) : "" },
    ];
    if (chosenWork) crumbItems.push({ name: chosenWork.name });

    const panels = stage.works.map((work, index) => {
      const isOpen = chosenWork ? work.name === chosenWork.name : index === 0;
      const categoryCount = new Set(work.operations.flatMap((operation) => operation.categories)).size;
      const operations = work.operations.map((operation) => `<article class="operation-card" data-filter-text="${escapeHtml(normalize(`${operation.name} ${operation.categories.join(" ")}`))}">
        <h3>${escapeHtml(operation.name)}</h3>
        <div class="category-links">${operation.categories.map((category) => categoryLink(category)).join("")}</div>
      </article>`).join("");
      return `<section class="work-panel${isOpen ? " open" : ""}" data-work-name="${escapeHtml(work.name)}">
        <button class="work-summary" type="button" data-action="toggle-work" aria-expanded="${isOpen}">
          <span class="work-summary-copy">
            <span class="work-index">${index + 1}</span>
            <span><h2>${escapeHtml(work.name)}</h2><small>${work.operations.length} ${plural(work.operations.length, "операция", "операции", "операций")} · ${categoryCount} категорий</small></span>
          </span>
          <span class="chevron" aria-hidden="true"></span>
        </button>
        <div class="work-content"><div class="operation-grid">${operations}</div></div>
      </section>`;
    }).join("");

    app.innerHTML = `<div class="page-shell">
      ${breadcrumbs(crumbItems)}
      <header class="route-head">
        <div class="route-head-row">
          <div>
            <div class="stage-number">Этап ${stage.id} из ${DATA.meta.stageCount}</div>
            <h1 class="page-heading">${escapeHtml(chosenWork?.name || stage.name)}</h1>
            <p class="page-lead">${escapeHtml(chosenWork ? `Раздел этапа «${stage.name}». Выберите операцию и нужную категорию товара.` : stage.description)}</p>
          </div>
          <span class="route-icon">${iconSvg(`stage${stage.id}`)}</span>
        </div>
      </header>

      <div class="route-toolbar">
        <a class="back-link" href="${chosenWork ? hashFor("stage", stage.id) : hashFor()}">← ${chosenWork ? "К этапу" : "Ко всем этапам"}</a>
        <label class="local-filter">${searchIcon()}<span class="visually-hidden">Фильтр внутри этапа</span><input id="stage-filter" type="search" placeholder="Найти операцию или категорию" /></label>
      </div>
      <div class="work-stack" id="work-stack">${panels}</div>
    </div>`;

    const filterInput = document.getElementById("stage-filter");
    filterInput.addEventListener("input", () => filterStage(filterInput.value));
    if (chosenWork) window.setTimeout(() => document.querySelector(".work-panel.open")?.scrollIntoView({ block: "start" }), 30);
  }

  function filterStage(query) {
    const term = normalize(query);
    document.querySelectorAll(".work-panel").forEach((panel) => {
      let visibleOperations = 0;
      panel.querySelectorAll(".operation-card").forEach((card) => {
        const visible = !term || card.dataset.filterText.includes(term) || normalize(panel.dataset.workName).includes(term);
        card.hidden = !visible;
        if (visible) visibleOperations += 1;
      });
      panel.hidden = visibleOperations === 0;
      if (term && visibleOperations) {
        panel.classList.add("open");
        panel.querySelector(".work-summary").setAttribute("aria-expanded", "true");
      }
    });
  }

  function renderType(blockId) {
    const block = DATA.typeBlocks.find((item) => item.id === Number(blockId));
    if (!block) return renderNotFound();
    document.title = `${block.name} — ${DATA.meta.title}`;
    const groups = block.groups.map((group) => {
      const items = group.children || [];
      return `<a class="group-card" href="${hashFor("type", block.id, "group", group.name)}">
        <h2>${escapeHtml(group.name)}</h2>
        <div class="group-card-list">
          ${items.slice(0, 5).map((item) => `<span>${escapeHtml(item.name)}</span>`).join("")}
        </div>
        <div class="group-more">${countLeaves(items)} ${plural(countLeaves(items), "категория", "категории", "категорий")} →</div>
      </a>`;
    }).join("");

    app.innerHTML = `<div class="page-shell">
      ${breadcrumbs([{ name: "Каталог", href: hashFor() }, { name: DATA.meta.title, href: hashFor() }, { name: block.name }])}
      <header class="route-head">
        <div class="route-head-row">
          <div>
            <h1 class="page-heading">${escapeHtml(block.name)}</h1>
            <p class="page-lead">${block.status === "unchanged" ? "Текущая структура раздела сохранена без изменений." : "Группы укрупнены и названы по понятным типам оборудования и инструмента."}</p>
          </div>
          <span class="route-icon">${iconSvg(`type${block.id}`)}</span>
        </div>
      </header>
      <div class="route-toolbar"><a class="back-link" href="${hashFor()}">← Ко всем типам инструмента</a></div>
      <div class="group-grid">${groups}</div>
    </div>`;
  }

  function renderTreeNodes(nodes, depth = 0) {
    return nodes.map((node) => {
      if (!node.children?.length) return externalOrCategoryLink(node);
      return `<details class="tree-branch${depth === 0 ? " tree-branch-root" : ""}"${depth === 0 ? " open" : ""}>
        <summary>
          <span class="tree-node-title">${escapeHtml(node.name)}</span>
          <span class="section-count">${countLeaves(node.children)} категорий <span class="tree-toggle" aria-hidden="true"></span></span>
        </summary>
        <div class="tree-branch-children">${renderTreeNodes(node.children, depth + 1)}</div>
      </details>`;
    }).join("");
  }

  function renderGroup(blockId, groupName) {
    const block = DATA.typeBlocks.find((item) => item.id === Number(blockId));
    const group = block?.groups.find((item) => item.name === groupName);
    if (!block || !group) return renderNotFound();
    document.title = `${group.name} — ${block.name}`;
    app.innerHTML = `<div class="page-shell">
      ${breadcrumbs([
        { name: "Каталог", href: hashFor() },
        { name: DATA.meta.title, href: hashFor() },
        { name: block.name, href: hashFor("type", block.id) },
        { name: group.name },
      ])}
      <header class="route-head">
        <h1 class="page-heading">${escapeHtml(group.name)}</h1>
        <p class="page-lead">${countLeaves(group.children)} ${plural(countLeaves(group.children), "категория", "категории", "категорий")} в разделе.</p>
      </header>
      <div class="route-toolbar"><a class="back-link" href="${hashFor("type", block.id)}">← К разделу «${escapeHtml(block.name)}»</a></div>
      <div class="tree-list">${renderTreeNodes(group.children)}</div>
    </div>`;
  }

  function categoryType(name) {
    const text = normalize(name);
    if (/диск|сверл|бур|корон|полотн|пилк|фрез|бит|насад|чашк|щетк|лент|стерж|головк|оснаст/.test(text)) return "Оснастка";
    if (/перчат|защит|маска/.test(text)) return "Безопасность";
    if (/рулет|нивелир|дальномер|измер|уровн|штанген|угольник/.test(text)) return "Измерение";
    if (/пылес|химия|пеногенератор|давления/.test(text)) return "Уборка";
    return "Инструмент и оборудование";
  }

  function renderCategory(name) {
    const category = categoryByName.get(name);
    if (!category) return renderNotFound();
    document.title = `${category.name} — ${DATA.meta.title}`;
    const stageIds = unique(category.placements.map((placement) => placement.stageId));
    const roles = unique(category.placements.map((placement) => placement.role).filter(Boolean));
    const paths = category.placements.map((placement) => `<article class="path-card${placement.placementType === "Основной путь" ? " path-card-main" : ""}">
      <div class="path-stage">Этап ${placement.stageId}${placement.placementType === "Основной путь" ? " · основной путь" : " · дополнительный путь"}</div>
      <h3>${escapeHtml(placement.work)}</h3>
      <p>${escapeHtml(placement.operation)}</p>
      <a class="card-action" href="${hashFor("stage", placement.stageId, "work", placement.work)}">Перейти к виду работ</a>
    </article>`).join("");

    app.innerHTML = `<div class="page-shell">
      ${breadcrumbs([{ name: "Каталог", href: hashFor() }, { name: DATA.meta.title, href: hashFor() }, { name: category.name }])}
      <section class="category-hero">
        <div class="category-label">${escapeHtml(categoryType(category.name))}</div>
        <h1>${escapeHtml(category.name)}</h1>
        <p>Категория показана во всех подходящих сценариях, чтобы её можно было найти как по типу товара, так и по реальной задаче.</p>
        <div class="tag-row">
          <span class="tag">${stageIds.length} ${plural(stageIds.length, "этап", "этапа", "этапов")}</span>
          <span class="tag">${category.placements.length} ${plural(category.placements.length, "сценарий", "сценария", "сценариев")}</span>
          ${roles.slice(0, 3).map((role) => `<span class="tag">${escapeHtml(role)}</span>`).join("")}
        </div>
      </section>

      <div class="route-toolbar">
        <a class="back-link" href="${hashFor()}">← Вернуться в каталог</a>
        <button class="catalog-button" type="button" data-action="copy-link">Скопировать ссылку</button>
      </div>

      <section class="section">
        <div class="section-head"><div><h2>Где используется</h2><p>Все пути внутри каталога по этапам работ.</p></div></div>
        <div class="paths-grid">${paths}</div>
      </section>
    </div>`;
  }

  function findCategories(query) {
    const term = normalize(query);
    if (!term) return [];
    return DATA.categories
      .map((category) => {
        const name = normalize(category.name);
        const score = name === term ? 0 : name.startsWith(term) ? 1 : name.includes(term) ? 2 : 99;
        return { category, score };
      })
      .filter((item) => item.score < 99)
      .sort((a, b) => a.score - b.score || a.category.name.localeCompare(b.category.name, "ru"))
      .map((item) => item.category);
  }

  function renderSearch(query) {
    const results = findCategories(query);
    document.title = `Поиск: ${query || "категории"} — ${DATA.meta.title}`;
    searchInput.value = query;
    searchBox.classList.toggle("has-value", Boolean(query));
    const list = results.length
      ? `<div class="search-results">${results.map((category) => {
        const stages = unique(category.placements.map((placement) => placement.stageId)).length;
        return `<a class="search-result" href="${hashFor("category", category.name)}"><span><strong>${escapeHtml(category.name)}</strong><small>${stages} ${plural(stages, "этап", "этапа", "этапов")} · ${categoryType(category.name)}</small></span><span class="search-result-arrow">→</span></a>`;
      }).join("")}</div>`
      : `<div class="empty-state"><strong>Ничего не найдено</strong>Попробуйте изменить запрос или выбрать этап работ.</div>`;

    app.innerHTML = `<div class="page-shell">
      ${breadcrumbs([{ name: "Каталог", href: hashFor() }, { name: DATA.meta.title, href: hashFor() }, { name: "Результаты поиска" }])}
      <header class="route-head"><h1 class="page-heading">Поиск по каталогу</h1><p class="page-lead">По запросу «${escapeHtml(query)}» найдено: ${results.length}</p></header>
      <div class="route-toolbar"><a class="back-link" href="${hashFor()}">← Вернуться в каталог</a></div>
      ${list}
    </div>`;
  }

  function renderNotFound() {
    document.title = `Раздел не найден — ${DATA.meta.title}`;
    app.innerHTML = `<div class="page-shell">
      ${breadcrumbs([{ name: "Каталог", href: hashFor() }, { name: "Страница не найдена" }])}
      <div class="empty-state"><strong>Такого раздела нет</strong><p>Вернитесь на главную страницу каталога и выберите нужный путь.</p><a class="card-action" href="${hashFor()}">Открыть каталог</a></div>
    </div>`;
  }

  function render() {
    const parts = routeParts();
    suggestions.hidden = true;
    if (!parts.length) renderHome();
    else if (parts[0] === "stage") renderStage(parts[1], parts[2] === "work" ? parts[3] : "");
    else if (parts[0] === "type" && parts[2] === "group") renderGroup(parts[1], parts[3]);
    else if (parts[0] === "type") renderType(parts[1]);
    else if (parts[0] === "category") renderCategory(parts[1]);
    else if (parts[0] === "search") renderSearch(parts[1] || "");
    else renderNotFound();
    window.scrollTo({ top: 0, behavior: "auto" });
    app.focus({ preventScroll: true });
  }

  function scrollHome(target) {
    const section = document.getElementById(target === "stages" ? "stages-section" : "types-section");
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelectorAll(".catalog-switch button").forEach((button) => {
      button.classList.toggle("active", button.dataset.action === (target === "stages" ? "show-stages" : "show-types"));
    });
  }

  function openHomeTarget(target) {
    if (routeParts().length) {
      pendingHomeTarget = target;
      window.location.hash = hashFor();
    } else {
      scrollHome(target);
    }
  }

  document.addEventListener("click", async (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      if (!event.target.closest(".global-search")) suggestions.hidden = true;
      return;
    }
    const action = actionTarget.dataset.action;
    if (action === "home-types" || action === "show-types") openHomeTarget("types");
    if (action === "show-stages") openHomeTarget("stages");
    if (action === "toggle-work") {
      const panel = actionTarget.closest(".work-panel");
      const isOpen = panel.classList.toggle("open");
      actionTarget.setAttribute("aria-expanded", String(isOpen));
    }
    if (action === "copy-link") {
      try {
        await navigator.clipboard.writeText(window.location.href);
        showToast("Ссылка скопирована");
      } catch {
        showToast("Скопируйте адрес из строки браузера");
      }
    }
  });

  searchInput.addEventListener("input", () => {
    const query = searchInput.value;
    searchBox.classList.toggle("has-value", Boolean(query));
    const results = findCategories(query).slice(0, 8);
    if (!query.trim()) {
      suggestions.hidden = true;
      return;
    }
    suggestions.innerHTML = results.length
      ? `${results.map((category) => `<a class="suggestion-link" href="${hashFor("category", category.name)}"><span>${escapeHtml(category.name)}</span><small>${unique(category.placements.map((item) => item.stageId)).length} этап.</small></a>`).join("")}<a class="suggestion-link" href="${hashFor("search", query)}"><strong>Все результаты</strong><small>→</small></a>`
      : `<div class="suggestion-empty">Совпадений нет</div>`;
    suggestions.hidden = false;
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      window.location.hash = hashFor("search", searchInput.value.trim());
      searchInput.blur();
    }
    if (event.key === "Escape") suggestions.hidden = true;
  });

  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim()) searchInput.dispatchEvent(new Event("input"));
  });

  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchBox.classList.remove("has-value");
    suggestions.hidden = true;
    searchInput.focus();
  });

  window.addEventListener("hashchange", render);
  render();
})();
