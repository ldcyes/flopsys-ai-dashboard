// 硬件配置数据
export const hardwareBrands = {
    huawei: ['910B', '910C', '950PR', '960', '970'],
    nvidia: ['L4', 'H20', 'H800', 'HGX-H100', 'HGX-H200', 'DGX-B100', 'DGX-B200', 'DGX-B300', 'GB200-NVL72', 'GB300-NV72', 'Vera-Rubin', 'Rubin-Ultra'],
    amd: ['MI300X', 'MI325X', 'MI350X', 'MI355X', 'MI400', 'MI450']
};

export const allHardware = [
    'L4', 'H20', 'H800', 'HGX-H100', 'HGX-H200', 'DGX-B100', 'DGX-B200', 'DGX-B300', 'GB200-NVL72', 'GB300-NV72', 'Vera-Rubin', 'Rubin-Ultra'
];

export const tpOptions = [
    { id: 'attn-tp', values: ['1TP', '2TP', '4TP', '8TP'] },
    { id: 'ffn-tp', values: ['1TP', '2TP', '4TP', '8TP'] }
];

export const ppOptions = ['1PP', '2PP', '4PP', '8PP'];

// Batch size 选项
export const batchOptions = [16, 32, 64, 96, 128, 256, 384, 512];

export const defaultWebInputs = {
    schema_version: 'web-model-inputs-v1',
    models: [
        {
            id: 'deepseek-ai_DeepSeek-V3',
            value: 'DeepSeek-V3',
            label: 'DeepSeek-V3',
            modelName: 'deepseek-ai/DeepSeek-V3',
            sequences: [
                {
                    id: 'i32768_o32768_fp4',
                    label: 'I32K / O32K / fp4',
                    inputLen: 32768,
                    outputLen: 32768,
                    precision: 'fp4',
                    strategyPayloads: [
                        {
                            id: 'h100_deepseek_v3_decode_pareto',
                            label: 'H100 DeepSeek-V3 strategy Pareto',
                            path: 'data/profile_sweeps/deepseek-ai_DeepSeek-V3/HGX-H100_72/i32768_o32768/h100_deepseek_v3_decode_pareto.json',
                            kind: 'pareto',
                            hardware: ['HGX-H100'],
                            gpuNums: [72],
                            strategies: ['monolithic', 'mtp', 'pd', 'af', 'pd_af'],
                            stages: []
                        }
                    ]
                }
            ]
        }
    ],
    hardware: allHardware,
    gpuNums: [36, 72, 144, 288, 576],
    batches: batchOptions
};

export async function loadWebInputs(filePath = 'data/model_inputs.json') {
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`Unable to load ${filePath}: ${response.status}`);
        const payload = await response.json();
        if (!payload || !Array.isArray(payload.models) || payload.models.length === 0) {
            throw new Error('model input manifest has no models');
        }
        return {
            ...defaultWebInputs,
            ...payload,
            hardware: Array.isArray(payload.hardware) && payload.hardware.length ? payload.hardware : defaultWebInputs.hardware,
            gpuNums: Array.isArray(payload.gpuNums) && payload.gpuNums.length ? payload.gpuNums : defaultWebInputs.gpuNums,
            batches: Array.isArray(payload.batches) && payload.batches.length ? payload.batches : defaultWebInputs.batches
        };
    } catch (error) {
        console.warn('[loadWebInputs] using defaults:', error.message);
        return defaultWebInputs;
    }
}

export function modelOptions(inputs) {
    return (inputs?.models || defaultWebInputs.models).map(model => ({
        value: model.value || model.label || model.id,
        label: model.label || model.value || model.modelName || model.id
    }));
}

export function findModelInput(inputs, modelValue) {
    const models = inputs?.models || defaultWebInputs.models;
    return models.find(model => {
        const values = [model.value, model.label, model.id, model.modelName].map(value => String(value || ''));
        return values.includes(String(modelValue || ''));
    }) || models[0];
}

export function sequenceOptions(inputs, modelValue) {
    const model = findModelInput(inputs, modelValue);
    return (model?.sequences || []).map(sequence => ({
        value: sequence.id,
        label: sequence.label || sequence.id
    }));
}

export function findSequenceInput(inputs, modelValue, sequenceValue) {
    const model = findModelInput(inputs, modelValue);
    const sequences = model?.sequences || [];
    return sequences.find(sequence => String(sequence.id) === String(sequenceValue)) || sequences[0];
}

export function resolvePhaseDataPath(inputs, modelValue, sequenceValue, phase, fallbackPath) {
    const sequence = findSequenceInput(inputs, modelValue, sequenceValue);
    return sequence?.tables?.[phase] || fallbackPath;
}

export function caseTableOptions(inputs, modelValue, sequenceValue) {
    const sequence = findSequenceInput(inputs, modelValue, sequenceValue);
    return Array.isArray(sequence?.caseTables) ? sequence.caseTables : [];
}

export function resolveCasePhaseDataPaths(inputs, modelValue, sequenceValue, phase, hardwareValues, gpuNum, fallbackPath) {
    const hardware = Array.isArray(hardwareValues)
        ? hardwareValues.map(value => String(value))
        : [hardwareValues].filter(Boolean).map(value => String(value));
    const gpu = gpuNum == null || gpuNum === '' ? '' : String(gpuNum);

    if (hardware.length && gpu) {
        const paths = caseTableOptions(inputs, modelValue, sequenceValue)
            .filter(item => hardware.includes(String(item.hardware)) && String(item.gpuNum) === gpu)
            .map(item => item.tables?.[phase])
            .filter(Boolean);
        if (paths.length) {
            return [...new Set(paths)];
        }
    }

    const aggregatePath = resolvePhaseDataPath(inputs, modelValue, sequenceValue, phase, fallbackPath);
    return aggregatePath ? [aggregatePath] : [];
}

export function resolveCasePhaseDataPath(inputs, modelValue, sequenceValue, phase, hardwareValue, gpuNum, fallbackPath) {
    const paths = resolveCasePhaseDataPaths(inputs, modelValue, sequenceValue, phase, hardwareValue ? [hardwareValue] : [], gpuNum, fallbackPath);
    return paths[0] || fallbackPath;
}

export function strategyPayloadOptions(inputs, modelValue, sequenceValue) {
    const sequence = findSequenceInput(inputs, modelValue, sequenceValue);
    return Array.isArray(sequence?.strategyPayloads) ? sequence.strategyPayloads : [];
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
        select.value = placeholder ? select.options[Math.min(1, select.options.length - 1)].value : select.options[0].value;
    }
}

// 获取品牌图标类名
export function getBrandIcon(hw) {
    if (hardwareBrands.huawei.includes(hw)) {
        return { class: 'brand-huawei', text: 'H' };
    } else if (hardwareBrands.nvidia.includes(hw)) {
        return { class: 'brand-nvidia', text: 'N' };
    } else if (hardwareBrands.amd.includes(hw)) {
        return { class: 'brand-amd', text: 'A' };
    }
    return { class: '', text: '' };
}

function coerceCellValue(value) {
    if (typeof value === 'string' && value.trim() !== '' && !isNaN(value)) {
        return Number(value);
    }
    return value;
}

function coerceRows(rows) {
    return rows.map(row => {
        const obj = {};
        Object.entries(row).forEach(([key, value]) => {
            obj[key] = coerceCellValue(value);
        });
        return obj;
    });
}

function decodeCompactTable(payload) {
    const columns = Array.isArray(payload?.columns) ? payload.columns : [];
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    if (!columns.length) return [];
    return rows.map(row => {
        const obj = {};
        columns.forEach((column, index) => {
            obj[column] = coerceCellValue(row[index]);
        });
        return obj;
    });
}

async function loadCompactTableData(filePath) {
    const jsonPath = filePath.endsWith('.json') ? filePath : filePath.replace(/\.xlsx$/i, '.json');
    if (jsonPath === filePath && !filePath.endsWith('.json')) return null;
    try {
        const response = await fetch(jsonPath);
        if (!response.ok) return null;
        const payload = await response.json();
        if (payload?.schema_version !== 'web-table-v1') return null;
        return decodeCompactTable(payload);
    } catch (error) {
        console.warn('[loadCompactTableData] falling back to workbook:', error.message);
        return null;
    }
}

// 从 Excel(xlsx) 文件加载数据
// 依赖 SheetJS(xlsx) 库，请在 HTML 中通过 CDN 引入：
// <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
export async function loadExcelData(filePath) {
    const compactRows = await loadCompactTableData(filePath);
    if (compactRows) {
        return compactRows;
    }

    const response = await fetch(filePath);
    const arrayBuffer = await response.arrayBuffer();

    // 读取工作簿，这里假设使用 SheetJS(xlsx) 库，暴露为全局 XLSX 对象
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // 默认取第一个工作表
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // 转换为 JSON 数组，每一行是一个对象，key 为列名
    const json = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    console.log('[loadExcelData] rows count =', json.length);
    console.log('[loadExcelData] first row =', json[0]);
    // 尝试把数字字符串转成 Number，其他保持原样
    return coerceRows(json);
}
