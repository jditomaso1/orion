(function () {
  const API_BASE = "https://api.private-credit.ai";
  const current = window.location.pathname + window.location.search;
  const signin = `/capmarkets/signin/signin.html?next=${encodeURIComponent(current)}`;
  document.documentElement.style.visibility = "hidden";

  fetch(`${API_BASE}/access/check?area=capmarkets`, {
    credentials: "include",
    cache: "no-store"
  }).then(async response => {
    if (response.ok) {
      document.documentElement.style.visibility = "visible";
      return;
    }
    if (response.status === 401) {
      window.location.replace(signin);
      return;
    }
    if (response.status === 403) {
      let state = "pending";
      try {
        const payload = await response.json();
        state = payload?.detail?.state || state;
      } catch (error) {}
      window.location.replace(`${signin}&state=${encodeURIComponent(state)}`);
      return;
    }
    throw new Error(`Access check failed (${response.status})`);
  }).catch(() => {
    const showUnavailable = () => {
      document.body.innerHTML = `<main style="font-family:Poppins,sans-serif;max-width:560px;margin:12vh auto;padding:28px"><h1>Orion is temporarily unavailable</h1><p>The authorization service may be waking up. Please refresh this page in a minute.</p><button onclick="location.reload()" style="padding:10px 16px">Try again</button></main>`;
      document.documentElement.style.visibility = "visible";
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showUnavailable, { once: true });
    } else {
      showUnavailable();
    }
  });
})();
