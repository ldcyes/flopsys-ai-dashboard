import { updateLanguage, currentLang, translations } from './i18n.js';
import {
    findSequenceInput,
    loadWebInputs,
    modelOptions,
    populateSelectOptions,
    sequenceOptions,
    strategyPayloadOptions
} from './data.js';

let webInputs = null;

const DEFAULT_CARD_PRICE = 3.0;
const MIN_TPS_PER_USER = 20;

document.addEventListener('DOMContentLoaded', async function() {
    webInputs = await loadWebInputs();
    populateTcoInputs();
    bindEvents();
    updateLanguage(currentLang);
    await calculateTCO();
});

function bindEvents() {
    document.getElementById('calculate-tco-btn')?.addEventListener('click', calculateTCO);
    document.getElementById('tco-model-select')?.addEventListener('change', () => {
        populateTcoSequences();
        populateTcoHardware();
        calculateTCO();
    });
    document.getElementById('tco-seq-select')?.addEventListener('change', () => {
        populateTcoHardware();
        calculateTCO();
    });
    document.getElementById('tco-gpu-select')?.addEventListener('change', calculateTCO);
    document.getElementById('card-price-input')?.addEventListener('change', calculateTCO);
    document.getElementById('lang-select')?.addEventListener('change', event => {
        updateLanguage(event.target.value);
    });
}

function populateTcoInputs() {
    populateSelectOptions(document.getElementById('tco-model-select'), modelOptions(webInputs), '请选择模型');
    setFirstAvailableSelectValue('tco-model-select');
    populateTcoSequences();
    populateTcoHardware();
    const priceInput = document.getElementById('card-price-input');
    if (priceInput && !priceInput.value) {
        priceInput.value = DEFAULT_CARD_PRICE.toFixed(2);
    }
}

function populateTcoSequences() {
    const model = document.getElementById('tco-model-select')?.value;
    populateSelectOptions(document.getElementById('tco-seq-select'), sequenceOptions(webInputs, model));
}

function populateTcoHardware() {
    const model = document.getElementById('tco-model-select')?.value;
    const seq = document.getElementById('tco-seq-select')?.value;
    const descriptors = strategyPayloadOptions(webInputs, model, seq);
    const hardware = uniqueValues(
        descriptors.flatMap(descriptor => Array.isArray(descriptor.hardware) ? descriptor.hardware : []),
        value => value
    );
    const options = (hardware.length ? hardware : (webInputs?.hardware || []))
        .map(value => ({ value, label: value }));
    populateSelectOptions(document.getElementById('tco-gpu-select'), options, '请选择 GPU');
    setFirstAvailableSelectValue('tco-gpu-select');
}

function setFirstAvailableSelectValue(selectId) {
    const select = document.getElementById(selectId);
    if (!select || select.value) return;
    const firstValue = [...select.options].find(option => option.value !== '');
    if (firstValue) {
        select.value = firstValue.value;
    }
}

function uniqueValues(rows, getter) {
    return [...new Set(rows.map(getter).filter(value => value !== undefined && value !== null && value !== ''))]
        .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function number(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

function hasValue(value) {
    return value !== undefined && value !== null && value !== '' && !Number.isNaN(value);
}

function truthy(value) {
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'True';
}

function formatSeqLength(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value || '-');
    return numeric % 1024 === 0 ? `${numeric / 1024}K` : String(numeric);
}

function formatValue(value, fallback = '-') {
    if (!hasValue(value)) return fallback;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
        return Number.isInteger(numeric) ? String(numeric) : numeric.toPrecision(4).replace(/0+$/, '').replace(/\.$/, '');
    }
    return String(value);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

async function calculateTCO() {
    const model = document.getElementById('tco-model-select')?.value;
    const seq = document.getElementById('tco-seq-select')?.value;
    const gpu = document.getElementById('tco-gpu-select')?.value;
    const priceInput = document.getElementById('card-price-input');
    const parsedPrice = parseFloat(priceInput?.value || '');
    const cardPrice = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : DEFAULT_CARD_PRICE;

    if (priceInput && (!priceInput.value || parsedPrice <= 0)) {
        priceInput.value = cardPrice.toFixed(2);
    }

    if (!model || !seq || !gpu) {
        const msg = translations[currentLang]?.['tco-input-missing'] || 'Please select model, input/output, and machine first';
        showEmptyResult(msg);
        return;
    }

    const sequence = findSequenceInput(webInputs, model, seq);

    try {
        const bestCfg = await loadBestConfigFromStrategyPayloads(model, seq, gpu);
        if (!bestCfg) {
            const msg = translations[currentLang]?.['tco-no-config-found'] || 'No strategy payload candidate was found for this selection';
            showEmptyResult(msg);
            return;
        }
        displayResults(model, sequence, gpu, cardPrice, bestCfg);
    } catch (err) {
        console.error(err);
        const msg = translations[currentLang]?.['tco-excel-error'] || 'Failed to read latest strategy payloads';
        showEmptyResult(msg);
    }
}

function descriptorMatchesHardware(descriptor, gpu) {
    const hardware = Array.isArray(descriptor.hardware) ? descriptor.hardware.map(String) : [];
    return !gpu || hardware.includes(String(gpu));
}

async function loadStrategyPayload(descriptor) {
    const response = await fetch(descriptor.path);
    if (!response.ok) throw new Error(`${descriptor.path}: ${response.status}`);
    return response.json();
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

function normalizeStrategy(point, descriptor) {
    if (point.strategy_type !== undefined && point.strategy_type !== null && point.strategy_type !== 'None') {
        return String(point.strategy_type);
    }
    const mtpModel = String(point.mtp_model ?? '').toLowerCase();
    if (truthy(point.pd_enabled) && truthy(point.af_enabled)) return 'pd_af';
    if (truthy(point.pd_enabled)) return 'pd';
    if (truthy(point.af_enabled)) return 'af';
    if (descriptor.kind === 'mtp_stage' || mtpModel && !['off', 'none', 'false', '0'].includes(mtpModel)) return 'mtp';
    return 'monolithic';
}

function normalizeStrategyPoint(point, descriptor) {
    const gpuNum = number(point.gpu_num ?? point['Gpu num'] ?? descriptor.gpuNums?.[0]);
    const tpsPerGpu = number(point.tps_per_gpu ?? point['TPS per gpu']);
    const throughputTotal = number(point.throughput_total_tps ?? point['throughput_total_tps']);
    const hardware = String(point.hardware || point.GPU || descriptor.hardware?.[0] || '');
    return {
        configName: point.Config_Name || point.config_name || point.config_summary || descriptor.label || '',
        configSummary: point.config_summary || '',
        decodeConfigSummary: point.decode_config_summary || '',
        prefillConfigSummary: point.prefill_config_summary || '',
        hardware,
        gpuNum,
        strategyType: normalizeStrategy(point, descriptor),
        tpsPerGpu,
        tpsPerUser: number(point.tps_per_user ?? point['TPS per user']),
        throughputTotalTps: throughputTotal || tpsPerGpu * Math.max(gpuNum, 1),
        batch: point.batch ?? point.Batch ?? point.batch_attn_gpu ?? point['batch attn gpu'] ?? '',
        pp: point.pp ?? point.PP ?? '',
        attnDp: point.attn_dp ?? point['attn dp'] ?? '',
        attnTp: point.attn_tp ?? point['attn tp'] ?? '',
        attnCp: point.attn_cp ?? point['attn cp'] ?? '',
        ffnEp: point.ffn_ep ?? point['ffn ep'] ?? '',
        ffnTp: point.ffn_tp ?? point['ffn tp'] ?? '',
        mtpStage: point.mtp_stage ?? point['mtp stage'] ?? '',
        pdEnabled: truthy(point.pd_enabled),
        afEnabled: truthy(point.af_enabled)
    };
}

async function loadBestConfigFromStrategyPayloads(model, seq, gpu) {
    const descriptors = strategyPayloadOptions(webInputs, model, seq)
        .filter(descriptor => descriptorMatchesHardware(descriptor, gpu));
    if (!descriptors.length) return null;

    const loaded = await Promise.all(descriptors.map(async descriptor => ({
        descriptor,
        payload: await loadStrategyPayload(descriptor)
    })));
    const points = loaded.flatMap(({ descriptor, payload }) =>
        decodeCompactRecords(payload).map(point => normalizeStrategyPoint(point, descriptor))
    );
    const candidates = points.filter(point =>
        String(point.hardware) === String(gpu) &&
        point.tpsPerGpu > 0 &&
        point.throughputTotalTps > 0 &&
        point.tpsPerUser >= MIN_TPS_PER_USER
    );
    if (!candidates.length) return null;

    return candidates.sort((a, b) =>
        b.tpsPerGpu - a.tpsPerGpu ||
        b.throughputTotalTps - a.throughputTotalTps ||
        b.tpsPerUser - a.tpsPerUser
    )[0];
}

function showEmptyResult(message) {
    const resultsContainer = document.getElementById('tco-results');
    if (!resultsContainer) return;
    resultsContainer.innerHTML = `
        <div class="result-card empty-state">
            ${escapeHtml(message)}
        </div>
    `;
}

function displayResults(model, sequence, gpu, cardPrice, bestCfg) {
    const resultsContainer = document.getElementById('tco-results');
    if (!resultsContainer) return;
    resultsContainer.innerHTML = '';

    function pricePerMillionTokens(bestCfg) {
        const throughput = bestCfg.throughputTotalTps || bestCfg.tpsPerGpu * Math.max(bestCfg.gpuNum, 1);
        if (!throughput || throughput <= 0) return null;
        return cardPrice * Math.max(bestCfg.gpuNum, 1) * 1_000_000 / (throughput * 3600);
    }

    const t = translations[currentLang] || {};
    const resultCard = document.createElement('div');
    resultCard.className = 'result-card';
    const pricePerMillion = pricePerMillionTokens(bestCfg);
    const inputSeq = formatSeqLength(sequence?.inputLen);
    const outputSeq = formatSeqLength(sequence?.outputLen);
    const modeFlags = [
        bestCfg.strategyType ? bestCfg.strategyType.replaceAll('_', ' / ') : '',
        bestCfg.pdEnabled ? 'PD' : '',
        bestCfg.afEnabled ? 'AF' : '',
        hasValue(bestCfg.mtpStage) ? `MTP stage ${formatValue(bestCfg.mtpStage)}` : ''
    ].filter(Boolean).join(' | ');

    resultCard.innerHTML = `
        <div class="result-header">
            <h3>${escapeHtml(model)} / ${escapeHtml(gpu)} - ${escapeHtml(inputSeq)} input / ${escapeHtml(outputSeq)} output</h3>
        </div>
        <div class="result-details">
            <div class="result-item">
                <span class="result-label">${escapeHtml(t['tco-best-config'] || 'Best configuration')}</span>
                <span class="result-value">${escapeHtml(bestCfg.configName || bestCfg.configSummary || '-')}</span>
            </div>
            <div class="result-item">
                <span class="result-label">${escapeHtml(t['tco-strategy'] || 'Strategy')}</span>
                <span class="result-value">${escapeHtml(modeFlags || '-')}</span>
            </div>
            <div class="result-item">
                <span class="result-label">${escapeHtml(t['tco-parallel-config'] || 'Parallel config')}</span>
                <span class="result-value">
                    GPUs=${escapeHtml(formatValue(bestCfg.gpuNum))}
                    | batch=${escapeHtml(formatValue(bestCfg.batch))}
                    | pp=${escapeHtml(formatValue(bestCfg.pp))}
                    | attn dp/tp/cp=${escapeHtml(formatValue(bestCfg.attnDp))}/${escapeHtml(formatValue(bestCfg.attnTp))}/${escapeHtml(formatValue(bestCfg.attnCp))}
                    | ffn ep/tp=${escapeHtml(formatValue(bestCfg.ffnEp))}/${escapeHtml(formatValue(bestCfg.ffnTp))}
                </span>
            </div>
            <div class="result-item">
                <span class="result-label">${escapeHtml(t['tco-throughput'] || 'Throughput')}</span>
                <span class="result-value">
                    TPS/GPU=${escapeHtml(bestCfg.tpsPerGpu.toFixed(2))}
                    | TPS/request=${escapeHtml(bestCfg.tpsPerUser.toFixed(2))}
                    | total TPS=${escapeHtml(bestCfg.throughputTotalTps.toFixed(2))}
                </span>
            </div>
            ${pricePerMillion != null ? `
            <div class="result-item">
                <span class="result-label">${escapeHtml(t['tco-price-per-million'] || 'Price per 1M tokens')}</span>
                <span class="result-value">$${escapeHtml(pricePerMillion.toFixed(4))}</span>
            </div>` : ''}
            ${bestCfg.decodeConfigSummary || bestCfg.prefillConfigSummary ? `
            <div class="result-item">
                <span class="result-label">${escapeHtml(t['tco-summary'] || 'Summary')}</span>
                <span class="result-value">
                    ${escapeHtml([bestCfg.decodeConfigSummary, bestCfg.prefillConfigSummary].filter(Boolean).join(' | '))}
                </span>
            </div>` : ''}
        </div>
    `;

    resultsContainer.appendChild(resultCard);
}
