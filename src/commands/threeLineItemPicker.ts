import * as vscode from 'vscode';
import { type ZoteroItemSummary } from '../types';

interface PickerRow {
  itemId: number;
  title: string;
  authors: string;
  meta: string;
  searchText: string;
}

function extractYear(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/(\d{4})/);
  return match?.[1];
}

function buildMeta(item: ZoteroItemSummary): string {
  const publicationYear = item.year || extractYear(item.date) || 'n.d.';
  const addedYear = extractYear(item.dateAdded) || 'unknown';
  const editedYear = extractYear(item.dateModified) || 'unknown';
  const pdfText = item.hasPdf ? `yes (${item.pdfCount})` : 'no';
  return `Published: ${publicationYear} • Added: ${addedYear} • Edited: ${editedYear} • PDF: ${pdfText} • Notes: ${item.noteCount}`;
}

function toRows(items: ZoteroItemSummary[]): PickerRow[] {
  return items.map((item) => {
    const title = item.title || 'Untitled';
    const authors = item.creatorsText || 'Unknown creator';
    const meta = buildMeta(item);
    return {
      itemId: item.itemId,
      title,
      authors,
      meta,
      searchText: `${title} ${authors} ${meta}`.toLowerCase(),
    };
  });
}

function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

function buildHtml(webview: vscode.Webview, rows: PickerRow[], resultCount: number): string {
  const scriptNonce = nonce();
  const data = JSON.stringify(rows).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${scriptNonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Select Zotero items</title>
  <style>
    :root {
      color-scheme: light dark;
      --border: color-mix(in srgb, currentColor 25%, transparent);
      --muted: color-mix(in srgb, currentColor 70%, transparent);
      --muted-2: color-mix(in srgb, currentColor 55%, transparent);
    }
    body {
      margin: 0;
      font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .container {
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      height: 100vh;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--vscode-editor-background) 90%, var(--vscode-panel-background));
    }
    .toolbar input {
      flex: 1;
      min-width: 160px;
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: inherit;
      background: var(--vscode-input-background);
    }
    .toolbar button {
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
    }
    .subhead {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      color: var(--muted);
      display: flex;
      gap: 16px;
    }
    #list {
      overflow: auto;
    }
    .row {
      display: grid;
      grid-template-columns: 24px 1fr;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
    }
    .row:hover {
      background: color-mix(in srgb, var(--vscode-list-hoverBackground) 60%, transparent);
    }
    .lines {
      min-width: 0;
    }
    .line1, .line2, .line3 {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .line1 {
      color: var(--vscode-foreground);
      font-weight: 600;
    }
    .line2 {
      color: var(--muted);
      margin-top: 2px;
    }
    .line3 {
      color: var(--muted-2);
      margin-top: 2px;
      font-size: 12px;
    }
    .footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 10px 12px;
      border-top: 1px solid var(--border);
      background: color-mix(in srgb, var(--vscode-editor-background) 90%, var(--vscode-panel-background));
    }
    .footer button {
      padding: 6px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      cursor: pointer;
      color: inherit;
      background: var(--vscode-button-secondaryBackground);
    }
    .footer button.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: color-mix(in srgb, var(--vscode-button-background) 70%, var(--border));
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="toolbar">
      <input id="filter" type="text" placeholder="Filter title, authors, metadata" />
      <button id="selectAll" type="button">Select All</button>
      <button id="clearAll" type="button">Clear</button>
    </div>
    <div class="subhead">
      <span id="visibleCount">${resultCount} shown</span>
      <span id="selectedCount">0 selected</span>
    </div>
    <div id="list"></div>
    <div class="footer">
      <button id="cancel" type="button">Cancel</button>
      <button id="export" class="primary" type="button">Export Selected</button>
    </div>
  </div>
  <script id="rows-data" type="application/json">${data}</script>
  <script nonce="${scriptNonce}">
    const vscode = acquireVsCodeApi();
    const rows = JSON.parse(document.getElementById('rows-data').textContent || '[]');
    const list = document.getElementById('list');
    const filterInput = document.getElementById('filter');
    const visibleCount = document.getElementById('visibleCount');
    const selectedCount = document.getElementById('selectedCount');
    const selectAllButton = document.getElementById('selectAll');
    const clearAllButton = document.getElementById('clearAll');
    const exportButton = document.getElementById('export');
    const cancelButton = document.getElementById('cancel');

    const checkboxById = new Map();
    const rowElementById = new Map();

    const updateCounts = () => {
      let selected = 0;
      let visible = 0;
      for (const row of rows) {
        const checkbox = checkboxById.get(row.itemId);
        const element = rowElementById.get(row.itemId);
        if (!checkbox || !element) {
          continue;
        }
        if (checkbox.checked) {
          selected += 1;
        }
        if (element.style.display !== 'none') {
          visible += 1;
        }
      }
      selectedCount.textContent = selected + ' selected';
      visibleCount.textContent = visible + ' shown';
    };

    const applyFilter = () => {
      const query = (filterInput.value || '').trim().toLowerCase();
      for (const row of rows) {
        const element = rowElementById.get(row.itemId);
        if (!element) {
          continue;
        }
        const show = query.length === 0 || row.searchText.includes(query);
        element.style.display = show ? 'grid' : 'none';
      }
      updateCounts();
    };

    for (const row of rows) {
      const rowElement = document.createElement('label');
      rowElement.className = 'row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(row.itemId);
      checkbox.addEventListener('change', updateCounts);

      const lines = document.createElement('div');
      lines.className = 'lines';

      const line1 = document.createElement('div');
      line1.className = 'line1';
      line1.textContent = row.title;

      const line2 = document.createElement('div');
      line2.className = 'line2';
      line2.textContent = row.authors;

      const line3 = document.createElement('div');
      line3.className = 'line3';
      line3.textContent = row.meta;

      lines.appendChild(line1);
      lines.appendChild(line2);
      lines.appendChild(line3);
      rowElement.appendChild(checkbox);
      rowElement.appendChild(lines);
      list.appendChild(rowElement);

      checkboxById.set(row.itemId, checkbox);
      rowElementById.set(row.itemId, rowElement);
    }

    filterInput.addEventListener('input', applyFilter);
    selectAllButton.addEventListener('click', () => {
      for (const row of rows) {
        const checkbox = checkboxById.get(row.itemId);
        const element = rowElementById.get(row.itemId);
        if (!checkbox || !element || element.style.display === 'none') {
          continue;
        }
        checkbox.checked = true;
      }
      updateCounts();
    });
    clearAllButton.addEventListener('click', () => {
      for (const row of rows) {
        const checkbox = checkboxById.get(row.itemId);
        if (!checkbox) {
          continue;
        }
        checkbox.checked = false;
      }
      updateCounts();
    });
    exportButton.addEventListener('click', () => {
      const itemIds = [];
      for (const row of rows) {
        const checkbox = checkboxById.get(row.itemId);
        if (checkbox && checkbox.checked) {
          itemIds.push(row.itemId);
        }
      }
      vscode.postMessage({ type: 'export', itemIds });
    });
    cancelButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    updateCounts();
    filterInput.focus();
  </script>
</body>
</html>`;
}

export async function pickItemsWithThreeLineView(
  items: ZoteroItemSummary[],
): Promise<ZoteroItemSummary[] | undefined> {
  const rows = toRows(items);
  const itemsById = new Map(items.map((item) => [item.itemId, item]));

  const panel = vscode.window.createWebviewPanel(
    'zoteroItemPicker',
    `Select Zotero items to export (${items.length})`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
    },
  );

  panel.webview.html = buildHtml(panel.webview, rows, rows.length);

  return new Promise<ZoteroItemSummary[] | undefined>((resolve) => {
    const disposables: vscode.Disposable[] = [];
    let done = false;

    const finish = (value: ZoteroItemSummary[] | undefined): void => {
      if (done) {
        return;
      }
      done = true;
      while (disposables.length > 0) {
        const disposable = disposables.pop();
        disposable?.dispose();
      }
      panel.dispose();
      resolve(value);
    };

    disposables.push(
      panel.onDidDispose(() => {
        finish(undefined);
      }),
    );

    disposables.push(
      panel.webview.onDidReceiveMessage((message: { type?: string; itemIds?: unknown }) => {
        if (message.type === 'cancel') {
          finish(undefined);
          return;
        }

        if (message.type !== 'export') {
          return;
        }

        const ids = Array.isArray(message.itemIds)
          ? message.itemIds.filter((value): value is number => Number.isInteger(value))
          : [];

        const selected = ids
          .map((itemId) => itemsById.get(itemId))
          .filter((item): item is ZoteroItemSummary => item !== undefined);
        finish(selected);
      }),
    );
  });
}
