const MAIN_NAV = [
    { href: "index.html", label: "Overview" },
    { href: "leaderboard.html", label: "Hardware Ranking" },
    { href: "tco.html", label: "TCO" },
    { href: "author.html", label: "Author" },
];

export const PAGE_CONTEXT = {
    overview: {
        eyebrow: "Cost Model Overview",
        title: "Paper-to-web analysis map",
        summary: "Start from model inputs, hardware knobs, operator costs, communication terms, memory limits, and scenario switches before exploring measured strategy data.",
        sections: [
            "Input Parameters and Modeled Objects",
            "Hardware Abstraction Layer",
            "Prefill, Decode, MTP, and PD Scenario Analysis",
            "Output Metrics and Visualization",
        ],
        questions: [
            "Which model, sequence, batch, and parallel dimensions define the sweep?",
            "How do GPU family, card count, Attention TP, FFN TP, PP, and batch change TPS?",
            "Which charts should be treated as search output versus architectural explanation?",
        ],
        metrics: ["TPS/user", "aggregate throughput", "TPS/GPU", "batch-size feasibility"],
        related: ["search-pareto", "hardware-ranking"],
    },
    "search-pareto": {
        eyebrow: "Parallel Strategy Search",
        title: "Search space and Pareto frontier",
        summary: "Compare valid strategy points after feasibility filtering and inspect how frontier points trade user TPS against total throughput.",
        sections: [
            "Parallel Strategy Search",
            "Prefill, Decode, MTP, and PD Scenario Analysis",
            "Output Metrics and Visualization",
        ],
        questions: [
            "Which candidate strategy is dominated under a fixed GPU budget?",
            "Where do Attention TP, FFN TP, PP, batch, and MTP stage changes appear on the frontier?",
            "Which frontier points favor latency-oriented service versus throughput-oriented batch serving?",
        ],
        metrics: ["Pareto frontier count", "TPS/user", "total throughput", "bottleneck stage"],
        related: ["overview", "memory-tco", "hardware-ranking"],
    },
    "memory-tco": {
        eyebrow: "Capacity and Cost",
        title: "Memory, batch, and TCO constraints",
        summary: "Tie HBM feasibility, KV-cache budget, batch constraints, price assumptions, and per-token economics into one planning surface.",
        sections: [
            "Memory Capacity and Batch Constraints",
            "Output Metrics and Visualization",
            "Model Limitations and Applicability Boundaries",
        ],
        questions: [
            "Which configurations fit weights, KV cache, activation buffers, and runtime overheads into HBM?",
            "How does input/output sequence length change the feasible batch envelope?",
            "Which valid strategy minimizes per-token cost under the chosen GPU price?",
        ],
        metrics: ["HBM headroom", "max feasible batch", "per-1M-token price", "3-year TCO"],
        formulas: ["M_total = M_weights + M_kv + M_act + M_runtime", "Cost/token = GPU_hour_price * GPU_count / tokens_per_hour"],
        related: ["overview", "search-pareto", "hardware-ranking"],
    },
    "hardware-ranking": {
        eyebrow: "Hardware Abstraction Layer",
        title: "Hardware ranking and ROI comparison",
        summary: "Use normalized hardware records and price inputs to compare throughput-per-dollar and ROI across vendors and GPU generations.",
        sections: [
            "Hardware Abstraction Layer",
            "Parallel Strategy Search",
            "Output Metrics and Visualization",
        ],
        questions: [
            "Which GPU family wins after price, topology, and feasible strategy constraints are applied?",
            "How sensitive is the ranking to prefill versus decode mode?",
            "Which configuration should be inspected in the overview strategy panel before committing?",
        ],
        metrics: ["TPS/$", "ROI", "card count", "best valid strategy"],
        related: ["overview", "search-pareto", "memory-tco"],
    },
    author: {
        eyebrow: "Author",
        title: "Dashboard ownership and modeling focus",
        summary: "Track the dashboard author's focus areas, experience background, and the modeling surfaces maintained in this web report.",
        sections: [
            "Input Parameters and Modeled Objects",
            "Hardware Abstraction Layer",
            "Parallel Strategy Search",
            "Model Limitations and Applicability Boundaries",
        ],
        questions: [
            "Who maintains the dashboard assumptions and analysis flow?",
            "Which architecture and performance-modeling areas does the dashboard emphasize?",
            "Where should readers start before interpreting the author-maintained dashboard views?",
        ],
        metrics: ["architecture", "performance modeling", "strategy analysis", "dashboard ownership"],
        related: ["overview", "search-pareto", "hardware-ranking"],
    },
};

const CONTEXT_BY_PATH = {
    "index.html": "overview",
    "pareto.html": "search-pareto",
    "tco.html": "memory-tco",
    "leaderboard.html": "hardware-ranking",
    "author.html": "author",
};

function currentPageName() {
    const path = window.location.pathname.split("/").pop();
    return path || "index.html";
}

function createTextElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    element.textContent = text;
    return element;
}

function createList(items, className) {
    const list = document.createElement("ul");
    list.className = className;
    items.forEach((item) => {
        const row = document.createElement("li");
        row.textContent = item;
        list.appendChild(row);
    });
    return list;
}

function createChipRail(items, className = "paper-context-chips") {
    const rail = document.createElement("div");
    rail.className = className;
    items.forEach((item) => {
        rail.appendChild(createTextElement("span", "paper-context-chip", item));
    });
    return rail;
}

function renderContextBlock(target, contextId) {
    const context = PAGE_CONTEXT[contextId];
    if (!context) {
        return;
    }

    target.replaceChildren();
    target.classList.add("paper-context");

    const head = document.createElement("div");
    head.className = "paper-context-head";
    const copy = document.createElement("div");
    copy.appendChild(createTextElement("p", "eyebrow", context.eyebrow));
    copy.appendChild(createTextElement("h2", "", context.title));
    copy.appendChild(createTextElement("p", "paper-context-summary", context.summary));
    head.appendChild(copy);
    if (context.metrics?.length) {
        head.appendChild(createChipRail(context.metrics, "paper-context-metrics"));
    }

    const grid = document.createElement("div");
    grid.className = "paper-context-grid";

    const sections = document.createElement("article");
    sections.className = "paper-domain-card";
    sections.appendChild(createTextElement("h3", "", "Paper sections covered"));
    sections.appendChild(createChipRail(context.sections));
    grid.appendChild(sections);

    const questions = document.createElement("article");
    questions.className = "paper-domain-card";
    questions.appendChild(createTextElement("h3", "", "Questions this page answers"));
    questions.appendChild(createList(context.questions, "paper-context-list"));
    grid.appendChild(questions);

    if (context.formulas?.length) {
        const formulas = document.createElement("article");
        formulas.className = "paper-domain-card";
        formulas.appendChild(createTextElement("h3", "", "Active formulas"));
        formulas.appendChild(createList(context.formulas, "paper-context-list mono-list"));
        grid.appendChild(formulas);
    }

    const related = document.createElement("article");
    related.className = "paper-domain-card";
    related.appendChild(createTextElement("h3", "", "Related analysis pages"));
    const links = document.createElement("div");
    links.className = "paper-context-links";
    context.related.forEach((relatedId) => {
        const item = Object.entries(CONTEXT_BY_PATH).find(([, id]) => id === relatedId);
        if (!item) {
            return;
        }
        const [href] = item;
        const link = document.createElement("a");
        link.href = href;
        link.textContent = PAGE_CONTEXT[relatedId].eyebrow;
        links.appendChild(link);
    });
    related.appendChild(links);
    grid.appendChild(related);

    target.appendChild(head);
    target.appendChild(grid);
}

function updateNavigation() {
    const pageName = currentPageName();
    document.querySelectorAll(".nav-link").forEach((link) => {
        const href = link.getAttribute("href");
        const nav = MAIN_NAV.find((item) => item.href === href);
        if (!nav) {
            return;
        }
        if (!link.hasAttribute("data-lang")) {
            link.textContent = nav.label;
        }
        link.classList.toggle("active", href === pageName);
    });
}

function initSiteContext() {
    updateNavigation();
    document.querySelectorAll("[data-site-context]").forEach((target) => {
        const contextId = target.getAttribute("data-site-context") || CONTEXT_BY_PATH[currentPageName()];
        renderContextBlock(target, contextId);
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSiteContext);
} else {
    initSiteContext();
}
