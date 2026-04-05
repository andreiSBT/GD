/** Custom dialog utilities — replaces browser prompt/confirm with styled overlays */

export function customPrompt(title, defaultValue = '') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('custom-prompt-overlay');
    const input = document.getElementById('cp-input');
    const okBtn = document.getElementById('cp-ok');
    const cancelBtn = document.getElementById('cp-cancel');
    const titleEl = document.getElementById('cp-title');

    titleEl.textContent = title;
    input.value = defaultValue;
    overlay.style.display = 'flex';
    setTimeout(() => input.focus(), 50);

    const cleanup = () => {
      overlay.style.display = 'none';
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      input.onkeydown = null;
    };

    okBtn.onclick = () => { cleanup(); resolve(input.value); };
    cancelBtn.onclick = () => { cleanup(); resolve(null); };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') { cleanup(); resolve(input.value); }
      if (e.key === 'Escape') { cleanup(); resolve(null); }
      e.stopPropagation();
    };
    // Stop all keyboard events from reaching the game/editor
    overlay.onkeydown = (e) => e.stopPropagation();
  });
}

export function customConfirm(title, message, yesLabel = 'YES', noLabel = 'CANCEL') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('custom-confirm-overlay');
    const titleEl = document.getElementById('cc-title');
    const msgEl = document.getElementById('cc-message');
    const yesBtn = document.getElementById('cc-yes');
    const noBtn = document.getElementById('cc-no');

    titleEl.textContent = title;
    msgEl.textContent = message;
    yesBtn.textContent = yesLabel;
    noBtn.textContent = noLabel;
    overlay.style.display = 'flex';

    const cleanup = () => {
      overlay.style.display = 'none';
      yesBtn.onclick = null;
      noBtn.onclick = null;
    };

    yesBtn.onclick = () => { cleanup(); resolve(true); };
    noBtn.onclick = () => { cleanup(); resolve(false); };
    overlay.onkeydown = (e) => e.stopPropagation();
  });
}

export function showMusicPicker(hasMusic, onChoose, onRemove) {
  const overlay = document.getElementById('music-picker-overlay');
  const chooseBtn = document.getElementById('mp-choose');
  const removeBtn = document.getElementById('mp-remove');
  const closeBtn = document.getElementById('mp-close');
  const filenameEl = document.getElementById('mp-filename');

  filenameEl.textContent = hasMusic ? 'Current music loaded' : '';
  removeBtn.style.display = hasMusic ? 'block' : 'none';
  overlay.style.display = 'flex';

  const cleanup = () => {
    overlay.style.display = 'none';
    chooseBtn.onclick = null;
    removeBtn.onclick = null;
    closeBtn.onclick = null;
  };

  chooseBtn.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = () => {
      const file = input.files[0];
      if (file) {
        filenameEl.textContent = file.name;
        onChoose(file);
        cleanup();
      }
    };
    input.click();
  };

  removeBtn.onclick = () => {
    if (onRemove) onRemove();
    cleanup();
  };

  closeBtn.onclick = cleanup;
  overlay.onkeydown = (e) => e.stopPropagation();
}
