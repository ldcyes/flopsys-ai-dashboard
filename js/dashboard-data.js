export const STRATEGY_SCHEMA_VERSION = 'pareto-display-v1';
export const DECISION_SCHEMA_VERSION = 'dashboard-decisions-v1';
export const MANIFEST_SCHEMA_VERSION = 'web-model-inputs-v2';

export const REQUIRED_POINT_FIELDS = Object.freeze([
    'hardware',
    'gpu_num',
    'strategy_type',
    'tps_per_user',
    'tps_per_gpu',
    'throughput_total_tps',
    'batch',
    'pp',
    'attn_dp',
    'attn_tp',
    'attn_cp',
    'ffn_ep',
    'ffn_tp',
    'mtp_enabled',
    'mtp_stage',
    'pd_enabled',
    'af_enabled',
]);

export const OPTIONAL_POINT_FIELDS = Object.freeze([
    'mtp_model',
    'mtp_expected_tokens',
    'prefill_gpu_num',
    'decode_gpu_num',
    'pd_transfer_time_s',
    'decode_attention_gpu',
    'decode_ffn_gpu',
    'decode_attn_ffn_transfer_time_s',
    'bottleneck',
    'mla_time_s',
    'load_kv_time_s',
    'dense_mlp_time_s',
    'dispatch_time_s',
    'shared_expert_time_s',
    'routed_expert_time_s',
    'combine_time_s',
    'final_linear_softmax_time_s',
    'mla_all_reduce_time_s',
    'mla_cp_ring_time_s',
    'ffn_all_reduce_time_s',
]);

export const LEADERBOARD_COLUMNS = Object.freeze([
    'hardware',
    'gpu_num',
    'config_label',
    'tps_per_gpu',
    'throughput_total_tps',
    'tps_per_user',
]);

export const TCO_COLUMNS = Object.freeze([
    'hardware',
    'gpu_num',
    'config_name',
    'decode_config_summary',
    'prefill_config_summary',
    'strategy_type',
    'pd_enabled',
    'af_enabled',
    'mtp_stage',
    'batch',
    'pp',
    'attn_dp',
    'attn_tp',
    'attn_cp',
    'ffn_ep',
    'ffn_tp',
    'tps_per_gpu',
    'tps_per_user',
    'throughput_total_tps',
]);

const STRATEGY_KEYS = Object.freeze([
    'schema_version',
    'summary',
    'point_columns',
    'point_rows',
]);
const DECISION_KEYS = Object.freeze([
    'schema_version',
    'leaderboard_columns',
    'leaderboard_rows',
    'tco_columns',
    'tco_rows',
]);
const SUMMARY_FIELDS = new Set(['title', 'description', 'y_metric', 'mtp_note', 'pp_note']);
const OPTIONAL_SUMMARY_FIELDS = new Set(['description', 'mtp_note', 'pp_note']);
const POINT_FIELDS = new Set([...REQUIRED_POINT_FIELDS, ...OPTIONAL_POINT_FIELDS]);
const REQUIRED_INTEGER_POINT_FIELDS = new Set([
    'gpu_num', 'batch', 'pp', 'attn_dp', 'attn_tp', 'attn_cp', 'ffn_ep', 'ffn_tp',
    'mtp_stage',
]);
const OPTIONAL_INTEGER_POINT_FIELDS = new Set(['prefill_gpu_num', 'decode_gpu_num']);
const NUMBER_POINT_FIELDS = new Set([
    'tps_per_user', 'tps_per_gpu', 'throughput_total_tps', 'mtp_expected_tokens',
    'pd_transfer_time_s', 'decode_attn_ffn_transfer_time_s', 'mla_time_s',
    'load_kv_time_s', 'dense_mlp_time_s', 'dispatch_time_s', 'shared_expert_time_s',
    'routed_expert_time_s', 'combine_time_s', 'final_linear_softmax_time_s',
    'mla_all_reduce_time_s', 'mla_cp_ring_time_s', 'ffn_all_reduce_time_s',
]);
const BOOLEAN_POINT_FIELDS = new Set(['mtp_enabled', 'pd_enabled', 'af_enabled']);
const OVERVIEW_FIELDS = Object.freeze([
    'hardware', 'gpu_num', 'strategy_tier', 'batch', 'pp', 'attn_tp', 'ffn_tp',
    'attn_cp', 'mtp_stage',
]);
const INDEPENDENT_FIELDS = Object.freeze([
    'gpu_num', 'strategy_type', 'mtp_stage', 'bottleneck',
]);
const HUAWEI_HARDWARE = new Set(['910B', '910C', '950PR', '960', '970']);
const AMD_HARDWARE = new Set(['MI300X', 'MI325X', 'MI350X', 'MI355X', 'MI400', 'MI450']);
const DEFAULT_PRICES = Object.freeze({ huawei: 2.5, nvidia: 3.0, amd: 2.0 });


function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}


function assertObject(value, label) {
    if (!isObject(value)) throw new TypeError(`${label} must be an object`);
    return value;
}


function assertExactKeys(value, expected, label) {
    const actual = Object.keys(assertObject(value, label)).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
        const unexpected = actual.filter(key => !wanted.includes(key));
        const missing = wanted.filter(key => !actual.includes(key));
        throw new TypeError(
            `${label} has unexpected or missing keys ` +
            `(unexpected=${JSON.stringify(unexpected)}, missing=${JSON.stringify(missing)})`,
        );
    }
}


function assertNonBlankString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${label} must be a non-empty string`);
    }
    return value;
}


function assertFiniteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${label} must be a finite number`);
    }
    return value;
}


export function maximumBy(values, selector, fallback) {
    if (!Array.isArray(values)) throw new TypeError('maximum values must be an array');
    if (typeof selector !== 'function') throw new TypeError('maximum selector must be callable');
    assertFiniteNumber(fallback, 'maximum fallback');
    let maximum = fallback;
    values.forEach((value, index) => {
        const candidate = selector(value, index);
        assertFiniteNumber(candidate, `maximum value ${index}`);
        if (candidate > maximum) maximum = candidate;
    });
    return maximum;
}


function assertPositiveInteger(value, label, { allowZero = false } = {}) {
    if (!Number.isInteger(value) || (allowZero ? value < 0 : value <= 0)) {
        throw new TypeError(`${label} must be ${allowZero ? 'a non-negative' : 'a positive'} integer`);
    }
    return value;
}


function arraysEqual(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}


function assertSafeRelativePath(value, label) {
    assertNonBlankString(value, label);
    if (
        value.startsWith('/') ||
        value.includes('\\') ||
        value.split('/').some(part => part === '' || part === '.' || part === '..')
    ) {
        throw new TypeError(`${label} must be a normalized relative path`);
    }
    return value;
}


export function decodeColumnarRows(payload, options) {
    assertObject(payload, 'columnar payload');
    assertObject(options, 'columnar decoder options');
    const {
        schemaVersion,
        columnsKey,
        rowsKey,
        expectedColumns,
        requiredColumns,
        allowedColumns,
        label = 'columnar payload',
    } = options;
    assertNonBlankString(schemaVersion, 'expected schema version');
    assertNonBlankString(columnsKey, 'columns key');
    assertNonBlankString(rowsKey, 'rows key');
    if (payload.schema_version !== schemaVersion) {
        throw new TypeError(`${label} schema_version must be ${schemaVersion}`);
    }
    const columns = payload[columnsKey];
    if (!Array.isArray(columns) || columns.length === 0) {
        throw new TypeError(`${label} ${columnsKey} must be a non-empty array`);
    }
    const seen = new Set();
    columns.forEach((column, index) => {
        assertNonBlankString(column, `${label} ${columnsKey}[${index}]`);
        if (column !== column.trim()) {
            throw new TypeError(`${label} ${columnsKey}[${index}] must be canonical`);
        }
        if (seen.has(column)) throw new TypeError(`${label} has duplicate column ${column}`);
        seen.add(column);
    });
    if (expectedColumns !== undefined && !arraysEqual(columns, [...expectedColumns])) {
        throw new TypeError(`${label} ${columnsKey} does not match the expected schema`);
    }
    if (requiredColumns !== undefined) {
        const required = [...requiredColumns];
        if (!arraysEqual(columns.slice(0, required.length), required)) {
            throw new TypeError(`${label} ${columnsKey} must start with required columns`);
        }
    }
    if (allowedColumns !== undefined) {
        const allowed = new Set(allowedColumns);
        const unsupported = columns.filter(column => !allowed.has(column));
        if (unsupported.length) {
            throw new TypeError(`${label} has unsupported columns ${JSON.stringify(unsupported)}`);
        }
    }
    const rows = payload[rowsKey];
    if (!Array.isArray(rows)) throw new TypeError(`${label} ${rowsKey} must be an array`);
    return rows.map((row, rowIndex) => {
        if (!Array.isArray(row)) throw new TypeError(`${label} row ${rowIndex} must be an array`);
        if (row.length !== columns.length) {
            throw new TypeError(`${label} row ${rowIndex} width does not match ${columnsKey}`);
        }
        return Object.fromEntries(columns.map((column, index) => [column, row[index]]));
    });
}


function validateSummary(summary) {
    assertObject(summary, 'strategy summary');
    const unexpected = Object.keys(summary).filter(key => !SUMMARY_FIELDS.has(key));
    if (unexpected.length) {
        throw new TypeError(`strategy summary has unexpected keys ${JSON.stringify(unexpected)}`);
    }
    assertNonBlankString(summary.title, 'strategy summary title');
    assertNonBlankString(summary.y_metric, 'strategy summary y_metric');
    if (summary.y_metric !== 'throughput_total_tps') {
        throw new TypeError('strategy summary y_metric must be throughput_total_tps');
    }
    for (const field of OPTIONAL_SUMMARY_FIELDS) {
        if (Object.hasOwn(summary, field)) assertNonBlankString(summary[field], `strategy summary ${field}`);
    }
    return { ...summary };
}


function validatePointColumns(columns) {
    const optional = columns.slice(REQUIRED_POINT_FIELDS.length);
    const expectedOptional = OPTIONAL_POINT_FIELDS.filter(field => optional.includes(field));
    if (!arraysEqual(optional, expectedOptional)) {
        throw new TypeError('strategy point_columns optional fields must follow canonical order');
    }
}


function isMissingOptionalValue(value) {
    return (
        value === null ||
        value === undefined ||
        (typeof value === 'string' && value.trim() === '') ||
        (typeof value === 'number' && !Number.isFinite(value))
    );
}


function validateOptionalColumnValues(points, columns) {
    for (const column of columns.slice(REQUIRED_POINT_FIELDS.length)) {
        if (points.every(point => isMissingOptionalValue(point[column]))) {
            throw new TypeError(`strategy optional column ${column} must not be entirely empty`);
        }
    }
}


function validateStrategyPoint(point, rowIndex) {
    const prefix = `strategy point row ${rowIndex}`;
    assertNonBlankString(point.hardware, `${prefix} hardware`);
    assertNonBlankString(point.strategy_type, `${prefix} strategy_type`);
    for (const field of REQUIRED_POINT_FIELDS) {
        if (point[field] === null || point[field] === undefined) {
            throw new TypeError(`${prefix} ${field} is required`);
        }
    }
    for (const [field, value] of Object.entries(point)) {
        if (value === null && OPTIONAL_POINT_FIELDS.includes(field)) continue;
        if (REQUIRED_INTEGER_POINT_FIELDS.has(field)) {
            assertPositiveInteger(value, `${prefix} ${field}`, { allowZero: field === 'mtp_stage' });
        } else if (OPTIONAL_INTEGER_POINT_FIELDS.has(field) && !Number.isInteger(value)) {
            throw new TypeError(`${prefix} ${field} must be an integer`);
        } else if (NUMBER_POINT_FIELDS.has(field)) {
            assertFiniteNumber(value, `${prefix} ${field}`);
        } else if (BOOLEAN_POINT_FIELDS.has(field) && typeof value !== 'boolean') {
            throw new TypeError(`${prefix} ${field} must be boolean`);
        }
    }
}


function validateDescriptor(descriptor, label = 'strategy descriptor') {
    assertExactKeys(descriptor, ['id', 'label', 'path', 'kind', 'hardware', 'gpuNums'], label);
    assertNonBlankString(descriptor.id, `${label} id`);
    assertNonBlankString(descriptor.label, `${label} label`);
    assertSafeRelativePath(descriptor.path, `${label} path`);
    if (!['pareto', 'mtp_stage'].includes(descriptor.kind)) {
        throw new TypeError(`${label} kind is invalid`);
    }
    if (!Array.isArray(descriptor.hardware) || descriptor.hardware.length === 0) {
        throw new TypeError(`${label} hardware must be a non-empty array`);
    }
    const hardwareSeen = new Set();
    descriptor.hardware.forEach((value, index) => {
        assertNonBlankString(value, `${label} hardware[${index}]`);
        if (hardwareSeen.has(value)) throw new TypeError(`${label} hardware has duplicate value ${value}`);
        hardwareSeen.add(value);
    });
    if (!Array.isArray(descriptor.gpuNums) || descriptor.gpuNums.length === 0) {
        throw new TypeError(`${label} gpuNums must be a non-empty array`);
    }
    const gpuSeen = new Set();
    descriptor.gpuNums.forEach((value, index) => {
        assertPositiveInteger(value, `${label} gpuNums[${index}]`);
        if (gpuSeen.has(value)) throw new TypeError(`${label} gpuNums has duplicate value ${value}`);
        gpuSeen.add(value);
    });
    return descriptor;
}


function sortedUnique(values, compare) {
    return [...new Set(values)].sort(compare);
}


function validateDescriptorPayloadMetadata(points, descriptor) {
    const actualHardware = sortedUnique(points.map(point => point.hardware), (left, right) => (
        left < right ? -1 : left > right ? 1 : 0
    ));
    const expectedHardware = [...descriptor.hardware].sort((left, right) => (
        left < right ? -1 : left > right ? 1 : 0
    ));
    const actualGpuNums = sortedUnique(points.map(point => point.gpu_num), (left, right) => left - right);
    const expectedGpuNums = [...descriptor.gpuNums].sort((left, right) => left - right);
    if (!arraysEqual(actualHardware, expectedHardware)) {
        throw new TypeError('strategy descriptor hardware metadata differs from payload');
    }
    if (!arraysEqual(actualGpuNums, expectedGpuNums)) {
        throw new TypeError('strategy descriptor gpuNums metadata differs from payload');
    }
}


export function decodeStrategyPayload(payload, descriptor) {
    assertExactKeys(payload, STRATEGY_KEYS, 'strategy payload');
    validateDescriptor(descriptor);
    const points = decodeColumnarRows(payload, {
        schemaVersion: STRATEGY_SCHEMA_VERSION,
        columnsKey: 'point_columns',
        rowsKey: 'point_rows',
        requiredColumns: REQUIRED_POINT_FIELDS,
        allowedColumns: POINT_FIELDS,
        label: 'strategy payload',
    });
    if (points.length === 0) throw new TypeError('strategy payload point_rows must be non-empty');
    validatePointColumns(payload.point_columns);
    points.forEach(validateStrategyPoint);
    validateOptionalColumnValues(points, payload.point_columns);
    validateDescriptorPayloadMetadata(points, descriptor);
    return {
        summary: validateSummary(payload.summary),
        points: points.map(row => ({ ...row, _descriptor_kind: descriptor.kind })),
    };
}


function validateDecisionRow(row, columns, label, rowIndex) {
    assertNonBlankString(row.hardware, `${label} row ${rowIndex} hardware`);
    assertPositiveInteger(row.gpu_num, `${label} row ${rowIndex} gpu_num`);
    for (const field of ['tps_per_gpu', 'throughput_total_tps', 'tps_per_user']) {
        assertFiniteNumber(row[field], `${label} row ${rowIndex} ${field}`);
        if (row[field] <= 0) throw new TypeError(`${label} row ${rowIndex} ${field} must be positive`);
    }
    if (row.tps_per_user < 20) {
        throw new TypeError(`${label} row ${rowIndex} tps_per_user must be at least 20`);
    }
    if (columns === LEADERBOARD_COLUMNS) {
        assertNonBlankString(row.config_label, `${label} row ${rowIndex} config_label`);
    }
    if (columns === TCO_COLUMNS) {
        assertNonBlankString(row.config_name, `${label} row ${rowIndex} config_name`);
        assertNonBlankString(row.strategy_type, `${label} row ${rowIndex} strategy_type`);
        for (const field of ['pd_enabled', 'af_enabled']) {
            if (typeof row[field] !== 'boolean') throw new TypeError(`${label} row ${rowIndex} ${field} must be boolean`);
        }
        for (const field of ['mtp_stage', 'batch', 'pp', 'attn_dp', 'attn_tp', 'attn_cp', 'ffn_ep', 'ffn_tp']) {
            assertPositiveInteger(row[field], `${label} row ${rowIndex} ${field}`, { allowZero: field === 'mtp_stage' });
        }
    }
}


export function decodeDecisionSummary(payload) {
    assertExactKeys(payload, DECISION_KEYS, 'decision summary');
    const leaderboardRows = decodeColumnarRows(payload, {
        schemaVersion: DECISION_SCHEMA_VERSION,
        columnsKey: 'leaderboard_columns',
        rowsKey: 'leaderboard_rows',
        expectedColumns: LEADERBOARD_COLUMNS,
        label: 'leaderboard decision summary',
    });
    const tcoRows = decodeColumnarRows(payload, {
        schemaVersion: DECISION_SCHEMA_VERSION,
        columnsKey: 'tco_columns',
        rowsKey: 'tco_rows',
        expectedColumns: TCO_COLUMNS,
        label: 'TCO decision summary',
    });
    if (!leaderboardRows.length || !tcoRows.length) {
        throw new TypeError('decision summary row arrays must be non-empty');
    }
    leaderboardRows.forEach((row, index) => validateDecisionRow(row, LEADERBOARD_COLUMNS, 'leaderboard', index));
    tcoRows.forEach((row, index) => validateDecisionRow(row, TCO_COLUMNS, 'TCO', index));
    const brandCounts = new Map();
    leaderboardRows.forEach(row => {
        const brand = brandForHardware(row.hardware);
        const count = (brandCounts.get(brand) || 0) + 1;
        if (count > 20) throw new TypeError(`decision summary has more than 20 ${brand} leaderboard rows`);
        brandCounts.set(brand, count);
    });
    const tcoHardware = new Set();
    tcoRows.forEach(row => {
        if (tcoHardware.has(row.hardware)) {
            throw new TypeError(`decision summary has duplicate TCO hardware ${row.hardware}`);
        }
        tcoHardware.add(row.hardware);
    });
    return { leaderboardRows, tcoRows };
}


function assertUniqueStrings(values, label) {
    if (!Array.isArray(values) || values.length === 0) {
        throw new TypeError(`${label} must be a non-empty array`);
    }
    const seen = new Set();
    values.forEach((value, index) => {
        assertNonBlankString(value, `${label}[${index}]`);
        if (seen.has(value)) throw new TypeError(`${label} must not contain duplicates`);
        seen.add(value);
    });
}


function validateSequence(sequence, label) {
    assertExactKeys(
        sequence,
        ['id', 'label', 'inputLen', 'outputLen', 'decisionSummaryPath', 'strategyPayloads'],
        label,
    );
    assertNonBlankString(sequence.id, `${label} id`);
    assertNonBlankString(sequence.label, `${label} label`);
    assertPositiveInteger(sequence.inputLen, `${label} inputLen`);
    assertPositiveInteger(sequence.outputLen, `${label} outputLen`);
    assertSafeRelativePath(sequence.decisionSummaryPath, `${label} decisionSummaryPath`);
    if (!Array.isArray(sequence.strategyPayloads) || sequence.strategyPayloads.length === 0) {
        throw new TypeError(`${label} strategyPayloads must be a non-empty array`);
    }
    sequence.strategyPayloads.forEach((item, index) => validateDescriptor(item, `${label} strategyPayloads[${index}]`));
    const ids = sequence.strategyPayloads.map(item => item.id);
    const paths = sequence.strategyPayloads.map(item => item.path);
    if (new Set(ids).size !== ids.length || new Set(paths).size !== paths.length) {
        throw new TypeError(`${label} strategy descriptors must have unique ids and paths`);
    }
}


export function validateWebInputs(payload) {
    assertExactKeys(payload, ['schema_version', 'hardware', 'gpuNums', 'batches', 'models'], 'web inputs');
    if (payload.schema_version !== MANIFEST_SCHEMA_VERSION) {
        throw new TypeError(`web inputs schema_version must be ${MANIFEST_SCHEMA_VERSION}`);
    }
    assertUniqueStrings(payload.hardware, 'web inputs hardware');
    if (!Array.isArray(payload.gpuNums) || payload.gpuNums.length === 0) {
        throw new TypeError('web inputs gpuNums must be a non-empty array');
    }
    const gpuNums = new Set();
    payload.gpuNums.forEach((value, index) => {
        assertPositiveInteger(value, `web inputs gpuNums[${index}]`);
        if (gpuNums.has(value)) throw new TypeError(`web inputs gpuNums has duplicate value ${value}`);
        gpuNums.add(value);
    });
    if (!Array.isArray(payload.batches) || payload.batches.length === 0) {
        throw new TypeError('web inputs batches must be a non-empty array');
    }
    const batches = new Set();
    payload.batches.forEach((value, index) => {
        assertPositiveInteger(value, `web inputs batches[${index}]`);
        if (batches.has(value)) throw new TypeError(`web inputs batches has duplicate value ${value}`);
        batches.add(value);
    });
    if (!Array.isArray(payload.models) || payload.models.length === 0) {
        throw new TypeError('web inputs models must be a non-empty array');
    }
    payload.models.forEach((model, modelIndex) => {
        const label = `web inputs models[${modelIndex}]`;
        assertExactKeys(model, ['id', 'label', 'sequences'], label);
        assertNonBlankString(model.id, `${label} id`);
        assertNonBlankString(model.label, `${label} label`);
        if (!Array.isArray(model.sequences) || model.sequences.length === 0) {
            throw new TypeError(`${label} sequences must be a non-empty array`);
        }
        model.sequences.forEach((sequence, index) => validateSequence(sequence, `${label} sequences[${index}]`));
        const sequenceIds = model.sequences.map(sequence => sequence.id);
        if (new Set(sequenceIds).size !== sequenceIds.length) {
            throw new TypeError(`${label} sequence ids must be unique`);
        }
    });
    const modelIds = payload.models.map(model => model.id);
    if (new Set(modelIds).size !== modelIds.length) {
        throw new TypeError('web inputs model ids must be unique');
    }
    return payload;
}


export function modelOptions(inputs) {
    return validateWebInputs(inputs).models.map(model => ({ value: model.id, label: model.label }));
}


export function findModelInput(inputs, modelId) {
    const manifest = validateWebInputs(inputs);
    return manifest.models.find(model => model.id === String(modelId ?? '')) || manifest.models[0];
}


export function sequenceOptions(inputs, modelId) {
    return findModelInput(inputs, modelId).sequences.map(sequence => ({
        value: sequence.id,
        label: sequence.label,
    }));
}


export function findSequenceInput(inputs, modelId, sequenceId) {
    const model = findModelInput(inputs, modelId);
    return model.sequences.find(sequence => sequence.id === String(sequenceId ?? '')) || model.sequences[0];
}


export function decisionSummaryPath(inputs, modelId, sequenceId) {
    return findSequenceInput(inputs, modelId, sequenceId).decisionSummaryPath;
}


export function strategyPayloadOptions(inputs, modelId, sequenceId) {
    return findSequenceInput(inputs, modelId, sequenceId).strategyPayloads;
}


function selectionArray(value) {
    const values = Array.isArray(value) ? value : (value === null || value === undefined || value === '' ? [] : [value]);
    const result = [];
    values.forEach(item => {
        if (item !== null && item !== undefined && item !== '' && !result.some(value => value === item)) {
            result.push(item);
        }
    });
    return result;
}


export function filterStrategyDescriptors(descriptors, state = {}) {
    if (!Array.isArray(descriptors)) throw new TypeError('strategy descriptors must be an array');
    const hardware = new Set(selectionArray(state.hardware).map(String));
    const gpuNums = new Set(selectionArray(state.gpu_num ?? state.gpuNums).map(String));
    return descriptors.filter((item, index) => {
        validateDescriptor(item, `strategy descriptors[${index}]`);
        const itemHardware = item.hardware.map(String);
        const itemGpuNums = item.gpuNums.map(String);
        return (
            (!hardware.size || itemHardware.some(value => hardware.has(value))) &&
            (!gpuNums.size || itemGpuNums.some(value => gpuNums.has(value)))
        );
    });
}


const PREFERRED_STRATEGY_HARDWARE_PATTERNS = [/r300/i, /rubin/i, /b300/i];


export function preferredStrategyDescriptorSelection(descriptors, manifest = {}) {
    if (!Array.isArray(descriptors)) throw new TypeError('strategy descriptors must be an array');
    assertObject(manifest, 'strategy descriptor manifest');
    descriptors.forEach((descriptor, index) => validateDescriptor(descriptor, `strategy descriptors[${index}]`));
    if (!descriptors.length) return { hardware: [], gpu_num: [] };

    const descriptorHardware = new Set(descriptors.flatMap(descriptor => descriptor.hardware).map(String));
    const manifestHardware = selectionArray(manifest.hardware).map(String);
    const hardwareCandidates = [
        ...manifestHardware.filter(value => descriptorHardware.has(value)),
        ...descriptorHardware,
    ].filter((value, index, values) => values.indexOf(value) === index);
    let selectedHardware = hardwareCandidates[0];
    for (const pattern of PREFERRED_STRATEGY_HARDWARE_PATTERNS) {
        const match = hardwareCandidates.find(value => pattern.test(value));
        if (match !== undefined) {
            selectedHardware = match;
            break;
        }
    }
    if (selectedHardware === undefined) return { hardware: [], gpu_num: [] };

    const matchingGpuNums = new Set(
        descriptors
            .filter(descriptor => descriptor.hardware.map(String).includes(selectedHardware))
            .flatMap(descriptor => descriptor.gpuNums)
            .map(String),
    );
    const manifestGpuNums = selectionArray(manifest.gpuNums ?? manifest.gpu_num).map(String);
    const gpuCandidates = [
        ...manifestGpuNums.filter(value => matchingGpuNums.has(value)),
        ...matchingGpuNums,
    ].filter((value, index, values) => values.indexOf(value) === index);
    const selectedGpuNum = gpuCandidates[0];
    return {
        hardware: [selectedHardware],
        gpu_num: selectedGpuNum === undefined ? [] : [Number(selectedGpuNum)],
    };
}


export function loadCachedStrategyPayload(cache, descriptor, loader) {
    if (!(cache instanceof Map)) throw new TypeError('strategy payload cache must be a Map');
    validateDescriptor(descriptor);
    if (typeof loader !== 'function') throw new TypeError('strategy payload loader must be callable');
    if (cache.has(descriptor.path)) return cache.get(descriptor.path);

    const pending = Promise.resolve().then(() => loader(descriptor));
    cache.set(descriptor.path, pending);
    pending.catch(() => {
        if (cache.get(descriptor.path) === pending) cache.delete(descriptor.path);
    });
    return pending;
}


function activeMtpModel(value) {
    if (value === null || value === undefined || String(value).trim() === '') return false;
    return !new Set(['off', 'none', 'false', '0']).has(String(value).trim().toLocaleLowerCase('en-US'));
}


export function strategyFeatures(point) {
    assertObject(point, 'strategy point');
    const strategy = String(point.strategy_type ?? '').toLocaleLowerCase('en-US');
    const result = new Set();
    if (
        strategy.includes('mtp') ||
        point.mtp_enabled === true ||
        activeMtpModel(point.mtp_model) ||
        point._descriptor_kind === 'mtp_stage'
    ) result.add('mtp');
    if (strategy.includes('pd') || point.pd_enabled === true) result.add('pd');
    if (strategy.includes('af') || strategy.includes('hybrid') || point.af_enabled === true) result.add('af');
    return result;
}


export function strategyTier(point) {
    const features = strategyFeatures(point);
    if (features.has('af')) return 'af';
    if (features.has('pd')) return 'pd';
    if (features.has('mtp')) return 'mtp';
    return 'monolithic';
}


export function normalizeFilterState(surface, state = {}) {
    assertObject(state, 'filter state');
    if (surface === 'overview') {
        return Object.fromEntries(OVERVIEW_FIELDS.map(field => [field, selectionArray(state[field])]));
    }
    if (surface === 'independent') {
        return Object.fromEntries(INDEPENDENT_FIELDS.map(field => {
            const value = state[field];
            return [field, value === undefined || value === null || value === '' || value === 'all' ? null : value];
        }));
    }
    throw new TypeError(`unsupported dashboard surface ${String(surface)}`);
}


function hasValue(value) {
    return value !== null && value !== undefined && value !== '' && !(typeof value === 'number' && Number.isNaN(value));
}


function selectedIncludes(values, value) {
    return values.some(selected => String(selected) === String(value));
}


function filterOverview(points, state) {
    const selectedTier = state.strategy_tier;
    const stageFilterEnabled = selectedTier.length > 0 && state.mtp_stage.length > 0;
    return points.filter(point => {
        for (const field of ['hardware', 'gpu_num', 'batch', 'pp', 'attn_tp', 'ffn_tp', 'attn_cp']) {
            if (state[field].length && hasValue(point[field]) && !selectedIncludes(state[field], point[field])) return false;
        }
        const tier = strategyTier(point);
        if (tier !== 'monolithic' && (!selectedTier.length || !selectedIncludes(selectedTier, tier))) return false;
        if (strategyFeatures(point).has('mtp') && stageFilterEnabled) {
            if (!hasValue(point.mtp_stage) || !selectedIncludes(state.mtp_stage, point.mtp_stage)) return false;
        }
        return true;
    });
}


function filterIndependent(points, state) {
    return points.filter(point => INDEPENDENT_FIELDS.every(field => (
        state[field] === null || String(point[field]) === String(state[field])
    )));
}


export function filterStrategyPoints(points, state = {}, surface = 'overview') {
    if (!Array.isArray(points) || points.some(point => !isObject(point))) {
        throw new TypeError('strategy points must be an array of objects');
    }
    const normalized = normalizeFilterState(surface, state);
    return surface === 'overview' ? filterOverview(points, normalized) : filterIndependent(points, normalized);
}


function metricPair(point, index) {
    const x = point.tps_per_user;
    const y = point.throughput_total_tps ?? point.tps_per_gpu;
    assertFiniteNumber(x, `frontier row ${index} tps_per_user`);
    assertFiniteNumber(y, `frontier row ${index} throughput`);
    return [x, y];
}


function computeFrontier(points) {
    const decorated = points.map((row, index) => ({ row, index, metrics: metricPair(row, index) }));
    decorated.sort((left, right) => (
        left.metrics[0] - right.metrics[0] ||
        right.metrics[1] - left.metrics[1] ||
        left.index - right.index
    ));
    const bestByX = [];
    for (const item of decorated) {
        if (!bestByX.length || bestByX.at(-1).metrics[0] !== item.metrics[0]) bestByX.push(item);
    }
    const retained = [];
    let bestY = -Infinity;
    for (let index = bestByX.length - 1; index >= 0; index -= 1) {
        const item = bestByX[index];
        if (item.metrics[1] > bestY) {
            retained.push(item);
            bestY = item.metrics[1];
        }
    }
    retained.reverse();
    return retained.map(item => item.row);
}


function naturalCompare(left, right) {
    const leftText = String(left);
    const rightText = String(right);
    const natural = leftText.localeCompare(rightText, 'en-US', { numeric: true, sensitivity: 'base' });
    if (natural) return natural;
    if (leftText === rightText) return 0;
    return leftText < rightText ? -1 : 1;
}


function groupKey(surface, point) {
    return surface === 'overview'
        ? [point.hardware, point.gpu_num, strategyTier(point)]
        : [point.gpu_num];
}


function compareGroupKeys(left, right) {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        const comparison = naturalCompare(left[index] ?? '', right[index] ?? '');
        if (comparison) return comparison;
    }
    return 0;
}


export function frontierRowsForSelection(points, state = {}, surface = 'overview') {
    const filtered = filterStrategyPoints(points, state, surface);
    const groups = new Map();
    filtered.forEach(point => {
        const values = groupKey(surface, point);
        const key = JSON.stringify(values);
        if (!groups.has(key)) groups.set(key, { values, points: [] });
        groups.get(key).points.push(point);
    });
    return [...groups.values()]
        .sort((left, right) => compareGroupKeys(left.values, right.values))
        .flatMap(group => computeFrontier(group.points));
}


function brandForHardware(hardware) {
    if (HUAWEI_HARDWARE.has(hardware)) return 'huawei';
    if (AMD_HARDWARE.has(hardware)) return 'amd';
    return 'nvidia';
}


export function rankLeaderboardDecisionRows(rows, cardPrices = DEFAULT_PRICES) {
    if (!Array.isArray(rows) || rows.some(row => !isObject(row))) {
        throw new TypeError('leaderboard rows must be an array of objects');
    }
    assertObject(cardPrices, 'card prices');
    const prices = { ...DEFAULT_PRICES, ...cardPrices };
    for (const brand of ['huawei', 'nvidia', 'amd']) {
        assertFiniteNumber(prices[brand], `${brand} card price`);
        if (prices[brand] <= 0) throw new TypeError(`${brand} card price must be positive`);
    }
    return rows.map((row, index) => {
        const brand = brandForHardware(row.hardware);
        assertFiniteNumber(row.tps_per_gpu, `leaderboard row ${index} tps_per_gpu`);
        assertFiniteNumber(row.throughput_total_tps, `leaderboard row ${index} throughput_total_tps`);
        assertFiniteNumber(row.tps_per_user, `leaderboard row ${index} tps_per_user`);
        return {
            ...row,
            brand,
            roi: row.tps_per_gpu * 3600 / prices[brand],
            _input_order: index,
        };
    }).sort((left, right) => (
        right.roi - left.roi ||
        right.throughput_total_tps - left.throughput_total_tps ||
        right.tps_per_user - left.tps_per_user ||
        left._input_order - right._input_order
    )).slice(0, 20).map(({ _input_order, ...row }) => row);
}


export function tcoDecisionForHardware(rows, hardware) {
    if (!Array.isArray(rows) || rows.some(row => !isObject(row))) {
        throw new TypeError('TCO rows must be an array of objects');
    }
    return rows.find(row => row.hardware === hardware) || null;
}
