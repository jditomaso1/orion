(async function () {
  const unlock = () => document.documentElement.classList.remove("auth-pending");

  try {
    // Fail fast if API is down/hanging
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2500);

    const r = await fetch("https://api.orion.private-credit.ai/me", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal
    });

    clearTimeout(t);

    if (r.status === 401) return (window.location.href = "/signin.html");
    if (r.status === 402) return (window.location.href = "/pricing.html");
    if (!r.ok) return (window.location.href = "/pricing.html");

    // Authorized
    unlock();
  } catch (e) {
    // API down / blocked / timeout → lock it
    window.location.href = "/pricing.html";
  }
})();
