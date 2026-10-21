import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { CLIENT } from '../src/web/client.ts';

/** Run the served browser script against a small DOM and a controllable event connection. */
function browser(eventSource = true) {
  let submit!: (event: { preventDefault(): void }) => void;
  let leave!: () => void;
  class Events {
    static connections: Events[] = [];
    closed = false;
    onmessage?: (event: { data: string }) => void;
    onerror?: () => void;
    constructor(readonlyUrl: string) { this.url = readonlyUrl; Events.connections.push(this); }
    url: string;
    close() { this.closed = true; }
    emit(event: unknown) { this.onmessage?.({ data: JSON.stringify(event) }); }
  }
  const input = { value: 'https://github.com/Acme' };
  const progress = { hidden: true };
  const meter = { value: 0, max: 1, removeAttribute: () => { meter.value = -1; } };
  const status = { textContent: '' };
  const output = { innerHTML: '', children: [] as unknown[], replaceChildren: (...children: unknown[]) => { output.children = children; output.innerHTML = ''; } };
  const nodes: Record<string, unknown> = { repo: input, 'scan-progress': progress, 'scan-meter': meter, 'scan-status': status, 'scan-output': output };
  const document = {
    title: '',
    querySelector: () => ({ addEventListener: (_name: string, handler: typeof submit) => { submit = handler; } }),
    getElementById: (id: string) => nodes[id],
    createElement: () => ({ className: '', textContent: '', setAttribute() {} }),
  };
  let url = '';
  runInNewContext(CLIENT, {
    document, EventSource: Events, URLSearchParams,
    window: { EventSource: eventSource ? Events : undefined, addEventListener: (_name: string, handler: () => void) => { leave = handler; } },
    history: { replaceState: (_state: unknown, _unused: string, next: string) => { url = next; } },
  });
  return {
    input, progress, meter, status, output, document, connections: Events.connections,
    url: () => url, leave: () => leave(),
    submit: () => { let prevented = false; submit({ preventDefault: () => { prevented = true; } }); return prevented; },
  };
}

test('scan form shows listing and measured progress, then inserts the report and shareable URL', () => {
  const page = browser();
  assert.equal(page.submit(), true);
  assert.equal(page.progress.hidden, false);
  assert.equal(page.status.textContent, 'Listing projects…');
  assert.equal(page.meter.value, -1);
  const connection = page.connections[0];
  assert.equal(connection.url, '/events?org=https%3A%2F%2Fgithub.com%2FAcme');
  connection.emit({ type: 'progress', organization: 'Acme', completed: 1, total: 3 });
  assert.equal(page.meter.value, 1);
  assert.equal(page.meter.max, 3);
  assert.equal(page.status.textContent, 'Scanning Acme: 1/3 projects');
  connection.emit({ type: 'result', html: '<p>Complete report</p>' });
  assert.equal(connection.closed, true);
  assert.equal(page.progress.hidden, true);
  assert.equal(page.output.innerHTML, '<p>Complete report</p>');
  assert.equal(page.url(), '/?repo=https%3A%2F%2Fgithub.com%2FAcme');
  assert.equal(page.document.title, 'Acme · Skill Atlas');
});

test('new scans and leaving the page close the active connection', () => {
  const page = browser();
  page.submit();
  page.input.value = 'github.com/Another';
  page.submit();
  assert.equal(page.connections[0].closed, true);
  assert.equal(page.connections[1].closed, false);
  page.leave();
  assert.equal(page.connections[1].closed, true);
});

test('scan errors and interrupted connections stop progress and do not reconnect', () => {
  const page = browser();
  page.submit();
  page.connections[0].emit({ type: 'error', html: '<div>Error from GitHub</div>' });
  assert.equal(page.progress.hidden, true);
  assert.equal(page.output.innerHTML, '<div>Error from GitHub</div>');
  assert.equal(page.connections[0].closed, true);
  page.submit();
  page.connections[1].onerror!();
  assert.equal(page.connections[1].closed, true);
  assert.equal(page.progress.hidden, true);
  assert.match((page.output.children[0] as { textContent: string }).textContent, /interrupted.*try again/);
  assert.equal(page.connections.length, 2);
});

test('repository submissions and browsers without EventSource use the ordinary GET form', () => {
  const page = browser();
  for (const input of ['https://github.com/Acme/project', '', '   ']) {
    page.input.value = input;
    assert.equal(page.submit(), false);
    assert.equal(page.connections.length, 0);
  }
  const fallback = browser(false);
  assert.equal(fallback.submit(), false);
  assert.equal(fallback.connections.length, 0);
});
