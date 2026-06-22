import { changeLanguage } from './i18n.js';
import {
    tpOptions,
    ppOptions,
    batchOptions,
    loadWebInputs,
    modelOptions,
    sequenceOptions,
    populateSelectOptions
} from './data.js';
import { initStrategyParetoPanel, updateStrategyParetoPanel } from './strategy-pareto.js?v=20260623-tiered-strategy-frontiers';

let webInputs = null;
let batchInputOptions = batchOptions;

const IMPLICIT_PARALLEL_VALUES = {
    'attn-tp': '1',
    'ffn-tp': '1',
    'pp': '1'
};

document.addEventListener('DOMContentLoaded', async function() {
    webInputs = await loadWebInputs();
    batchInputOptions = webInputs.batches || batchOptions;
    populateModelAndSequenceSelects();
    generateTPCheckboxes();
    generatePPCheckboxes();
    generateBatchSlider();

    setDefaultSelectValue('model-select');
    setDefaultSelectValue('seq-select');

    selectAllCheckboxes('#attn-tp-group');
    selectAllCheckboxes('#ffn-tp-group');
    selectAllCheckboxes('#pp-group');
    setBatchSliderIndex(Math.max(batchInputOptions.length - 1, 0));

    initStrategyParetoPanel(webInputs);
    bindEventListeners();
    handleConfigChange();
});

function populateModelAndSequenceSelects() {
    populateSelectOptions(document.getElementById('model-select'), modelOptions(webInputs), '请选择模型');
    populateSequenceSelect();
}

function populateSequenceSelect() {
    const modelValue = document.getElementById('model-select')?.value;
    populateSelectOptions(document.getElementById('seq-select'), sequenceOptions(webInputs, modelValue));
}

function setDefaultSelectValue(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    for (let i = 0; i < select.options.length; i++) {
        const option = select.options[i];
        if (option.value !== '') {
            select.value = option.value;
            break;
        }
    }
}

function setFirstCheckboxChecked(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const firstCheckbox = container.querySelector('input[type="checkbox"]');
    if (firstCheckbox) firstCheckbox.checked = true;
}

function selectAllCheckboxes(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
    });
}

function setPreferredHardwareCheckbox(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const inputs = [...container.querySelectorAll('input[type="checkbox"]')];
    if (!inputs.length) return;
    const preferred = inputs.find(input => /r300/i.test(input.value))
        || inputs.find(input => /rubin/i.test(input.value))
        || inputs.find(input => /b300/i.test(input.value))
        || inputs[0];
    inputs.forEach(input => {
        input.checked = input === preferred;
    });
}

function resetStrategyFilterDefaults() {
    setPreferredHardwareCheckbox('#strategy-hardware-group');
    setFirstCheckboxChecked('#strategy-gpu-num-group');
    selectAllCheckboxes('#strategy-type-group');
    const strategyColorMode = document.querySelector('input[name="strategy-color-mode"][value="strategy"]');
    if (strategyColorMode) strategyColorMode.checked = true;
    setRangeSliderIndex('strategy-stage-slider', 'strategy-stage-value', 9, Array.from({ length: 10 }, (_, index) => String(index)));
    setRangeSliderIndex('attn-cp-slider', 'attn-cp-value', 3, ['1', '2', '4', '8']);
}

function generateTPCheckboxes() {
    const attnContainer = document.getElementById('attn-tp-group');
    const ffnContainer = document.getElementById('ffn-tp-group');
    if (!attnContainer || !ffnContainer) return;

    attnContainer.innerHTML = '';
    ffnContainer.innerHTML = '';

    tpOptions[0].values.forEach(value => {
        const num = value.replace('TP', '');
        if (num === '1') return;
        attnContainer.innerHTML += `
            <div class="checkbox-item">
                <input type="checkbox" id="attn-tp-${num}" value="${num}">
                <label for="attn-tp-${num}">${value}</label>
            </div>
        `;
    });

    tpOptions[1].values.forEach(value => {
        const num = value.replace('TP', '');
        if (num === '1') return;
        ffnContainer.innerHTML += `
            <div class="checkbox-item">
                <input type="checkbox" id="ffn-tp-${num}" value="${num}">
                <label for="ffn-tp-${num}">${value}</label>
            </div>
        `;
    });
}

function generatePPCheckboxes() {
    const container = document.getElementById('pp-group');
    if (!container) return;
    container.innerHTML = '';

    ppOptions.forEach(value => {
        const num = value.replace('PP', '');
        if (num === '1') return;
        container.innerHTML += `
            <div class="checkbox-item">
                <input type="checkbox" id="pp-${num}" value="${num}">
                <label for="pp-${num}">${value}</label>
            </div>
        `;
    });
}

function generateBatchSlider() {
    const slider = document.getElementById('batch-slider');
    if (!slider) return;
    const maxIndex = Math.max(batchInputOptions.length - 1, 0);
    const configured = slider.dataset?.configured === 'true';
    const previous = configured ? Number(slider.value || maxIndex) : maxIndex;
    slider.min = '0';
    slider.max = String(maxIndex);
    slider.step = '1';
    slider.value = String(Math.max(0, Math.min(previous, maxIndex)));
    if (slider.dataset) slider.dataset.configured = 'true';
    updateBatchSliderLabel();
}

function setRangeSliderIndex(sliderId, valueId, index, values = null) {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(valueId);
    if (!slider) return;
    const maxIndex = Number(slider.max || 0);
    const nextIndex = Math.max(0, Math.min(Number(index) || 0, maxIndex));
    slider.value = String(nextIndex);
    if (label) {
        label.textContent = values ? formatRangeSelection(values, nextIndex) : String(nextIndex);
    }
}

function selectedRangeValue(sliderId, values) {
    const slider = document.getElementById(sliderId);
    if (!slider || !values.length) return '';
    const index = Math.max(0, Math.min(Number(slider.value || 0), values.length - 1));
    return String(values[index]);
}

function selectedRangeValues(sliderId, values) {
    const slider = document.getElementById(sliderId);
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

function updateBatchSliderLabel() {
    const label = document.getElementById('batch-value');
    const slider = document.getElementById('batch-slider');
    const index = Number(slider?.value || 0);
    if (label) label.textContent = formatRangeSelection(batchInputOptions.map(String), index);
}

function setBatchSliderIndex(index) {
    setRangeSliderIndex('batch-slider', 'batch-value', index, batchInputOptions.map(String));
}

function getSelectedBatches() {
    return selectedRangeValues('batch-slider', batchInputOptions.map(String));
}

function getSelectedValues(prefix) {
    const checkboxes = document.querySelectorAll(`input[id^="${prefix}-"]:checked`);
    const selectedValues = Array.from(checkboxes).map(cb => cb.value);
    const implicitValue = IMPLICIT_PARALLEL_VALUES[prefix];
    if (implicitValue && !selectedValues.includes(implicitValue)) {
        selectedValues.unshift(implicitValue);
    }
    return selectedValues;
}

function getCurrentConfig() {
    return {
        model: document.getElementById('model-select')?.value || '',
        seq: document.getElementById('seq-select')?.value || '',
        cardCount: '',
        hardware: [],
        attnTP: getSelectedValues('attn-tp'),
        ffnTP: getSelectedValues('ffn-tp'),
        pp: getSelectedValues('pp'),
        batch: getSelectedBatches()
    };
}

function bindEventListeners() {
    document.getElementById('model-select')?.addEventListener('change', () => {
        populateSequenceSelect();
        handleConfigChange();
    });
    document.getElementById('seq-select')?.addEventListener('change', handleConfigChange);

    document.getElementById('lang-select')?.addEventListener('change', (event) => {
        changeLanguage(event.target.value);
    });

    document.getElementById('attn-tp-group')?.addEventListener('change', handleConfigChange);
    document.getElementById('ffn-tp-group')?.addEventListener('change', handleConfigChange);
    document.getElementById('pp-group')?.addEventListener('change', handleConfigChange);
    document.getElementById('batch-slider')?.addEventListener('input', () => {
        updateBatchSliderLabel();
        handleConfigChange();
    });

    document.getElementById('reset-btn')?.addEventListener('click', resetHardwareConfig);
    document.getElementById('update-btn')?.addEventListener('click', handleConfigChange);
}

function handleConfigChange() {
    updateStrategyParetoPanel(getCurrentConfig());
}

function resetHardwareConfig() {
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });

    setDefaultSelectValue('model-select');
    populateSequenceSelect();
    setDefaultSelectValue('seq-select');
    selectAllCheckboxes('#attn-tp-group');
    selectAllCheckboxes('#ffn-tp-group');
    selectAllCheckboxes('#pp-group');
    setBatchSliderIndex(Math.max(batchInputOptions.length - 1, 0));
    resetStrategyFilterDefaults();

    handleConfigChange();
}
