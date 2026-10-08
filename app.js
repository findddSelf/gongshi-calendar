(() => {
  'use strict';
  const RATE = 10;
  const STORAGE_KEY = 'gongshi-calendar-records-v1';
  const $ = (id) => document.getElementById(id);
  const monthTitle = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' });
  const fullDate = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const currency = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
  const today = new Date();
  let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let records = readRecords();
  let activeDate = null;
  let selectedHours = 0;
  let previousFocus = null;
  let toastTimer;
  let installPrompt = null;

  function keyFor(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function readRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter(([date, hours]) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(hours) && hours > 0 && hours <= 24 && Number.isInteger(hours * 2)
      ));
    } catch {
      setSaveError('读取本机记录失败，请检查浏览器存储设置。');
      return {};
    }
  }

  function setSaving() {
    const indicator = $('saved-indicator');
    indicator.classList.remove('is-error');
    indicator.classList.add('is-saving');
    indicator.innerHTML = '<span class="saved-dot"></span>正在保存';
  }

  function setSaved() {
    const indicator = $('saved-indicator');
    indicator.classList.remove('is-saving', 'is-error');
    indicator.innerHTML = '<span class="saved-dot"></span>已保存在本机';
    $('save-note').textContent = '每次调整都会自动保存';
    $('save-note').classList.remove('error');
  }

  function setSaveError(message) {
    const indicator = $('saved-indicator');
    indicator.classList.remove('is-saving');
    indicator.classList.add('is-error');
    indicator.innerHTML = '<span class="saved-dot"></span>保存失败';
    const note = $('save-note');
    if (note) {
      note.textContent = message;
      note.classList.add('error');
    }
  }

  function persist() {
    setSaving();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      setSaved();
      return true;
    } catch {
      setSaveError('浏览器无法保存，请检查手机可用空间或存储设置。');
      return false;
    }
  }

  function displayHours(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function renderSummary() {
    const prefix = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, '0')}-`;
    const values = Object.entries(records).filter(([date]) => date.startsWith(prefix)).map(([, hours]) => hours);
    const total = values.reduce((sum, hours) => sum + hours, 0);
    $('summary-month').textContent = `${visibleMonth.getMonth() + 1} 月汇总`;
    $('total-hours').textContent = displayHours(total);
    $('total-pay').textContent = currency.format(total * RATE);
    $('days-count').textContent = String(values.length);
  }

  function renderCalendar() {
    $('calendar-heading').textContent = monthTitle.format(visibleMonth);
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
    const grid = $('calendar-grid');
    grid.replaceChildren();

    for (let index = 0; index < 42; index += 1) {
      const day = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      const key = keyFor(day);
      const inMonth = day.getMonth() === visibleMonth.getMonth();
      const isToday = key === keyFor(today);
      const hasHours = Object.hasOwn(records, key);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'day-cell';
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-label', `${fullDate.format(day)}${hasHours ? `，${displayHours(records[key])} 小时` : '，未记录工时'}`);
      button.dataset.date = key;
      if (!inMonth) button.classList.add('other-month');
      if (day.getDay() === 0 || day.getDay() === 6) button.classList.add('weekend');
      if (isToday) button.classList.add('today');
      if (hasHours) button.classList.add('has-hours');
      if (activeDate === key) button.classList.add('selected');
      const number = document.createElement('span');
      number.className = 'day-number';
      number.textContent = String(day.getDate());
      button.append(number);
      if (hasHours) {
        const hours = document.createElement('span');
        hours.className = 'day-hours';
        hours.textContent = `${displayHours(records[key])}h`;
        button.append(hours);
      }
      button.addEventListener('click', () => {
        if (!inMonth) {
          visibleMonth = new Date(day.getFullYear(), day.getMonth(), 1);
          render();
        }
        openSheet(key);
      });
      grid.append(button);
    }
  }

  function render() {
    renderSummary();
    renderCalendar();
  }

  function updatePicker() {
    $('selected-hours').textContent = displayHours(selectedHours);
    $('decrease-hours').disabled = selectedHours <= 0;
    $('increase-hours').disabled = selectedHours >= 24;
    document.querySelectorAll('#quick-hours button').forEach((button) => {
      const selected = Number(button.dataset.hours) === selectedHours;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function openSheet(key) {
    activeDate = key;
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    selectedHours = records[key] || 0;
    previousFocus = document.activeElement;
    $('sheet-title').textContent = fullDate.format(date);
    $('save-note').textContent = '每次调整都会自动保存';
    $('save-note').classList.remove('error');
    $('hours-sheet').hidden = false;
    $('sheet-backdrop').hidden = false;
    document.body.classList.add('sheet-open');
    updatePicker();
    $('close-sheet').focus();
  }

  function closeSheet() {
    $('hours-sheet').hidden = true;
    $('sheet-backdrop').hidden = true;
    document.body.classList.remove('sheet-open');
    activeDate = null;
    renderCalendar();
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }

  function changeHours(value) {
    if (!activeDate) return;
    const next = Math.max(0, Math.min(24, Math.round(value * 2) / 2));
    if (next === selectedHours) return;
    const oldValue = records[activeDate];
    selectedHours = next;
    if (selectedHours === 0) delete records[activeDate];
    else records[activeDate] = selectedHours;

    const saved = persist();
    if (!saved) {
      if (oldValue === undefined) delete records[activeDate];
      else records[activeDate] = oldValue;
      selectedHours = oldValue || 0;
    }
    updatePicker();
    render();
  }

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  $('prev-month').addEventListener('click', () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    render();
  });
  $('next-month').addEventListener('click', () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    render();
  });
  $('today-month').addEventListener('click', () => {
    visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    render();
    document.querySelector(`[data-date="${keyFor(today)}"]`)?.focus();
  });
  $('decrease-hours').addEventListener('click', () => changeHours(selectedHours - 0.5));
  $('increase-hours').addEventListener('click', () => changeHours(selectedHours + 0.5));
  $('quick-hours').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-hours]');
    if (button) changeHours(Number(button.dataset.hours));
  });
  $('close-sheet').addEventListener('click', closeSheet);
  $('done-button').addEventListener('click', closeSheet);
  $('sheet-backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('hours-sheet').hidden) closeSheet();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    $('install-button').hidden = false;
  });
  $('install-button').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $('install-button').hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    $('install-button').hidden = true;
    showToast('工时日历已添加到主屏幕');
  });

  render();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();

