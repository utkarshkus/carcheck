const STATUS = {
  complete: { label: "Full manual coverage", cls: "st-complete" },
  partial:  { label: "Partial coverage",     cls: "st-partial" },
  stub:     { label: "Content not started",  cls: "st-stub" }
};

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let cars = [];

function render(filter = "") {
  const q = filter.trim().toLowerCase();
  const list = cars.filter(c => !q || `${c.make} ${c.model} ${c.blurb || ""}`.toLowerCase().includes(q));
  const grid = document.getElementById("grid");

  if (!list.length) {
    grid.innerHTML = `<p class="empty">No car matches that. The library is small on purpose: each car is only added once its manual has actually been read.</p>`;
  } else {
    grid.innerHTML = list.map(c => {
      const st = STATUS[c.status] || STATUS.stub;
      const count = c.status === "stub" ? "No checks yet" : `${c.issueCount} guided checks`;
      return `<a class="card" href="/c/${esc(c.id)}">
        <div class="make">${esc(c.make)}</div>
        <h2>${esc(c.model)}</h2>
        <p>${esc(c.blurb || "")} ${esc(c.years || "")}</p>
        <div class="foot"><span class="tag ${st.cls}"><i></i>${st.label}</span><span>${count}</span></div>
      </a>`;
    }).join("");
  }
  document.getElementById("count").textContent =
    `${cars.length} cars in the library. Adding one takes a sourced manual, not a scrape.`;
}

async function init() {
  try {
    const res = await fetch("/data/cars.json");
    if (!res.ok) throw new Error(res.status);
    cars = (await res.json()).cars || [];
  } catch (e) {
    document.getElementById("grid").innerHTML =
      `<p class="empty">The car list did not load. Reload the page, and if it keeps failing the site data is missing.</p>`;
    return;
  }
  render();
  document.getElementById("q").addEventListener("input", e => render(e.target.value));
}

init();
