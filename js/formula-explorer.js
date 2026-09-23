"use strict";
// Static cards remain readable without JavaScript and when opened via file://.
(() => {
  const search = document.getElementById("formula-search");
  const category = document.getElementById("formula-category");
  const cards = Array.from(document.querySelectorAll(".formula-card"));
  if (!search || !category) return;
  const update = () => {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const card of cards) {
      const matches = (!category.value || card.dataset.category === category.value) &&
        (!query || card.textContent.toLocaleLowerCase().includes(query));
      card.hidden = !matches;
      if (matches) visible++;
    }
    document.getElementById("formula-count").textContent = `${visible} / ${cards.length} 条公式`;
    document.getElementById("formula-empty").hidden = visible > 0;
  };
  search.addEventListener("input", update);
  category.addEventListener("change", update);
  update();
})();
