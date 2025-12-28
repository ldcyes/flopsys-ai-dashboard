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
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const x = context.parsed.x;
                            const y = context.parsed.y;
                            return `${context.dataset.label}: TPS per user = ${y.toFixed(2)}, TPS per gpu = ${x.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
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
                },
                y: {
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
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
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
    const csvData = await loadExcelData(filePath);

    // 从 Excel 中提取 TPS per gpu / TPS per user 列（注意大小写）
    const chartDataPoints = csvData
        .filter(row => row['TPS per gpu'] != null && row['TPS per user'] != null)
        .map(row => ({
            x: Number(row['TPS per gpu']),
            y: Number(row['TPS per user'])
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
    const csvData = await loadExcelData(filePath);

    // 1) 按 filters 过滤行（例如 pp、attn tp、ffn tp、attn dp、ffn dp 等）
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
                x: Number(row['TPS per gpu']),
                y: Number(row['TPS per user'])
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