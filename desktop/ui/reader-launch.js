document.getElementById('open-reader').addEventListener('click', async event => {
  if (!window.__TAURI__?.core) return;
  event.preventDefault();
  try { await window.__TAURI__.core.invoke('desktop_open_reader'); }
  catch (error) { alert(`Không mở được Reader: ${error}`); }
});
