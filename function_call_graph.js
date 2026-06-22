const DATA_URL = window.FUNCTION_EXPLAINER_DATA_URL || "data/function_call_graph.json";

const state = {
  graph: null,
  nodesById: new Map(),
  outgoing: new Map(),
  incoming: new Map(),
  selectedId: null,
  expandedCallers: new Set(),
  expandedCallees: new Set(),
};

const elements = {
  nativeOverviewCards: document.getElementById("native-overview-cards"),
  nativeParameterGroups: document.getElementById("native-parameter-groups"),
  nativeStackFilter: document.getElementById("native-stack-filter"),
  nativeCallStackList: document.getElementById("native-call-stack-list"),
  runtimeRiskFilter: document.getElementById("runtime-risk-filter"),
  runtimeOptimizationList: document.getElementById("runtime-optimization-list"),
  summaryText: document.getElementById("summary-text"),
  metricFunctions: document.getElementById("metric-functions"),
  metricEdges: document.getElementById("metric-edges"),
  metricFormulas: document.getElementById("metric-formulas"),
  metricAnnotated: document.getElementById("metric-annotated"),
  searchInput: document.getElementById("search-input"),
  moduleFilter: document.getElementById("module-filter"),
  formulaFilter: document.getElementById("formula-filter"),
  resetButton: document.getElementById("reset-button"),
  functionList: document.getElementById("function-list"),
  listSummary: document.getElementById("list-summary"),
  overview: document.getElementById("function-overview"),
  selectedSummary: document.getElementById("selected-summary"),
  guideSteps: document.getElementById("guide-steps"),
  directLinks: document.getElementById("direct-links"),
  formulaList: document.getElementById("formula-list"),
  formulaSummary: document.getElementById("formula-summary"),
  sourceView: document.getElementById("source-view"),
  sourceSummary: document.getElementById("source-summary"),
  callerTree: document.getElementById("caller-tree"),
  calleeTree: document.getElementById("callee-tree"),
  callerExpandButton: document.getElementById("caller-expand-button"),
  callerResetButton: document.getElementById("caller-reset-button"),
  calleeExpandButton: document.getElementById("callee-expand-button"),
  calleeResetButton: document.getElementById("callee-reset-button"),
};

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function option(select, value, label) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  select.appendChild(element);
}

function nodeById(nodeId) {
  return state.nodesById.get(nodeId) || null;
}

function getChildren(nodeId, direction) {
  return direction === "callers" ? state.incoming.get(nodeId) || [] : state.outgoing.get(nodeId) || [];
}

function getExpandedSet(direction) {
  return direction === "callers" ? state.expandedCallers : state.expandedCallees;
}

function shortLabel(node) {
  if (!node) return "";
  const parts = node.id.split(".");
  return parts.slice(-2).join(".");
}

function populateModules() {
  elements.moduleFilter.innerHTML = "";
  option(elements.moduleFilter, "all", "全部模块");
  state.graph.modules.forEach((moduleName) => option(elements.moduleFilter, moduleName, moduleName));
}

function indexGraph(graph) {
  state.nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  state.outgoing = new Map(graph.nodes.map((node) => [node.id, [...(node.callees || [])]]));
  state.incoming = new Map(graph.nodes.map((node) => [node.id, [...(node.callers || [])]]));
  graph.edges.forEach((edge) => {
    if (!state.outgoing.has(edge.source)) state.outgoing.set(edge.source, []);
    if (!state.incoming.has(edge.target)) state.incoming.set(edge.target, []);
    if (!state.outgoing.get(edge.source).includes(edge.target)) state.outgoing.get(edge.source).push(edge.target);
    if (!state.incoming.get(edge.target).includes(edge.source)) state.incoming.get(edge.target).push(edge.source);
  });
  for (const values of state.outgoing.values()) values.sort();
  for (const values of state.incoming.values()) values.sort();
}

function matchesModule(node) {
  return elements.moduleFilter.value === "all" || node.module === elements.moduleFilter.value;
}

function matchesFormulaFilter(node) {
  return elements.formulaFilter.value !== "with-formulas" || Number(node.formula_count || 0) > 0;
}

function searchHaystack(node) {
  const formulaBits = (node.formulas || [])
    .flatMap((formula) => [formula.target, formula.expression, formula.explanation, ...(formula.symbols || [])])
    .join(" ");
  return [node.id, node.module, node.file, node.summary, node.docstring, formulaBits].join(" ").toLowerCase();
}

function matchesSearch(node) {
  const query = elements.searchInput.value.trim().toLowerCase();
  if (!query) return true;
  return searchHaystack(node).includes(query);
}

function filteredNodes() {
  return state.graph.nodes.filter((node) => matchesModule(node) && matchesFormulaFilter(node) && matchesSearch(node));
}

function sortNodes(nodes) {
  return [...nodes].sort(
    (left, right) =>
      Number(right.formula_count || 0) - Number(left.formula_count || 0) ||
      right.outgoing + right.incoming - (left.outgoing + left.incoming) ||
      left.id.localeCompare(right.id),
  );
}

function chooseDefaultNode() {
  const candidates = sortNodes(filteredNodes());
  return candidates.length > 0 ? candidates[0].id : null;
}

function resetExpansion() {
  if (!state.selectedId) {
    state.expandedCallers = new Set();
    state.expandedCallees = new Set();
    return;
  }
  state.expandedCallers = new Set([state.selectedId]);
  state.expandedCallees = new Set([state.selectedId]);
}

function selectNode(nodeId) {
  state.selectedId = nodeId;
  resetExpansion();
  renderAll();
}

function refreshSelection() {
  const available = filteredNodes();
  if (!available.some((node) => node.id === state.selectedId)) {
    state.selectedId = chooseDefaultNode();
    resetExpansion();
  }
  renderAll();
}

function renderMetrics() {
  elements.metricFunctions.textContent = fmt(state.graph.summary.function_count);
  elements.metricEdges.textContent = fmt(state.graph.summary.edge_count);
  elements.metricFormulas.textContent = fmt(state.graph.summary.formula_count);
  elements.metricAnnotated.textContent = fmt(state.graph.summary.functions_with_formulas);
}

function renderSummary() {
  elements.summaryText.textContent = `Generated at ${state.graph.summary.generated_at} from ${state.graph.summary.source_roots.join(", ")}`;
}

function nativeReference() {
  return state.graph?.native_cost_model || null;
}

function populateNativeStackFilter(native) {
  if (!elements.nativeStackFilter || !native) return;
  elements.nativeStackFilter.innerHTML = "";
  option(elements.nativeStackFilter, "all", "全部调用栈");
  (native.call_stacks || []).forEach((stack) => option(elements.nativeStackFilter, stack.id, stack.title || stack.id));
}

function renderNativeOverviewCards(native) {
  if (!elements.nativeOverviewCards) return;
  elements.nativeOverviewCards.replaceChildren();
  if (!native) return;

  const riskyCount = (native.runtime_optimizations || []).filter((item) => item.can_miss_optimal).length;
  const cards = [
    ["Input Groups", (native.parameter_groups || []).length],
    ["Call Stacks", (native.call_stacks || []).length],
    ["Runtime Optimizations", (native.runtime_optimizations || []).length],
    ["可能错过最优解", riskyCount],
  ];

  cards.forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "native-overview-card";
    card.innerHTML = `<span>${escapeHtml(label)}</span><strong>${fmt(value)}</strong>`;
    elements.nativeOverviewCards.appendChild(card);
  });
}

function renderNativeParameterGroups(native) {
  if (!elements.nativeParameterGroups) return;
  elements.nativeParameterGroups.replaceChildren();
  if (!native || !(native.parameter_groups || []).length) {
    elements.nativeParameterGroups.innerHTML = '<div class="empty">没有 native cost model 参数数据。</div>';
    return;
  }

  native.parameter_groups.forEach((group, index) => {
    const details = document.createElement("details");
    details.className = "native-param-group";
    details.open = index < 3;
    const parameters = (group.parameters || [])
      .map(
        (parameter) => `
          <div class="native-param-row">
            <code>${escapeHtml(parameter.name)}</code>
            <span>${escapeHtml(parameter.meaning)}</span>
          </div>
        `,
      )
      .join("");
    details.innerHTML = `
      <summary>
        <span>${escapeHtml(group.title || group.id)}</span>
        <small>${escapeHtml(group.source || "")}</small>
      </summary>
      <p class="native-param-description">${escapeHtml(group.description || "")}</p>
      <div class="native-param-table">${parameters}</div>
    `;
    elements.nativeParameterGroups.appendChild(details);
  });
}

function renderNativeCallStacks() {
  const native = nativeReference();
  if (!elements.nativeCallStackList) return;
  elements.nativeCallStackList.replaceChildren();
  if (!native || !(native.call_stacks || []).length) {
    elements.nativeCallStackList.innerHTML = '<div class="empty">没有 native 调用栈数据。</div>';
    return;
  }

  const selected = elements.nativeStackFilter?.value || "all";
  const stacks = (native.call_stacks || []).filter((stack) => selected === "all" || stack.id === selected);
  stacks.forEach((stack) => {
    const card = document.createElement("section");
    card.className = "native-stack-card";
    card.innerHTML = `
      <div class="native-stack-head">
        <h3>${escapeHtml(stack.title || stack.id)}</h3>
        <p>${escapeHtml(stack.description || "")}</p>
      </div>
    `;
    const list = document.createElement("ol");
    list.className = "native-stack-steps";
    (stack.steps || []).forEach((step) => {
      const item = document.createElement("li");
      item.className = "native-stack-step";
      const canLink = step.node_id && nodeById(step.node_id);
      const symbolNode = canLink ? document.createElement("button") : document.createElement("code");
      if (canLink) {
        symbolNode.type = "button";
        symbolNode.className = "native-node-link";
        symbolNode.textContent = step.symbol;
        symbolNode.addEventListener("click", () => {
          selectNode(step.node_id);
          document.querySelector(".workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } else {
        symbolNode.textContent = step.symbol;
      }
      const role = document.createElement("p");
      role.textContent = step.role || "";
      item.appendChild(symbolNode);
      item.appendChild(role);
      list.appendChild(item);
    });
    card.appendChild(list);
    elements.nativeCallStackList.appendChild(card);
  });
}

function renderRuntimeOptimizations() {
  const native = nativeReference();
  if (!elements.runtimeOptimizationList) return;
  elements.runtimeOptimizationList.replaceChildren();
  if (!native || !(native.runtime_optimizations || []).length) {
    elements.runtimeOptimizationList.innerHTML = '<div class="empty">没有 runtime 优化数据。</div>';
    return;
  }

  const selected = elements.runtimeRiskFilter?.value || "all";
  const optimizations = (native.runtime_optimizations || []).filter((item) => {
    if (selected === "risk") return item.can_miss_optimal;
    if (selected === "safe") return !item.can_miss_optimal;
    return true;
  });

  optimizations.forEach((item) => {
    const riskClass = item.can_miss_optimal ? "possible-optimality-risk" : "safe-runtime-optimization";
    const riskText = item.can_miss_optimal ? "可能错过最优解" : "不改变候选/结果";
    const card = document.createElement("article");
    card.className = `runtime-card ${riskClass}`;
    card.innerHTML = `
      <div class="runtime-card-head">
        <div>
          <h3>${escapeHtml(item.symbol)}</h3>
          <p>${escapeHtml(item.stage || "")}</p>
        </div>
        <span class="risk-badge ${item.can_miss_optimal ? "is-risk" : "is-safe"}">${riskText}</span>
      </div>
      <dl class="runtime-card-body">
        <dt>位置</dt><dd><code>${escapeHtml(item.location || "")}</code></dd>
        <dt>优化目的</dt><dd>${escapeHtml(item.why_runtime || "")}</dd>
        <dt>行为</dt><dd>${escapeHtml(item.summary || "")}</dd>
        <dt>最优性说明</dt><dd>${escapeHtml(item.optimality_note || "")}</dd>
        <dt>验证/缓解</dt><dd>${escapeHtml(item.mitigation || "")}</dd>
      </dl>
    `;
    elements.runtimeOptimizationList.appendChild(card);
  });
}

function renderNativeCostModel() {
  const native = nativeReference();
  populateNativeStackFilter(native);
  renderNativeOverviewCards(native);
  renderNativeParameterGroups(native);
  renderNativeCallStacks();
  renderRuntimeOptimizations();
}

function renderFunctionList() {
  const nodes = sortNodes(filteredNodes());
  elements.functionList.replaceChildren();
  elements.listSummary.textContent = `${fmt(nodes.length)} / ${fmt(state.graph.summary.function_count)} shown`;

  if (nodes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "没有匹配到函数。可以换个关键字，或切回全部模块。";
    elements.functionList.appendChild(empty);
    return;
  }

  nodes.forEach((node) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `function-card${node.id === state.selectedId ? " is-selected" : ""}`;
    button.innerHTML = `
      <div class="function-card-title">${escapeHtml(node.id)}</div>
      <div class="function-card-meta">${escapeHtml(node.file)}:${node.line} • ${node.kind} • ${node.formula_count} formulas</div>
      <div class="function-card-meta">${node.incoming} callers / ${node.outgoing} callees</div>
      <div class="function-card-summary">${escapeHtml(node.summary || "")}</div>
    `;
    button.addEventListener("click", () => selectNode(node.id));
    elements.functionList.appendChild(button);
  });
}

function renderOverview() {
  const node = nodeById(state.selectedId);
  elements.overview.innerHTML = "";
  elements.selectedSummary.textContent = "";
  elements.guideSteps.innerHTML = "";
  elements.directLinks.innerHTML = "";

  if (!node) {
    elements.overview.innerHTML = '<div class="empty">没有可展示的函数。</div>';
    return;
  }

  elements.selectedSummary.textContent = `${node.formula_count} formulas • ${node.source_line_count} lines`;

  const rows = [
    ["Function", node.id],
    ["Module", node.module],
    ["Source", `${node.file}:${node.line}-${node.end_line}`],
    ["Kind", node.kind],
    ["Parameters", (node.parameters || []).join(", ") || "(none)"],
    ["Summary", node.summary || ""],
    ["Docstring", node.docstring || "(none)"],
    ["Internal Calls", `${node.incoming} callers / ${node.outgoing} callees`],
    ["External Calls", node.external_calls && node.external_calls.length ? node.external_calls.join(", ") : "(none)"],
  ];

  rows.forEach(([label, value]) => {
    const labelNode = document.createElement("div");
    labelNode.className = "label";
    labelNode.textContent = label;
    const valueNode = document.createElement("div");
    valueNode.className = "value";
    valueNode.textContent = value;
    elements.overview.appendChild(labelNode);
    elements.overview.appendChild(valueNode);
  });

  if (node.guide_steps && node.guide_steps.length) {
    const list = document.createElement("ol");
    list.className = "guide-list";
    node.guide_steps.forEach((step) => {
      const item = document.createElement("li");
      item.textContent = step;
      list.appendChild(item);
    });
    elements.guideSteps.appendChild(list);
  }

  const linkTargets = [
    ...((node.callers || []).slice(0, 6).map((id) => ({ id, prefix: "caller" }))),
    ...((node.callees || []).slice(0, 6).map((id) => ({ id, prefix: "callee" }))),
  ];
  linkTargets.forEach(({ id, prefix }) => {
    const related = nodeById(id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip-button";
    button.textContent = `${prefix}: ${related ? shortLabel(related) : id}`;
    button.addEventListener("click", () => selectNode(id));
    elements.directLinks.appendChild(button);
  });
}

function buildSymbolItem(symbol) {
  const node = document.createElement("div");
  node.className = "symbol-item";
  node.innerHTML = `<code>${escapeHtml(symbol)}</code><div>${escapeHtml(describeSymbol(symbol))}</div>`;
  return node;
}

function describeSymbol(symbol) {
  const current = nodeById(state.selectedId);
  if (!current) return symbol;
  const formula = (current.formulas || []).find((entry) => (entry.symbols || []).includes(symbol));
  if (!formula) return symbol;
  return symbol;
}

function renderFormulaList() {
  const node = nodeById(state.selectedId);
  elements.formulaList.replaceChildren();
  elements.formulaSummary.textContent = "";

  if (!node) {
    elements.formulaList.innerHTML = '<div class="empty">没有函数可展示。</div>';
    return;
  }

  const formulas = [...(node.formulas || [])].sort((left, right) => left.line - right.line);
  elements.formulaSummary.textContent = `${formulas.length} formulas extracted`;

  if (formulas.length === 0) {
    elements.formulaList.innerHTML = '<div class="empty">这个函数没有提取到明显的算式，通常意味着它更偏配置、包装或 I/O 逻辑。</div>';
    return;
  }

  formulas.forEach((formula, index) => {
    const details = document.createElement("details");
    details.className = "formula-card";
    details.open = index < 3;
    const factors = formula.factors || [];
    const terms = formula.terms || [];

    details.innerHTML = `
      <summary>
        <span class="formula-title">${escapeHtml(formula.target)}</span>
        <span class="line-badge">L${formula.line}</span>
        <span class="formula-badge">${escapeHtml(formula.kind)}</span>
      </summary>
      <div class="formula-body">
        <pre class="formula-code">${escapeHtml(formula.statement)}</pre>
        <p class="formula-explanation">${escapeHtml(formula.explanation)}</p>
      </div>
    `;

    const body = details.querySelector(".formula-body");

    if (factors.length) {
      const section = document.createElement("div");
      section.className = "formula-section";
      section.innerHTML = '<p class="formula-section-title">乘法项</p>';
      const row = document.createElement("div");
      row.className = "formula-chip-row";
      factors.forEach((factor) => {
        const chip = document.createElement("span");
        chip.className = "formula-chip";
        chip.innerHTML = `<code>${escapeHtml(factor)}</code>`;
        row.appendChild(chip);
      });
      section.appendChild(row);
      body.appendChild(section);
    }

    if (terms.length) {
      const section = document.createElement("div");
      section.className = "formula-section";
      section.innerHTML = '<p class="formula-section-title">加法项</p>';
      const row = document.createElement("div");
      row.className = "formula-chip-row";
      terms.forEach((term) => {
        const chip = document.createElement("span");
        chip.className = "formula-chip";
        chip.innerHTML = `<code>${escapeHtml(term)}</code>`;
        row.appendChild(chip);
      });
      section.appendChild(row);
      body.appendChild(section);
    }

    if (formula.symbols && formula.symbols.length) {
      const section = document.createElement("div");
      section.className = "formula-section";
      section.innerHTML = '<p class="formula-section-title">涉及变量</p>';
      const grid = document.createElement("div");
      grid.className = "symbol-grid";
      formula.symbols.forEach((symbol) => {
        const item = document.createElement("div");
        item.className = "symbol-item";
        item.innerHTML = `<code>${escapeHtml(symbol)}</code><div>${escapeHtml(symbolDescription(symbol))}</div>`;
        grid.appendChild(item);
      });
      section.appendChild(grid);
      body.appendChild(section);
    }

    elements.formulaList.appendChild(details);
  });
}

function symbolDescription(symbol) {
  const leaf = symbol.split(".").slice(-1)[0];
  const map = state.graph?.glossary || {};
  return map[symbol] || map[leaf] || "代码里的中间变量或配置项";
}

function renderSource() {
  const node = nodeById(state.selectedId);
  elements.sourceView.replaceChildren();
  elements.sourceSummary.textContent = "";

  if (!node) {
    elements.sourceView.innerHTML = '<div class="empty">没有函数源码可展示。</div>';
    return;
  }

  elements.sourceSummary.textContent = `${node.file}:${node.line}-${node.end_line}`;
  const formulaLines = new Set((node.formulas || []).map((formula) => Number(formula.line)));
  const lines = String(node.source_excerpt || "").split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNo = node.line + index;
    const row = document.createElement("div");
    row.className = `code-line${formulaLines.has(lineNo) ? " is-formula" : ""}`;
    row.innerHTML = `
      <span class="line-number">${lineNo}</span>
      <span class="code-text">${escapeHtml(line || " ")}</span>
    `;
    elements.sourceView.appendChild(row);
  });
}

function renderTree(direction) {
  const container = direction === "callers" ? elements.callerTree : elements.calleeTree;
  container.replaceChildren();

  const node = nodeById(state.selectedId);
  if (!node) {
    container.innerHTML = '<div class="empty">没有函数可展示。</div>';
    return;
  }

  container.appendChild(renderTreeNode(state.selectedId, direction, 0, new Set()));
}

function renderTreeNode(nodeId, direction, depth, path) {
  const node = nodeById(nodeId);
  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";
  if (!node) return wrapper;

  const children = getChildren(nodeId, direction);
  const expanded = getExpandedSet(direction).has(nodeId);
  const row = document.createElement("div");
  row.className = `tree-row${nodeId === state.selectedId ? " is-selected" : ""}`;
  row.style.setProperty("--depth", String(depth));

  if (children.length) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tree-toggle";
    toggle.textContent = expanded ? "−" : "+";
    toggle.addEventListener("click", () => {
      const set = getExpandedSet(direction);
      if (set.has(nodeId)) set.delete(nodeId);
      else set.add(nodeId);
      renderTree(direction);
    });
    row.appendChild(toggle);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "tree-toggle-placeholder";
    row.appendChild(placeholder);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "tree-node-button";
  button.innerHTML = `
    <div class="tree-node-title">${escapeHtml(node.id)}</div>
    <div class="tree-node-meta">${node.formula_count} formulas • ${node.incoming} in / ${node.outgoing} out</div>
  `;
  button.addEventListener("click", () => selectNode(nodeId));
  row.appendChild(button);
  wrapper.appendChild(row);

  if (!expanded || !children.length) {
    return wrapper;
  }

  const nextPath = new Set(path);
  nextPath.add(nodeId);
  children.forEach((childId) => {
    if (nextPath.has(childId)) {
      const cycle = document.createElement("div");
      cycle.className = "tree-row";
      cycle.style.setProperty("--depth", String(depth + 1));
      cycle.innerHTML = '<span class="tree-toggle-placeholder"></span><div class="empty">cycle omitted</div>';
      wrapper.appendChild(cycle);
      return;
    }
    wrapper.appendChild(renderTreeNode(childId, direction, depth + 1, nextPath));
  });
  return wrapper;
}

function collectVisibleTreeNodes(direction, nodeId, path = new Set()) {
  if (path.has(nodeId)) return [];
  const result = [nodeId];
  const expanded = getExpandedSet(direction);
  if (!expanded.has(nodeId)) return result;
  const nextPath = new Set(path);
  nextPath.add(nodeId);
  getChildren(nodeId, direction).forEach((childId) => {
    result.push(...collectVisibleTreeNodes(direction, childId, nextPath));
  });
  return result;
}

function expandOneLayer(direction) {
  if (!state.selectedId) return;
  const expanded = getExpandedSet(direction);
  collectVisibleTreeNodes(direction, state.selectedId).forEach((nodeId) => {
    if (getChildren(nodeId, direction).length) expanded.add(nodeId);
  });
  renderTree(direction);
}

function collapseTree(direction) {
  if (!state.selectedId) return;
  if (direction === "callers") state.expandedCallers = new Set([state.selectedId]);
  else state.expandedCallees = new Set([state.selectedId]);
  renderTree(direction);
}

function renderAll() {
  renderFunctionList();
  renderOverview();
  renderFormulaList();
  renderSource();
  renderTree("callers");
  renderTree("callees");
}

async function load() {
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`failed to load ${DATA_URL}`);
  state.graph = await response.json();
  state.graph.glossary = state.graph.glossary || {};
  indexGraph(state.graph);
  populateModules();
  renderMetrics();
  renderSummary();
  renderNativeCostModel();
  state.selectedId = chooseDefaultNode();
  resetExpansion();
  renderAll();
}

elements.searchInput.addEventListener("input", refreshSelection);
elements.moduleFilter.addEventListener("change", refreshSelection);
elements.formulaFilter.addEventListener("change", refreshSelection);
elements.resetButton.addEventListener("click", () => {
  elements.searchInput.value = "";
  elements.moduleFilter.value = "all";
  elements.formulaFilter.value = "all";
  refreshSelection();
});
elements.callerExpandButton.addEventListener("click", () => expandOneLayer("callers"));
elements.callerResetButton.addEventListener("click", () => collapseTree("callers"));
elements.calleeExpandButton.addEventListener("click", () => expandOneLayer("callees"));
elements.calleeResetButton.addEventListener("click", () => collapseTree("callees"));
elements.nativeStackFilter?.addEventListener("change", renderNativeCallStacks);
elements.runtimeRiskFilter?.addEventListener("change", renderRuntimeOptimizations);

load().catch((error) => {
  elements.summaryText.textContent = error.message;
});
