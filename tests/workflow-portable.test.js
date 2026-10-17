const test = require('node:test');
const assert = require('node:assert/strict');
const { toPortable, fromPortable, fileNameFor, sortKeys } = require('../scripts/lib/workflow-portable');

const apiWorkflow = {
  id: 'wf1', name: 'WF-01 Intake webhook', active: true, versionId: 'v9', createdAt: 'x', updatedAt: 'y',
  staticData: { lastId: 4 }, pinData: { a: 1 }, tags: [{ id: 't', name: 'demo' }],
  settings: { executionOrder: 'v1', errorWorkflow: 'wf90', somethingNew: true },
  connections: { B: {}, A: {} },
  nodes: [
    { id: 'n2', name: 'Call screening', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.4,
      parameters: { workflowId: { __rl: true, mode: 'id', value: 'wf10', cachedResultUrl: '/workflow/wf10' } } },
    { id: 'n1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2.2,
      parameters: {}, credentials: { httpHeaderAuth: { id: 'c1', name: 'CRM webhook secret' } } },
  ],
};
const names = { wf1: 'WF-01 Intake webhook', wf10: 'WF-10 Screening', wf90: 'WF-90 Error handler' };

test('toPortable drops volatile fields and unknown settings', () => {
  const p = toPortable(apiWorkflow, { workflowNameById: names });
  assert.deepEqual(Object.keys(p), ['connections', 'name', 'nodes', 'published', 'settings']);
  assert.equal(p.published, true);
  assert.equal(p.settings.somethingNew, undefined);
});

test('toPortable replaces instance IDs with names', () => {
  const p = toPortable(apiWorkflow, { workflowNameById: names });
  assert.equal(p.settings.errorWorkflow, '@name:WF-90 Error handler');
  const call = p.nodes.find((n) => n.name === 'Call screening');
  assert.deepEqual(call.parameters.workflowId, { __rl: true, mode: 'list', value: '@name:WF-10 Screening' });
  const hook = p.nodes.find((n) => n.name === 'Webhook');
  assert.deepEqual(hook.credentials, { httpHeaderAuth: { name: 'CRM webhook secret' } });
});

test('toPortable sorts nodes by name and keys alphabetically (stable diffs)', () => {
  const p = toPortable(apiWorkflow, { workflowNameById: names });
  assert.deepEqual(p.nodes.map((n) => n.name), ['Call screening', 'Webhook']);
  assert.deepEqual(Object.keys(p.connections), ['A', 'B']);
});

test('fromPortable resolves names back to IDs on another instance', () => {
  const p = toPortable(apiWorkflow, { workflowNameById: names });
  const { body, published, unresolved } = fromPortable(p, {
    workflowIdByName: { 'WF-10 Screening': 'new10', 'WF-90 Error handler': 'new90' },
    credentialIdByTypeAndName: { 'httpHeaderAuth:CRM webhook secret': 'newc1' },
  });
  assert.deepEqual(unresolved, []);
  assert.equal(published, true);
  assert.deepEqual(Object.keys(body).sort(), ['connections', 'name', 'nodes', 'settings']);
  assert.equal(body.settings.errorWorkflow, 'new90');
  assert.equal(body.nodes.find((n) => n.name === 'Call screening').parameters.workflowId.value, 'new10');
  assert.deepEqual(body.nodes.find((n) => n.name === 'Webhook').credentials, { httpHeaderAuth: { id: 'newc1', name: 'CRM webhook secret' } });
});

test('fromPortable reports what it could not resolve instead of guessing', () => {
  const p = toPortable(apiWorkflow, { workflowNameById: names });
  const { unresolved, body } = fromPortable(p, {});
  assert.equal(unresolved.length, 3);
  assert.deepEqual(body.nodes.find((n) => n.name === 'Webhook').credentials, {});
});

test('fileNameFor maps WF names to stable file names', () => {
  assert.equal(fileNameFor('WF-10 Screening pipeline'), '10-screening-pipeline.json');
  assert.equal(fileNameFor('WF-00 Hello items'), '00-hello-items.json');
  assert.equal(fileNameFor('Scratch: test!'), 'scratch-test.json');
});

test('sortKeys is recursive and leaves arrays in order', () => {
  assert.deepEqual(JSON.stringify(sortKeys({ b: 1, a: [{ d: 1, c: 2 }] })), '{"a":[{"c":2,"d":1}],"b":1}');
});
