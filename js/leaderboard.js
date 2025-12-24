import { translations, updateLanguage, currentLang } from './i18n.js';
import { allHardware, hardwareBrands, loadExcelData } from './data.js';

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
    const mode = document.getElementById('leaderboard-mode-select').value || 'prefill';
    const model = document.getElementById('leaderboard-model-select').value;
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
    
    const filePath = mode === 'prefill' ? 'data/final_prefill_all.xlsx' : 'data/final_decode_all.xlsx';

    generateRankingFromExcel(filePath, cardPrices)
        .then(rankings => {
            if (!rankings.length) {
                const msg = translations[currentLang]?.['leaderboard-no-data'] || '未找到满足条件的数据';
                alert(msg);
                return;
            }
            displayRankings(rankings);
        })
        .catch(err => {
            console.error(err);
            const msg = translations[currentLang]?.['leaderboard-excel-error'] || '读取 Excel 失败，请检查文件是否存在且格式正确';
            alert(msg);
        });
}

async function generateRankingFromExcel(filePath, cardPrices) {
    const rows = await loadExcelData(filePath);
    const rankings = [];

    rows.forEach(row => {
        const gpu = row['GPU'];
        const tpsPerGpu = row['TPS per gpu'];
        const tpsPerUser = row['TPS per user'];

        if (!gpu || tpsPerGpu == null) return;
        if (tpsPerUser != null && Number(tpsPerUser) <= 20) return;

        const brand = hardwareBrands.huawei.includes(gpu) ? 'huawei' :
                     hardwareBrands.nvidia.includes(gpu) ? 'nvidia' : 'amd';
        const price = cardPrices[brand] || 2.5;

        // 一小时每张卡吐出来的 token / price
        const tokensPerHourPerGpu = Number(tpsPerGpu) * 3600;
        const roi = tokensPerHourPerGpu / price;

        rankings.push({
            hardware: gpu,
            quantity: row['Gpu num'] || '-',
            config: row['Config_Name'] || '',
            tpsPerGpu: Number(tpsPerGpu),
            roi: roi
        });
    });

    rankings.sort((a, b) => b.roi - a.roi);
    return rankings;
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