import { updateLanguage, currentLang, translations } from './i18n.js';
import { loadExcelData } from './data.js';

document.addEventListener('DOMContentLoaded', function() {
    // 默认单卡价格设置为 2 美金（如用户未填写）
    const priceInput = document.getElementById('card-price-input');
    if (priceInput && !priceInput.value) {
        priceInput.value = '2';
    }

    // 下拉框默认选择第一个有效配置（跳过占位项）
    function setDefaultSelectValue(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        for (let i = 0; i < select.options.length; i++) {
            const opt = select.options[i];
            if (opt.value !== '') {
                select.value = opt.value;
                break;
            }
        }
    }

    setDefaultSelectValue('tco-gpu-select');
    setDefaultSelectValue('tco-model-select');
    setDefaultSelectValue('tco-input-seq');
    setDefaultSelectValue('tco-output-seq');

    bindEvents();
    updateLanguage(currentLang);
    const langSelect = document.getElementById('lang-select');
if (langSelect) {
    langSelect.value = currentLang || 'en';
}
updateLanguage();
});

function bindEvents() {
    document.getElementById('calculate-tco-btn').addEventListener('click', calculateTCO);
    document.getElementById('lang-select').addEventListener('change', (e) => {
        updateLanguage(e.target.value);
    });
}

function calculateTCO() {

    const gpu = document.getElementById('tco-gpu-select').value;
    const model = document.getElementById('tco-model-select').value;
    const inputSeq = document.getElementById('tco-input-seq').value;
    const outputSeq = document.getElementById('tco-output-seq').value;
    const cardPrice = parseFloat(document.getElementById('card-price-input').value);
    
    if (!gpu || !model || !inputSeq || !outputSeq || !cardPrice) {
        const msg = translations[currentLang]?.['tco-input-missing'] || 'please select Model, GPU, Input/Output and price per card';
        alert(msg);
        return;
    }

        // Input: 在 prefill 表中通过 Config_Name 包含 I1024 / I8192 过滤
        // Output: 在 decode 表中通过 Config_Name 包含 O1024 / O8192 过滤
        const inputPattern = inputSeq === '8K' ? 'I8192' : 'I1024';
        const outputPattern = outputSeq === '8K' ? 'O8192' : 'O1024';

        // 从 decode / prefill 表中寻找该 GPU 在指定 input/output 场景下，
        // - decode : TPS per gpu 最大的配置
        // - prefill: TPS per gpu 最大且 TPS per user >= 20 的配置
        Promise.all([
            // decode 不强制 TPS per user 下限
            loadBestConfig('data/final_decode_all.xlsx' , gpu, { configSubstring: outputPattern, minTpsPerUser: 20 }),
            // prefill 需要 TPS per user >= 20
            loadBestConfig('data/final_prefill_all.xlsx', gpu, { configSubstring: inputPattern })
        ]).then(([decodeCfg, prefillCfg]) => {
        if (!decodeCfg && !prefillCfg) {
            const msg = translations[currentLang]?.['tco-no-config-found'] || 'no matching config found in decode / prefill sheets';
            alert(msg);
            return;
        }

        displayResults(gpu, inputSeq, outputSeq, cardPrice, decodeCfg, prefillCfg);
    }).catch(err => {
        console.error(err);
        const msg = translations[currentLang]?.['tco-excel-error'] || 'Failed to read Excel, please check if the xlsx file exists and is correctly formatted';
        alert(msg);
    });
}

async function loadBestConfig(filePath, gpu, options = {}) {
  const { minTpsPerUser = 0, configSubstring = null } = options;
  const rows = await loadExcelData(filePath);

  console.log('filter', filePath, 'for GPU:', gpu, 'with options:', options);
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
    ffnEp: best['ffn ep'] ?? null,
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
                <span class="result-label">${t['tco-decode-best'] || 'Decode best config (by TPS per GPU)'}</span>
                <div class="result-value">
                    <div class="result-tags">
                        <span class="tag">PP: ${decodeCfg.pp ?? '-'}</span>
                        <span class="tag">Attn TP: ${decodeCfg.attnTp ?? '-'}</span>
                        <span class="tag">FFN TP: ${decodeCfg.ffnTp ?? '-'}</span>
                        <span class="tag">FFN EP: ${decodeCfg.ffnEp ?? '-'}</span>
                        <span class="tag">Batch: ${decodeCfg.batch ?? '-'}</span>
                    </div>
                    <div class="result-metrics">
                        <span class="metric">TPS/gpu: ${decodeCfg.tpsPerGpu.toFixed(2)}</span>
                    </div>
                </div>
            </div>
            ${decodePrice != null ? `
            <div class="result-item">
                <span class="result-label">${t['tco-decode-price'] || 'Decode per 1M token price:'}</span>
                <span class="result-value">$${decodePrice.toFixed(4)}</span>
            </div>` : ''}
            ` : `<div class="result-item"><span class="result-label">Decode:</span><span class="result-value">${t['tco-decode-none'] || '无满足条件配置'}</span></div>`}

            ${prefillCfg ? `
            <div class="result-item">
                <span class="result-label">${t['tco-prefill-best'] || 'Prefill best config (by TPS/gpu and TPS/request > 20)'}</span>
                <div class="result-value">
                    <div class="result-tags">
                        <span class="tag">PP: ${prefillCfg.pp ?? '-'}</span>
                        <span class="tag">Attn TP: ${prefillCfg.attnTp ?? '-'}</span>
                        <span class="tag">FFN TP: ${prefillCfg.ffnTp ?? '-'}</span>
                        <span class="tag">FFN EP: ${prefillCfg.ffnEp ?? '-'}</span>
                        <span class="tag">Batch: ${prefillCfg.batch ?? '-'}</span>
                    </div>
                    <div class="result-metrics">
                        <span class="metric">TPS/gpu: ${prefillCfg.tpsPerGpu.toFixed(2)}</span>
                        ${prefillCfg.tpsPerUser != null ? `<span class="metric">TPS/request: ${prefillCfg.tpsPerUser.toFixed(2)}</span>` : ''}
                    </div>
                </div>
            </div>
            ${prefillPrice != null ? `
            <div class="result-item">
                <span class="result-label">${t['tco-prefill-price'] || 'Prefill per 1M token price:'}</span>
                <span class="result-value">$${prefillPrice.toFixed(4)}</span>
            </div>` : ''}
            ` : `<div class="result-item"><span class="result-label">Prefill:</span><span class="result-value">${t['tco-prefill-none'] || '无满足条件配置 (TPS/request > 20)'}</span></div>`}
        </div>
    `;
    
    resultsContainer.appendChild(resultCard);
}