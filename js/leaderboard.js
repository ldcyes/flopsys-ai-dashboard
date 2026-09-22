import { translations, updateLanguage, currentLang } from './i18n.js';
import {
    loadDecisionSummary,
    loadWebInputs,
    modelOptions,
    populateSelectOptions,
    sequenceOptions
} from './data.js?v=display-data-v2';
import {
    decisionSummaryPath,
    rankLeaderboardDecisionRows
} from './dashboard-data.js?v=display-data-v2';

let webInputs = null;
let rankingRequestId = 0;
const DEFAULT_CARD_PRICES = Object.freeze({
    huawei: 2.5,
    nvidia: 3.0,
    amd: 2.0
});

document.addEventListener('DOMContentLoaded', async function() {
    webInputs = await loadWebInputs();
    populateLeaderboardInputs();
    bindEvents();
    updateLanguage(currentLang);
    await generateRanking();
});

function bindEvents() {
    document.getElementById('generate-ranking-btn').addEventListener('click', generateRanking);
    document.getElementById('leaderboard-model-select').addEventListener('change', () => {
        rankingRequestId += 1;
        populateLeaderboardSequences();
    });
    document.getElementById('leaderboard-seq-select').addEventListener('change', () => {
        rankingRequestId += 1;
    });
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
    const requestId = ++rankingRequestId;
    const mode = document.getElementById('leaderboard-mode-select')?.value || 'decode';
    const model = document.getElementById('leaderboard-model-select').value;
    const seq = document.getElementById('leaderboard-seq-select')?.value;
    const priceHuawei = positiveCardPrice('price-input-huawei', DEFAULT_CARD_PRICES.huawei);
    const priceNvidia = positiveCardPrice('price-input-nvidia', DEFAULT_CARD_PRICES.nvidia);
    const priceAmd = positiveCardPrice('price-input-amd', DEFAULT_CARD_PRICES.amd);
    
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
        const rankings = await generateRankingFromDecisionSummary(cardPrices, model, seq, mode);
        if (requestId !== rankingRequestId) return;
        if (!rankings.length) {
            const msg = translations[currentLang]?.['leaderboard-no-data'] || '未找到满足条件的数据';
            alert(msg);
            return;
        }
        displayRankings(rankings);
    } catch (err) {
        if (requestId !== rankingRequestId) return;
        console.error(err);
        const msg = translations[currentLang]?.['leaderboard-excel-error'] || '读取 decision summary 失败，请检查文件是否存在且格式正确';
        alert(msg);
    }
}

function positiveCardPrice(inputId, fallback) {
    const parsed = Number.parseFloat(document.getElementById(inputId)?.value || '');
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function generateRankingFromDecisionSummary(cardPrices, model, seq, mode) {
    if (mode !== 'decode') return [];
    const decision = await loadDecisionSummary(decisionSummaryPath(webInputs, model, seq));
    return rankLeaderboardDecisionRows(decision.leaderboardRows, cardPrices);
}

function brandIcon(brand) {
    if (brand === 'huawei') return '🇨🇳';
    return '🇺🇸';
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
    
    rankings.forEach((item, index) => {
        const row = document.createElement('tr');
        const icon = brandIcon(item.brand);
        
        row.innerHTML = `
            <td class="rank-cell">${index + 1}</td>
            <td>${icon} ${escapeHtml(item.hardware)}</td>
            <td>${escapeHtml(item.gpu_num)}</td>
            <td class="config-cell">${escapeHtml(item.config_label)}</td>
            <td class="metric-cell">${item.tps_per_gpu.toFixed(2)}</td>
            <td class="metric-cell">${item.roi.toFixed(2)}</td>
        `;
        
        // 前三名高亮
        if (index < 3) {
            row.classList.add('top-rank');
        }
        
        tbody.appendChild(row);
    });
}
