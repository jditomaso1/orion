(async function loadCapitalMarketsOrionChat() {
  if (window.__capitalMarketsOrionChatLoading) return;
  window.__capitalMarketsOrionChatLoading = true;

  try {
    const response = await fetch("/capmarkets/includes/orion-chat.html", {
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`Ask Orion include returned ${response.status}`);

    const host = document.createElement("div");
    host.id = "capital-markets-orion-chat";
    host.innerHTML = await response.text();
    document.body.appendChild(host);

    host.querySelectorAll("script").forEach((oldScript) => {
      const script = document.createElement("script");
      for (const attribute of oldScript.attributes) {
        script.setAttribute(attribute.name, attribute.value);
      }
      script.textContent = oldScript.textContent;
      document.body.appendChild(script);
      oldScript.remove();
    });
  } catch (error) {
    window.__capitalMarketsOrionChatLoading = false;
    console.error("Ask Orion is unavailable", error);
  }
})();
