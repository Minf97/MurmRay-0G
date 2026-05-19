// 证明页面
export function renderZeroGProofPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Signal Ledger</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #080b10;
      --panel: #10151d;
      --line: #233042;
      --text: #edf2f7;
      --muted: #9aa8ba;
      --accent: #67e8f9;
      --accent-2: #a3e635;
      --warn: #f59e0b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.5 Inter, ui-sans-serif, system-ui, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(103,232,249,.14), transparent 30%),
        radial-gradient(circle at right top, rgba(163,230,53,.10), transparent 24%),
        var(--bg);
    }
    main { max-width: 1240px; margin: 0 auto; padding: 32px 20px 48px; }
    header {
      display: flex; justify-content: space-between; gap: 16px; align-items: end;
      border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 24px;
    }
    h1 { margin: 0; font-size: 28px; letter-spacing: .02em; }
    .sub { color: var(--muted); max-width: 64ch; }
    .status { color: var(--accent); font-family: ui-monospace, SFMono-Regular, monospace; }
    .shell {
      background: rgba(16,21,29,.88);
      border: 1px solid var(--line);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,.32);
    }
    .toolbar {
      display: flex; justify-content: space-between; gap: 12px; align-items: center;
      padding: 14px 16px; border-bottom: 1px solid var(--line);
    }
    button {
      appearance: none; border: 1px solid var(--line); background: #0d1218; color: var(--text);
      border-radius: 10px; padding: 10px 14px; font: inherit; cursor: pointer;
    }
    button:hover { border-color: var(--accent); color: var(--accent); }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      padding: 12px 14px; border-bottom: 1px solid rgba(35,48,66,.8); vertical-align: top;
      text-align: left;
    }
    th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    td code, a {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 12px;
      color: var(--text);
      word-break: break-word;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 8px; border-radius: 999px; background: rgba(103,232,249,.12); color: var(--accent);
    }
    .empty { padding: 24px 16px; color: var(--muted); }
    .grid {
      display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 12px;
    }
    .card {
      padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: rgba(7,11,16,.7);
    }
    .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px; }
    .value { overflow-wrap: anywhere; }
    @media (max-width: 980px) {
      .grid { grid-template-columns: 1fr 1fr; }
      table, thead, tbody, th, td, tr { display: block; }
      thead { display: none; }
      tr { border-bottom: 1px solid rgba(35,48,66,.8); }
      td { border: 0; padding-top: 8px; padding-bottom: 8px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Signal Ledger</h1>
        <p class="sub">MurmRay records each AI market judgment on 0G, then tracks whether it is still active, expired, or resolved.</p>
      </div>
      <div class="status" id="status">Loading…</div>
    </header>
    <div class="grid" id="summary"></div>
    <section class="shell" style="margin-top:16px;">
      <div class="toolbar">
        <strong>Latest signals</strong>
        <button type="button" id="refresh">Refresh</button>
      </div>
      <div id="tableRoot"></div>
    </section>
  </main>
  <script>
	    const statusEl = document.getElementById('status');
	    const summaryEl = document.getElementById('summary');
	    const tableRoot = document.getElementById('tableRoot');
	    const refreshButton = document.getElementById('refresh');
	    const DEFAULT_PROOF_LIST_LIMIT = 5;

    function esc(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));
    }

    function summaryCard(label, value) {
      return '<div class="card"><div class="label">' + esc(label) + '</div><div class="value">' + esc(value) + '</div></div>';
    }

    function renderSummary(proofs) {
      const total = proofs.length;
      const active = proofs.filter((proof) => proof.lifecycleStatus === 'active').length;
      const expired = proofs.filter((proof) => proof.lifecycleStatus === 'expired').length;
      const resolved = proofs.filter((proof) => proof.lifecycleStatus === 'resolved').length;
      summaryEl.innerHTML = [
        summaryCard('Signals', total),
        summaryCard('Active', active),
        summaryCard('Expired', expired),
        summaryCard('Resolved', resolved),
      ].join('');
    }

	    function renderTable(proofs) {
      if (!proofs.length) {
        tableRoot.innerHTML = '<div class="empty">No signals recorded yet.</div>';
        return;
      }

      const rows = proofs.map((proof) => {
        return '<tr>' +
          '<td><span class="badge">' + esc(proof.lifecycleStatus || 'untracked') + '</span><br><code>' + esc(proof.outcomeStatus || 'pending') + '</code></td>' +
          '<td><span>' + esc(proof.marketQuestion) + '</span><br><code>' + esc(proof.direction) + ' · ' + esc(proof.confidence) + '</code><br><span>' + esc(proof.trackRecordNote || '') + '</span></td>' +
          '<td><code>' + esc(proof.signalHash) + '</code><br><code>' + esc(proof.storageUri) + '</code><br><a href="' + esc(proof.storageUri) + '" target="_blank" rel="noreferrer">Storage</a></td>' +
          '<td><code>' + esc(proof.txHash) + '</code><br><code>' + esc(proof.contractAddress) + '</code><br><a href="' + esc(proof.explorerUrl) + '" target="_blank" rel="noreferrer">Explorer</a></td>' +
          '<td><code>' + esc(proof.createdAt) + '</code><br><code>' + esc(proof.marketEndDate || 'no end date') + '</code><br><a href="' + esc(proof.sourceUrl) + '" target="_blank" rel="noreferrer">Source</a></td>' +
        '</tr>';
      }).join('');

	      tableRoot.innerHTML = '<table><thead><tr><th>Status</th><th>Market judgment</th><th>0G Storage</th><th>0G Chain</th><th>Timeline</th></tr></thead><tbody>' + rows + '</tbody></table>';
	    }

	    async function readPayload(response) {
	      const text = await response.text();
	      if (!text) return {};
	      if ((response.headers.get('content-type') || '').includes('application/json')) return JSON.parse(text);
	      return { error: text.slice(0, 500) };
	    }

	    function readErrorMessage(payload) {
	      if (payload && typeof payload === 'object' && payload.error) return String(payload.error);
	      return 'Failed to load proofs.';
	    }

	    function readListLimit() {
	      const value = Number(new URLSearchParams(location.search).get('limit') || DEFAULT_PROOF_LIST_LIMIT);
	      if (!Number.isFinite(value)) return DEFAULT_PROOF_LIST_LIMIT;
	      return Math.min(50, Math.max(1, Math.round(value)));
	    }
	
	    async function loadProofs() {
	      statusEl.textContent = 'Refreshing…';
	      const response = await fetch('/api/0g/proofs?limit=' + readListLimit());
	      const payload = await readPayload(response);
	      if (!response.ok) throw new Error(readErrorMessage(payload));
	      const proofs = Array.isArray(payload.proofs) ? payload.proofs : [];
	      renderSummary(proofs);
      renderTable(proofs);
      statusEl.textContent = 'Ready';
    }

    refreshButton.addEventListener('click', () => {
      loadProofs().catch((error) => {
        statusEl.textContent = error.message;
        tableRoot.innerHTML = '<div class="empty">' + esc(error.message) + '</div>';
      });
    });

    loadProofs().catch((error) => {
      statusEl.textContent = error.message;
      tableRoot.innerHTML = '<div class="empty">' + esc(error.message) + '</div>';
    });
  </script>
</body>
</html>`;
}
