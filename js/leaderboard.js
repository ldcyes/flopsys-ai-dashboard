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

    
    if (!model) {
        const msg = translations[currentLang]?.['leaderboard-model-missing'] || '请选择模型';
        alert(msg);
        return;
    }
    
    const filePath = mode === 'prefill' ? 'data/final_prefill_all.xlsx' : 'data/final_decode_all.xlsx';

    generateRankingFromExcel(filePath, model)
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

async function generateRankingFromExcel(filePath, model) {
    const rows = await loadExcelData(filePath);

    // 先按 GPU 聚合，找到每个 GPU TPS per gpu 最大的配置
    const bestByGpu = new Map();

    rows.forEach(row => {
        const gpu = row['GPU'];
        const rowModel = row['model'] || row['Model'];
        const tpsPerGpuRaw = row['TPS per gpu'];
        const tpsPerUserRaw = row['TPS per user'];

        if (!gpu || tpsPerGpuRaw == null) return;

        // 模型过滤
        if (model && rowModel && String(rowModel).trim() !== String(model).trim()) return;

        const tpsPerGpu = Number(tpsPerGpuRaw);
        const tpsPerUser = tpsPerUserRaw != null ? Number(tpsPerUserRaw) : null;

        // 只保留 TPS per user >= 20 的配置
        if (tpsPerUser != null && tpsPerUser < 20) return;

        const existing = bestByGpu.get(gpu);
        if (!existing || tpsPerGpu > existing.tpsPerGpu) {
            bestByGpu.set(gpu, {
                row,
                tpsPerGpu
            });
        }
    });

    const rankings = [];

    bestByGpu.forEach(({ row, tpsPerGpu }) => {
        const gpu = row['GPU'];

        // 从行里取出 dp/ep/tp/batch（这里以 FFN 为例，你可以换成 attn_*）
    const attnDp = row['attn dp'] ?? row['Attn dp'] ?? row['attn_dp'];
    const attnTp = row['attn tp'] ?? row['Attn tp'] ?? row['attn_tp'];
        const ffnEp = row['ffn ep'] ?? row['FFN ep'] ?? row['ffn_ep'];
        const ffnTp = row['ffn tp'] ?? row['FFN tp'] ?? row['ffn_tp'];
        const batch = row['Batch'] ?? row['batch'];

        rankings.push({
            hardware: gpu,
            quantity: row['Gpu num'] || '-',
            tpsPerGpu,
            attnDp,
            attnTp,
            ffnEp,
            ffnTp,
            batch
        });
    });

    // 按 TPS/gpu 从大到小排序
    rankings.sort((a, b) => b.tpsPerGpu - a.tpsPerGpu);

    return rankings;
}

function displayRankings(rankings) {
    const tbody = document.getElementById('leaderboard-tbody');
    tbody.innerHTML = '';
    
    rankings.slice(0, 20).forEach((item, index) => {
        const row = document.createElement('tr');
        const brandIcon = hardwareBrands.huawei.includes(item.hardware) ? '🇨🇳' : 
                         hardwareBrands.nvidia.includes(item.hardware) ? '🇺🇸' : '🇺🇸';

        const configParamsText = [
            item.attnDp!= null ? `attn dp: ${item.attnDp}` : null,
            item.attnTp!= null ? `attn tp: ${item.attnTp}` : null,
            item.ffnEp != null ? `ffn ep: ${item.ffnEp}` : null,
            item.ffnTp != null ? `ffn tp: ${item.ffnTp}` : null,
            item.batch != null ? `batch: ${item.batch}` : null
        ].filter(Boolean).join(' | ');

        row.innerHTML = `
            <td class="rank-cell">${index + 1}</td>
            <td>${brandIcon} ${item.hardware}</td>
            <td>${item.quantity}</td>
            <td class="config-cell">${configParamsText}</td>
            <td class="metric-cell">${item.tpsPerGpu.toFixed(2)}</td>
        `;
        
        if (index < 3) {
            row.classList.add('top-rank');
        }
        
        tbody.appendChild(row);
    });
}