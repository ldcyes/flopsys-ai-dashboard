import { translations, changeLanguage, updateLanguage, currentLang } from './i18n.js';
import { allHardware, hardwareBrands, tpOptions, ppOptions, generateMockData } from './data.js';
import { initChart, updateChart, updateLegend, chart, chartData, loadAndRenderChartFromCSV, plotCsvWithFilters } from './chart.js';
const initialConfig = {
    model: 'DeepSeekR1', // 默认模型
    cardCount: '72', // 默认卡数量
    inputSeq: '8K', // 默认输入序列
    outputSeq: '8K', // 默认输出序列
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
    console.log("Initializing mock data...");
    //generateMockData(initialConfig);
    console.log("init chart")
    initChart();
    console.log("bind event listeners")
    bindEventListeners();

    // 初始不加载模拟曲线，仅根据用户配置+CSV 绘制
    updateLegend();

});

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
        inputSeq: document.getElementById('input-seq-select').value,
        outputSeq: document.getElementById('output-seq-select').value,
        hardware: getSelectedHardware(),
        attnTP: getSelectedValues('attn-tp'),
        ffnTP: getSelectedValues('ffn-tp'),
        pp: getSelectedValues('pp')
    };
}

// 绑定事件监听器
function bindEventListeners() {
    // 模型与序列配置变化
    document.getElementById('model-select').addEventListener('change', handleConfigChange);
    document.getElementById('card-count-select').addEventListener('change', handleConfigChange);
    document.getElementById('input-seq-select').addEventListener('change', handleConfigChange);
    document.getElementById('output-seq-select').addEventListener('change', handleConfigChange);
    
    // 语言切换
    document.getElementById('lang-select').addEventListener('change', (e) => {
        changeLanguage(e.target.value);
    });
    
    // 复选框变化（使用事件委托）
    document.getElementById('hardware-checkboxes').addEventListener('change', handleConfigChange);
    document.getElementById('attn-tp-group').addEventListener('change', handleConfigChange);
    document.getElementById('ffn-tp-group').addEventListener('change', handleConfigChange);
    document.getElementById('pp-group').addEventListener('change', handleConfigChange);
    
    // 按钮事件
    document.getElementById('reset-btn').addEventListener('click', resetHardwareConfig);
    document.getElementById('update-btn').addEventListener('click', handleConfigChange);
}

// 处理配置变化
function handleConfigChange() {
    const config = getCurrentConfig();
    const hasBaseConfig = config.model && config.cardCount && config.inputSeq && config.outputSeq;
    const hasHardwareConfig = config.hardware.length > 0 && config.attnTP.length > 0 && config.ffnTP.length > 0 && config.pp.length > 0;

    // 仅在选择了完整的硬件配置后才从 Excel 绘制
    if (hasBaseConfig && hasHardwareConfig) {
        showLoading();

    // 构造 Excel(原 CSV) 过滤条件：根据你的表头列名映射
        const filters = {
            // 这里假定：pp 列中存的是纯数字，如 4, 8，对应复选框值
            'pp': config.pp,
            'attn tp': config.attnTP,
            'ffn tp': config.ffnTP
            // 如果 CSV 中还有 dp/ep 相关列，并且你在 UI 中加入了选择，可以在这里继续补充
            // 'attn dp': ..., 'ffn dp': ..., 'ffn ep': ...
        };

    // 分类方式：示例按 ffn tp 分类，你可以通过下拉框(category-key-select)切换
        const categoryKeySelect = document.getElementById('category-key-select');
        const categoryKey = categoryKeySelect ? categoryKeySelect.value : 'ffn tp';

    // 根据 Excel 文件路径调用绘制函数
    const csvPath = 'data/final_decode_all.xlsx';

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