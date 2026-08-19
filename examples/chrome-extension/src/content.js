// content.js — page-side highlighter. Marks TODO / FIXME / HACK with a yellow box.
(function () {
  const REGEX = /\b(TODO|FIXME|HACK)\b/g;
  function highlight(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const targets = [];
    let n;
    while ((n = walker.nextNode())) {
      if (REGEX.test(n.nodeValue)) {
        REGEX.lastIndex = 0;
        targets.push(n);
      }
    }
    for (const t of targets) {
      const html = t.nodeValue.replace(REGEX, (m) => '<mark style="background:#ffe066;padding:0 2px;border-radius:2px">' + m + "</mark>");
      const wrap = document.createElement("span");
      wrap.innerHTML = html;
      t.parentNode.replaceChild(wrap, t);
    }
  }
  if (document.body) highlight(document.body);
  else document.addEventListener("DOMContentLoaded", () => highlight(document.body));
})();
