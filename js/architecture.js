const state = {
    report: null,
    audience: 'all',
    sectionId: null,
    tag: 'all',
    query: '',
    selectedPoint: null
};

const els = {
    title: document.getElementById('report-title'),
    subtitle: document.getElementById('report-subtitle'),
    metricSections: document.getElementById('metric-sections'),
    metricPoints: document.getElementById('metric-points'),
    metricScenarios: document.getElementById('metric-scenarios'),
    audienceTabs: document.getElementById('audience-tabs'),
    search: document.getElementById('architecture-search'),
    sectionList: document.getElementById('section-list'),
    tagList: document.getElementById('tag-list'),
    flow: document.getElementById('architecture-flow'),
    paperOutline: document.getElementById('paper-outline'),
    metricCatalog: document.getElementById('metric-catalog'),
    formulaCatalog: document.getElementById('formula-catalog'),
    scenarioGrid: document.getElementById('scenario-grid'),
    sectionLabel: document.getElementById('active-section-label'),
    sectionTitle: document.getElementById('active-section-title'),
    sectionSummary: document.getElementById('active-section-summary'),
    moduleStack: document.getElementById('module-stack'),
    pointGrid: document.getElementById('analysis-point-grid'),
    pointDetail: document.getElementById('point-detail')
};

function totalPoints(report) {
    return report.sections.reduce((total, section) => total + section.analysisPoints.length, 0);
}

function uniqueTags(report) {
    return [...new Set(report.sections.flatMap(section => section.tags))].sort();
}

function matchesAudience(section) {
    return state.audience === 'all' || section.audiences.includes(state.audience);
}

function matchesTag(section, point) {
    if (state.tag === 'all') return true;
    const text = `${section.tags.join(' ')} ${point.name} ${point.what}`.toLowerCase();
    return text.includes(state.tag.toLowerCase());
}

function matchesQuery(section, point) {
    if (!state.query) return true;
    const haystack = [
        section.title,
        section.summary,
        section.tags.join(' '),
        point.name,
        point.what,
        point.paperNote || '',
        (point.formulaRefs || []).join(' '),
        point.inputs.join(' '),
        point.outputs.join(' '),
        point.code.join(' ')
    ].join(' ').toLowerCase();
    return haystack.includes(state.query.toLowerCase());
}

function visiblePoints(section) {
    if (!matchesAudience(section)) return [];
    return section.analysisPoints.filter(point => matchesTag(section, point) && matchesQuery(section, point));
}

function activeSection() {
    const sections = state.report.sections;
    return sections.find(section => section.id === state.sectionId) || sections[0];
}

function setActiveSection(sectionId) {
    state.sectionId = sectionId;
    state.selectedPoint = null;
    render();
}

function setAudience(audienceId) {
    state.audience = audienceId;
    const current = activeSection();
    if (!matchesAudience(current)) {
        const next = state.report.sections.find(section => matchesAudience(section));
        state.sectionId = next ? next.id : state.report.sections[0].id;
    }
    state.selectedPoint = null;
    render();
}

function setTag(tag) {
    state.tag = tag;
    state.selectedPoint = null;
    render();
}

function button(text, active, onClick, className = '') {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `${className} ${active ? 'active' : ''}`.trim();
    el.textContent = text;
    el.addEventListener('click', onClick);
    return el;
}

function pill(text) {
    const span = document.createElement('span');
    span.className = 'architecture-pill';
    span.textContent = text;
    return span;
}

function renderHeader() {
    const { metadata, sections, scenarios } = state.report;
    els.title.textContent = metadata.title;
    els.subtitle.textContent = metadata.subtitle;
    els.metricSections.textContent = sections.length.toLocaleString('en-US');
    els.metricPoints.textContent = totalPoints(state.report).toLocaleString('en-US');
    els.metricScenarios.textContent = scenarios.length.toLocaleString('en-US');
}

function renderAudienceTabs() {
    els.audienceTabs.replaceChildren();
    els.audienceTabs.appendChild(button('All Readers', state.audience === 'all', () => setAudience('all'), 'audience-tab'));
    state.report.audiences.forEach(audience => {
        const tab = button(audience.label, state.audience === audience.id, () => setAudience(audience.id), 'audience-tab');
        tab.title = audience.summary;
        els.audienceTabs.appendChild(tab);
    });
}

function renderSectionList() {
    els.sectionList.replaceChildren();
    state.report.sections.forEach(section => {
        const count = visiblePoints(section).length;
        const item = button(`${section.title} (${count})`, state.sectionId === section.id, () => setActiveSection(section.id), 'section-list-item');
        item.disabled = count === 0;
        els.sectionList.appendChild(item);
    });
}

function renderTags() {
    els.tagList.replaceChildren();
    els.tagList.appendChild(button('all', state.tag === 'all', () => setTag('all'), 'tag-button'));
    uniqueTags(state.report).forEach(tag => {
        els.tagList.appendChild(button(tag, state.tag === tag, () => setTag(tag), 'tag-button'));
    });
}

function renderFlow() {
    els.flow.replaceChildren();
    state.report.architectureFlow.forEach((node, index) => {
        const item = document.createElement('div');
        item.className = 'flow-node';
        item.innerHTML = `
            <div class="flow-index">${index + 1}</div>
            <div>
                <h3>${node.title}</h3>
                <p>${node.summary}</p>
                <div class="flow-modules">${node.modules.map(module => `<span>${module}</span>`).join('')}</div>
            </div>
        `;
        els.flow.appendChild(item);
    });
}

function renderPaperOutline() {
    els.paperOutline.replaceChildren();
    state.report.paperOutline.forEach((section, index) => {
        const item = document.createElement('article');
        item.className = 'paper-outline-card';
        item.innerHTML = `
            <div class="paper-outline-index">${index + 1}</div>
            <div>
                <h3>${section.title}</h3>
                <p>${section.summary}</p>
                <h4>Analysis Focus</h4>
                ${listItems(section.analysisFocus)}
                <h4>Outputs</h4>
                <div class="paper-outline-tags">${section.outputs.map(output => `<span>${output}</span>`).join('')}</div>
            </div>
        `;
        item.addEventListener('click', () => {
            const target = state.report.sections.find(reportSection => reportSection.id === section.id);
            if (target) setActiveSection(target.id);
        });
        els.paperOutline.appendChild(item);
    });
}

function renderMetricCatalog() {
    els.metricCatalog.replaceChildren();
    state.report.keyMetrics.forEach(metric => {
        const item = document.createElement('article');
        item.className = 'metric-catalog-card';
        item.innerHTML = `
            <div>
                <h3>${metric.name}</h3>
                <p>${metric.meaning}</p>
            </div>
            <span>${metric.group}</span>
            <code>${metric.source}</code>
        `;
        els.metricCatalog.appendChild(item);
    });
}

function renderFormulaCatalog() {
    els.formulaCatalog.replaceChildren();
    state.report.formulas.forEach(formula => {
        const item = document.createElement('article');
        item.className = 'formula-card';
        item.innerHTML = `
            <h3>${formula.name}</h3>
            <code>${formula.expression}</code>
            <p>${formula.meaning}</p>
            <div class="formula-used-by">${formula.usedBy.map(target => `<span>${target}</span>`).join('')}</div>
        `;
        els.formulaCatalog.appendChild(item);
    });
}

function renderScenarios() {
    els.scenarioGrid.replaceChildren();
    state.report.scenarios.forEach(scenario => {
        const card = document.createElement('article');
        card.className = 'scenario-card';
        card.innerHTML = `
            <h3>${scenario.title}</h3>
            <p>${scenario.description}</p>
            <div class="scenario-tags">${scenario.tags.map(tag => `<span>${tag}</span>`).join('')}</div>
        `;
        card.addEventListener('click', () => {
            state.tag = scenario.tags[0] || 'all';
            render();
        });
        els.scenarioGrid.appendChild(card);
    });
}

function renderSection() {
    const section = activeSection();
    const points = visiblePoints(section);
    els.sectionLabel.textContent = `${section.id} / ${points.length} visible points`;
    els.sectionTitle.textContent = section.title;
    els.sectionSummary.textContent = section.summary;
    els.moduleStack.replaceChildren(...section.modules.map(module => pill(module)));

    els.pointGrid.replaceChildren();
    if (points.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state architecture-empty';
        empty.textContent = 'No analysis points match the current reader, tag, or search filters.';
        els.pointGrid.appendChild(empty);
        return;
    }

    points.forEach((point, index) => {
        const card = document.createElement('article');
        card.className = 'analysis-point-card';
        if (state.selectedPoint === point) card.classList.add('active');
        card.innerHTML = `
            <div class="analysis-point-number">${index + 1}</div>
            <div>
                <h3>${point.name}</h3>
                <p>${point.what}</p>
                <div class="analysis-point-code">${point.code.map(item => `<span>${item}</span>`).join('')}</div>
            </div>
        `;
        card.addEventListener('click', () => {
            state.selectedPoint = point;
            renderDetail();
            document.querySelectorAll('.analysis-point-card').forEach(el => el.classList.remove('active'));
            card.classList.add('active');
        });
        els.pointGrid.appendChild(card);
    });
}

function listItems(values) {
    return `<ul>${values.map(value => `<li>${value}</li>`).join('')}</ul>`;
}

function renderDetail() {
    const point = state.selectedPoint;
    if (!point) {
        els.pointDetail.className = 'point-detail-empty';
        els.pointDetail.textContent = 'Select a point to inspect inputs, outputs, and code references.';
        return;
    }
    els.pointDetail.className = 'point-detail';
    const formulaRefs = point.formulaRefs || [];
    const formulas = formulaRefs
        .map(ref => state.report.formulas.find(formula => formula.id === ref))
        .filter(Boolean);
    els.pointDetail.innerHTML = `
        <h3>${point.name}</h3>
        <p>${point.what}</p>
        ${point.paperNote ? `<h4>Paper Note</h4><p>${point.paperNote}</p>` : ''}
        ${formulas.length ? `<h4>Linked Formulas</h4>${formulas.map(formula => `<div class="detail-formula"><strong>${formula.name}</strong><code>${formula.expression}</code><p>${formula.meaning}</p></div>`).join('')}` : ''}
        <h4>Inputs</h4>
        ${listItems(point.inputs)}
        <h4>Outputs</h4>
        ${listItems(point.outputs)}
        <h4>Code References</h4>
        <div class="detail-code">${point.code.map(item => `<span>${item}</span>`).join('')}</div>
    `;
}

function render() {
    renderHeader();
    renderAudienceTabs();
    renderSectionList();
    renderTags();
    renderFlow();
    renderPaperOutline();
    renderMetricCatalog();
    renderFormulaCatalog();
    renderScenarios();
    renderSection();
    renderDetail();
}

async function init() {
    const response = await fetch('data/cost_model_architecture.json');
    if (!response.ok) throw new Error(`Unable to load architecture report: ${response.status}`);
    state.report = await response.json();
    state.sectionId = state.report.sections[0].id;
    els.search.addEventListener('input', event => {
        state.query = event.target.value.trim();
        state.selectedPoint = null;
        render();
    });
    render();
}

init().catch(error => {
    els.sectionTitle.textContent = 'Failed to load report';
    els.sectionSummary.textContent = error.message;
});
