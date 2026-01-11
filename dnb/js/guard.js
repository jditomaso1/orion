(async function () {
  const PRICING = "/dnb/pricing/pricing.html";
  const SIGNIN  = "/dnb/signin/signin.html";
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  const API_BASE = "https://orion.private-credit.ai";

  const unlock = () => document.documentElement.classList.remove("auth-pending");

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2500);

    const r = await fetch(`${API_BASE}/me`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal
    });

    clearTimeout(t);

    if (r.status === 401) return (window.location.href = `${SIGNIN}?next=${next}`);
    if (r.status === 402) return (window.location.href = PRICING);
    if (!r.ok) return (window.location.href = PRICING);

    unlock();
  } catch (e) {
    window.location.href = PRICING;
  }
})();
