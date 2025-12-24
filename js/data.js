// 硬件配置数据
export const hardwareBrands = {
    //huawei: ['910B', '910C','950PR','960','970'],
    nvidia: ['H20', 'H800', 'HGX-H100', 'HGX-H200', 'DGX-B100', 'DGX-B200', 'DGX-B300', 'GB200-NVL72', 'GB300-NV72', 'Rubin-NV144', 'Rubin-NV576'],
    //amd: ['MI300X', 'MI350X', 'MI355', 'MI400']
};

export const allHardware = [//'910B', '910C','950PR','960','970',
    'H20', 'H800', 'HGX-H100','HGX-H200', 'DGX-B200', 'DGX-B300', 'GB200-NVL72', 'GB300-NV72', 'Rubin-NV144', 'Rubin-NV576']; //'MI400', 'MI355'];

export const tpOptions = [
    { id: 'attn-tp', values: ['1TP', '2TP', '4TP', '8TP'] },
    { id: 'ffn-tp', values: ['1TP', '2TP', '4TP', '8TP'] }
];

export const ppOptions = ['1PP', '2PP', '4PP', '8PP'];

// Batch size 选项
export const batchOptions = [16, 32, 64, 128, 256, 384, 512];

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
    console.log('[loadExcelData] rows count =', json.length);
    console.log('[loadExcelData] first row =', json[0]);
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