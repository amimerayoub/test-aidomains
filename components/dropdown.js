// components/dropdown.js — Custom select dropdown logic
export function initCustomSelects() {
  document.querySelectorAll('.custom-select').forEach(sel => {
    const trigger = sel.querySelector('.custom-select-trigger');
    if (!trigger) return;

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const wasOpen = sel.classList.contains('open');
      document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
      if (!wasOpen) sel.classList.add('open');
    });

    sel.querySelectorAll('.select-option').forEach(opt => {
      opt.addEventListener('click', () => {
        sel.querySelectorAll('.select-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        const txt = sel.querySelector('.selected-text');
        if (txt) txt.textContent = opt.textContent;
        sel.classList.remove('open');
        sel.dataset.value = opt.dataset.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
  });
}

export function getSelectValue(id) {
  const sel = document.getElementById(id);
  if (!sel) return '';
  const active = sel.querySelector('.select-option.active');
  return active ? active.dataset.value : '';
}

export function setSelectValue(id, value) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.querySelectorAll('.select-option').forEach(o => {
    const isActive = o.dataset.value === value;
    o.classList.toggle('active', isActive);
  });
  const txt = sel.querySelector('.selected-text');
  if (txt) {
    const active = sel.querySelector('.select-option.active');
    if (active) txt.textContent = active.textContent;
  }
  sel.dataset.value = value;
}
