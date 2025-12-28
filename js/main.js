import { translations, changeLanguage, updateLanguage, currentLang } from './i18n.js';
import { allHardware, hardwareBrands, tpOptions, ppOptions, batchOptions} from './data.js';
import { initChart, updateChart, updateLegend, chart, chartData, loadAndRenderChartFromCSV, plotCsvWithFilters } from './chart.js';
const initialConfig = {
    model: 'DeepSeekR1', // 默认模型
    precision: 'FP8', // 默认精度
    cardCount: '72', // 默认卡数量
    mode: 'prefill', // 默认场景
    seq: '8K', // 默认序列长度
    hardware: ['HGX-H200'], // 默认硬件配置
    attnTP: ['1'], // 默认 Attention TP
    ffnTP: ['1'], // 默认 FFN TP
    pp: ['1'] // 默认 PP
};
// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', async function() {
    generateHardwareCheckboxes();
    generateTPCheckboxes();
    generatePPCheckboxes();
    generateBatchCheckboxes();

    // 默认选中下拉框的第一个有效选项
    setDefaultSelectValue('model-select');
    setDefaultSelectValue('card-count-select');
    setDefaultSelectValue('mode-select');
    setDefaultSelectValue('seq-select');

    // 默认选中每组 checkbox 的第一个选项；batch 组默认全选
    setFirstCheckboxChecked('#hardware-checkboxes');
    setFirstCheckboxChecked('#attn-tp-group');
    setFirstCheckboxChecked('#ffn-tp-group');
    setFirstCheckboxChecked('#pp-group');
    selectAllCheckboxes('#batch-group');

    initChart();
    bindEventListeners();

    // 用初始选择触发一次绘制，从 Excel 加载并画出数据
    handleConfigChange();
});

// 将下拉框设置为第一个非空选项
function setDefaultSelectValue(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    // 跳过第一个“请选择”空值选项，从第二个开始
    for (let i = 0; i < select.options.length; i++) {
        const option = select.options[i];
        if (option.value !== '') {
            select.value = option.value;
            break;
        }
    }
}

// 将指定容器中的第一个 checkbox 设为选中
function setFirstCheckboxChecked(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const firstCheckbox = container.querySelector('input[type="checkbox"]');
    if (firstCheckbox) {
        firstCheckbox.checked = true;
    }
}

// 将某个容器下的所有 checkbox 设为选中
function selectAllCheckboxes(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
    });
}

// 生成硬件配置复选框
function generateHardwareCheckboxes() {
    const container = document.getElementById('hardware-checkboxes');
    container.innerHTML = '';
    
    allHardware.forEach(hw => {
        const item = document.createElement('div');
        item.className = 'checkbox-item';
        
        const brand = hardwareBrands.huawei.includes(hw) ? 
            { class: 'brand-huawei', text: 'H' } :
            hardwareBrands.nvidia.includes(hw) ? 
            { class: 'brand-nvidia', text: 'N' } :
            { class: 'brand-amd', text: 'A' };
        
        item.innerHTML = `
            <input type="checkbox" id="hw-${hw}" value="${hw}">
            <label for="hw-${hw}">
                <span class="brand-icon ${brand.class}">${brand.text}</span>
                ${hw}
            </label>
        `;
        
        container.appendChild(item);
    });
}

// 生成TP复选框
function generateTPCheckboxes() {
    const attnContainer = document.getElementById('attn-tp-group');
    const ffnContainer = document.getElementById('ffn-tp-group');
    
    attnContainer.innerHTML = '';
    ffnContainer.innerHTML = '';
    
    tpOptions[0].values.forEach(value => {
        const num = value.replace('TP', '');
        attnContainer.innerHTML += `
            <div class="checkbox-item">
                <input type="checkbox" id="attn-tp-${num}" value="${num}">
                <label for="attn-tp-${num}">${value}</label>
            </div>
        `;
    });
    
    tpOptions[1].values.forEach(value => {
        const num = value.replace('TP', '');
        ffnContainer.innerHTML += `
            <div class="checkbox-item">
                <input type="checkbox" id="ffn-tp-${num}" value="${num}">
                <label for="ffn-tp-${num}">${value}</label>
            </div>
        `;
    });
}

// 生成PP复选框
function generatePPCheckboxes() {
    const container = document.getElementById('pp-group');
    container.innerHTML = '';
    
    ppOptions.forEach(value => {
        const num = value.replace('PP', '');
        container.innerHTML += `
            <div class="checkbox-item">
                <input type="checkbox" id="pp-${num}" value="${num}">
                <label for="pp-${num}">${value}</label>
            </div>
        `;
    });
}

// 生成 Batch Size 复选框
function generateBatchCheckboxes() {
    const container = document.getElementById('batch-group');
    if (!container) return;
    container.innerHTML = '';

    batchOptions.forEach(value => {
        container.innerHTML += `
            <div class="checkbox-item">
                <input type="checkbox" id="batch-${value}" value="${value}">
                <label for="batch-${value}">${value}</label>
            </div>
        `;
    });
}

// 获取选中的硬件配置
function getSelectedHardware() {
    const checkboxes = document.querySelectorAll('#hardware-checkboxes input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// 获取特定类别的选中值
function getSelectedValues(prefix) {
    const checkboxes = document.querySelectorAll(`input[id^="${prefix}-"]:checked`);
    return Array.from(checkboxes).map(cb => cb.value);
}

// 获取当前配置
function getCurrentConfig() {
    return {
        model: document.getElementById('model-select').value,
        cardCount: document.getElementById('card-count-select').value,
        mode: document.getElementById('mode-select').value,
        seq: document.getElementById('seq-select').value,
        hardware: getSelectedHardware(),
        attnTP: getSelectedValues('attn-tp'),
        ffnTP: getSelectedValues('ffn-tp'),
    pp: getSelectedValues('pp'),
    batch: getSelectedValues('batch')
    };
}

// 绑定事件监听器
function bindEventListeners() {
    // 模型与序列配置变化
    document.getElementById('model-select').addEventListener('change', handleConfigChange);
    document.getElementById('card-count-select').addEventListener('change', handleConfigChange);
    document.getElementById('mode-select').addEventListener('change', handleConfigChange);
    document.getElementById('seq-select').addEventListener('change', handleConfigChange);
    
    // 语言切换
    document.getElementById('lang-select').addEventListener('change', (e) => {
        changeLanguage(e.target.value);
    });
    
    // 复选框变化（使用事件委托）
    document.getElementById('hardware-checkboxes').addEventListener('change', handleConfigChange);
    document.getElementById('attn-tp-group').addEventListener('change', handleConfigChange);
    document.getElementById('ffn-tp-group').addEventListener('change', handleConfigChange);
    document.getElementById('pp-group').addEventListener('change', handleConfigChange);
    const batchGroup = document.getElementById('batch-group');
    if (batchGroup) {
        batchGroup.addEventListener('change', handleConfigChange);
    }
    
    // 按钮事件
    document.getElementById('reset-btn').addEventListener('click', resetHardwareConfig);
    document.getElementById('update-btn').addEventListener('click', handleConfigChange);

    // 分类方式变化时自动刷新图表
    const categoryKeySelect = document.getElementById('category-key-select');
    if (categoryKeySelect) {
        categoryKeySelect.addEventListener('change', handleConfigChange);
    }
}

// 处理配置变化
function handleConfigChange() {
    const config = getCurrentConfig();
    const hasBaseConfig = config.model && config.cardCount && config.mode && config.seq;
    const hasHardwareConfig = config.hardware.length > 0 && config.attnTP.length > 0 && config.ffnTP.length > 0 && config.pp.length > 0 && config.batch.length > 0;

    // 仅在选择了完整的硬件配置后才从 Excel 绘制
    if (hasBaseConfig && hasHardwareConfig) {
        showLoading();

    // 构造 Excel(原 CSV) 过滤条件：根据你的表头列名映射
        // 通过 UI 选择构造 Excel 过滤条件
        // - model: 直接匹配表头中的 model 列
        // - GPU: 直接匹配表头中的 GPU 列（硬件选择）
        // - Gpu num: 匹配选中的卡数量
        // - I/O 序列：从 Config_Name 中的 Ixxxx/Oxxxx 进行模糊匹配
        const filters = {
            model: config.model || null,
            GPU: config.hardware,
            'Gpu num': config.cardCount || null,
            // 这里假定：pp 列中存的是纯数字，如 4, 8，对应复选框值
            'pp': config.pp,
            'attn tp': config.attnTP,
            'ffn tp': config.ffnTP,
            'Batch': config.batch,
            'ffn dp': 1,
            'attn ep': 1
        };

    // 分类方式：示例按 ffn tp 分类，你可以通过下拉框(category-key-select)切换
        const categoryKeySelect = document.getElementById('category-key-select');
        const categoryKey = categoryKeySelect ? categoryKeySelect.value : 'ffn tp';

    // 根据场景选择对应的 Excel 文件
    const csvPath = config.mode === 'prefill' ? 'data/final_prefill_all.xlsx' : 'data/final_decode_all.xlsx';

        setTimeout(async () => {
            await plotCsvWithFilters(csvPath, filters, categoryKey);
            updateLegend();
            hideLoading();
        }, 300);
    } else {
        // 没有任何配置时清空图表
        if (!chart) {
            return;
        }

        chartData.datasets = [];
        updateLegend();
        chart.update();
    }
}

// 重置配置
function resetHardwareConfig() {
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    
    document.getElementById('model-select').value = '';
    document.getElementById('card-count-select').value = '';
    document.getElementById('input-seq-select').value = '';
    document.getElementById('output-seq-select').value = '';
    
    handleConfigChange();
}

// 显示/隐藏加载动画
function showLoading() {
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

// 取消默认加载多个 CSV 的示例函数，改由 handleConfigChange 中按需加载 data.csv