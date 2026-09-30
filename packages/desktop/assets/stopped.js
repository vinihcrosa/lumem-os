const button = document.getElementById("start");
const hint = document.getElementById("hint");

async function start() {
  button.disabled = true;
  hint.textContent = "Iniciando…";
  // Quando dá certo o app recarrega esta janela com o Lumem de verdade.
  const started = await window.lumemDesktop.start();
  if (started) return;
  hint.textContent = "Não consegui iniciar. `lumem logs` mostra o que houve.";
  button.disabled = false;
}

button.addEventListener("click", () => void start());
