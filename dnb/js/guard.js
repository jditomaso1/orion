(async function () {
  try {
    const r = await fetch("https://api.orion.private-credit.ai/me", {
      credentials: "include"
    });

    if (r.status === 401) {
      window.location.href = "/signin.html";
      return;
    }

    if (r.status === 402) {
      window.location.href = "/pricing.html";
      return;
    }

    if (!r.ok) {
      window.location.href = "/pricing.html";
    }
  } catch (e) {
    // API down or blocked → lock the page
    window.location.href = "/pricing.html";
  }
})();
