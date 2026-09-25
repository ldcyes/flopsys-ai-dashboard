/** Bounded deployment comparisons; no legacy Pareto schema or candidate downloads. */
export const MODE_IDS = Object.freeze([
    'all_gpu', 'pd_gpu', 'pd_draft_gpu', 'pd_draft_lpu',
    'pafd_split_draft_lpu', 'prefill_gpu_decode_lpu',
]);
const MODE_LABELS = {
    all_gpu: 'ALL(GPU)', pd_gpu: 'P(GPU) + D(GPU)',
    pd_draft_gpu: 'P(GPU) + D(GPU) + draft(GPU)',
    pd_draft_lpu: 'P(GPU) + D(GPU) + draft(LPU)',
    pafd_split_draft_lpu: 'PA(GPU) + PF(LPU) + DA(GPU) + DF(LPU) + draft(LPU)',
    prefill_gpu_decode_lpu: 'PA(GPU) + PF(GPU) + DA(LPU) + DF(LPU) + draft(LPU)',
};
function invariant(ok, message) { if (!ok) throw new Error(message); }
function string(value, name) { invariant(typeof value === 'string' && value.trim(), `${name}: expected nonempty text`); }
function number(value, name, min = 0, integer = false) {
    invariant(typeof value === 'number' && Number.isFinite(value) && value >= min &&
        (!integer || Number.isInteger(value)), `${name}: invalid number`);
}
function list(value, name) { invariant(Array.isArray(value), `${name}: expected array`); }
function unique(items, name) {
    const ids = new Set();
    for (const item of items) { string(item?.id, `${name}.id`); invariant(!ids.has(item.id), `${name}: duplicate id`); ids.add(item.id); }
    return ids;
}
export function validateDeploymentData(data) {
    invariant(data?.schema_version === 'deployment-comparison-v1', 'Unsupported deployment schema');
    string(data.model?.id, 'model.id'); string(data.model?.label, 'model.label'); string(data.model?.revision, 'model.revision');
    invariant(data.provenance && typeof data.provenance === 'object' && !Array.isArray(data.provenance), 'Missing provenance');
    for (const key of ['modes', 'workloads', 'rows', 'assumptions']) list(data[key], key);
    data.assumptions.forEach(value => string(value, 'assumption'));
    const modeIds = unique(data.modes, 'modes');
    invariant(modeIds.size === MODE_IDS.length && MODE_IDS.every(id => modeIds.has(id)), 'Expected all six mode definitions');
    data.modes.forEach(mode => string(mode.label, 'mode.label'));
    const workloads = unique(data.workloads, 'workloads');
    invariant(workloads.size > 0, 'Missing workloads');
    data.workloads.forEach(w => {
        number(w.input_len, 'input_len', 1, true); number(w.output_len, 'output_len', 1, true); string(w.policy, 'policy');
    });
    unique(data.rows, 'rows');
    for (const row of data.rows) {
        invariant(modeIds.has(row.mode_id) && workloads.has(row.workload_id), 'Unknown mode/workload reference');
        string(row.hardware, 'hardware'); number(row.batch, 'batch', 1, true);
        number(row.gpu_count, 'gpu_count', 0, true); number(row.lpu_count, 'lpu_count', 0, true);
        invariant(['feasible', 'infeasible', 'unsupported'].includes(row.status), 'Unknown row status');
        if (row.status === 'feasible') {
            for (const key of ['ttft_s', 'tpot_s', 'output_tps', 'request_rps', 'e2e_s']) {
                number(row.metrics?.[key], key, key === 'tpot_s' ? 0 : Number.MIN_VALUE);
            }
            number(row.metrics?.expected_tokens, 'expected_tokens', 1);
            number(row.metrics?.verification_length, 'verification_length', 0, true);
            invariant(row.metrics.expected_tokens <= 6 && row.metrics.verification_length <= 5, 'Invalid DSpark width');
        } else string(row.reason, 'reason');
        for (const key of ['pools', 'stages', 'links', 'modeling_notes']) list(row[key], key);
        row.modeling_notes.forEach(value => string(value, 'modeling_note'));
        const pools = unique(row.pools, 'pools');
        for (const pool of row.pools) {
            string(pool.kind, 'pool.kind'); string(pool.hardware, 'pool.hardware'); number(pool.count, 'pool.count', 1, true);
            for (const key of ['memory_bytes_per_device', 'capacity_bytes_per_device']) {
                if (pool[key] != null) number(pool[key], key);
            }
            if (pool.memory_tiers) for (const key of ['sram_resident_bytes', 'sram_capacity_bytes',
                'external_resident_bytes', 'external_capacity_bytes', 'bandwidth_GBps_per_device', 'host_capacity_bytes_excluded']) {
                number(pool.memory_tiers[key], key);
            }
        }
        if (row.memory_transfers) {
            list(row.memory_transfers, 'memory_transfers');
            for (const transfer of row.memory_transfers) {
                invariant(pools.has(transfer.pool_id), 'Unknown memory transfer pool');
                for (const key of ['seconds', 'bytes_per_device', 'native_seconds', 'total_seconds']) number(transfer[key], key);
            }
        }
        unique(row.stages, 'stages'); unique(row.links, 'links');
        for (const stage of row.stages) {
            invariant(pools.has(stage.pool_id), 'Unknown stage pool'); number(stage.seconds_per_request, 'seconds_per_request');
        }
        for (const link of row.links) {
            number(link.bytes_per_request, 'bytes_per_request'); number(link.bandwidth_GBps, 'bandwidth_GBps', Number.MIN_VALUE); number(link.latency_s, 'latency_s');
        }
    }
    return data;
}
export function selectDeploymentRows(data, selection = {}) {
    return data.rows.filter(row => ['workload_id', 'hardware', 'batch'].every(key =>
        !selection[key] || String(row[key]) === String(selection[key])));
}
function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (className) el.className = className;
    return el;
}
function format(value, digits = 3) { return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'; }
function bytes(value) { return value == null ? '未提供 / unknown' : `${format(value / 1024 ** 3)} GiB`; }
function table(headers, rows) {
    const wrap = node('div', null, 'deployment-table-wrap');
    const result = node('table'); const head = node('thead'); const tr = node('tr');
    headers.forEach(label => { const th = node('th', label); th.scope = 'col'; tr.append(th); });
    head.append(tr); result.append(head); const body = node('tbody');
    for (const values of rows) { const row = node('tr'); values.forEach(value => row.append(node('td', value))); body.append(row); }
    result.append(body); wrap.append(result); return wrap;
}
function renderRow(row) {
    const article = node('article', null, 'deployment-row'); article.dataset.rowId = row.id;
    const feasible = row.status === 'feasible';
    article.append(node('h4', `${row.hardware} · Batch ${row.batch} · ${row.gpu_count} GPU + ${row.lpu_count} LPU`));
    if (row.allocation) article.append(node('p', row.allocation.policy === 'total_gpu'
        ? `资源口径：总 GPU 预算 ${row.allocation.scale}，按 GPU 池均分；LPU 另计。`
        : `资源口径：每个独立 GPU 池 ${row.allocation.scale} 张；请比较上方实际总数。`));
    article.append(node('p', feasible ? '可行 / feasible' : `${row.status === 'infeasible' ? '不可行' : '暂不支持'}: ${row.reason}`, `deployment-${row.status}`));
    if (feasible) {
        const m = row.metrics;
        article.append(table(['TTFT (s)', 'TPOT (ms)', '输出 TPS', '请求/s', 'E2E (s)', '每周期期望 token', '草稿前缀上限 k'],
            [[format(m.ttft_s), format(m.tpot_s * 1000), format(m.output_tps), format(m.request_rps), format(m.e2e_s), format(m.expected_tokens), m.verification_length]]));
    }
    if (row.bottleneck) article.append(node('p', `瓶颈 / bottleneck: ${row.bottleneck}`));
    const detail = node('details'); detail.append(node('summary', '资源、阶段与链路明细 / Details'));
    detail.append(node('h5', '资源池（共享 pool ID 表示竞争同一资源）'));
    detail.append(table(['Pool', '类型', '硬件', '数量', '驻留/设备', '容量/设备', '并行度 / 补齐 batch', 'GPU 机架放置'], row.pools.map(p =>
        [p.id, p.kind, p.hardware, p.count, bytes(p.memory_bytes_per_device), bytes(p.capacity_bytes_per_device),
            p.parallelism ? `A TP=${p.parallelism.attn_tp} / DP=${p.parallelism.attn_dp}; F EP=${p.parallelism.ffn_ep} / DP=${p.parallelism.ffn_dp}; padded B=${p.native_padded_batch}` : '—',
            p.rack_placement?.map(r => `rack ${r.rack}: ${r.gpu_count} GPU`).join('; ') || '—'])));
    const tierPools = row.pools.filter(p => p.memory_tiers);
    if (tierPools.length) {
        detail.append(node('h5', 'LPU 分层内存（每颗；主机内存不计入容量）'));
        detail.append(table(['Pool', 'SRAM 驻留 / 容量', '外部 DRAM 驻留 / 容量', '外部 GB/s/颗（假设）', '主机内存不计入'], tierPools.map(p => {
            const m = p.memory_tiers;
            return [p.id, `${bytes(m.sram_resident_bytes)} / ${bytes(m.sram_capacity_bytes)}`,
                `${bytes(m.external_resident_bytes)} / ${bytes(m.external_capacity_bytes)}`,
                format(m.bandwidth_GBps_per_device, 3), bytes(m.host_capacity_bytes_excluded)];
        })));
    }
    if (row.memory_transfers?.length) {
        detail.append(node('h5', '外部内存搬运（整池一次阶段调用；已计入阶段时间，勿重复相加）'));
        detail.append(node('p', '逐 query width 列出候选曲线；最终执行量由草稿前缀 k 与周期数决定。'));
        detail.append(table(['Pool', '阶段 / 角色 / q', '搬运/颗', '搬运 s', '原生 s', '合计 s'], row.memory_transfers.map(t =>
            [t.pool_id, `${t.phase} / ${t.role} / ${t.query_width}`, bytes(t.bytes_per_device),
                format(t.seconds, 6), format(t.native_seconds, 6), format(t.total_seconds, 6)])));
    }
    detail.append(node('h5', '阶段服务需求（秒/请求，不等于流水线延迟）'));
    detail.append(table(['阶段', 'Pool', 's/request'], row.stages.map(s => [s.id, s.pool_id, format(s.seconds_per_request, 6)])));
    detail.append(node('h5', '链路（十进制 GB/s）'));
    detail.append(table(['链路', 'Bytes/request', 'GB/s', '延迟 s'], row.links.map(l => [l.id, format(l.bytes_per_request), format(l.bandwidth_GBps), format(l.latency_s, 6)])));
    if (row.modeling_notes.length) { const ul = node('ul'); row.modeling_notes.forEach(text => ul.append(node('li', text))); detail.append(ul); }
    article.append(detail); return article;
}
export function mountDeploymentPanel(root) {
    const status = node('p', '展开后加载部署比较数据。', 'deployment-status'); status.dataset.deploymentStatus = ''; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const controls = node('div', null, 'deployment-controls');
    const results = node('div'); results.dataset.deploymentResults = '';
    const retry = node('button', '重试'); retry.type = 'button'; retry.hidden = true;
    root.append(status, retry, controls, results);
    let data; let pending = false;
    function render() {
        const selection = {};
        controls.querySelectorAll('select').forEach(select => { selection[select.dataset.filter === 'workload' ? 'workload_id' : select.dataset.filter] = select.value; });
        const rows = selectDeploymentRows(data, selection); results.replaceChildren();
        for (const id of MODE_IDS) {
            const mode = data.modes.find(item => item.id === id);
            const section = node('section', null, 'deployment-mode'); section.dataset.modeId = id;
            section.append(node('h3', MODE_LABELS[id]));
            if (mode.label.replaceAll(' ', '') !== MODE_LABELS[id].replaceAll(' ', '') && mode.label !== id) section.append(node('p', mode.label));
            if (mode.notes) section.append(node('p', Array.isArray(mode.notes) ? mode.notes.join('；') : mode.notes));
            const matches = rows.filter(row => row.mode_id === id);
            if (matches.length) matches.forEach(row => section.append(renderRow(row)));
            else section.append(node('p', '当前筛选尚无结果；未模拟或缺少该资源组合，不代表性能为零。', 'deployment-missing'));
            results.append(section);
        }
        status.textContent = `已加载 ${data.model.label} · ${rows.length} 个配置 / 6 种部署模式。结果为分析模型估计。`;
    }
    function buildControls() {
        controls.replaceChildren();
        for (const [key, label, options] of [
            ['workload', '工作负载', data.workloads.map(w => [w.id, `${w.input_len} input / ${w.output_len} output · ${w.policy}`])],
            ['hardware', '主硬件', [...new Set(data.rows.map(r => r.hardware))].sort().map(value => [value, value])],
            ['batch', 'Batch（整个资源池）', [...new Set(data.rows.map(r => r.batch))].sort((a,b) => a-b).map(value => [String(value), String(value)])],
        ]) {
            const wrapper = node('label', label); const select = node('select'); select.dataset.filter = key;
            const all = node('option', '全部 / All'); all.value = ''; select.append(all);
            options.forEach(([value, text]) => { const option = node('option', text); option.value = value; select.append(option); });
            if (key === 'workload' && options.length) select.value = options[0][0];
            const preferred = data.default_selection?.[key];
            if (preferred != null && options.some(([value]) => value === String(preferred))) select.value = String(preferred);
            select.addEventListener('change', render); wrapper.append(select); controls.append(wrapper);
        }
    }
    async function load() {
        if (pending || data) return;
        pending = true; retry.hidden = true; root.setAttribute('aria-busy', 'true'); status.textContent = '正在加载部署比较…';
        try {
            const response = await fetch('data/deployment_modes.json', { cache: 'no-cache' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const next = validateDeploymentData(await response.json());
            data = next; buildControls();
            const assumptions = node('details', null, 'deployment-assumptions'); assumptions.append(node('summary', '模型来源与假设 / Provenance'));
            assumptions.append(node('p', `模型: ${data.model.label} · revision: ${data.model.revision}`));
            const ul = node('ul'); data.assumptions.forEach(text => ul.append(node('li', text))); assumptions.append(ul);
            assumptions.append(node('pre', JSON.stringify(data.provenance, null, 2))); root.append(assumptions); render();
        } catch (error) {
            status.textContent = `加载失败：${error.message}。请重试。`; retry.hidden = false;
        } finally { pending = false; root.setAttribute('aria-busy', 'false'); }
    }
    retry.addEventListener('click', load);
    const lazy = root.closest('[data-deployment-lazy]');
    if (lazy) { lazy.addEventListener('toggle', () => { if (lazy.open) load(); }); if (lazy.open) load(); }
    else load();
    return { load };
}
if (typeof document !== 'undefined') document.querySelectorAll('[data-deployment-root]').forEach(mountDeploymentPanel);
