import { PlugConnection } from './device.js?v=0.2.0';

const $ = id => document.getElementById(id);
const connection = new PlugConnection(navigator.bluetooth);
const colors = ['Green', 'Orange', 'Red', 'Blue', 'Cyan', 'Pink', 'Lilac'];
const blocks = {
  1: ['Compressor', 'Comp', 'M5 5v14M19 5v14M8 9h8M8 15h8M12 6v12'],
  2: ['Drive', 'Drive', 'M3 15l6-8v10l6-10v10l6-8'],
  3: ['NAM', 'NAM', 'M5 19V5h3l8 14h3V5M8 5v14M16 5v14'],
  4: ['Equalizer', 'EQ', 'M5 4v16M12 4v16M19 4v16M2 8h6M9 16h6M16 10h6'],
  5: ['Noise gate', 'Gate', 'M3 12h5l2-7h4l2 7h5M8 19h8'],
  6: ['Modulation', 'Mod', 'M2 12c4-14 6 14 10 0s6 14 10 0'],
  7: ['Delay', 'Delay', 'M4 4v16M10 7v10M16 9v6M22 11v2'],
  8: ['Reverb', 'Reverb', 'M3 9l3 6 3-6 3 6 3-6 3 6 3-6M3 4h18M3 20h18'],
  9: ['Cabinet', 'Cab', 'M5 3h14v18H5zM15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0M15 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0']
};
let snapshot = null, selected = 3, busy = false, operation = 0;

function message(text, error = false) {
  $('message').textContent = text; $('message').classList.toggle('error', error);
  if (error && connection.log.length) $('connection-details').open = true;
}
function diagnostics() {
  $('connection-details').hidden = !connection.log.length;
  $('diagnostics-text').value = connection.report();
}
function render() {
  const online = Boolean(snapshot && connection.connected);
  $('connection-state').textContent = busy ? connection.connected ? 'Reading…' : 'Connecting…' : online ? 'Connected' : connection.connected ? 'Linked' : 'Offline';
  $('connection-state').classList.toggle('online', connection.connected);
  $('connect').textContent = busy ? 'Cancel' : connection.connected ? 'Disconnect' : 'Connect';
  $('connect').disabled = !navigator.bluetooth?.requestDevice;
  $('refresh').disabled = !connection.connected || busy || connection.writeStalled;
  $('presets').replaceChildren(...colors.map((color, index) => {
    const item = document.createElement('li');
    const occupied = online && (snapshot.occupied & (1 << index));
    const active = online && snapshot.active === index;
    item.className = `preset ${color.toLowerCase()}${occupied ? ' occupied' : ''}${active ? ' active' : ''}`;
    item.setAttribute('aria-label', `${index + 1}. ${color}${online ? occupied ? ', saved' : ', empty' : ''}${active ? ', active' : ''}`);
    if (active) item.setAttribute('aria-current', 'true');
    const dot = document.createElement('span'); dot.className = 'swatch'; dot.setAttribute('aria-hidden', 'true');
    const number = document.createElement('span'); number.textContent = index + 1;
    item.append(dot, number); return item;
  }));
  $('active-preset').textContent = online ? colors[snapshot.active] ?? 'Unsaved' : '—';
  $('empty-chain').hidden = online; $('chain').hidden = !online;
  $('chain-hint').textContent = online ? 'Select a block to inspect' : connection.connected ? 'Waiting for reply' : 'Waiting for connection';
  $('chain').replaceChildren();
  if (online) for (const id of snapshot.order) {
    const [name, short, path] = blocks[id]; const bypassed = Boolean(snapshot.effects[id] & 64);
    const button = document.createElement('button'); button.className = `block${bypassed ? ' bypassed' : ''}`;
    button.setAttribute('aria-label', `${name}, ${bypassed ? 'bypassed' : 'enabled'}`);
    button.setAttribute('aria-pressed', String(selected === id));
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path'); line.setAttribute('d', path); icon.append(line);
    const label = document.createElement('span'); label.textContent = short;
    const state = document.createElement('small'); state.textContent = bypassed ? 'Bypassed' : 'On';
    button.append(icon, label, state); button.addEventListener('click', () => selectBlock(id)); $('chain').append(button);
  }
  detail(online);
  $('buffer').textContent = online ? `${snapshot.buffer} samples` : '—';
  $('output').textContent = online ? snapshot.settling ? 'Settling' : snapshot.listening ? 'On' : 'Muted' : '—';
  $('model').textContent = online ? snapshot.loaded ? 'Loaded' : 'Empty' : '—';
  $('health').textContent = online ? snapshot.faults ? 'Fault reported' : 'Ready' : '—';
  $('version').textContent = online ? `0.2.0 · ${snapshot.identity}` : 'Connection preview · 0.2.0';
  diagnostics();
}
function detail(online) {
  $('block-name').textContent = online ? blocks[selected][0] : 'No block selected';
  $('block-state').textContent = online ? snapshot.effects[selected] & 64 ? 'Bypassed' : 'Enabled' : '—';
  $('block-info').textContent = !online ? 'Your chain will appear here.' : selected === 3
    ? snapshot.loaded ? 'Capture loaded on the plug.' : 'No capture loaded.' : 'Current state on the plug.';
}
function selectBlock(id) {
  selected = id;
  for (const [index, button] of [...$('chain').children].entries()) button.setAttribute('aria-pressed', String(snapshot.order[index] === id));
  detail(true);
}
function clear() { operation++; busy = false; snapshot = null; connection.close(); render(); }
$('connect').addEventListener('click', async () => {
  if (busy || connection.connected) { clear(); message('Disconnected.'); return; }
  const ticket = ++operation; busy = true; render(); message('Choose your Mighty Plug Pro.');
  try {
    const result = await connection.connect(); if (ticket !== operation) return;
    snapshot = result; message('Status received. No settings changed.');
  } catch (error) {
    if (ticket !== operation) return;
    snapshot = null; message(error.name === 'NotFoundError' ? 'No plug selected.' : error.message, error.name !== 'NotFoundError');
  } finally { if (ticket === operation) { busy = false; render(); } }
});
$('refresh').addEventListener('click', async () => {
  const ticket = ++operation; busy = true; render(); message('Reading the plug…');
  try { const result = await connection.refresh(); if (ticket !== operation) return; snapshot = result; message('Status updated.'); }
  catch (error) { if (ticket !== operation) return; snapshot = null; message(error.message, true); }
  finally { if (ticket === operation) { busy = false; render(); } }
});
connection.addEventListener('diagnostic', diagnostics);
connection.addEventListener('progress', () => {
  if (busy) {
    message(`${connection.stage}…`);
    $('connection-state').textContent = connection.connected ? 'Reading…' : 'Connecting…';
  }
});
connection.addEventListener('disconnected', event => {
  operation++; snapshot = null; busy = false; render();
  message(event.detail.stage === 'Ready' ? 'Plug disconnected.' : `Bluetooth disconnected during: ${event.detail.stage}.`, true);
});
$('copy-report').addEventListener('click', async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(connection.report()); $('copy-status').textContent = 'Report copied.';
  } catch {
    const field = $('diagnostics-text'); field.focus(); field.select(); field.setSelectionRange(0, field.value.length);
    $('copy-status').textContent = 'Select and copy the report below.';
  }
});
window.addEventListener('pagehide', clear);
$('browser-help').hidden = Boolean(navigator.bluetooth?.requestDevice);
render();
