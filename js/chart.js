import { loadExcelData } from './data.js';

export let chart = null;
export let chartData = { datasets: [] };

const colors = {
    gradient: ['#ff00cc', '#4facfe', '#00f2fe', '#00ff9d', '#b967ff', '#ffcc00', '#ff4d4d', '#ff6b6b', '#4ecdc4', '#45b7d1']
};

export function initChart() {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    chart = new Chart(ctx, {
    // 使用散点图，更适合展示 CSV 中离散的 TPS 点
    type: 'scatter',
    titleColor: '#e0e0ff',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 30, 46, 0.9)',
                    bodyColor: '#e0e0ff',
                    borderColor: 'rgba(100, 200, 255, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            const point = context.raw || {};
                            const tpsPerUser = Number.isFinite(point.x) ? point.x : context.parsed.x;
                            const tpsPerGpu = Number.isFinite(point.y) ? point.y : context.parsed.y;
                            const gpu = point.gpu ?? 'N/A';
                            const batch = point.batch ?? 'N/A';
                            const attnTP = point.attnTP ?? 'N/A';
                            const ffnTP = point.ffnTP ?? 'N/A';
                            const attnDP = point.attnDP ?? 'N/A';
                            const ffnDP = point.ffnDP ?? 'N/A';

                            return [
                                `TPS (user/gpu): ${tpsPerUser.toFixed(2)} / ${tpsPerGpu.toFixed(2)}`,
                                `GPU: ${gpu}`,
                                `Batch: ${batch}`,
                                `TP: Attn ${attnTP}, FFN ${ffnTP}`,
                                `DP: Attn ${attnDP}, FFN ${ffnDP}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'TPS per User',
                        color: '#a0a0c0',
                        font: {
                            size: 14,
                            weight: '500'
                        }
                    },
                    grid: {
                        color: 'rgba(160, 160, 192, 0.1)'
                    },
                        ticks: {
                        color: '#a0a0c0'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'TPS per GPU',
                        color: '#a0a0c0',
                        font: {
                            size: 14,
                            weight: '500'
                        }
                    },
                    grid: {
                        color: 'rgba(160, 160, 192, 0.1)'
                    },
                    ticks: {
                        color: '#a0a0c0'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                intersect: true
            },
            elements: {
                line: {
                    tension: 0.4,
                    borderWidth: 2,
                    showLine: false
                },
                point: {
                    radius: 4,
                    hoverRadius: 6
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeInOutQuart'
            }
        }
    });
}

function getColor(index) {
    return colors.gradient[index % colors.gradient.length];
}

export function updateChart(config) {
    const { model, cardCount, inputSeq, outputSeq, hardware, attnTP, ffnTP, pp } = config;
    
    chartData.datasets = [];
    let datasetIndex = 0;
    
    // 基础配置曲线
    if (model && cardCount && inputSeq && outputSeq) {
        const data = generateMockData(config);
        const label = `${model}-${cardCount}卡-${inputSeq}in-${outputSeq}out`;
        
        chartData.datasets.push({
            label: label,
            data: data,
            borderColor: getColor(datasetIndex),
            backgroundColor: getColor(datasetIndex) + '20',
            fill: false,
            pointBackgroundColor: getColor(datasetIndex),
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: getColor(datasetIndex)
        });
        
        datasetIndex++;
    }
    
    // 生成所有硬件 × TP × PP组合
    if (hardware.length > 0 && attnTP.length > 0 && ffnTP.length > 0 && pp.length > 0) {
        hardware.forEach(hw => {
            attnTP.forEach(attn => {
                ffnTP.forEach(ffn => {
                    pp.forEach(p => {
                        const comboConfig = { ...config, hardware: hw, attnTP: attn, ffnTP: ffn, pp: p };
                        const data = generateMockData(comboConfig);
                        const label = `${hw}-${attn}TP-${ffn}TP-${p}PP`;
                        
                        chartData.datasets.push({
                            label: label,
                            data: data,
                            borderColor: getColor(datasetIndex),
                            backgroundColor: getColor(datasetIndex) + '20',
                            fill: false,
                            pointBackgroundColor: getColor(datasetIndex),
                            pointBorderColor: '#fff',
                            pointHoverBackgroundColor: '#fff',
                            pointHoverBorderColor: getColor(datasetIndex)
                        });
                        
                        datasetIndex++;
                    });
                });
            });
        });
    }
    
    chart.update();
}

export async function loadAndRenderChartFromCSV(filePath, label) {
    console.log('[loadAndRenderChartFromCSV] Loading data from:', filePath);
    const csvData = await loadExcelData(filePath);

    // 从 Excel 中提取 TPS per user / TPS per gpu 列（注意大小写）
    // Axes swapped: x = TPS per user, y = TPS per gpu
    const chartDataPoints = csvData
        .filter(row => row['TPS per gpu'] != null && row['TPS per user'] != null)
        .map(row => ({
            x: Number(row['TPS per user']),
            y: Number(row['TPS per gpu']),
            gpu: row['GPU'] ?? row['Gpu'] ?? row['gpu'] ?? null,
            batch: row['Batch'] ?? row['batch'] ?? null,
            attnTP: row['attn tp'] ?? row['attnTP'] ?? null,
            ffnTP: row['ffn tp'] ?? row['ffnTP'] ?? null,
            attnDP: row['attn dp'] ?? row['attnDP'] ?? null,
            ffnDP: row['ffn dp'] ?? row['ffnDP'] ?? null
        }));

    const datasetIndex = chartData.datasets.length;
    chartData.datasets.push({
        label: label,
        data: chartDataPoints,
        borderColor: getColor(datasetIndex),
        backgroundColor: getColor(datasetIndex) + '20',
        fill: false,
        showLine: false,
        pointBackgroundColor: getColor(datasetIndex),
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: getColor(datasetIndex)
    });

    chart.update();
}

// 从 CSV 绘制：根据过滤条件选行，并按某一列进行分类着色
export async function plotCsvWithFilters(filePath, filters, categoryKey) {
    //console.log('[plotCsvWithFilters] Loading data from:', filePath);
    const csvData = await loadExcelData(filePath);

    //console.log('[plotCsvWithFilters] total rows in CSV:', csvData.length);
    // 1) 按 filters 过滤行（例如 pp、attn tp、ffn ep、attn dp、ffn dp 等）
    //console.log('[plotCsvWithFilters] filters:', filters);
    const filteredRows = csvData.filter(row => {
        return Object.entries(filters).every(([key, value]) => {
            if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
                return true; // 未指定该条件则忽略
            }

            const cell = row[key];
            if (Array.isArray(value)) {
                // 多选：例如 pp: ['4', '8']
                return value.map(v => String(v).trim()).includes(String(cell).trim());
            }
            return String(cell).trim() === String(value).trim();
        });
    });

    console.log('[plotCsvWithFilters] filtered rows:', filteredRows.length);
    // 2) 按 categoryKey 分组（确保一次只有一个分类维度）
    const groups = new Map();
    filteredRows.forEach(row => {
        const catVal = row[categoryKey] ?? 'Unknown';
        const key = String(catVal).trim();
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(row);
    });

    // 清空当前数据集，再按分组生成新的数据集
    chartData.datasets = [];
    let datasetIndex = 0;

    for (const [catVal, rows] of groups.entries()) {
        const points = rows
            .filter(row => row['TPS per gpu'] != null && row['TPS per user'] != null)
                .map(row => ({
                    // Axes swapped: x = TPS per user, y = TPS per gpu
                    x: Number(row['TPS per user']),
                    y: Number(row['TPS per gpu']),
                    gpu: row['GPU'] ?? row['Gpu'] ?? row['gpu'] ?? null,
                    batch: row['Batch'] ?? row['batch'] ?? null,
                    attnTP: row['attn tp'] ?? row['attnTP'] ?? null,
                    ffnTP: row['ffn tp'] ?? row['ffnTP'] ?? null,
                    attnDP: row['attn dp'] ?? row['attnDP'] ?? null,
                    ffnDP: row['ffn dp'] ?? row['ffnDP'] ?? null
                }));

        if (points.length === 0) continue;

        chartData.datasets.push({
            label: `${categoryKey}=${catVal}`,
            data: points,
            borderColor: getColor(datasetIndex),
            backgroundColor: getColor(datasetIndex) + '40',
            showLine: false,
            pointBackgroundColor: getColor(datasetIndex),
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: getColor(datasetIndex)
        });

        datasetIndex++;
    }

    chart.update();
}

export function updateLegend() {
    const legendContainer = document.getElementById('legend-container');
    legendContainer.innerHTML = '';

    if (chartData.datasets.length === 0) {
        const noDataText = document.querySelector('#lang-select').value === 'zh' ? 
            '暂无数据 - 请选择配置' : 'No data - Please select configuration';
        legendContainer.innerHTML = `<div class="legend-item"><span>${noDataText}</span></div>`;
        return;
    }
    
    chartData.datasets.forEach((dataset, index) => {
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        
        const colorBox = document.createElement('div');
        colorBox.className = 'legend-color';
        colorBox.style.background = dataset.borderColor;
        
        const label = document.createElement('span');
        label.textContent = dataset.label;
        
        legendItem.appendChild(colorBox);
        legendItem.appendChild(label);
        legendContainer.appendChild(legendItem);
    });
}