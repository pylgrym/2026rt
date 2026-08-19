// Enhances source-file links (a.ts-source): clicking shows the file's text
// inline on the page in a viewer panel, while still downloading the file.

document.querySelectorAll("a.ts-source").forEach((link) => {
  link.addEventListener("click", async (event) => {
    event.preventDefault();

    const href = link.getAttribute("href");
    const name = href.split("/").pop();

    // Fetch the raw source text.
    let text;
    try {
      const res = await fetch(link.href);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      text = await res.text();
    } catch (err) {
      showSource(name, `Failed to load ${href}:\n${err.message}`);
      return;
    }

    // View it as text on the page...
    showSource(name, text);

    // ...but still download the original file.
    triggerDownload(link.href, name);
  });
});

/** Programmatically downloads href, saving it as fileName. */
function triggerDownload(href, fileName) {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Shows text in an on-page viewer panel, creating it on first use. */
function showSource(title, text) {
  let viewer = document.getElementById("source-viewer");

  if (!viewer) {
    viewer = document.createElement("section");
    viewer.id = "source-viewer";

    const header = document.createElement("header");
    const label = document.createElement("span");
    label.className = "sv-title";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "sv-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => viewer.remove());
    header.append(label, close);

    const pre = document.createElement("pre");
    pre.append(document.createElement("code"));

    viewer.append(header, pre);
    document.querySelector("main").append(viewer);
  }

  viewer.querySelector(".sv-title").textContent = title;
  viewer.querySelector("code").textContent = text;
  viewer.scrollIntoView({ behavior: "smooth", block: "start" });
}
