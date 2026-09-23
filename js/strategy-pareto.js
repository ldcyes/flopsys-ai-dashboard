import { loadStrategyPayload, strategyPayloadOptions } from './data.js?v=display-data-v2';
import {
    filterStrategyDescriptors,
    filterStrategyPoints,
    frontierRowsForSelection,
    loadCachedStrategyPayload,
    maximumBy,
    preferredStrategyDescriptorSelection,
    strategyFeatures,
    strategyTier
} from './dashboard-data.js?v=display-data-v2';

const state = {
    webInputs: null,
    currentConfig: null,
    configKey: '',
    descriptors: [],
    payloadCache: new Map(),
    points: [],
    pointDescriptors: new WeakMap(),
    loadedDescriptorKey: '',
    selectedPointKey: '',
    colorMode: 'strategy',
    showLabels: false,
    bound: false,
    requestId: 0
};

const IMPLICIT_ATTENTION_CP = '1';
const STRATEGY_FRONTIER_POINT_RADIUS = '4.5';
const HARDWARE_COLOR_PALETTE = [
    '#ff6b4a',
    '#22d3ee',
    '#a78bfa',
    '#34d399',
    '#f59e0b',
    '#f472b6',
    '#60a5fa',
    '#facc15',
    '#fb7185',
    '#2dd4bf',
    '#c084fc',
    '#a3e635'
];
const MUTED_SERIES_COLOR = '#94a3b8';

const CONFIG_FIELDS = [
    { key: 'strategy_type', label: 'strategy' },
    { key: 'batch', label: 'batch' },
    { key: 'pp', label: 'pp' },
    { key: 'attn_dp', label: 'attn dp' },
    { key: 'attn_tp', label: 'attn tp' },
    { key: 'attn_cp', label: 'attn cp' },
    { key: 'ffn_ep', label: 'ffn ep' },
    { key: 'ffn_tp', label: 'ffn tp' },
    { key: 'mtp_stage', label: 'mtp stage' },
    { key: 'pd_enabled', label: 'pd' },
    { key: 'af_enabled', label: 'af' },
    { key: 'prefill_gpu_num', label: 'prefill gpu' },
    { key: 'decode_gpu_num', label: 'decode gpu' }
];

const STRATEGY_STYLES = {
    monolithic: { label: 'monolithic', color: '#94a3b8' },
    mtp: { label: 'mtp', color: '#f59e0b' },
    pd: { label: 'PD', color: '#34d399' },
    af: { label: 'AF', color: '#c084fc' }
};
const STRATEGY_FILTER_OPTIONS = ['mtp', 'pd', 'af'];
const DEFAULT_STRATEGY_FILTER_OPTIONS = STRATEGY_FILTER_OPTIONS;
const STRATEGY_FEATURE_LABELS = {
    mtp: 'MTP',
    pd: 'PD split',
    af: 'A/F split'
};
const STRATEGY_FILTER_LABELS = {
    mtp: 'MTP',
    pd: 'PD',
    af: 'AF'
};
const FIXED_ATTENTION_CP_VALUES = ['1', '2', '4', '8'];
const FIXED_MTP_STAGES = Array.from({ length: 10 }, (_, index) => String(index));
const COMPUTE_COMPONENTS = [
    { key: 'mla_time_s', label: 'MLA' },
    { key: 'dense_mlp_time_s', label: 'Dense MLP' },
    { key: 'shared_expert_time_s', label: 'Shared Expert' },
    { key: 'routed_expert_time_s', label: 'Routed expert' },
    { key: 'final_linear_softmax_time_s', label: 'Final linear softmax' }
];
const COMMUNICATION_COMPONENTS = [
    { key: 'load_kv_time_s', label: 'Load KV' },
    { key: 'dispatch_time_s', label: 'Dispatch' },
    { key: 'combine_time_s', label: 'Combine' },
    { key: 'mla_all_reduce_time_s', label: 'MLA all-reduce' },
    { key: 'mla_cp_ring_time_s', label: 'MLA CP ring' },
    { key: 'ffn_all_reduce_time_s', label: 'FFN all-reduce' },
    { key: 'pd_transfer_time_s', label: 'PD transfer' },
    { key: 'decode_attn_ffn_transfer_time_s', label: 'Decode A/F transfer' }
];
const BOTTLENECK_CLASSES = ['gpc', 'sm', 'l2', 'hbm', 'compute', 'd2d'];

function number(value) {
    if (value === undefined || value === null || value === '') return 0;
    return Number(value);
}

function formatInt(value) {
    return Math.round(number(value)).toLocaleString('en-US');
}

function hasValue(value) {
    return value !== undefined && value !== null && value !== '' && !Number.isNaN(value);
}

function formatConfigValue(value) {
    if (typeof value === 'boolean') return value ? 'on' : 'off';
    if (value === 'true' || value === 'True') return 'on';
    if (value === 'false' || value === 'False') return 'off';
    const numeric = Number(value);
    const text = String(value).trim();
    if (text !== '' && Number.isFinite(numeric)) {
        return Number.isInteger(numeric) ? String(numeric) : numeric.toPrecision(4).replace(/0+$/, '').replace(/\.$/, '');
    }
    return String(value);
}

function displayValue(value, fallback = '-') {
    return hasValue(value) ? formatConfigValue(value) : fallback;
}

function safeId(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function element(id) {
    return document.getElementById(id);
}

function uniqueValues(rows, getter) {
    return [...new Set(rows.map(getter).filter(value => value !== undefined && value !== null && value !== ''))]
        .sort((a, b) => {
            const an = Number(a);
            const bn = Number(b);
            if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
            return String(a).localeCompare(String(b));
        });
}

function renderCheckboxGroup(containerId, values, selectedValues, labelFor = value => value) {
    const container = element(containerId);
    if (!container) return;
    const selected = new Set([...selectedValues].map(String));
    container.innerHTML = values.map(value => {
        const text = labelFor(value);
        const id = `${containerId}-${safeId(value)}`;
        const checked = selected.has(String(value)) ? ' checked' : '';
        return `
            <div class="checkbox-item">
                <input type="checkbox" id="${id}" value="${escapeHtml(value)}"${checked}>
                <label for="${id}">${escapeHtml(text)}</label>
            </div>
        `;
    }).join('');
}

function strategyColorFor(strategy) {
    return STRATEGY_STYLES[strategy]?.color || '#94a3b8';
}

function strategyLabelFor(strategy) {
    return STRATEGY_STYLES[strategy]?.label || String(strategy).replaceAll('_', ' / ');
}

function syncColorMode() {
    const checked = document.querySelector('input[name="strategy-color-mode"]:checked');
    state.colorMode = checked?.value === 'strategy' ? 'strategy' : 'hardware';
}

function hardwareSwatchColor(hardware) {
    return state.colorMode === 'hardware' ? hardwareColorFor(hardware) : MUTED_SERIES_COLOR;
}

function strategySwatchColor(strategy) {
    return state.colorMode === 'strategy' ? strategyColorFor(strategy) : MUTED_SERIES_COLOR;
}

function selectedRangeValue(sliderId, values) {
    const slider = element(sliderId);
    if (!slider || !values.length) return '';
    const index = Math.max(0, Math.min(Number(slider.value || 0), values.length - 1));
    return String(values[index]);
}

function selectedRangeValues(sliderId, values) {
    const slider = element(sliderId);
    if (!slider || !values.length) return [];
    const index = Math.max(0, Math.min(Number(slider.value || 0), values.length - 1));
    return values.slice(0, index + 1).map(String);
}

function formatRangeSelection(values, index) {
    if (!values.length) return '-';
    const safeIndex = Math.max(0, Math.min(Number(index) || 0, values.length - 1));
    const first = String(values[0]);
    const current = String(values[safeIndex]);
    return first === current ? current : `${first}-${current}`;
}

function configureRangeSlider(sliderId, labelId, values, fallbackValue) {
    const slider = element(sliderId);
    const label = element(labelId);
    if (!slider || !values.length) return;
    const configured = slider.dataset?.configured === 'true';
    const previous = configured ? selectedRangeValue(sliderId, values) : '';
    const value = values.includes(previous) ? previous : (values.includes(String(fallbackValue)) ? String(fallbackValue) : values[0]);
    const index = Math.max(values.indexOf(value), 0);
    slider.min = '0';
    slider.max = String(values.length - 1);
    slider.step = '1';
    slider.value = String(index);
    if (slider.dataset) slider.dataset.configured = 'true';
    if (label) label.textContent = formatRangeSelection(values, index);
}

function updateRangeSliderLabel(sliderId, labelId, values) {
    const label = element(labelId);
    const slider = element(sliderId);
    if (label) label.textContent = formatRangeSelection(values, Number(slider?.value || 0));
}

function renderHardwareCheckboxes(values, selectedValues) {
    const container = element('strategy-hardware-group');
    if (!container) return;
    const selected = new Set([...selectedValues].map(String));
    container.innerHTML = values.map(value => {
        const id = `strategy-hardware-group-${safeId(value)}`;
        const checked = selected.has(String(value)) ? ' checked' : '';
        return `
            <div class="checkbox-item strategy-gpu-checkbox">
                <input type="checkbox" id="${id}" value="${escapeHtml(value)}"${checked}>
                <label for="${id}">
                    <span class="strategy-gpu-line-swatch${state.colorMode === 'hardware' ? '' : ' is-muted'}" style="--gpu-color:${escapeHtml(hardwareSwatchColor(value))}"></span>
                    ${escapeHtml(value)}
                </label>
            </div>
        `;
    }).join('');
}

function renderStrategyTypeCheckboxes(values, selectedValues) {
    const container = element('strategy-type-group');
    if (!container) return;
    const selected = new Set([...selectedValues].map(String));
    container.innerHTML = values.map(value => {
        const id = `strategy-type-group-${safeId(value)}`;
        const checked = selected.has(String(value)) ? ' checked' : '';
        return `
            <div class="checkbox-item">
                <input type="checkbox" id="${id}" value="${escapeHtml(value)}"${checked}>
                <label for="${id}">
                    <span class="strategy-line-swatch${state.colorMode === 'strategy' ? '' : ' is-muted'}" style="--strategy-color:${escapeHtml(strategySwatchColor(value))}"></span>
                    ${escapeHtml(STRATEGY_FILTER_LABELS[value] || STRATEGY_FEATURE_LABELS[value] || strategyLabelFor(value))}
                </label>
            </div>
        `;
    }).join('');
}

function isMtpPoint(point) {
    return strategyFeatures(point).has('mtp');
}

function availableStrategyFilterOptions(points) {
    return STRATEGY_FILTER_OPTIONS;
}

function defaultStrategyFilterSelection(strategies) {
    return DEFAULT_STRATEGY_FILTER_OPTIONS;
}

function checkedValues(containerId) {
    const container = element(containerId);
    if (!container) return [];
    return [...container.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
}

function selectedValuesIn(containerId, values) {
    const available = new Set(values.map(value => String(value)));
    return checkedValues(containerId).filter(value => available.has(String(value)));
}

function checkboxGroupInitialized(containerId) {
    return Boolean(element(containerId)?.querySelector('input[type="checkbox"]'));
}

function selectedOrDefault(containerId, values, fallbackValues) {
    if (!checkboxGroupInitialized(containerId)) return fallbackValues;
    return selectedValuesIn(containerId, values);
}

function descriptorHardwareValues() {
    const descriptorHardware = state.descriptors.flatMap(descriptor =>
        Array.isArray(descriptor.hardware) ? descriptor.hardware : []
    );
    return uniqueValues(descriptorHardware, value => value);
}

function descriptorGpuNumValues() {
    const descriptorGpuNums = state.descriptors.flatMap(descriptor =>
        Array.isArray(descriptor.gpuNums) ? descriptor.gpuNums : []
    );
    return uniqueValues(descriptorGpuNums, value => value).map(String);
}

function fixedHardwareValues() {
    return descriptorHardwareValues();
}

function fixedGpuNumValues() {
    return descriptorGpuNumValues();
}

function setText(id, value) {
    const target = element(id);
    if (target) target.textContent = value;
}

function setNote(value) {
    setText('strategy-pareto-note', value);
}

function yValue(point) {
    return number(point.throughput_total_tps ?? point.tps_per_gpu);
}

function overviewFilterState() {
    const attnCps = selectedRangeValues('attn-cp-slider', FIXED_ATTENTION_CP_VALUES);
    if (!attnCps.length) attnCps.push(IMPLICIT_ATTENTION_CP);
    return {
        hardware: checkedValues('strategy-hardware-group'),
        gpu_num: checkedValues('strategy-gpu-num-group'),
        strategy_tier: checkedValues('strategy-type-group'),
        batch: state.currentConfig?.batch || [],
        pp: state.currentConfig?.pp || [],
        attn_tp: state.currentConfig?.attnTP || [],
        ffn_tp: state.currentConfig?.ffnTP || [],
        attn_cp: attnCps,
        mtp_stage: selectedRangeValues('strategy-stage-slider', FIXED_MTP_STAGES)
    };
}

function gpuDomainPoints() {
    const hardware = new Set(checkedValues('strategy-hardware-group'));
    const gpuNums = new Set(checkedValues('strategy-gpu-num-group'));
    return state.points.filter(point => {
        if (hardware.size && !hardware.has(String(point.hardware))) return false;
        if (gpuNums.size && !gpuNums.has(String(point.gpu_num))) return false;
        return true;
    });
}

function frontierGroups(points, frontierPoints) {
    const groups = [];
    const seen = new Set();
    frontierPoints.forEach(point => {
        const hardware = String(point.hardware);
        const gpuNum = String(point.gpu_num);
        const tier = strategyTier(point);
        const key = JSON.stringify([hardware, gpuNum, tier]);
        if (!seen.has(key)) {
            seen.add(key);
            groups.push({ key, hardware, gpuNum, tier });
        }
    });
    return groups.map(({ key, hardware, gpuNum, tier }) => {
        const groupPoints = points.filter(point =>
            String(point.hardware) === hardware &&
            String(point.gpu_num) === gpuNum &&
            strategyTier(point) === tier
        );
        return {
            key,
            hardware,
            gpu_num: Number(gpuNum),
            strategy_type: tier,
            label: `${STRATEGY_STYLES[tier]?.label || tier} ${hardware} ${gpuNum} GPU`,
            points: groupPoints,
            frontier: frontierPoints.filter(point =>
                String(point.hardware) === hardware &&
                String(point.gpu_num) === gpuNum &&
                strategyTier(point) === tier
            )
        };
    });
}

function groupColor(index) {
    return HARDWARE_COLOR_PALETTE[index % HARDWARE_COLOR_PALETTE.length];
}

function hardwareColorFor(hardware) {
    const hardwareValues = fixedHardwareValues().map(String);
    const index = hardwareValues.indexOf(String(hardware));
    return groupColor(index >= 0 ? index : 0);
}

function frontierColorFor(group, index) {
    return state.colorMode === 'strategy' ? strategyColorFor(group.strategy_type) : hardwareColorFor(group.hardware);
}

function pointLabel(point) {
    const stage = isMtpPoint(point) && hasValue(point.mtp_stage) ? ` s${point.mtp_stage}` : '';
    return `${point.hardware} ${point.gpu_num}G ${String(point.strategy_type).replaceAll('_', '+')}${stage}`;
}

function configSummary(point) {
    const parts = [
        String(point.strategy_type || '').replaceAll('_', '+'),
        hasValue(point.batch) ? `b${formatConfigValue(point.batch)}` : '',
        hasValue(point.pp) ? `pp${formatConfigValue(point.pp)}` : '',
        hasValue(point.attn_dp) ? `aDP${formatConfigValue(point.attn_dp)}` : '',
        hasValue(point.attn_tp) ? `aTP${formatConfigValue(point.attn_tp)}` : '',
        hasValue(point.attn_cp) ? `aCP${formatConfigValue(point.attn_cp)}` : '',
        hasValue(point.ffn_ep) ? `fEP${formatConfigValue(point.ffn_ep)}` : '',
        hasValue(point.ffn_tp) ? `fTP${formatConfigValue(point.ffn_tp)}` : '',
        isMtpPoint(point) && hasValue(point.mtp_stage) ? `s${formatConfigValue(point.mtp_stage)}` : '',
        point.pd_enabled ? 'PD' : '',
        point.af_enabled ? 'AF' : '',
        hasValue(point.prefill_gpu_num) && hasValue(point.decode_gpu_num)
            ? `${formatConfigValue(point.prefill_gpu_num)}+${formatConfigValue(point.decode_gpu_num)}G`
            : ''
    ].filter(Boolean);
    return parts.length ? parts.join(' ') : pointLabel(point);
}

function descriptorForPoint(point) {
    return state.pointDescriptors.get(point) || null;
}

function showTooltip(event, point) {
    const tooltip = element('strategy-chart-tooltip');
    if (!tooltip) return;
    const descriptor = descriptorForPoint(point);
    tooltip.innerHTML = `
        <strong>${escapeHtml(pointLabel(point))}</strong>
        dataset: ${escapeHtml(descriptor?.label || '-')}<br>
        TPS/user: ${formatInt(point.tps_per_user)}<br>
        total throughput: ${formatInt(point.throughput_total_tps)}<br>
        throughput/GPU: ${formatInt(point.tps_per_gpu)}<br>
        ${isMtpPoint(point) && hasValue(point.mtp_stage) ? `MTP stage: ${escapeHtml(point.mtp_stage)}<br>` : ''}
        ${point.pd_enabled ? `PD split: ${escapeHtml(point.prefill_gpu_num ?? '')}+${escapeHtml(point.decode_gpu_num ?? '')}<br>` : ''}
        ${point.af_enabled ? `A/F split: ${escapeHtml(point.decode_attention_gpu || point.hardware)} / ${escapeHtml(point.decode_ffn_gpu || 'groq-lpx3')}<br>` : ''}
        attn dp/tp/cp: ${escapeHtml(displayValue(point.attn_dp))}/${escapeHtml(displayValue(point.attn_tp))}/${escapeHtml(displayValue(point.attn_cp))}<br>
        ffn ep/tp: ${escapeHtml(displayValue(point.ffn_ep))}/${escapeHtml(displayValue(point.ffn_tp))}<br>
        bottleneck: ${escapeHtml(point.bottleneck || '-')}
    `;
    positionTooltip(tooltip, element('strategy-pareto-chart')?.parentElement, event.clientX, event.clientY);
}

function hideTooltip() {
    const tooltip = element('strategy-chart-tooltip');
    if (tooltip) tooltip.style.display = 'none';
}

function positionTooltip(tooltip, frame, clientX, clientY) {
    if (!tooltip || !frame) return;
    const rect = frame.getBoundingClientRect();
    tooltip.style.display = 'block';
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';

    const gap = 14;
    const inset = 8;
    const tooltipWidth = tooltip.offsetWidth || 320;
    const tooltipHeight = tooltip.offsetHeight || 120;
    const maxLeft = Math.max(inset, rect.width - tooltipWidth - inset);
    const maxTop = Math.max(inset, rect.height - tooltipHeight - inset);
    const left = Math.min(Math.max(clientX - rect.left + gap, inset), maxLeft);
    const top = Math.min(Math.max(clientY - rect.top + gap, inset), maxTop);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function pointKey(point) {
    return [
        descriptorForPoint(point)?.id,
        point.hardware,
        point.gpu_num,
        point.strategy_type,
        point.tps_per_user,
        point.throughput_total_tps,
        point.batch,
        point.pp,
        point.attn_dp,
        point.attn_tp,
        point.attn_cp,
        point.ffn_ep,
        point.ffn_tp,
        point.mtp_stage,
        point.prefill_gpu_num,
        point.decode_gpu_num,
        point.decode_attention_gpu,
        point.decode_ffn_gpu
    ].map(value => hasValue(value) ? String(value) : '').join('|');
}

function isSelectedPoint(point) {
    return Boolean(state.selectedPointKey) && pointKey(point) === state.selectedPointKey;
}

function selectPoint(point) {
    state.selectedPointKey = pointKey(point);
    hideTooltip();
    renderFiltered();
}

function bindPointInteraction(node, point) {
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
    node.style.cursor = 'pointer';
    node.addEventListener('mousemove', event => showTooltip(event, point));
    node.addEventListener('mouseleave', hideTooltip);
    node.addEventListener('click', () => selectPoint(point));
    node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectPoint(point);
        }
    });
}

function formatSeconds(value) {
    if (!hasValue(value)) return '-';
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return formatConfigValue(value);
    const abs = Math.abs(numeric);
    if (numeric === 0) return '0 s';
    if (abs >= 1) return `${numeric.toFixed(4)} s`;
    if (abs >= 1e-3) return `${(numeric * 1e3).toFixed(3)} ms`;
    if (abs >= 1e-6) return `${(numeric * 1e6).toFixed(3)} us`;
    return `${(numeric * 1e9).toFixed(3)} ns`;
}

function bottleneckClassLabel(value) {
    const text = String(value || '').toLowerCase();
    for (const candidate of BOTTLENECK_CLASSES) {
        if (text.includes(candidate)) {
            return candidate.toUpperCase();
        }
    }
    if (/dispatch|combine|reduce|ring|transfer|noc|link|comm/.test(text)) return 'D2D';
    if (/mla|mlp|expert|linear|softmax|gemm|compute/.test(text)) return 'COMPUTE';
    return value ? formatConfigValue(value) : '-';
}

function pointBottleneckSource(point) {
    return hasValue(point.bottleneck) ? point.bottleneck : '';
}

function bottleneckChips(point) {
    const source = String(pointBottleneckSource(point) || '').toLowerCase();
    const inferred = bottleneckClassLabel(source).toLowerCase();
    return BOTTLENECK_CLASSES.map(name => {
        const active = source.includes(name) || inferred === name;
        return `<span class="strategy-bottleneck-chip${active ? ' active' : ''}">${escapeHtml(name.toUpperCase())}</span>`;
    }).join('');
}

function componentRows(point, components) {
    return components
        .map(component => ({
            ...component,
            value: point[component.key]
        }))
        .filter(row => hasValue(row.value));
}

function rowMagnitude(row) {
    const numeric = Number(row.value);
    return Number.isFinite(numeric) ? Math.abs(numeric) : 0;
}

function renderOpBarChart(title, rows) {
    if (!rows.length) {
        return `
            <div class="strategy-op-card">
                <h3>${escapeHtml(title)}</h3>
                <p class="member-bio">No timing fields are available for this category.</p>
            </div>
        `;
    }
    const maxTime = maximumBy(rows, rowMagnitude, 0);
    const body = [...rows]
        .sort((a, b) => rowMagnitude(b) - rowMagnitude(a))
        .map(row => {
            const magnitude = rowMagnitude(row);
            const share = maxTime > 0 ? Math.max(magnitude / maxTime * 100, magnitude > 0 ? 2 : 0) : 0;
            return `
                <div class="strategy-op-bar-row">
                    <div class="strategy-op-bar-label">${escapeHtml(row.label)}</div>
                    <div class="strategy-op-bar-track" aria-hidden="true">
                        <span class="strategy-op-bar-fill" style="--op-share:${share.toFixed(2)}%"></span>
                    </div>
                    <div class="strategy-op-bar-meta">
                        <span class="strategy-op-time">${escapeHtml(formatSeconds(row.value))}</span>
                    </div>
                </div>
            `;
        }).join('');
    return `
        <div class="strategy-op-card">
            <h3>${escapeHtml(title)}</h3>
            <div class="strategy-op-bar-chart">${body}</div>
        </div>
    `;
}

function renderPointDetail(point) {
    const container = element('strategy-point-detail');
    if (!container) return;
    if (!point) {
        container.innerHTML = `
            <div class="section-title">Selected point details</div>
            <p class="member-bio">Click a point on the chart to inspect operator time and bottleneck details.</p>
        `;
        return;
    }

    const features = [...strategyFeatures(point)].map(value => STRATEGY_FEATURE_LABELS[value] || value.toUpperCase()).join(' + ') || 'baseline';
    const metricCards = [
        ['GPU', `${point.hardware} ${formatInt(point.gpu_num)} GPU`],
        ['Strategy', `${strategyLabelFor(point.strategy_type)} (${features})`],
        ['TPS/user', formatInt(point.tps_per_user)],
        ['Total TPS', formatInt(point.throughput_total_tps)],
        ['TPS/GPU', formatInt(point.tps_per_gpu)],
        ['Batch', displayValue(point.batch)],
        ['MTP stage', isMtpPoint(point) ? displayValue(point.mtp_stage) : '-'],
        ['Bottleneck', bottleneckClassLabel(pointBottleneckSource(point))]
    ].map(([label, value]) => `
        <div class="strategy-detail-card">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `).join('');

    const computeRows = componentRows(point, COMPUTE_COMPONENTS);
    const communicationRows = componentRows(point, COMMUNICATION_COMPONENTS);
    container.innerHTML = `
        <div class="section-title">Selected point details</div>
        <div class="strategy-detail-grid">${metricCards}</div>
        <div class="strategy-bottleneck-chips" aria-label="Compute bottleneck classes">${bottleneckChips(point)}</div>
        <div class="strategy-op-columns">
            ${renderOpBarChart('Compute ops', computeRows)}
            ${renderOpBarChart('Communication ops', communicationRows)}
        </div>
    `;
}

function parallelSummary(point) {
    return [
        `pp ${displayValue(point.pp)}`,
        `attn ${displayValue(point.attn_dp)}/${displayValue(point.attn_tp)}/${displayValue(point.attn_cp)}`,
        `ffn ${displayValue(point.ffn_ep)}/${displayValue(point.ffn_tp)}`
    ].join(' | ');
}

function renderFrontierTable(groups) {
    const tbody = element('strategy-frontier-table');
    if (!tbody) return;
    const rows = groups.flatMap(group =>
        group.frontier.map((point, index) => ({
            point,
            previous: index > 0 ? group.frontier[index - 1] : null
        }))
    );
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7">No Pareto frontier points match the current filters.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(({ point, previous }) => {
        const key = pointKey(point);
        const selected = isSelectedPoint(point) ? ' class="is-selected"' : '';
        return `
            <tr${selected} data-point-key="${escapeHtml(key)}">
                <td>${escapeHtml(point.hardware)}<br><span>${escapeHtml(displayValue(point.gpu_num))} GPU</span></td>
                <td>${escapeHtml(strategyLabelFor(point.strategy_type))}</td>
                <td>${escapeHtml(formatInt(point.tps_per_user))}</td>
                <td>${escapeHtml(formatInt(yValue(point)))}</td>
                <td>${escapeHtml(displayValue(point.batch))}</td>
                <td>${escapeHtml(parallelSummary(point))}</td>
                <td>${escapeHtml(parameterDelta(point, previous))}</td>
            </tr>
        `;
    }).join('');
    tbody.querySelectorAll('tr[data-point-key]').forEach(row => {
        const key = row.getAttribute('data-point-key');
        const match = rows.find(item => pointKey(item.point) === key);
        if (match) {
            row.addEventListener('click', () => selectPoint(match.point));
        }
    });
}

function renderChart(points, groups, domainPoints = points) {
    const svg = element('strategy-pareto-chart');
    if (!svg) return;
    svg.replaceChildren();
    const scalePoints = domainPoints.length ? domainPoints : points;
    if (!scalePoints.length) return;
    const width = svg.clientWidth || 960;
    const height = svg.clientHeight || 500;
    const margin = { top: 24, right: 28, bottom: 54, left: 90 };
    const plotWidth = Math.max(width - margin.left - margin.right, 1);
    const plotHeight = Math.max(height - margin.top - margin.bottom, 1);
    const maxX = maximumBy(scalePoints, point => number(point.tps_per_user), 1) * 1.08;
    const maxY = maximumBy(scalePoints, yValue, 1) * 1.08;
    const x = value => margin.left + number(value) / maxX * plotWidth;
    const y = value => margin.top + plotHeight - number(value) / maxY * plotHeight;
    const create = name => document.createElementNS('http://www.w3.org/2000/svg', name);

    for (let i = 0; i <= 5; i += 1) {
        const gx = margin.left + i / 5 * plotWidth;
        const gy = margin.top + i / 5 * plotHeight;
        const vLine = create('line');
        vLine.setAttribute('x1', gx);
        vLine.setAttribute('x2', gx);
        vLine.setAttribute('y1', margin.top);
        vLine.setAttribute('y2', margin.top + plotHeight);
        vLine.setAttribute('stroke', 'rgba(154, 166, 188, 0.18)');
        svg.appendChild(vLine);

        const hLine = create('line');
        hLine.setAttribute('x1', margin.left);
        hLine.setAttribute('x2', margin.left + plotWidth);
        hLine.setAttribute('y1', gy);
        hLine.setAttribute('y2', gy);
        hLine.setAttribute('stroke', 'rgba(154, 166, 188, 0.18)');
        svg.appendChild(hLine);

        const xTick = create('text');
        xTick.setAttribute('x', gx);
        xTick.setAttribute('y', height - 26);
        xTick.setAttribute('text-anchor', 'middle');
        xTick.setAttribute('fill', '#9aa6bc');
        xTick.setAttribute('font-size', '11');
        xTick.textContent = formatInt(maxX * i / 5);
        svg.appendChild(xTick);

        const yTick = create('text');
        yTick.setAttribute('x', margin.left - 10);
        yTick.setAttribute('y', margin.top + plotHeight - i / 5 * plotHeight + 4);
        yTick.setAttribute('text-anchor', 'end');
        yTick.setAttribute('fill', '#9aa6bc');
        yTick.setAttribute('font-size', '11');
        yTick.textContent = formatInt(maxY * i / 5);
        svg.appendChild(yTick);
    }

    const xAxis = create('text');
    xAxis.setAttribute('x', margin.left + plotWidth / 2);
    xAxis.setAttribute('y', height - 6);
    xAxis.setAttribute('text-anchor', 'middle');
    xAxis.setAttribute('fill', '#edf2ff');
    xAxis.setAttribute('font-size', '12');
    xAxis.textContent = 'TPS per user';
    svg.appendChild(xAxis);

    const yAxis = create('text');
    yAxis.setAttribute('transform', `translate(20 ${margin.top + plotHeight / 2}) rotate(-90)`);
    yAxis.setAttribute('text-anchor', 'middle');
    yAxis.setAttribute('fill', '#edf2ff');
    yAxis.setAttribute('font-size', '12');
    yAxis.textContent = 'total throughput';
    svg.appendChild(yAxis);

    groups.forEach((group, index) => {
        const color = frontierColorFor(group, index);
        if (group.frontier.length > 1) {
            const line = create('polyline');
            line.setAttribute('points', group.frontier.map(point => `${x(point.tps_per_user)},${y(yValue(point))}`).join(' '));
            line.setAttribute('fill', 'none');
            line.setAttribute('stroke', color);
            line.setAttribute('stroke-width', '2.4');
            svg.appendChild(line);
        }
        group.frontier.forEach((point, frontierIndex) => {
            const previous = frontierIndex === 0 ? null : group.frontier[frontierIndex - 1];
            const selected = isSelectedPoint(point);
            const circle = create('circle');
            circle.setAttribute('cx', x(point.tps_per_user));
            circle.setAttribute('cy', y(yValue(point)));
            circle.setAttribute('r', selected ? '6' : STRATEGY_FRONTIER_POINT_RADIUS);
            circle.setAttribute('fill', '#10131a');
            circle.setAttribute('stroke', selected ? '#ffffff' : color);
            circle.setAttribute('stroke-width', selected ? '3' : '2.1');
            bindPointInteraction(circle, point);
            svg.appendChild(circle);

            if (state.showLabels) {
                const label = create('text');
                label.setAttribute('x', x(point.tps_per_user) + 9);
                label.setAttribute('y', y(yValue(point)) - 8);
                label.setAttribute('fill', '#edf2ff');
                label.setAttribute('font-size', '11');
                label.textContent = frontierPointLabel(point, previous);
                svg.appendChild(label);
            }
        });
    });
}

function parameterDelta(current, previous) {
    if (!previous) return 'frontier start';
    const changes = CONFIG_FIELDS
        .filter(({ key }) => displayValue(current[key], '') !== displayValue(previous[key], ''))
        .map(({ key, label }) => `${label}: ${displayValue(previous[key])} -> ${displayValue(current[key])}`);
    return changes.length ? changes.join('; ') : 'same parameters';
}

function frontierPointLabel(current, previous) {
    return previous ? parameterDelta(current, previous) : configSummary(current);
}

function renderFiltered() {
    syncColorMode();
    syncMtpStageControl();
    state.showLabels = Boolean(element('strategy-labels-toggle')?.checked);
    const filters = overviewFilterState();
    const points = filterStrategyPoints(state.points, filters, 'overview');
    const frontierPoints = frontierRowsForSelection(state.points, filters, 'overview');
    const groups = frontierGroups(points, frontierPoints);
    const domainPoints = gpuDomainPoints();
    const selectedPoint = state.selectedPointKey
        ? frontierPoints.find(point => pointKey(point) === state.selectedPointKey)
        : null;
    if (state.selectedPointKey && !selectedPoint) {
        state.selectedPointKey = '';
    }
    renderChart(frontierPoints, groups, domainPoints);
    renderPointDetail(selectedPoint);
    renderFrontierTable(groups);
}

function syncMtpStageControl() {
    const stageControl = element('strategy-stage-control');
    const stageSlider = element('strategy-stage-slider');
    if (!stageControl || !stageSlider) return;

    const hasStages = FIXED_MTP_STAGES.length > 0;
    const mtpEnabled = hasStages && checkedValues('strategy-type-group').length > 0;
    stageControl.classList.toggle('hidden', !hasStages);
    stageControl.classList.toggle('strategy-stage-disabled', hasStages && !mtpEnabled);
    stageControl.setAttribute('aria-disabled', mtpEnabled ? 'false' : 'true');
    stageSlider.disabled = !mtpEnabled;
    updateRangeSliderLabel('strategy-stage-slider', 'strategy-stage-value', FIXED_MTP_STAGES);
}

function populateFilters(points) {
    syncColorMode();
    const hardware = fixedHardwareValues();
    const gpuNums = fixedGpuNumValues();
    const strategies = availableStrategyFilterOptions(points);
    const stages = FIXED_MTP_STAGES;
    const preferred = preferredStrategyDescriptorSelection(state.descriptors, {
        hardware: state.webInputs?.hardware || [],
        gpuNums: state.webInputs?.gpuNums || []
    });
    const selectedHardware = selectedOrDefault('strategy-hardware-group', hardware, preferred.hardware);
    const selectedGpuNums = selectedOrDefault('strategy-gpu-num-group', gpuNums, preferred.gpu_num);
    const selectedStrategies = selectedOrDefault('strategy-type-group', strategies, defaultStrategyFilterSelection(strategies));
    renderHardwareCheckboxes(hardware, selectedHardware);
    renderCheckboxGroup('strategy-gpu-num-group', gpuNums, selectedGpuNums, value => `${value} GPU`);
    renderStrategyTypeCheckboxes(strategies, selectedStrategies);
    configureRangeSlider('attn-cp-slider', 'attn-cp-value', FIXED_ATTENTION_CP_VALUES, FIXED_ATTENTION_CP_VALUES.at(-1));
    configureRangeSlider('strategy-stage-slider', 'strategy-stage-value', stages, stages.at(-1));
    syncMtpStageControl();
}

function visibleStrategyDescriptors() {
    const selection = {
        hardware: checkedValues('strategy-hardware-group'),
        gpu_num: checkedValues('strategy-gpu-num-group')
    };
    if (!selection.hardware.length || !selection.gpu_num.length) return [];
    return filterStrategyDescriptors(state.descriptors, selection);
}

function descriptorSelectionKey(descriptors) {
    return descriptors.map(descriptor => descriptor.path).sort().join('|');
}

function strategyCoverageNote(points) {
    if (!points.length || points.some(point => strategyFeatures(point).has('pd'))) return '';
    return ' No PD candidates are present in these loaded datasets. PD and PD+MTP need compatible prefill results and P/D split-size source runs; selecting a feature cannot generate missing candidates.';
}

async function loadVisiblePayloads() {
    const requestId = ++state.requestId;
    const selectedDescriptors = visibleStrategyDescriptors();
    state.loadedDescriptorKey = descriptorSelectionKey(selectedDescriptors);
    state.points = [];
    state.pointDescriptors = new WeakMap();
    state.selectedPointKey = '';
    if (!selectedDescriptors.length) {
        renderFiltered();
        setNote('Select a data-backed hardware and GPU-count pair to load strategy data.');
        return;
    }

    renderFiltered();
    setNote(`Loading ${selectedDescriptors.length} strategy dataset(s)...`);

    const loaded = await Promise.allSettled(selectedDescriptors.map(async descriptor => ({
        descriptor,
        decoded: await loadCachedStrategyPayload(state.payloadCache, descriptor, loadStrategyPayload)
    })));
    if (requestId !== state.requestId) return;

    const points = [];
    const pointDescriptors = new WeakMap();
    const failed = [];
    loaded.forEach(result => {
        if (result.status !== 'fulfilled') {
            failed.push(result.reason?.message || String(result.reason));
            return;
        }
        const { descriptor, decoded } = result.value;
        decoded.points.forEach(point => {
            pointDescriptors.set(point, descriptor);
            points.push(point);
        });
    });
    if (failed.length) state.loadedDescriptorKey = '';
    state.points = points;
    state.pointDescriptors = pointDescriptors;
    populateFilters(points);
    renderFiltered();
    const suffix = failed.length ? ` ${failed.length} payload failed to load.` : strategyCoverageNote(points);
    setNote(points.length ? `Loaded ${formatInt(points.length)} strategy points from ${selectedDescriptors.length} selected dataset(s).${suffix}` : `No strategy points found.${suffix}`);
}

function bindEvents() {
    if (state.bound) return;
    state.bound = true;
    ['strategy-hardware-group', 'strategy-gpu-num-group'].forEach(id => {
        element(id)?.addEventListener('change', loadVisiblePayloads);
    });
    ['strategy-type-group'].forEach(id => {
        element(id)?.addEventListener('change', renderFiltered);
    });
    element('attn-cp-slider')?.addEventListener('input', () => {
        updateRangeSliderLabel('attn-cp-slider', 'attn-cp-value', FIXED_ATTENTION_CP_VALUES);
        renderFiltered();
    });
    element('strategy-stage-slider')?.addEventListener('input', () => {
        updateRangeSliderLabel('strategy-stage-slider', 'strategy-stage-value', FIXED_MTP_STAGES);
        renderFiltered();
    });
    document.querySelectorAll('input[name="strategy-color-mode"]').forEach(input => {
        input.addEventListener('change', () => {
            syncColorMode();
            populateFilters(state.points);
            renderFiltered();
        });
    });
    element('strategy-labels-toggle')?.addEventListener('change', event => {
        state.showLabels = event.target.checked;
        renderFiltered();
    });
    window.addEventListener('resize', renderFiltered);
}

export function initStrategyParetoPanel(webInputs) {
    state.webInputs = webInputs;
    bindEvents();
}

export function resetStrategyDescriptorSelection() {
    const hardwareContainer = element('strategy-hardware-group');
    const gpuNumContainer = element('strategy-gpu-num-group');
    if (hardwareContainer) hardwareContainer.innerHTML = '';
    if (gpuNumContainer) gpuNumContainer.innerHTML = '';
    populateFilters(state.points);
}

export function updateStrategyParetoPanel(config) {
    state.currentConfig = config;
    if (!config?.model || !config?.seq) {
        state.requestId += 1;
        state.currentConfig = null;
        state.configKey = '';
        state.descriptors = [];
        state.points = [];
        state.pointDescriptors = new WeakMap();
        state.loadedDescriptorKey = '';
        state.selectedPointKey = '';
        populateFilters([]);
        renderFiltered();
        setNote('Select a model and sequence to load strategy Pareto data.');
        return;
    }

    const configKey = `${config.model}|${config.seq}`;
    if (configKey === state.configKey) {
        const visibleKey = descriptorSelectionKey(visibleStrategyDescriptors());
        if (visibleKey !== state.loadedDescriptorKey) loadVisiblePayloads();
        else renderFiltered();
        return;
    }
    state.requestId += 1;
    state.configKey = configKey;
    state.descriptors = strategyPayloadOptions(state.webInputs, config.model, config.seq);
    state.points = [];
    state.pointDescriptors = new WeakMap();
    state.loadedDescriptorKey = '';
    state.selectedPointKey = '';
    const hardwareContainer = element('strategy-hardware-group');
    const gpuNumContainer = element('strategy-gpu-num-group');
    if (hardwareContainer) hardwareContainer.innerHTML = '';
    if (gpuNumContainer) gpuNumContainer.innerHTML = '';
    populateFilters([]);

    if (!state.descriptors.length) {
        renderFiltered();
        setNote('No Pareto, MTP, PD, or A/F strategy JSON is available for this model sequence yet.');
        return;
    }
    loadVisiblePayloads();
}
