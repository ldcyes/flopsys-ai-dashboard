// 硬件配置数据
export const hardwareBrands = {
    huawei: ['910B', '910C','950PR','960','970'],
    nvidia: ['L4', 'H20', 'H800', 'HGX-H100', 'HGX-H200', 'DGX-B100', 'DGX-B200', 'DGX-B300', 'GB200-NVL72', 'GB300-NV72', 'Rubin-NV144', 'Rubin-NV576'],
    amd: ['MI300X', 'MI350X', 'MI355', 'MI400']
};

export const allHardware = ['910B', '910C','950PR','960','970', 'L4','H20','H800',
    'HGX-H200', 'DGX-B200', 'DGX-B300', 'GB200-NVL72', 'GB300-NV72', 'Rubin-NV144', 'Rubin-NV576', 'HGX-H200', 'H800', 'H200', 'R200', 'R300', 'MI400', 'MI355'];

export const tpOptions = [
    { id: 'attn-tp', values: ['1TP', '2TP', '4TP', '8TP'] },
    { id: 'ffn-tp', values: ['1TP', '2TP', '4TP', '8TP'] }
];

export const ppOptions = ['1PP', '2PP', '4PP', '8PP', '16PP'];

// 生成模拟数据
export function generateMockData(config) {
    const data = [];
    const points = 20;
    
    for (let i = 0; i < points; i++) {
        const totalTPS = 1000 + i * 500 + Math.random() * 300;
        const TPSPerQuery = totalTPS / (10 + Math.random() * 20) * (0.8 + Math.random() * 0.4);
        
        data.push({
            x: totalTPS,
            y: TPSPerQuery
        });
    }
    
    if (config.model) {
        const modelMultiplier = {
            'K2-thinking': 1.2,
            'DeepSeekR1': 1.0,
            'LLAMA4-behemoh': 0.8,
            'GPT-oss120b': 1.1
        };
        data.forEach(point => {
            point.y *= modelMultiplier[config.model] || 1;
        });
    }
    
    if (config.cardCount) {
        const cardMultiplier = parseInt(config.cardCount) / 72;
        data.forEach(point => {
            point.x *= cardMultiplier;
            point.y *= Math.sqrt(cardMultiplier);
        });
    }
    
    return data.sort((a, b) => a.x - b.x);
}

// 获取品牌图标类名
export function getBrandIcon(hw) {
    if (hardwareBrands.huawei.includes(hw)) {
        return { class: 'brand-huawei', text: 'H' };
    } else if (hardwareBrands.nvidia.includes(hw)) {
        return { class: 'brand-nvidia', text: 'N' };
    } else if (hardwareBrands.amd.includes(hw)) {
        return { class: 'brand-amd', text: 'A' };
    }
    return { class: '', text: '' };
}

// 从 Excel(xlsx) 文件加载数据
// 依赖 SheetJS(xlsx) 库，请在 HTML 中通过 CDN 引入：
// <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
export async function loadExcelData(filePath) {
    const response = await fetch(filePath);
    const arrayBuffer = await response.arrayBuffer();

    // 读取工作簿，这里假设使用 SheetJS(xlsx) 库，暴露为全局 XLSX 对象
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // 默认取第一个工作表
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // 转换为 JSON 数组，每一行是一个对象，key 为列名
    const json = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    // 尝试把数字字符串转成 Number，其他保持原样
    return json.map(row => {
        const obj = {};
        Object.entries(row).forEach(([key, value]) => {
            if (typeof value === 'string' && value.trim() !== '' && !isNaN(value)) {
                obj[key] = Number(value);
            } else {
                obj[key] = value;
            }
        });
        return obj;
    });
}