import { translations, updateLanguage, currentLang } from './i18n.js';
import { allHardware, hardwareBrands } from './data.js';

// 最优配置模拟数据
const optimalConfigs = {
    'K2-thinking': {
        '36': { attnTP: '2', ffnTP: '2', pp: '4', tco: 125000 },
        '72': { attnTP: '4', ffnTP: '4', pp: '8', tco: 245000 },
        '144': { attnTP: '8', ffnTP: '8', pp: '16', tco: 480000 },
        '288': { attnTP: '8', ffnTP: '8', pp: '32', tco: 920000 },
        '576': { attnTP: '16', ffnTP: '16', pp: '64', tco: 1800000 }
    },
    'DeepSeekR1': {
        '36': { attnTP: '1', ffnTP: '2', pp: '4', tco: 118000 },
        '72': { attnTP: '2', ffnTP: '4', pp: '8', tco: 235000 },
        '144': { attnTP: '4', ffnTP: '8', pp: '16', tco: 465000 },
        '288': { attnTP: '8', ffnTP: '8', pp: '32', tco: 890000 },
        '576': { attnTP: '8', ffnTP: '16', pp: '64', tco: 1750000 }
    },
    'LLAMA4-behemoh': {
        '36': { attnTP: '4', ffnTP: '4', pp: '2', tco: 132000 },
        '72': { attnTP: '8', ffnTP: '8', pp: '4', tco: 258000 },
        '144': { attnTP: '8', ffnTP: '16', pp: '8', tco: 505000 },
        '288': { attnTP: '16', ffnTP: '16', pp: '16', tco: 980000 },
        '576': { attnTP: '16', ffnTP: '32', pp: '32', tco: 1920000 }
    },
    'GPT-oss120b': {
        '36': { attnTP: '2', ffnTP: '1', pp: '4', tco: 120000 },
        '72': { attnTP: '4', ffnTP: '2', pp: '8', tco: 238000 },
        '144': { attnTP: '8', ffnTP: '4', pp: '16', tco: 470000 },
        '288': { attnTP: '8', ffnTP: '8', pp: '32', tco: 910000 },
        '576': { attnTP: '16', ffnTP: '8', pp: '64', tco: 1780000 }
    }
};

document.addEventListener('DOMContentLoaded', function() {
    bindEvents();
    updateLanguage(currentLang);
});

function bindEvents() {
    document.getElementById('calculate-tco-btn').addEventListener('click', calculateTCO);
    document.getElementById('lang-select').addEventListener('change', (e) => {
        updateLanguage(e.target.value);
    });
}

function calculateTCO() {
    const model = document.getElementById('tco-model-select').value;
    const cardPrice = parseFloat(document.getElementById('card-price-input').value);
    const quantity = document.getElementById('card-quantity-select').value;
    const usageHours = parseInt(document.getElementById('usage-hours-input').value);
    
    if (!model || !cardPrice || !quantity || !usageHours) {
        alert('请填写所有必填项');
        return;
    }
    
    const config = optimalConfigs[model][quantity];
    if (!config) {
        alert('暂无该配置数据');
        return;
    }
    
    // 计算TCO：硬件成本 + 3年运营成本
    const hardwareCost = config.tco;
    const yearlyOpEx = cardPrice * parseInt(quantity) * usageHours * 365;
    const totalTCO = hardwareCost + yearlyOpEx * 3;
    
    displayResults(model, quantity, config, totalTCO);
}

function displayResults(model, quantity, config, tco) {
    const resultsContainer = document.getElementById('tco-results');
    resultsContainer.innerHTML = '';
    
    const resultCard = document.createElement('div');
    resultCard.className = 'result-card';
    resultCard.innerHTML = `
        <div class="result-header">
            <h3>${model} - ${quantity} ${currentLang === 'zh' ? '卡配置' : 'Cards'}</h3>
        </div>
        <div class="result-details">
            <div class="result-item">
                <span class="result-label" data-lang="attn-tp-config">Attention TP:</span>
                <span class="result-value">${config.attnTP}TP</span>
            </div>
            <div class="result-item">
                <span class="result-label" data-lang="ffn-tp-config">FFN TP:</span>
                <span class="result-value">${config.ffnTP}TP</span>
            </div>
            <div class="result-item">
                <span class="result-label" data-lang="pp-config">PP:</span>
                <span class="result-value">${config.pp}PP</span>
            </div>
            <div class="result-item">
                <span class="result-label" data-lang="hardware-cost">硬件成本:</span>
                <span class="result-value">$${config.tco.toLocaleString()}</span>
            </div>
            <div class="result-item total">
                <span class="result-label" data-lang="total-tco">总TCO (3年):</span>
                <span class="result-value">$${tco.toLocaleString()}</span>
            </div>
        </div>
    `;
    
    resultsContainer.appendChild(resultCard);
}