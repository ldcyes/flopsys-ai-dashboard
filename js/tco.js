import { updateLanguage, currentLang, translations } from './i18n.js';
import {
    decisionSummaryPath,
    findModelInput,
    findSequenceInput,
    loadDecisionSummary,
    loadWebInputs,
    modelOptions,
    populateSelectOptions,
    sequenceOptions
} from './data.js?v=display-data-v2';
import { tcoDecisionForHardware } from './dashboard-data.js?v=display-data-v2';

let webInputs = null;
let hardwareRequestId = 0;
let calculationRequestId = 0;

const DEFAULT_CARD_PRICE = 3.0;

document.addEventListener('DOMContentLoaded', async function() {
    webInputs = await loadWebInputs();
    populateTcoInputs();
    bindEvents();
    updateLanguage(currentLang);
    await refreshTcoHardwareAndCalculation();
});

function bindEvents() {
    document.getElementById('calculate-tco-btn')?.addEventListener('click', calculateTCO);
    document.getElementById('tco-model-select')?.addEventListener('change', async () => {
        populateTcoSequences();
        await refreshTcoHardwareAndCalculation();
    });
    document.getElementById('tco-seq-select')?.addEventListener('change', refreshTcoHardwareAndCalculation);
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
    const priceInput = document.getElementById('card-price-input');
    if (priceInput && !priceInput.value) {
        priceInput.value = DEFAULT_CARD_PRICE.toFixed(2);
    }
}

function populateTcoSequences() {
    const model = document.getElementById('tco-model-select')?.value;
    populateSelectOptions(document.getElementById('tco-seq-select'), sequenceOptions(webInputs, model));
}

async function populateTcoHardware() {
    const requestId = hardwareRequestId;
    const model = document.getElementById('tco-model-select')?.value;
    const seq = document.getElementById('tco-seq-select')?.value;
    if (!model || !seq) {
        populateSelectOptions(document.getElementById('tco-gpu-select'), [], '请选择 GPU');
        return false;
    }

    const decision = await loadDecisionSummary(decisionSummaryPath(webInputs, model, seq));
    if (
        requestId !== hardwareRequestId ||
        model !== document.getElementById('tco-model-select')?.value ||
        seq !== document.getElementById('tco-seq-select')?.value
    ) return false;

    const hardware = uniqueValues(decision.tcoRows, row => row.hardware);
    const options = hardware.map(value => ({ value, label: value }));
    populateSelectOptions(document.getElementById('tco-gpu-select'), options, '请选择 GPU');
    setFirstAvailableSelectValue('tco-gpu-select');
    return true;
}

async function refreshTcoHardwareAndCalculation() {
    const requestId = ++hardwareRequestId;
    calculationRequestId += 1;
    populateSelectOptions(document.getElementById('tco-gpu-select'), [], '请选择 GPU');
    try {
        if (await populateTcoHardware()) await calculateTCO();
    } catch (error) {
        if (requestId !== hardwareRequestId) return;
        console.error(error);
        const message = translations[currentLang]?.['tco-excel-error'] || 'Failed to read the decision summary';
        showEmptyResult(message);
    }
}

function setFirstAvailableSelectValue(selectId) {
    const select = document.getElementById(selectId);
    if (!select || select.value) return;
    const firstValue = [...select.options].find(option => option.value !== '');
    if (firstValue) select.value = firstValue.value;
}

function uniqueValues(rows, getter) {
    return [...new Set(rows.map(getter).filter(value => value !== undefined && value !== null && value !== ''))]
        .sort((left, right) => String(left).localeCompare(String(right), undefined, { numeric: true }));
}

function hasValue(value) {
    return value !== undefined && value !== null && value !== '' && !Number.isNaN(value);
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
    const requestId = ++calculationRequestId;
    const model = document.getElementById('tco-model-select')?.value;
    const seq = document.getElementById('tco-seq-select')?.value;
    const gpu = document.getElementById('tco-gpu-select')?.value;
    const priceInput = document.getElementById('card-price-input');
    const parsedPrice = parseFloat(priceInput?.value || '');
    const cardPrice = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : DEFAULT_CARD_PRICE;

    if (priceInput && (!priceInput.value || parsedPrice <= 0)) {
        priceInput.value = cardPrice.toFixed(2);
    }
    if (!model || !seq) {
        const message = translations[currentLang]?.['tco-input-missing'] || 'Please select model, input/output, and machine first';
        showEmptyResult(message);
        return;
    }
    if (!gpu) {
        await refreshTcoHardwareAndCalculation();
        return;
    }

    const sequence = findSequenceInput(webInputs, model, seq);
    const modelLabel = findModelInput(webInputs, model).label;
    try {
        const decision = await loadDecisionSummary(decisionSummaryPath(webInputs, model, seq));
        if (requestId !== calculationRequestId) return;
        const bestCfg = tcoDecisionForHardware(decision.tcoRows, gpu);
        if (!bestCfg) {
            const message = translations[currentLang]?.['tco-no-config-found'] || 'No stored TCO decision was found for this selection';
            showEmptyResult(message);
            return;
        }
        displayResults(modelLabel, sequence, gpu, cardPrice, bestCfg);
    } catch (error) {
        if (requestId !== calculationRequestId) return;
        console.error(error);
        const message = translations[currentLang]?.['tco-excel-error'] || 'Failed to read the decision summary';
        showEmptyResult(message);
    }
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
        const throughput = bestCfg.throughput_total_tps || bestCfg.tps_per_gpu * Math.max(bestCfg.gpu_num, 1);
        if (!throughput || throughput <= 0) return null;
        return cardPrice * Math.max(bestCfg.gpu_num, 1) * 1_000_000 / (throughput * 3600);
    }

    const t = translations[currentLang] || {};
    const resultCard = document.createElement('div');
    resultCard.className = 'result-card';
    const pricePerMillion = pricePerMillionTokens(bestCfg);
    const inputSeq = formatSeqLength(sequence?.inputLen);
    const outputSeq = formatSeqLength(sequence?.outputLen);
    const modeFlags = [
        bestCfg.strategy_type ? bestCfg.strategy_type.replaceAll('_', ' / ') : '',
        bestCfg.pd_enabled ? 'PD' : '',
        bestCfg.af_enabled ? 'AF' : '',
        hasValue(bestCfg.mtp_stage) ? `MTP stage ${formatValue(bestCfg.mtp_stage)}` : ''
    ].filter(Boolean).join(' | ');

    resultCard.innerHTML = `
        <div class="result-header">
            <h3>${escapeHtml(model)} / ${escapeHtml(gpu)} - ${escapeHtml(inputSeq)} input / ${escapeHtml(outputSeq)} output</h3>
        </div>
        <div class="result-details">
            <div class="result-item">
                <span class="result-label">${escapeHtml(t['tco-best-config'] || 'Best configuration')}</span>
                <span class="result-value">${escapeHtml(bestCfg.config_name || '-')}</span>
            </div>
            <div class="result-item">
                <span class="result-label">${escapeHtml(t['tco-strategy'] || 'Strategy')}</span>
                <span class="result-value">${escapeHtml(modeFlags || '-')}</span>
            </div>
            <div class="result-item">
                <span class="result-label">${escapeHtml(t['tco-parallel-config'] || 'Parallel config')}</span>
                <span class="result-value">
                    GPUs=${escapeHtml(formatValue(bestCfg.gpu_num))}
                    | batch=${escapeHtml(formatValue(bestCfg.batch))}
                    | pp=${escapeHtml(formatValue(bestCfg.pp))}
                    | attn dp/tp/cp=${escapeHtml(formatValue(bestCfg.attn_dp))}/${escapeHtml(formatValue(bestCfg.attn_tp))}/${escapeHtml(formatValue(bestCfg.attn_cp))}
                    | ffn ep/tp=${escapeHtml(formatValue(bestCfg.ffn_ep))}/${escapeHtml(formatValue(bestCfg.ffn_tp))}
                </span>
            </div>
            <div class="result-item">
                <span class="result-label">${escapeHtml(t['tco-throughput'] || 'Throughput')}</span>
                <span class="result-value">
                    TPS/GPU=${escapeHtml(bestCfg.tps_per_gpu.toFixed(2))}
                    | TPS/request=${escapeHtml(bestCfg.tps_per_user.toFixed(2))}
                    | total TPS=${escapeHtml(bestCfg.throughput_total_tps.toFixed(2))}
                </span>
            </div>
            ${pricePerMillion != null ? `
            <div class="result-item">
                <span class="result-label">${escapeHtml(t['tco-price-per-million'] || 'Price per 1M tokens')}</span>
                <span class="result-value">$${escapeHtml(pricePerMillion.toFixed(4))}</span>
            </div>` : ''}
            ${bestCfg.decode_config_summary || bestCfg.prefill_config_summary ? `
            <div class="result-item">
                <span class="result-label">${escapeHtml(t['tco-summary'] || 'Summary')}</span>
                <span class="result-value">
                    ${escapeHtml([bestCfg.decode_config_summary, bestCfg.prefill_config_summary].filter(Boolean).join(' | '))}
                </span>
            </div>` : ''}
        </div>
    `;

    resultsContainer.appendChild(resultCard);
}
