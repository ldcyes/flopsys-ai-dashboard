import { translations, updateLanguage, currentLang } from './i18n.js';
import { allHardware, hardwareBrands } from './data.js';

// 模拟ROI数据生成
function generateRankingData(model, cardPrices) {
    const rankings = [];
    const cardQuantities = ['36', '72', '144', '288', '576'];
    
    allHardware.forEach(hw => {
        const brand = hardwareBrands.huawei.includes(hw) ? 'huawei' : 
                     hardwareBrands.nvidia.includes(hw) ? 'nvidia' : 'amd';
        const price = cardPrices[brand] || 2.5;
        
        cardQuantities.forEach(qty => {
            const baseTPS = Math.random() * 5000 + 3000;
            const efficiency = 0.7 + Math.random() * 0.3;
            const tpsPerDollar = baseTPS / (price * parseInt(qty)) * efficiency;
            
            rankings.push({
                hardware: hw,
                quantity: qty,
                config: `${2 + Math.floor(Math.random() * 3)}TP-${2 + Math.floor(Math.random() * 3)}TP-${4 * Math.ceil(parseInt(qty) / 36)}PP`,
                tpsPerDollar: tpsPerDollar,
                roi: (tpsPerDollar * 100).toFixed(2)
            });
        });
    });
    
    return rankings.sort((a, b) => b.tpsPerDollar - a.tpsPerDollar);
}

document.addEventListener('DOMContentLoaded', function() {
    bindEvents();
    updateLanguage(currentLang);
});

function bindEvents() {
    document.getElementById('generate-ranking-btn').addEventListener('click', generateRanking);
    document.getElementById('lang-select').addEventListener('change', (e) => {
        updateLanguage(e.target.value);
    });
}

function generateRanking() {
    const model = document.getElementById('leaderboard-model-select').value;
    const priceHuawei = parseFloat(document.getElementById('price-input-huawei').value) || 2.5;
    const priceNvidia = parseFloat(document.getElementById('price-input-nvidia').value) || 3.0;
    const priceAmd = parseFloat(document.getElementById('price-input-amd').value) || 2.0;
    
    if (!model) {
        alert('请选择模型');
        return;
    }
    
    const cardPrices = {
        huawei: priceHuawei,
        nvidia: priceNvidia,
        amd: priceAmd
    };
    
    const rankings = generateRankingData(model, cardPrices);
    displayRankings(rankings);
}

function displayRankings(rankings) {
    const tbody = document.getElementById('leaderboard-tbody');
    tbody.innerHTML = '';
    
    rankings.slice(0, 20).forEach((item, index) => {
        const row = document.createElement('tr');
        const brandIcon = hardwareBrands.huawei.includes(item.hardware) ? '🇨🇳' : 
                         hardwareBrands.nvidia.includes(item.hardware) ? '🇺🇸' : '🇺🇸';
        
        row.innerHTML = `
            <td class="rank-cell">${index + 1}</td>
            <td>${brandIcon} ${item.hardware}</td>
            <td>${item.quantity}</td>
            <td class="config-cell">${item.config}</td>
            <td class="metric-cell">${item.tpsPerDollar.toFixed(2)}</td>
            <td class="metric-cell">${item.roi}%</td>
        `;
        
        // 前三名高亮
        if (index < 3) {
            row.classList.add('top-rank');
        }
        
        tbody.appendChild(row);
    });
}