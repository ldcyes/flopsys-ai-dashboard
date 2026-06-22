const query = new URLSearchParams(window.location.search);
const PARETO_POINT_RADIUS = '3';
const PARETO_FRONTIER_POINT_RADIUS = '4.5';
const DATASETS = [
    {
        file: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/HGX-H100_72/i32768_o32768/h100_deepseek_v3_decode_pareto.json',
        label: 'H100 72 GPU DeepSeek-V3 I32K/O32K'
    },
    {
        file: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/HGX-H200_72/i32768_o32768/h200_deepseek_v3_decode_pareto.json',
        label: 'H200 72 GPU DeepSeek-V3 I32K/O32K'
    },
    {
        file: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/DGX-B200_72/i32768_o32768/b200_deepseek_v3_decode_pareto.json',
        label: 'B200 72 GPU DeepSeek-V3 I32K/O32K'
    },
    {
        file: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/DGX-B300_72/i32768_o32768/b300_deepseek_v3_decode_pareto.json',
        label: 'B300 72 GPU DeepSeek-V3 I32K/O32K'
    },
    {
        file: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/Vera-Rubin_72/i32768_o32768/vera_rubin_deepseek_v3_decode_pareto.json',
        label: 'Vera-Rubin 72 GPU DeepSeek-V3 I32K/O32K'
    },
    {
        file: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/Rubin-Ultra_72/i32768_o32768/rubin_ultra_deepseek_v3_decode_pareto.json',
        label: 'Rubin-Ultra 72 GPU DeepSeek-V3 I32K/O32K'
    },
    {
        file: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/HGX-H100_72/i32768_o32768/h100_deepseek_v3_eagle_mtp72_stage0_9_accept0p7.json',
        label: 'H100 72 GPU DeepSeek-V3 MTP stage detail'
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

let payload = null;
let showLabels = false;

function number(value) {
    return Number(value || 0);
}

function truthy(value) {
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'True';
}

function normalizeStrategy(point) {
    if (point.strategy_type !== undefined && point.strategy_type !== null && point.strategy_type !== 'None') {
        return String(point.strategy_type);
    }
    if (truthy(point.pd_enabled) && truthy(point.af_enabled)) return 'pd_af';
    if (truthy(point.pd_enabled)) return 'pd';
    if (truthy(point.af_enabled)) return 'af';
    if (point.mtp_stage !== undefined && point.mtp_stage !== null) return 'mtp';
    return 'monolithic';
}

function normalizePoint(point) {
    return {
        ...point,
        strategy_type: normalizeStrategy(point)
    };
}

function decodeCompactRecords(payload, rowsKey = 'point_rows') {
    const columns = Array.isArray(payload?.point_columns) ? payload.point_columns : [];
    const rows = Array.isArray(payload?.[rowsKey]) ? payload[rowsKey] : [];
    if (columns.length && rows.length) {
        return rows.map(row => {
            const point = {};
            columns.forEach((column, index) => {
                point[column] = row[index];
            });
            return point;
        });
    }
    if (rowsKey === 'point_rows' && Array.isArray(payload?.points)) return payload.points;
    if (rowsKey === 'frontier_rows' && Array.isArray(payload?.frontier)) return payload.frontier;
    return [];
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
    uniqueValues(points, 'dominant_component').forEach(value => option(bottleneckFilter, value, String(value)));
    stageFilter.classList.toggle('hidden', !hasMtpStage(points));
    strategyFilter.classList.toggle('hidden', uniqueValues(points, 'strategy_type').length <= 1);
}

function filteredPoints() {
    const gpu = gpuFilter.value;
    const strategy = strategyFilter.value;
    const stage = stageFilter.value;
    const bottleneck = bottleneckFilter.value;
    return payload.points.filter(row => {
        const gpuOk = gpu === 'all' || String(row.gpu_num) === gpu;
        const strategyOk = strategy === 'all' || String(row.strategy_type) === strategy;
        const stageOk = stage === 'all' || String(row.mtp_stage) === stage;
        const bottleneckOk = bottleneck === 'all' || String(row.dominant_component) === bottleneck;
        return gpuOk && strategyOk && stageOk && bottleneckOk;
    });
}

function hasMtpStage(points) {
    return points.some(point => point.mtp_stage !== undefined && point.mtp_stage !== null);
}

function computeFrontier(points) {
    const sorted = [...points]
        .sort((a, b) => number(a.tps_per_user) - number(b.tps_per_user) || yValue(b) - yValue(a));
    const bestByUser = [];
    let lastUser = null;
    sorted.forEach(point => {
        if (lastUser !== point.tps_per_user) {
            bestByUser.push(point);
            lastUser = point.tps_per_user;
        }
    });

    const frontier = [];
    let bestThroughput = -Infinity;
    [...bestByUser].reverse().forEach(point => {
        if (yValue(point) > bestThroughput) {
            frontier.push(point);
            bestThroughput = yValue(point);
        }
    });
    return frontier.reverse();
}

function frontierGroups(points) {
    const selectedGpu = gpuFilter.value;
    const groupKeys = (selectedGpu === 'all' ? uniqueValues(points, 'gpu_num') : [selectedGpu]).map(gpuNum => ({ gpuNum }));
    return groupKeys
        .map(key => {
            const groupPoints = points.filter(point => String(point.gpu_num) === String(key.gpuNum));
            const first = groupPoints[0] || {};
            return {
                gpu_num: Number(first.gpu_num ?? key.gpuNum),
                mtp_stage: null,
                label: `${key.gpuNum} GPU`,
                color_key: `gpu-${key.gpuNum}`,
                points: groupPoints,
                frontier: computeFrontier(groupPoints)
            };
        })
        .filter(group => group.frontier.length > 0);
}

function formatParameterName(key) {
    return key.replaceAll('_', ' ');
}

function formatParameterValue(value) {
    return String(value).replaceAll('_', ' ');
}

function parameterDelta(current, previous) {
    if (!previous) return 'frontier start';
    const keys = ['strategy_type', 'batch', 'prefill_gpu_num', 'decode_gpu_num', 'attn_tp', 'attn_dp', 'ffn_tp', 'ffn_ep', 'pp', 'mtp_stage', 'dominant_component'];
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
    const bestUser = Math.max(...points.map(row => number(row.tps_per_user)));
    const bestThroughput = Math.max(...points.map(row => yValue(row)));
    document.getElementById('point-count').textContent = formatInt(points.length);
    document.getElementById('frontier-count').textContent = formatInt(totalFrontierPoints(groups));
    document.getElementById('best-user').textContent = formatInt(bestUser);
    document.getElementById('best-throughput').textContent = formatInt(bestThroughput);
}

function colorFor(point) {
    const colors = {
        monolithic: '#60a5fa',
        mtp: '#f59e0b',
        pd: '#34d399',
        af: '#c084fc',
        af_hybrid: '#2dd4bf',
        af_mtp: '#e879f9',
        af_hybrid_mtp: '#14b8a6',
        pd_af: '#f472b6',
        dispatch: '#60a5fa',
        combine: '#f59e0b',
        mla_compute: '#34d399',
        routed_expert: '#c084fc'
    };
    return colors[point.strategy_type] || colors[point.dominant_component] || '#94a3b8';
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
        bottleneck: ${point.dominant_component}
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
    const maxX = Math.max(...points.map(row => number(row.tps_per_user))) * 1.08;
    const maxY = Math.max(...points.map(row => yValue(row))) * 1.08;

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

    points.forEach(point => {
        const circle = create('circle');
        circle.setAttribute('cx', x(point.tps_per_user));
        circle.setAttribute('cy', y(yValue(point)));
        circle.setAttribute('r', PARETO_POINT_RADIUS);
        circle.setAttribute('fill', colorFor(point));
        circle.setAttribute('fill-opacity', '0.52');
        circle.setAttribute('stroke', 'rgba(255,255,255,0.72)');
        circle.setAttribute('stroke-width', '0.7');
        circle.addEventListener('mousemove', event => showTooltip(event, point));
        circle.addEventListener('mouseleave', hideTooltip);
        svg.appendChild(circle);
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

function render() {
    const points = filteredPoints();
    const groups = frontierGroups(points);
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
    if (description) {
        document.querySelector('.subtitle').textContent = description;
    }
}

async function init() {
    populateDatasetSelect();
    await loadPayload(dataFile);
    datasetSelect.addEventListener('change', async () => {
        dataFile = datasetSelect.value;
        const url = new URL(window.location.href);
        url.searchParams.set('data', dataFile);
        window.history.replaceState({}, '', url);
        await loadPayload(dataFile);
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

async function loadPayload(file) {
    const response = await fetch(dataUrl(file));
    payload = await response.json();
    payload.points = decodeCompactRecords(payload).map(normalizePoint);
    payload.frontier = decodeCompactRecords(payload, 'frontier_rows').map(normalizePoint);
    applyPayloadText();
    populateFilters(payload.points);
    document.getElementById('model-note').textContent = `${payload.summary.mtp_note} ${payload.summary.pp_note}`;
    render();
}

init().catch(error => {
    svg.replaceChildren();
    document.getElementById('model-note').textContent = `Failed to load Pareto data: ${error.message}`;
});
