import { updateLanguage, currentLang, translations } from './i18n.js';
import { loadExcelData } from './data.js';

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
    const gpu = document.getElementById('tco-gpu-select').value;
    const inputSeq = document.getElementById('tco-input-seq').value;
    const outputSeq = document.getElementById('tco-output-seq').value;
    const cardPrice = parseFloat(document.getElementById('card-price-input').value);
    
    if (!gpu || !inputSeq || !outputSeq || !cardPrice) {
        const msg = translations[currentLang]?.['tco-input-missing'] || '请先选择 GPU、Input/Output 序列并填写单卡价格';
        alert(msg);
        return;
    }

        // Input: 在 prefill 表中通过 Config_Name 包含 I1024 / I8192 过滤
        // Output: 在 decode 表中通过 Config_Name 包含 O1024 / O8192 过滤
        const inputPattern = inputSeq === '8K' ? 'I8192' : 'I1024';
        const outputPattern = outputSeq === '8K' ? 'O8192' : 'O1024';

        // 从 decode / prefill 表中寻找该 GPU 在指定 input/output 场景下，
        // TPS per gpu 最大且（对 prefill 要求 TPS per user > 20）的配置
        Promise.all([
            loadBestConfig('data/final_decode_all.xlsx', gpu, { configSubstring: outputPattern, minTpsPerUser: 20 }),
            loadBestConfig('data/final_prefill_all.xlsx', gpu, { configSubstring: inputPattern, minTpsPerUser: 20 })
        ]).then(([decodeCfg, prefillCfg]) => {
        if (!decodeCfg && !prefillCfg) {
            const msg = translations[currentLang]?.['tco-no-config-found'] || '在 decode / prefill 表中未找到满足条件的配置';
            alert(msg);
            return;
        }

        displayResults(gpu, inputSeq, outputSeq, cardPrice, decodeCfg, prefillCfg);
    }).catch(err => {
        console.error(err);
        const msg = translations[currentLang]?.['tco-excel-error'] || '读取 Excel 失败，请检查 decode_all.xlsx / prefill_all.xlsx 是否存在且格式正确';
        alert(msg);
    });
}

async function loadBestConfig(filePath, gpu, options = {}) {
    const { minTpsPerUser = 0, configSubstring = null } = options;
  const rows = await loadExcelData(filePath);

  const filtered = rows.filter(r => {
    if (String(r['GPU']).trim() !== String(gpu).trim()) return false;
        if (configSubstring && (!r['Config_Name'] || !String(r['Config_Name']).includes(configSubstring))) return false;
    if (r['TPS per user'] != null && Number(r['TPS per user']) < minTpsPerUser) return false;
    return r['TPS per gpu'] != null;
  });

  if (!filtered.length) return null;

  let best = filtered[0];
  for (const row of filtered) {
    if (Number(row['TPS per gpu']) > Number(best['TPS per gpu'])) {
      best = row;
    }
  }

  return {
    tpsPerGpu: Number(best['TPS per gpu']),
    tpsPerUser: best['TPS per user'] != null ? Number(best['TPS per user']) : null,
    batch: best['Batch'] ?? null,
    attnTp: best['attn tp'] ?? null,
    ffnTp: best['ffn tp'] ?? null,
    pp: best['pp'] ?? null,
    configName: best['Config_Name'] ?? null
  };
}

function displayResults(gpu, inputSeq, outputSeq, cardPrice, decodeCfg, prefillCfg) {
    const resultsContainer = document.getElementById('tco-results');
    resultsContainer.innerHTML = '';

    // 计算每 1M token 的价格：简单假设 TPS per gpu ≈ tokens/s per GPU，1M token 时间 = 1_000_000 / TPS
    function pricePerMillionTokens(tpsPerGpu) {
        if (!tpsPerGpu || tpsPerGpu <= 0) return null;
        const secondsFor1M = 1_000_000 / tpsPerGpu;
        const hoursFor1M = secondsFor1M / 3600;
        return cardPrice * hoursFor1M; // 单卡成本
    }

    const t = translations[currentLang] || {};

    const resultCard = document.createElement('div');
    resultCard.className = 'result-card';
    const decodePrice = decodeCfg ? pricePerMillionTokens(decodeCfg.tpsPerGpu) : null;
    const prefillPrice = prefillCfg ? pricePerMillionTokens(prefillCfg.tpsPerGpu) : null;

    resultCard.innerHTML = `
        <div class="result-header">
            <h3>${gpu} - ${inputSeq} input / ${outputSeq} output</h3>
        </div>
        <div class="result-details">
            ${decodeCfg ? `
            <div class="result-item">
                <span class="result-label">${t['tco-decode-best'] || 'Decode 最佳配置 (按 TPS per GPU)'}</span>
                <span class="result-value">
                    ${decodeCfg.configName || ''}
                    ${decodeCfg.pp ? ` | pp=${decodeCfg.pp}` : ''}
                    ${decodeCfg.attnTp ? ` | attn tp=${decodeCfg.attnTp}` : ''}
                    ${decodeCfg.ffnTp ? ` | ffn tp=${decodeCfg.ffnTp}` : ''}
                    ${decodeCfg.batch ? ` | batch=${decodeCfg.batch}` : ''}
                    | TPS/gpu=${decodeCfg.tpsPerGpu.toFixed(2)}
                </span>
            </div>
            ${decodePrice != null ? `
            <div class="result-item">
                <span class="result-label">${t['tco-decode-price'] || 'Decode 每 1M token 价格:'}</span>
                <span class="result-value">$${decodePrice.toFixed(4)}</span>
            </div>` : ''}
            ` : `<div class="result-item"><span class="result-label">Decode:</span><span class="result-value">${t['tco-decode-none'] || '无满足条件配置'}</span></div>`}

            ${prefillCfg ? `
            <div class="result-item">
                <span class="result-label">${t['tco-prefill-best'] || 'Prefill 最佳配置 (TPS/gpu 且 TPS/request > 20)'}</span>
                <span class="result-value">
                    ${prefillCfg.configName || ''}
                    ${prefillCfg.pp ? ` | pp=${prefillCfg.pp}` : ''}
                    ${prefillCfg.attnTp ? ` | attn tp=${prefillCfg.attnTp}` : ''}
                    ${prefillCfg.ffnTp ? ` | ffn tp=${prefillCfg.ffnTp}` : ''}
                    ${prefillCfg.batch ? ` | batch=${prefillCfg.batch}` : ''}
                    | TPS/gpu=${prefillCfg.tpsPerGpu.toFixed(2)}
                    ${prefillCfg.tpsPerUser != null ? ` | TPS/request=${prefillCfg.tpsPerUser.toFixed(2)}` : ''}
                </span>
            </div>
            ${prefillPrice != null ? `
            <div class="result-item">
                <span class="result-label">${t['tco-prefill-price'] || 'Prefill 每 1M token 价格:'}</span>
                <span class="result-value">$${prefillPrice.toFixed(4)}</span>
            </div>` : ''}
            ` : `<div class="result-item"><span class="result-label">Prefill:</span><span class="result-value">${t['tco-prefill-none'] || '无满足条件配置 (TPS/request > 20)'}</span></div>`}
        </div>
    `;
    
    resultsContainer.appendChild(resultCard);
}