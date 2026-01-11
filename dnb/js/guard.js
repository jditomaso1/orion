(async function () {
  const PRICING = "/dnb/pricing/pricing.html";

  // Hide page until authorized
  const unlock = () => document.documentElement.classList.remove("auth-pending");

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2500);

    const r = await fetch("https://api.orion.private-credit.ai/me", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal
    });

    clearTimeout(t);

    // If not logged in OR not paid OR anything unexpected -> pricing
    if (r.status === 401) return (window.location.href = PRICING);
    if (r.status === 402) return (window.location.href = PRICING);
    if (!r.ok) return (window.location.href = PRICING);

    // Authorized
    unlock();
  } catch (e) {
    // API down / blocked / timeout -> pricing
    window.location.href = PRICING;
  }
})();
