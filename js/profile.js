// profile.js - 从 decode_all.xlsx / prefill_all.xlsx 加载阶段耗时并画堆积柱状图

let stageChart = null;

// 8 个阶段列名，与表头严格一致
const STAGE_KEYS = [
  { key: 'MLA', label: 'MLA' },
  { key: 'Load KV', label: 'Load KV' },
  { key: 'Dense MLP', label: 'Dense MLP' },
  { key: 'Dispatch time', label: 'Dispatch time' },
  { key: 'Shared Expert', label: 'Shared Expert' },
  { key: 'Routed expert', label: 'Routed expert' },
  { key: 'Combine time', label: 'Combine time' },
  { key: 'final linear softmax', label: 'Final linear softmax' }
];

// 与 index.html 风格接近的一组颜色
const STAGE_COLORS = [
  '#4facfe',
  '#00f2fe',
  '#ff00cc',
  '#ffcc00',
  '#ff6b6b',
  '#4ecdc4',
  '#9365ff',
  '#ff9ff3'
];

// 根据场景返回文件路径
function getXlsxPath() {
  const mode = document.getElementById('mode-select').value; // 'decode' or 'prefill'
  if (mode === 'decode') {
    return 'data/final_decode_all.xlsx';
  } else if (mode === 'prefill') {
    return 'data/final_prefill_all.xlsx';
  }
  return null;
}

// 通过 fetch + XLSX 读取整个表
async function loadXlsxData(filePath) {
  const res = await fetch(filePath);
  if (!res.ok) {
    throw new Error('无法加载文件: ' + filePath);
  }
  const arrayBuffer = await res.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const json = XLSX.utils.sheet_to_json(sheet);
  return json;
}

// 根据选择过滤行：模型（可选）+ GPU 型号 + GPU 数量（可选）
function filterRows(rows) {
  const model = document.getElementById('profile-model-select')?.value; // 列名 model
  const gpu = document.getElementById('gpu-select').value; // 列名 GPU
  const gpuNum = document.getElementById('gpu-num-select').value; // 列名 Gpu num

  return rows.filter(row => {
    if (model && String(row['model']).trim() !== String(model).trim()) {
      return false;
    }
    if (gpu && String(row['GPU']).trim() !== String(gpu).trim()) {
      return false;
    }
    if (gpuNum && String(row['Gpu num']).trim() !== String(gpuNum).trim()) {
      return false;
    }
    return true;
  });
}

// 将每一行映射成堆积柱状图的数据
function buildChartData(rows) {
  // 横轴：Config_Name 或 pp-ep-dp-tp
  const labels = rows.map(row => {
    if (row['Config_Name']) {
      return row['Config_Name'];
    }
    const pp = row['pp'];
    const ep = row['ffn ep'];
    const dp = row['attn dp'];
    const tp = row['attn tp'];
    return `pp${pp}-ep${ep}-dp${dp}-tp${tp}`;
  });

  const datasets = STAGE_KEYS.map((stage, idx) => ({
    label: stage.label,
    data: rows.map(row => {
      const v = row[stage.key];
      const num = Number(v);
      return Number.isFinite(num) ? num : 0;
    }),
    backgroundColor: STAGE_COLORS[idx % STAGE_COLORS.length],
    stack: 'time-stack',
    borderWidth: 0
  }));

  return { labels, datasets };
}

function renderStageChart(chartData) {
  const ctx = document.getElementById('stageChart').getContext('2d');

  if (stageChart) {
    stageChart.destroy();
  }

  stageChart = new Chart(ctx, {
    type: 'bar',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#e0e0ff'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(30, 30, 46, 0.9)',
          bodyColor: '#e0e0ff',
          borderColor: 'rgba(100, 200, 255, 0.3)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function (context) {
              const val = context.parsed.y || 0;
              return `${context.dataset.label}: ${val.toFixed(4)}`;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: '#a0a0c0', maxRotation: 60, minRotation: 30 },
          title: {
            display: true,
            text: '',
            color: '#a0a0c0'
          },
          grid: { color: 'rgba(160, 160, 192, 0.1)' }
        },
        y: {
          stacked: true,
          ticks: { color: '#a0a0c0' },
          title: {
            display: true,
            text: 'time (ms)',
            color: '#a0a0c0'
          },
          grid: { color: 'rgba(160, 160, 192, 0.1)' }
        }
      }
    }
  });
}

async function handleLoadClick() {
  const path = getXlsxPath();
  if (!path) {
    alert('请选择场景');
    return;
  }

  try {
    const allRows = await loadXlsxData(path);
    const rows = filterRows(allRows);
    if (!rows.length) {
      alert('there is no data, please adjust GPU / card count.');
      if (stageChart) {
        stageChart.destroy();
        stageChart = null;
      }
      return;
    }

    const chartData = buildChartData(rows);
    renderStageChart(chartData);
  } catch (err) {
    console.error(err);
    alert('Failed to load or parse Excel. Please check if decode_all.xlsx / prefill_all.xlsx exist and have consistent headers.');
  }
}

// 初始化绑定事件
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('load-btn');
  if (btn) {
    btn.addEventListener('click', handleLoadClick);
  }
});
