import {
    decodeStrategyPayload,
    filterStrategyPoints,
    frontierRowsForSelection,
    maximumBy
} from './dashboard-data.js?v=display-data-v2';

const query = new URLSearchParams(window.location.search);
const PARETO_FRONTIER_POINT_RADIUS = '4.5';
const DATASETS = [
    {
        id: 'h100-deepseek-v3-decode-pareto',
        file: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/HGX-H100_72/i32768_o32768/h100_deepseek_v3_decode_pareto.json',
        label: 'H100 72 GPU DeepSeek-V3 I32K/O32K',
        kind: 'pareto',
        hardware: ['HGX-H100'],
        gpuNums: [72]
    },
    {
        id: 'h200-deepseek-v3-decode-pareto',
        file: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/HGX-H200_72/i32768_o32768/h200_deepseek_v3_decode_pareto.json',
        label: 'H200 72 GPU DeepSeek-V3 I32K/O32K',
        kind: 'pareto',
        hardware: ['HGX-H200'],
        gpuNums: [72]
    },
    {
        id: 'b200-deepseek-v3-decode-pareto',
        file: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/DGX-B200_72/i32768_o32768/b200_deepseek_v3_decode_pareto.json',
        label: 'B200 72 GPU DeepSeek-V3 I32K/O32K',
        kind: 'pareto',
        hardware: ['DGX-B200'],
        gpuNums: [72]
    },
    {
        id: 'b300-deepseek-v3-decode-pareto',
        file: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/DGX-B300_72/i32768_o32768/b300_deepseek_v3_decode_pareto.json',
        label: 'B300 72 GPU DeepSeek-V3 I32K/O32K',
        kind: 'pareto',
        hardware: ['DGX-B300'],
        gpuNums: [72]
    },
    {
        id: 'vera-rubin-deepseek-v3-decode-pareto',
        file: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/Vera-Rubin_72/i32768_o32768/vera_rubin_deepseek_v3_decode_pareto.json',
        label: 'Vera-Rubin 72 GPU DeepSeek-V3 I32K/O32K',
        kind: 'pareto',
        hardware: ['Vera-Rubin'],
        gpuNums: [72]
    },
    {
        id: 'rubin-ultra-deepseek-v3-decode-pareto',
        file: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/Rubin-Ultra_72/i32768_o32768/rubin_ultra_deepseek_v3_decode_pareto.json',
        label: 'Rubin-Ultra 72 GPU DeepSeek-V3 I32K/O32K',
        kind: 'pareto',
        hardware: ['Rubin-Ultra'],
        gpuNums: [72]
    },
    {
        id: 'h100-deepseek-v3-mtp-stage-detail',
        file: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/HGX-H100_72/i32768_o32768/h100_deepseek_v3_eagle_mtp72_stage0_9_accept0p7.json',
        label: 'H100 72 GPU DeepSeek-V3 MTP stage detail',
        kind: 'mtp_stage',
        hardware: ['HGX-H100'],
        gpuNums: [72]
    }
];
let dataFile = query.get('data') || DATASETS[0].file;
const svg = document.getElementById('pareto-chart');
const tooltip = document.getElementById('chart-tooltip');
const datasetSelect = document.getElementById('dataset-select');
const gpuFilter = document.getElementById('gpu-filter');
const strategyFilter = document.getElementById('strategy-filter');
const stageFilter = document.getElementById('stage-filter');
const bottleneckFilter = document.getElementById('bottleneck-filter');
const labelButton = document.getElementById('toggle-labels');
const defaultHeading = document.querySelector('h1')?.textContent || 'Search & Pareto Frontier';
const defaultSubtitle = document.querySelector('.subtitle')?.textContent || '';
const defaultDocumentTitle = document.title;

let payload = null;
let showLabels = false;
let payloadRequestId = 0;

function number(value) {
    return Number(value || 0);
}

function formatInt(value) {
    return Math.round(number(value)).toLocaleString('en-US');
}

function yMetric() {
    return payload?.summary?.y_metric || 'throughput_total_tps';
}

function yValue(point) {
    return number(point[yMetric()] ?? point.throughput_total_tps ?? point.tps_per_gpu);
}

function uniqueValues(rows, key) {
    return [...new Set(rows.map(row => row[key]).filter(value => value !== undefined && value !== null))]
        .sort((a, b) => {
            const an = Number(a);
            const bn = Number(b);
            if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
            return String(a).localeCompare(String(b));
        });
}

function option(select, value, label) {
    const el = document.createElement('option');
    el.value = String(value);
    el.textContent = label;
    select.appendChild(el);
}

function dataUrl(file) {
    return file.startsWith('data/') ? file : `data/${file}`;
}

function datasetForFile(file) {
    const dataset = DATASETS.find(candidate => candidate.file === file);
    if (!dataset) throw new TypeError(`Unsupported Pareto dataset: ${file}`);
    return dataset;
}

function descriptorForDataset(dataset) {
    return {
        id: dataset.id,
        label: dataset.label,
        path: dataset.file,
        kind: dataset.kind,
        hardware: dataset.hardware,
        gpuNums: dataset.gpuNums
    };
}

function populateDatasetSelect() {
    datasetSelect.innerHTML = '';
    DATASETS.forEach(dataset => option(datasetSelect, dataset.file, dataset.label));
    const known = DATASETS.some(dataset => dataset.file === dataFile);
    if (!known) option(datasetSelect, dataFile, dataFile);
    datasetSelect.value = dataFile;
}

function populateFilters(points) {
    gpuFilter.innerHTML = '';
    strategyFilter.innerHTML = '';
    stageFilter.innerHTML = '';
    bottleneckFilter.innerHTML = '';
    option(gpuFilter, 'all', '全部 GPU 分组');
    option(strategyFilter, 'all', '全部策略');
    option(stageFilter, 'all', '全部 MTP stage');
    option(bottleneckFilter, 'all', '全部瓶颈');

    uniqueValues(points, 'gpu_num').forEach(value => option(gpuFilter, value, `${value} GPU`));
    uniqueValues(points, 'strategy_type').forEach(value => option(strategyFilter, value, String(value).replaceAll('_', ' / ')));
    uniqueValues(points, 'mtp_stage').forEach(value => option(stageFilter, value, `stage ${value}`));
    uniqueValues(points, 'bottleneck').forEach(value => option(bottleneckFilter, value, String(value)));
    stageFilter.classList.toggle('hidden', !hasMtpStage(points));
    strategyFilter.classList.toggle('hidden', uniqueValues(points, 'strategy_type').length <= 1);
}

function selectedFilterValue(select) {
    return select.value === 'all' ? null : select.value;
}

function independentFilters() {
    return {
        gpu_num: selectedFilterValue(gpuFilter),
        strategy_type: selectedFilterValue(strategyFilter),
        mtp_stage: selectedFilterValue(stageFilter),
        bottleneck: selectedFilterValue(bottleneckFilter)
    };
}

function hasMtpStage(points) {
    return points.some(point => point.mtp_stage !== undefined && point.mtp_stage !== null);
}

function frontierGroups(frontierPoints) {
    const grouped = new Map();
    frontierPoints.forEach(point => {
        const gpuNum = String(point.gpu_num);
        if (!grouped.has(gpuNum)) grouped.set(gpuNum, []);
        grouped.get(gpuNum).push(point);
    });
    return [...grouped].map(([gpuNum, frontier]) => ({
        gpu_num: Number(gpuNum),
        mtp_stage: null,
        label: `${gpuNum} GPU`,
        color_key: `gpu-${gpuNum}`,
        frontier
    }));
}

function formatParameterName(key) {
    return key.replaceAll('_', ' ');
}

function formatParameterValue(value) {
    if (value === undefined || value === null || value === '') return '-';
    return String(value).replaceAll('_', ' ');
}

function parameterDelta(current, previous) {
    if (!previous) return 'frontier start';
    const keys = ['strategy_type', 'batch', 'prefill_gpu_num', 'decode_gpu_num', 'attn_tp', 'attn_dp', 'ffn_tp', 'ffn_ep', 'pp', 'mtp_stage', 'bottleneck'];
    const changes = keys
        .filter(key => String(current[key]) !== String(previous[key]))
        .map(key => `${formatParameterName(key)}: ${formatParameterValue(previous[key])} -> ${formatParameterValue(current[key])}`);
    return changes.length ? changes.join('; ') : 'same parameters';
}

function totalFrontierPoints(groups) {
    return groups.reduce((total, group) => total + group.frontier.length, 0);
}

function setMetrics(points, groups) {
    if (points.length === 0) {
        document.getElementById('point-count').textContent = '0';
        document.getElementById('frontier-count').textContent = '0';
        document.getElementById('best-user').textContent = '-';
        document.getElementById('best-throughput').textContent = '-';
        return;
    }
    const bestUser = maximumBy(points, row => number(row.tps_per_user), -Number.MAX_VALUE);
    const bestThroughput = maximumBy(points, yValue, -Number.MAX_VALUE);
    document.getElementById('point-count').textContent = formatInt(points.length);
    document.getElementById('frontier-count').textContent = formatInt(totalFrontierPoints(groups));
    document.getElementById('best-user').textContent = formatInt(bestUser);
    document.getElementById('best-throughput').textContent = formatInt(bestThroughput);
}

function lineColorForGroup(group) {
    const palette = ['#ff6b4a', '#22d3ee', '#a78bfa', '#34d399', '#f59e0b', '#f472b6', '#60a5fa', '#facc15', '#fb7185', '#2dd4bf'];
    const keys = uniqueValues(payload.points, 'gpu_num').map(value => `gpu-${value}`);
    const index = Math.max(0, keys.indexOf(String(group.color_key)));
    return palette[index % palette.length];
}

function pointLabel(point) {
    const stage = point.mtp_stage !== undefined && point.mtp_stage !== null ? ` s${point.mtp_stage}` : '';
    const strategy = point.strategy_type ? `${String(point.strategy_type).replaceAll('_', '+')} ` : '';
    return `${point.gpu_num}G ${strategy}${stage} b${point.batch} aTP${point.attn_tp} fTP${point.ffn_tp}`;
}

function showTooltip(event, point) {
    tooltip.style.display = 'block';
    tooltip.style.left = `${event.offsetX + 14}px`;
    tooltip.style.top = `${event.offsetY + 14}px`;
    tooltip.innerHTML = `
        <strong>${pointLabel(point)}</strong>
        strategy: ${point.strategy_type || 'monolithic'}<br>
        TPS/user: ${formatInt(point.tps_per_user)}<br>
        total throughput: ${formatInt(point.throughput_total_tps)}<br>
        throughput/GPU: ${formatInt(point.tps_per_gpu)}<br>
        ${point.mtp_stage !== undefined && point.mtp_stage !== null ? `MTP stage: ${point.mtp_stage}<br>MTP gain: ${Number(point.mtp_expected_tokens || 1).toFixed(3)}<br>` : ''}
        ${point.pd_enabled ? `PD split: ${point.prefill_gpu_num}+${point.decode_gpu_num}<br>PD transfer: ${Number(point.pd_transfer_time_s || 0).toFixed(4)}s<br>` : ''}
        ${point.af_enabled ? `A/F split: A=${point.decode_attention_gpu || point.hardware}, F=${point.decode_ffn_gpu || 'groq-lpx3'}<br>A/F transfer: ${Number(point.decode_attn_ffn_transfer_time_s || 0).toFixed(4)}s<br>` : ''}
        attn dp/tp: ${point.attn_dp}/${point.attn_tp}<br>
        ffn ep/tp: ${point.ffn_ep}/${point.ffn_tp}<br>
        bottleneck: ${point.bottleneck || '-'}
    `;
}

function hideTooltip() {
    tooltip.style.display = 'none';
}

function renderChart(points, frontier) {
    svg.replaceChildren();
    if (points.length === 0) return;
    const width = svg.clientWidth || 900;
    const height = svg.clientHeight || 560;
    const margin = { top: 24, right: 28, bottom: 58, left: 94 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxX = maximumBy(points, row => number(row.tps_per_user), -Number.MAX_VALUE) * 1.08;
    const maxY = maximumBy(points, yValue, -Number.MAX_VALUE) * 1.08;

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
        vLine.setAttribute('stroke', 'rgba(156, 168, 189, 0.18)');
        svg.appendChild(vLine);

        const hLine = create('line');
        hLine.setAttribute('x1', margin.left);
        hLine.setAttribute('x2', margin.left + plotWidth);
        hLine.setAttribute('y1', gy);
        hLine.setAttribute('y2', gy);
        hLine.setAttribute('stroke', 'rgba(156, 168, 189, 0.18)');
        svg.appendChild(hLine);

        const xTick = create('text');
        xTick.setAttribute('x', gx);
        xTick.setAttribute('y', height - 28);
        xTick.setAttribute('text-anchor', 'middle');
        xTick.setAttribute('fill', '#9ca8bd');
        xTick.setAttribute('font-size', '11');
        xTick.textContent = formatInt(maxX * i / 5);
        svg.appendChild(xTick);

        const yTick = create('text');
        yTick.setAttribute('x', margin.left - 10);
        yTick.setAttribute('y', margin.top + plotHeight - i / 5 * plotHeight + 4);
        yTick.setAttribute('text-anchor', 'end');
        yTick.setAttribute('fill', '#9ca8bd');
        yTick.setAttribute('font-size', '11');
        yTick.textContent = formatInt(maxY * i / 5);
        svg.appendChild(yTick);
    }

    const xAxis = create('text');
    xAxis.setAttribute('x', margin.left + plotWidth / 2);
    xAxis.setAttribute('y', height - 8);
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

    frontier.forEach((group, index) => {
        const color = lineColorForGroup(group);
        const legendX = margin.left + 8 + Math.floor(index / 3) * 82;
        const legendY = margin.top + 14 + (index % 3) * 18;
        const sample = create('line');
        sample.setAttribute('x1', legendX);
        sample.setAttribute('x2', legendX + 20);
        sample.setAttribute('y1', legendY);
        sample.setAttribute('y2', legendY);
        sample.setAttribute('stroke', color);
        sample.setAttribute('stroke-width', '2.5');
        svg.appendChild(sample);

        const label = create('text');
        label.setAttribute('x', legendX + 26);
        label.setAttribute('y', legendY + 4);
        label.setAttribute('fill', '#cbd5e1');
        label.setAttribute('font-size', '11');
        label.textContent = group.label;
        svg.appendChild(label);
    });

    frontier.forEach(group => {
        if (group.frontier.length <= 1) return;
        const line = create('polyline');
        line.setAttribute('points', group.frontier.map(point => `${x(point.tps_per_user)},${y(yValue(point))}`).join(' '));
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', lineColorForGroup(group));
        line.setAttribute('stroke-width', '2.5');
        svg.appendChild(line);
    });

    frontier.forEach(group => {
        const color = lineColorForGroup(group);
        group.frontier.forEach(point => {
            const circle = create('circle');
            circle.setAttribute('cx', x(point.tps_per_user));
            circle.setAttribute('cy', y(yValue(point)));
            circle.setAttribute('r', PARETO_FRONTIER_POINT_RADIUS);
            circle.setAttribute('fill', '#0f1420');
            circle.setAttribute('stroke', color);
            circle.setAttribute('stroke-width', '2.2');
            circle.addEventListener('mousemove', event => showTooltip(event, point));
            circle.addEventListener('mouseleave', hideTooltip);
            svg.appendChild(circle);

            if (showLabels) {
                const label = create('text');
                label.setAttribute('x', x(point.tps_per_user) + 9);
                label.setAttribute('y', y(yValue(point)) - 8);
                label.setAttribute('fill', '#edf2ff');
                label.setAttribute('font-size', '11');
                label.textContent = pointLabel(point);
                svg.appendChild(label);
            }
        });
    });
}

function renderTable(groups) {
    const body = document.getElementById('frontier-table');
    body.replaceChildren();
    groups.forEach(group => {
        group.frontier.forEach((point, index) => {
            const previous = index === 0 ? null : group.frontier[index - 1];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td>${point.gpu_num} ${point.strategy_type || 'monolithic'}${point.mtp_stage !== undefined && point.mtp_stage !== null ? ` s${point.mtp_stage}` : ''}</td>
                <td>${formatInt(point.tps_per_user)}</td>
                <td>${formatInt(yValue(point))}</td>
                <td>${point.batch}</td>
                <td>${point.attn_dp}/${point.attn_tp}</td>
                <td>${point.ffn_ep}/${point.ffn_tp}</td>
                <td>${parameterDelta(point, previous)}</td>
            `;
            body.appendChild(tr);
        });
    });
}

function clearPayloadView() {
    payload = null;
    svg.replaceChildren();
    hideTooltip();
    populateFilters([]);
    setMetrics([], []);
    renderTable([]);
    document.querySelector('h1').textContent = defaultHeading;
    document.querySelector('.subtitle').textContent = defaultSubtitle;
    document.title = defaultDocumentTitle;
    document.getElementById('model-note').textContent = '';
}

function render() {
    if (!payload) return;
    const filters = independentFilters();
    const points = filterStrategyPoints(payload.points, filters, 'independent');
    const frontier = frontierRowsForSelection(payload.points, filters, 'independent');
    const groups = frontierGroups(frontier);
    setMetrics(points, groups);
    renderChart(points, groups);
    renderTable(groups);
}

function applyPayloadText() {
    const title = payload?.summary?.title;
    const description = payload?.summary?.description;
    if (title) {
        document.querySelector('h1').textContent = title;
        document.title = `${title} - Flopsys AI`;
    }
    document.querySelector('.subtitle').textContent = description || defaultSubtitle;
}

function bindEvents() {
    datasetSelect.addEventListener('change', () => {
        dataFile = datasetSelect.value;
        const url = new URL(window.location.href);
        url.searchParams.set('data', dataFile);
        window.history.replaceState({}, '', url);
        void loadPayload(dataFile).catch(showLoadError);
    });
    gpuFilter.addEventListener('change', render);
    strategyFilter.addEventListener('change', render);
    stageFilter.addEventListener('change', render);
    bottleneckFilter.addEventListener('change', render);
    labelButton.addEventListener('click', () => {
        showLabels = !showLabels;
        labelButton.classList.toggle('active', showLabels);
        render();
    });
    window.addEventListener('resize', render);
}

async function init() {
    populateDatasetSelect();
    bindEvents();
    await loadPayload(dataFile);
}

async function loadPayload(file) {
    const requestId = ++payloadRequestId;
    clearPayloadView();
    try {
        const dataset = datasetForFile(file);
        const response = await fetch(dataUrl(dataset.file));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const decoded = decodeStrategyPayload(await response.json(), descriptorForDataset(dataset));
        if (requestId !== payloadRequestId) return false;
        payload = decoded;
        applyPayloadText();
        populateFilters(payload.points);
        document.getElementById('model-note').textContent = [
            payload.summary.mtp_note,
            payload.summary.pp_note
        ].filter(Boolean).join(' ');
        render();
        return true;
    } catch (error) {
        if (requestId !== payloadRequestId) return false;
        throw error;
    }
}

function showLoadError(error) {
    clearPayloadView();
    document.getElementById('model-note').textContent = `Failed to load Pareto data: ${error.message}`;
}

init().catch(showLoadError);
