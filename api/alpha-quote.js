<script>
  async function fetchQuote() {
    const symbol = document.getElementById("ticker").value.trim().toUpperCase() || "PLAY";

    const r = await fetch(`/api/alpha-quote?symbol=${encodeURIComponent(symbol)}`);
    const data = await r.json();

    if (!r.ok) {
      alert(data?.error || JSON.stringify(data));
      return;
    }

    const q = data["Global Quote"];
    if (!q) {
      alert("No quote returned: " + JSON.stringify(data));
      return;
    }

    document.getElementById("price").textContent = `$${Number(q["05. price"]).toFixed(2)}`;
    document.getElementById("change").textContent =
      `${q["09. change"]} (${q["10. change percent"]})`;
    document.getElementById("day").textContent = q["07. latest trading day"];
  }
</script>
