import { FRAMEWORKS } from '../frameworks/index.js';

function loadFramework() {
  const fwId = document.getElementById('framework').value;
  const framework = FRAMEWORKS[fwId];
  if (!framework) {
    console.error('Framework not found:', fwId);
    return;
  }

  // Render inputs
  renderFields(framework.fields);

  // Hook up scoring function
  document.getElementById('runScore').onclick = async () => {
    const inputs = collectInputs(framework.fields);
    const result = await framework.score(inputs);
    renderResults(result);
  };
}
