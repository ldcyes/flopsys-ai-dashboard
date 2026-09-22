import {
    decodeDecisionSummary,
    decodeStrategyPayload,
    decisionSummaryPath,
    filterStrategyDescriptors,
    findModelInput,
    findSequenceInput,
    modelOptions,
    sequenceOptions,
    strategyPayloadOptions,
    validateWebInputs,
} from './dashboard-data.js?v=display-data-v2';

export {
    decodeDecisionSummary,
    decodeStrategyPayload,
    decisionSummaryPath,
    filterStrategyDescriptors,
    findModelInput,
    findSequenceInput,
    modelOptions,
    sequenceOptions,
    strategyPayloadOptions,
    validateWebInputs,
};

export const hardwareBrands = {
    huawei: ['910B', '910C', '950PR', '960', '970'],
    nvidia: ['L4', 'H20', 'H800', 'HGX-H100', 'HGX-H200', 'DGX-B100', 'DGX-B200', 'DGX-B300', 'GB200-NVL72', 'GB300-NV72', 'Vera-Rubin', 'Rubin-Ultra'],
    amd: ['MI300X', 'MI325X', 'MI350X', 'MI355X', 'MI400', 'MI450'],
};

export const allHardware = [
    'L4', 'H20', 'H800', 'HGX-H100', 'HGX-H200', 'DGX-B100', 'DGX-B200', 'DGX-B300',
    'GB200-NVL72', 'GB300-NV72', 'Vera-Rubin', 'Rubin-Ultra',
];

export const tpOptions = [
    { id: 'attn-tp', values: ['1TP', '2TP', '4TP', '8TP'] },
    { id: 'ffn-tp', values: ['1TP', '2TP', '4TP', '8TP'] },
];

export const ppOptions = ['1PP', '2PP', '4PP', '8PP'];
export const batchOptions = [16, 32, 64, 96, 128, 256, 384, 512];

const decisionSummaryCache = new Map();


async function fetchJson(filePath, label) {
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`Unable to load ${label} ${filePath}: ${response.status}`);
    return response.json();
}


export async function loadWebInputs(filePath = 'data/model_inputs.json') {
    return validateWebInputs(await fetchJson(filePath, 'web inputs'));
}


export async function loadStrategyPayload(descriptor) {
    const payload = await fetchJson(descriptor.path, 'strategy payload');
    return decodeStrategyPayload(payload, descriptor);
}


export function loadDecisionSummary(filePath) {
    if (!decisionSummaryCache.has(filePath)) {
        const pending = fetchJson(filePath, 'decision summary')
            .then(decodeDecisionSummary)
            .catch(error => {
                decisionSummaryCache.delete(filePath);
                throw error;
            });
        decisionSummaryCache.set(filePath, pending);
    }
    return decisionSummaryCache.get(filePath);
}


export function populateSelectOptions(select, options, placeholder = null) {
    if (!select) return;
    const previousValue = select.value;
    select.innerHTML = '';
    if (placeholder) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = placeholder;
        select.appendChild(option);
    }
    options.forEach(item => {
        const option = document.createElement('option');
        option.value = item.value;
        option.textContent = item.label;
        select.appendChild(option);
    });
    if ([...select.options].some(option => option.value === previousValue)) {
        select.value = previousValue;
    } else if (select.options.length) {
        const index = placeholder ? Math.min(1, select.options.length - 1) : 0;
        select.value = select.options[index].value;
    }
}


export function getBrandIcon(hardware) {
    if (hardwareBrands.huawei.includes(hardware)) return { class: 'brand-huawei', text: 'H' };
    if (hardwareBrands.nvidia.includes(hardware)) return { class: 'brand-nvidia', text: 'N' };
    if (hardwareBrands.amd.includes(hardware)) return { class: 'brand-amd', text: 'A' };
    return { class: '', text: '' };
}
