const DATA_URL = 'data/expert_fc_utilization.json?v=20260608-vera-rubin-current';

const state = {
    data: null,
    model: '',
    selectedGpus: new Set(),
    selectedOps: new Set(),
    seriesCache: new Map(),
    requestId: 0
};

function element(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function safeId(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value, digits = 2) {
    const parsed = number(value);
    return parsed.toLocaleString('en-US', {
        maximumFractionDigits: digits,
        minimumFractionDigits: parsed === 0 ? 0 : 0
    });
}

function checkedValues(containerId) {
    const container = element(containerId);
    if (!container) return [];
    return [...container.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
}

function defaultGpuSelection() {
    const available = new Set((state.data?.gpus || []).map(gpu => gpu.key));
    const preferred = ['b200', 'b300', 'rubin144', 'rubin576'].filter(key => available.has(key));
    if (preferred.length) return preferred;
    return (state.data?.gpus || []).slice(0, 4).map(gpu => gpu.key);
}

function defaultOpSelection() {
    const ops = state.data?.ops || [];
    const preferred = ops.filter(op => op.key !== 'fc3').map(op => op.key);
    return preferred.length ? preferred : ops.slice(0, 1).map(op => op.key);
}

function byKey(rows) {
    return new Map(rows.map(row => [row.key, row]));
}

function gpuMap() {
    return byKey(state.data?.gpus || []);
}

function opMap() {
    return byKey(state.data?.ops || []);
}

function selectedSeriesDescriptors() {
    if (!state.data) return [];
    return state.data.series.filter(series =>
        series.model === state.model &&
        state.selectedGpus.has(series.gpu) &&
        state.selectedOps.has(series.op)
    );
}

function decodeSeriesPoints(payload) {
    if (Array.isArray(payload?.points)) return payload.points;
    const columns = Array.isArray(payload?.point_columns) ? payload.point_columns : [];
    const rows = Array.isArray(payload?.point_rows) ? payload.point_rows : [];
    if (!columns.length) return [];
    return rows.map(row => {
        const point = {};
        columns.forEach((column, index) => {
            point[column] = row[index];
        });
        return point;
    });
}

async function loadSeriesPoints(series) {
    if (Array.isArray(series.points)) return series;
    const path = series.points_path;
    if (!path) return { ...series, points: [] };
    if (state.seriesCache.has(path)) {
        return state.seriesCache.get(path);
    }
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    const payload = await response.json();
    const loaded = { ...series, points: decodeSeriesPoints(payload) };
    state.seriesCache.set(path, loaded);
    return loaded;
}

function renderModelSelect() {
    const select = element('expert-model-select');
    if (!select || !state.data) return;
    select.innerHTML = state.data.models.map(model => `
        <option value="${escapeHtml(model.key)}">${escapeHtml(model.label)}</option>
    `).join('');
    select.value = state.model;
}

function renderGpuCheckboxes() {
    const container = element('expert-gpu-checkboxes');
    if (!container || !state.data) return;
    container.innerHTML = state.data.gpus.map(gpu => {
        const id = `expert-gpu-${safeId(gpu.key)}`;
        const checked = state.selectedGpus.has(gpu.key) ? ' checked' : '';
        return `
            <div class="checkbox-item expert-legend-checkbox">
                <input type="checkbox" id="${id}" value="${escapeHtml(gpu.key)}"${checked}>
                <label for="${id}">
                    <span class="legend-swatch" style="--swatch-color:${escapeHtml(gpu.color)}"></span>
                    <span>${escapeHtml(gpu.label)}</span>
                </label>
            </div>
        `;
    }).join('');
}

function renderOpCheckboxes() {
    const container = element('expert-op-checkboxes');
    if (!container || !state.data) return;
    container.innerHTML = state.data.ops.map(op => {
        const id = `expert-op-${safeId(op.key)}`;
        const checked = state.selectedOps.has(op.key) ? ' checked' : '';
        const dashed = op.dash ? ' expert-op-dashed' : '';
        const dotted = op.key === 'fc3' ? ' expert-op-dotted' : '';
        return `
            <div class="checkbox-item expert-legend-checkbox">
                <input type="checkbox" id="${id}" value="${escapeHtml(op.key)}"${checked}>
                <label for="${id}">
                    <span class="op-line-swatch${dashed}${dotted}"></span>
                    <span>${escapeHtml(op.label)}</span>
                </label>
            </div>
        `;
    }).join('');
}

function setSelectedFromControls() {
    state.selectedGpus = new Set(checkedValues('expert-gpu-checkboxes'));
    state.selectedOps = new Set(checkedValues('expert-op-checkboxes'));
}

function createSvg(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}

function nearestPointAtBatch(series, batch, batchStart) {
    const direct = series.points[batch - batchStart];
    if (direct && direct.batch === batch) return direct;
    const points = series.points || [];
    if (!points.length) return null;
    let low = 0;
    let high = points.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const point = points[mid];
        if (point.batch === batch) return point;
        if (point.batch < batch) low = mid + 1;
        else high = mid - 1;
    }
    const left = points[Math.max(0, high)];
    const right = points[Math.min(points.length - 1, low)];
    if (!left) return right || null;
    if (!right) return left;
    return Math.abs(left.batch - batch) <= Math.abs(right.batch - batch) ? left : right;
}

function batchToX(value, batchStart, batchEnd, marginLeft, plotWidth) {
    const span = Math.max(batchEnd - batchStart, 1);
    return marginLeft + (number(value) - batchStart) / span * plotWidth;
}

function xToBatch(pixelX, batchStart, batchEnd, marginLeft, plotWidth) {
    const ratio = Math.max(0, Math.min(1, (pixelX - marginLeft) / Math.max(plotWidth, 1)));
    const value = batchStart + ratio * (batchEnd - batchStart);
    return Math.max(batchStart, Math.min(batchEnd, Math.round(value)));
}

function batchTicks(batchStart, batchEnd) {
    const tickCount = 5;
    const ticks = Array.from({ length: tickCount }, (_, index) =>
        Math.round(batchStart + (batchEnd - batchStart) * index / (tickCount - 1))
    );
    return ticks;
}

function linePoints(series, x, y, plotWidth) {
    const stride = Math.max(1, Math.floor(series.points.length / Math.max(plotWidth * 2, 1)));
    const points = [];
    series.points.forEach((point, index) => {
        if (index === 0 || index === series.points.length - 1 || index % stride === 0) {
            points.push(`${x(point.batch).toFixed(2)},${y(point.utilization).toFixed(2)}`);
        }
    });
    return points.join(' ');
}

function showTooltip(event, match, rect, width, height) {
    const tooltip = element('expert-fc-tooltip');
    if (!tooltip) return;
    const { series, point, gpu, op } = match;
    tooltip.style.display = 'block';
    tooltip.style.left = `${Math.min(event.clientX - rect.left + 14, width - 240)}px`;
    tooltip.style.top = `${Math.min(event.clientY - rect.top + 14, height - 150)}px`;
    tooltip.innerHTML = `
        <strong>${escapeHtml(gpu.label)} ${escapeHtml(op.label)}</strong>
        batch: ${escapeHtml(point.batch)}<br>
        utilization: ${formatNumber(point.utilization, 3)}%<br>
        FLOPs/byte: ${formatNumber(point.flops_per_byte, 3)}<br>
        peak bottleneck: ${escapeHtml(series.peak_overall_bottleneck || '-')}<br>
        peak bandwidth: ${escapeHtml(series.peak_bandwidth_bottleneck || '-')} ${formatNumber(series.peak_bandwidth_utilization, 2)}%<br>
        ${escapeHtml(series.label)}
    `;
}

function hideTooltip() {
    const tooltip = element('expert-fc-tooltip');
    if (tooltip) tooltip.style.display = 'none';
}

function renderAiLabels(svg, seriesList, x, y, gpus, ops, plotRight) {
    if (seriesList.length > 16) return;
    seriesList.forEach((series, index) => {
        const point = series.points[series.points.length - 1];
        const gpu = gpus.get(series.gpu);
        const op = ops.get(series.op);
        if (!point || !gpu || !op) return;
        const label = createSvg('text');
        label.setAttribute('x', Math.min(x(point.batch) + 6, plotRight - 84));
        label.setAttribute('y', y(point.utilization) + 4 + index % 3 * 11);
        label.setAttribute('fill', gpu.color);
        label.setAttribute('font-size', '10');
        label.textContent = `${gpu.label} ${op.label} ${formatNumber(point.flops_per_byte, 1)} F/B`;
        svg.appendChild(label);
    });
}

function maxUtilization(seriesList) {
    let maxValue = 1;
    seriesList.forEach(series => {
        series.points.forEach(point => {
            const value = number(point.utilization);
            if (value > maxValue) maxValue = value;
        });
    });
    return maxValue;
}

function renderChart(seriesList) {
    const svg = element('expert-fc-chart');
    if (!svg || !state.data) return;
    svg.replaceChildren();
    hideTooltip();

    const width = svg.clientWidth || 1080;
    const height = svg.clientHeight || 560;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    if (!seriesList.length) {
        const empty = createSvg('text');
        empty.setAttribute('x', width / 2);
        empty.setAttribute('y', height / 2);
        empty.setAttribute('text-anchor', 'middle');
        empty.setAttribute('fill', '#9aa6bc');
        empty.setAttribute('font-size', '13');
        empty.textContent = 'No selected series';
        svg.appendChild(empty);
        return;
    }

    const metadata = state.data.metadata;
    const batchStart = metadata.batch_start;
    const batchEnd = metadata.batch_end;
    const margin = { top: 28, right: 42, bottom: 50, left: 76 };
    const plotWidth = Math.max(width - margin.left - margin.right, 1);
    const plotHeight = Math.max(height - margin.top - margin.bottom, 1);
    const plotRight = margin.left + plotWidth;
    const plotBottom = margin.top + plotHeight;
    const maxUtil = maxUtilization(seriesList);
    const maxY = maxUtil > 100 ? maxUtil * 1.08 : 100;
    const x = value => batchToX(value, batchStart, batchEnd, margin.left, plotWidth);
    const y = value => margin.top + plotHeight - number(value) / maxY * plotHeight;
    const gpus = gpuMap();
    const ops = opMap();
    const xTicks = batchTicks(batchStart, batchEnd);

    xTicks.forEach(tickValue => {
        const gx = x(tickValue);
        const vLine = createSvg('line');
        vLine.setAttribute('x1', gx);
        vLine.setAttribute('x2', gx);
        vLine.setAttribute('y1', margin.top);
        vLine.setAttribute('y2', plotBottom);
        vLine.setAttribute('stroke', 'rgba(154, 166, 188, 0.15)');
        svg.appendChild(vLine);

        const xTick = createSvg('text');
        xTick.setAttribute('x', gx);
        xTick.setAttribute('y', height - 24);
        xTick.setAttribute('text-anchor', 'middle');
        xTick.setAttribute('fill', '#9aa6bc');
        xTick.setAttribute('font-size', '11');
        xTick.textContent = tickValue;
        svg.appendChild(xTick);
    });

    for (let i = 0; i <= 4; i += 1) {
        const gy = margin.top + i / 4 * plotHeight;

        const hLine = createSvg('line');
        hLine.setAttribute('x1', margin.left);
        hLine.setAttribute('x2', plotRight);
        hLine.setAttribute('y1', gy);
        hLine.setAttribute('y2', gy);
        hLine.setAttribute('stroke', 'rgba(154, 166, 188, 0.15)');
        svg.appendChild(hLine);

        const yTick = createSvg('text');
        yTick.setAttribute('x', margin.left - 10);
        yTick.setAttribute('y', plotBottom - i / 4 * plotHeight + 4);
        yTick.setAttribute('text-anchor', 'end');
        yTick.setAttribute('fill', '#9aa6bc');
        yTick.setAttribute('font-size', '11');
        yTick.textContent = `${formatNumber(maxY * i / 4, 0)}%`;
        svg.appendChild(yTick);
    }

    const xAxis = createSvg('text');
    xAxis.setAttribute('x', margin.left + plotWidth / 2);
    xAxis.setAttribute('y', height - 6);
    xAxis.setAttribute('text-anchor', 'middle');
    xAxis.setAttribute('fill', '#edf2ff');
    xAxis.setAttribute('font-size', '12');
    xAxis.textContent = 'GPU expert batch (linear scale)';
    svg.appendChild(xAxis);

    const yAxis = createSvg('text');
    yAxis.setAttribute('transform', `translate(20 ${margin.top + plotHeight / 2}) rotate(-90)`);
    yAxis.setAttribute('text-anchor', 'middle');
    yAxis.setAttribute('fill', '#edf2ff');
    yAxis.setAttribute('font-size', '12');
    yAxis.textContent = 'useful GPU peak utilization';
    svg.appendChild(yAxis);

    seriesList.forEach(series => {
        const gpu = gpus.get(series.gpu);
        const op = ops.get(series.op);
        if (!gpu || !op) return;
        const line = createSvg('polyline');
        line.setAttribute('points', linePoints(series, x, y, plotWidth));
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', gpu.color);
        line.setAttribute('stroke-width', series.op === 'fc3' ? '1.9' : '2.2');
        line.setAttribute('stroke-opacity', '0.78');
        if (op.dash) line.setAttribute('stroke-dasharray', op.dash);
        line.appendChild(createSvg('title')).textContent = `${gpu.label} ${op.label}`;
        svg.appendChild(line);
    });

    renderAiLabels(svg, seriesList, x, y, gpus, ops, plotRight);

    const focus = createSvg('circle');
    focus.setAttribute('r', '5');
    focus.setAttribute('fill', '#10131a');
    focus.setAttribute('stroke', '#edf2ff');
    focus.setAttribute('stroke-width', '1.8');
    focus.style.display = 'none';
    svg.appendChild(focus);

    svg.onmousemove = event => {
        const rect = svg.getBoundingClientRect();
        const sx = width / Math.max(rect.width, 1);
        const sy = height / Math.max(rect.height, 1);
        const px = (event.clientX - rect.left) * sx;
        const py = (event.clientY - rect.top) * sy;
        if (px < margin.left || px > plotRight || py < margin.top || py > plotBottom) {
            focus.style.display = 'none';
            hideTooltip();
            return;
        }
        const batch = xToBatch(px, batchStart, batchEnd, margin.left, plotWidth);
        let best = null;
        seriesList.forEach(series => {
            const point = nearestPointAtBatch(series, batch, batchStart);
            const gpu = gpus.get(series.gpu);
            const op = ops.get(series.op);
            if (!point || !gpu || !op) return;
            const distance = Math.abs(y(point.utilization) - py);
            if (!best || distance < best.distance) {
                best = { distance, series, point, gpu, op };
            }
        });
        if (!best || best.distance > 36) {
            focus.style.display = 'none';
            hideTooltip();
            return;
        }
        focus.style.display = 'block';
        focus.setAttribute('cx', x(best.point.batch));
        focus.setAttribute('cy', y(best.point.utilization));
        focus.setAttribute('stroke', best.gpu.color);
        showTooltip(event, best, rect, width, height);
    };
    svg.onmouseleave = () => {
        focus.style.display = 'none';
        hideTooltip();
    };
}

function renderBottleneckTable(seriesList) {
    const body = element('expert-fc-bottleneck-table');
    const gpus = gpuMap();
    const ops = opMap();
    if (!body) return;
    body.innerHTML = seriesList
        .slice()
        .sort((a, b) => `${a.gpu}|${a.op}`.localeCompare(`${b.gpu}|${b.op}`))
        .map(series => {
            const gpu = gpus.get(series.gpu);
            const op = ops.get(series.op);
            return `
                <tr>
                    <td>${escapeHtml(gpu?.label || series.gpu)}</td>
                    <td>${escapeHtml(op?.label || series.op)}</td>
                    <td>${formatNumber(series.peak_utilization, 3)}%</td>
                    <td>${escapeHtml(series.peak_batch)}</td>
                    <td>${formatNumber(series.peak_flops_per_byte, 3)}</td>
                    <td>${escapeHtml(series.peak_overall_bottleneck || '-')}</td>
                    <td>${escapeHtml(series.peak_bandwidth_bottleneck || '-')}</td>
                    <td>${formatNumber(series.peak_bandwidth_utilization, 2)}%</td>
                    <td>${escapeHtml(series.underutilization_reason || '-')}</td>
                </tr>
            `;
        })
        .join('');
}

async function renderAll() {
    const requestId = ++state.requestId;
    const descriptors = selectedSeriesDescriptors();
    const count = element('expert-selected-count');
    if (count) count.textContent = formatNumber(descriptors.length, 0);
    const seriesList = await Promise.all(descriptors.map(loadSeriesPoints));
    if (requestId !== state.requestId) return;
    renderChart(seriesList);
    renderBottleneckTable(seriesList);
}

function bindEvents() {
    element('expert-model-select')?.addEventListener('change', event => {
        state.model = event.target.value;
        renderAll();
    });
    element('expert-gpu-checkboxes')?.addEventListener('change', () => {
        setSelectedFromControls();
        renderAll();
    });
    element('expert-op-checkboxes')?.addEventListener('change', () => {
        setSelectedFromControls();
        renderAll();
    });
    window.addEventListener('resize', renderAll);
}

async function init() {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`${DATA_URL}: ${response.status}`);
    state.data = await response.json();
    state.model = state.data.models[0]?.key || '';
    state.selectedGpus = new Set(defaultGpuSelection());
    state.selectedOps = new Set(defaultOpSelection());
    renderModelSelect();
    renderGpuCheckboxes();
    renderOpCheckboxes();
    bindEvents();
    await renderAll();
}

document.addEventListener('DOMContentLoaded', () => {
    init().catch(error => {
        const svg = element('expert-fc-chart');
        if (svg) {
            svg.replaceChildren();
            const text = createSvg('text');
            text.setAttribute('x', '24');
            text.setAttribute('y', '36');
            text.setAttribute('fill', '#ff6b6b');
            text.textContent = error.message;
            svg.appendChild(text);
        }
        console.error(error);
    });
});
