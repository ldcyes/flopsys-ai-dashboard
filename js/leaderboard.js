import { translations, updateLanguage, currentLang } from './i18n.js';
import {
    hardwareBrands,
    loadWebInputs,
    modelOptions,
    sequenceOptions,
    populateSelectOptions,
    strategyPayloadOptions
} from './data.js';

let webInputs = null;
const MIN_TPS_PER_USER = 20;

document.addEventListener('DOMContentLoaded', async function() {
    webInputs = await loadWebInputs();
    populateLeaderboardInputs();
    bindEvents();
    updateLanguage(currentLang);
    await generateRanking();
});

function bindEvents() {
    document.getElementById('generate-ranking-btn').addEventListener('click', generateRanking);
    document.getElementById('leaderboard-model-select').addEventListener('change', populateLeaderboardSequences);
    document.getElementById('lang-select').addEventListener('change', (e) => {
        updateLanguage(e.target.value);
    });
}

function populateLeaderboardInputs() {
    populateSelectOptions(document.getElementById('leaderboard-model-select'), modelOptions(webInputs), '请选择模型');
    setFirstAvailableSelectValue('leaderboard-model-select');
    populateLeaderboardSequences();
}

function populateLeaderboardSequences() {
    const model = document.getElementById('leaderboard-model-select')?.value;
    populateSelectOptions(document.getElementById('leaderboard-seq-select'), sequenceOptions(webInputs, model));
}

function setFirstAvailableSelectValue(selectId) {
    const select = document.getElementById(selectId);
    if (!select || select.value) return;
    const firstValue = [...select.options].find(option => option.value !== '');
    if (firstValue) {
        select.value = firstValue.value;
    }
}

async function generateRanking() {
    const mode = document.getElementById('leaderboard-mode-select')?.value || 'decode';
    const model = document.getElementById('leaderboard-model-select').value;
    const seq = document.getElementById('leaderboard-seq-select')?.value;
    const priceHuawei = parseFloat(document.getElementById('price-input-huawei').value) || 2.5;
    const priceNvidia = parseFloat(document.getElementById('price-input-nvidia').value) || 3.0;
    const priceAmd = parseFloat(document.getElementById('price-input-amd').value) || 2.0;
    
    if (!model) {
        const msg = translations[currentLang]?.['leaderboard-model-missing'] || '请选择模型';
        alert(msg);
        return;
    }

    const cardPrices = {
        huawei: priceHuawei,
        nvidia: priceNvidia,
        amd: priceAmd
    };

    try {
        const rankings = await generateRankingFromStrategyPayloads(cardPrices, model, seq, mode);
        if (!rankings.length) {
            const msg = translations[currentLang]?.['leaderboard-no-data'] || '未找到满足条件的数据';
            alert(msg);
            return;
        }
        displayRankings(rankings);
    } catch (err) {
        console.error(err);
        const msg = translations[currentLang]?.['leaderboard-excel-error'] || '读取 strategy payload 失败，请检查文件是否存在且格式正确';
        alert(msg);
    }
}

async function generateRankingFromStrategyPayloads(cardPrices, model, seq, mode) {
    if (mode !== 'decode') return [];
    const descriptors = strategyPayloadOptions(webInputs, model, seq)
        .filter(descriptor => descriptor.kind === 'pareto');
    if (!descriptors.length) return [];

    const loaded = await Promise.all(descriptors.map(async descriptor => ({
        descriptor,
        payload: await loadStrategyPayload(descriptor)
    })));
    const points = loaded.flatMap(({ descriptor, payload }) =>
        decodeCompactRecords(payload).map(point => normalizeStrategyPoint(point, descriptor))
    );

    const rankings = points
        .filter(point =>
            point.hardware &&
            point.tpsPerGpu > 0 &&
            point.throughputTotalTps > 0 &&
            point.tpsPerUser >= MIN_TPS_PER_USER
        )
        .map(point => {
            const brand = brandForHardware(point.hardware);
            const price = cardPrices[brand] || cardPrices.nvidia || 3.0;
            const roi = point.tpsPerGpu * 3600 / price;
            return {
                hardware: point.hardware,
                quantity: point.gpuNum || '-',
                config: configLabel(point),
                tpsPerGpu: point.tpsPerGpu,
                throughputTotalTps: point.throughputTotalTps,
                tpsPerUser: point.tpsPerUser,
                roi
            };
        });

    rankings.sort((a, b) =>
        b.roi - a.roi ||
        b.throughputTotalTps - a.throughputTotalTps ||
        b.tpsPerUser - a.tpsPerUser
    );
    return rankings;
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

function number(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

function truthy(value) {
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'True';
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
        configName: point.Config_Name || point.config_name || descriptor.label || '',
        configSummary: point.config_summary || '',
        decodeConfigSummary: point.decode_config_summary || '',
        prefillConfigSummary: point.prefill_config_summary || '',
        hardware,
        gpuNum,
        strategyType: normalizeStrategy(point, descriptor),
        tpsPerGpu,
        tpsPerUser: number(point.tps_per_user ?? point['TPS per user']),
        throughputTotalTps: throughputTotal || tpsPerGpu * Math.max(gpuNum, 1),
        batch: point.batch ?? point.Batch ?? point.total_machine_batch ?? point['total machine batch'] ?? '',
        batchAttnGpu: point.batch_attn_gpu ?? point['batch attn gpu'] ?? '',
        batchFfnGpu: point.batch_ffn_gpu ?? point['batch ffn gpu'] ?? '',
        pp: point.pp ?? point.PP ?? '',
        attnDp: point.attn_dp ?? point['attn dp'] ?? '',
        attnTp: point.attn_tp ?? point['attn tp'] ?? '',
        attnCp: point.attn_cp ?? point['attn cp'] ?? '',
        ffnEp: point.ffn_ep ?? point['ffn ep'] ?? '',
        ffnTp: point.ffn_tp ?? point['ffn tp'] ?? '',
        mtpStage: point.mtp_stage ?? point['mtp stage'] ?? ''
    };
}

function brandForHardware(hardware) {
    if (hardwareBrands.huawei.includes(hardware)) return 'huawei';
    if (hardwareBrands.amd.includes(hardware)) return 'amd';
    return 'nvidia';
}

function brandIconForHardware(hardware) {
    const brand = brandForHardware(hardware);
    if (brand === 'huawei') return '🇨🇳';
    return '🇺🇸';
}

function configLabel(point) {
    const config = point.configSummary || point.configName || point.decodeConfigSummary || point.prefillConfigSummary;
    const knobs = [
        point.strategyType && point.strategyType !== 'monolithic' ? point.strategyType : '',
        point.mtpStage ? `stage ${point.mtpStage}` : '',
        point.batch ? `batch ${point.batch}` : '',
        point.pp ? `${point.pp}PP` : '',
        point.attnDp ? `attn ${point.attnDp}DP/${point.attnTp || '-'}TP/${point.attnCp || '-'}CP` : '',
        point.ffnEp ? `ffn ${point.ffnEp}EP/${point.ffnTp || '-'}TP` : ''
    ].filter(Boolean);
    return [config, knobs.join(', ')].filter(Boolean).join(' | ');
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function displayRankings(rankings) {
    const tbody = document.getElementById('leaderboard-tbody');
    tbody.innerHTML = '';
    
    rankings.slice(0, 20).forEach((item, index) => {
        const row = document.createElement('tr');
        const brandIcon = brandIconForHardware(item.hardware);
        
        row.innerHTML = `
            <td class="rank-cell">${index + 1}</td>
            <td>${brandIcon} ${escapeHtml(item.hardware)}</td>
            <td>${escapeHtml(item.quantity)}</td>
            <td class="config-cell">${escapeHtml(item.config)}</td>
            <td class="metric-cell">${item.tpsPerGpu.toFixed(2)}</td>
            <td class="metric-cell">${item.roi.toFixed(2)}</td>
        `;
        
        // 前三名高亮
        if (index < 3) {
            row.classList.add('top-rank');
        }
        
        tbody.appendChild(row);
    });
}
