// Converts between an n8n workflow as the API returns it and the "portable" JSON we keep in git.
// Pure functions, unit-tested in tests/workflow-portable.test.js.
//
// Portable form:
// - Only the fields the API accepts on create/update (name, nodes, connections, settings),
//   plus `published` (our own flag for publish state).
// - Volatile fields dropped (id, versionId, timestamps, staticData, pinData, meta, tags, shared).
// - Instance-specific IDs replaced with names, so a fresh n8n instance can import it:
//     workflow references → "@name:<workflow name>"
//     credentials        → { name } only (the ID is looked up by type + name on import)
// - Keys sorted and nodes ordered by name, so diffs only show real changes.

// From the settings schema in n8n 2.43.7 /api/v1/openapi.yml (additionalProperties: false).
const ALLOWED_SETTINGS = [
  'saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution',
  'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder', 'binaryMode', 'callerPolicy',
  'callerIds', 'timeSavedMode', 'timeSavedPerExecution', 'redactionPolicy', 'availableInMCP',
  'customTelemetryTags', 'credentialResolverId',
];
const NAME_REF = '@name:';

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

// "WF-10 Screening pipeline" → "10-screening-pipeline.json"
function fileNameFor(name) {
  const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const m = name.match(/^WF-(\d+)\s+(.*)$/i);
  return (m ? `${m[1]}-${kebab(m[2])}` : kebab(name)) + '.json';
}

function mapWorkflowRef(param, mapId) {
  if (param === undefined || param === null || param === '') return param;
  if (typeof param === 'string') return mapId(param);
  if (typeof param === 'object' && param.__rl) {
    const mapped = mapId(param.value);
    const out = { __rl: true, mode: 'list', value: mapped };
    if (param.cachedResultName) out.cachedResultName = param.cachedResultName;
    return out;
  }
  return param;
}

function toPortable(wf, { workflowNameById = {} } = {}) {
  const idToRef = (id) => (workflowNameById[id] ? NAME_REF + workflowNameById[id] : id);

  const nodes = (wf.nodes || []).map((node) => {
    const n = { ...node };
    if (n.parameters && n.parameters.workflowId !== undefined) {
      n.parameters = { ...n.parameters, workflowId: mapWorkflowRef(n.parameters.workflowId, idToRef) };
    }
    if (n.credentials) {
      const creds = {};
      for (const [type, ref] of Object.entries(n.credentials)) creds[type] = { name: ref.name };
      n.credentials = creds;
    }
    return n;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const settings = {};
  for (const k of ALLOWED_SETTINGS) {
    if (wf.settings && wf.settings[k] !== undefined) settings[k] = wf.settings[k];
  }
  if (settings.errorWorkflow) settings.errorWorkflow = idToRef(settings.errorWorkflow);

  return sortKeys({
    name: wf.name,
    published: Boolean(wf.active),
    nodes,
    connections: wf.connections || {},
    settings,
  });
}

function fromPortable(p, { workflowIdByName = {}, credentialIdByTypeAndName = {} } = {}) {
  const unresolved = [];
  const refToId = (v) => {
    if (typeof v !== 'string' || !v.startsWith(NAME_REF)) return v;
    const name = v.slice(NAME_REF.length);
    if (!workflowIdByName[name]) unresolved.push(`workflow "${name}"`);
    return workflowIdByName[name] || v;
  };

  const nodes = p.nodes.map((node) => {
    const n = { ...node };
    if (n.parameters && n.parameters.workflowId !== undefined) {
      n.parameters = { ...n.parameters, workflowId: mapWorkflowRef(n.parameters.workflowId, refToId) };
    }
    if (n.credentials) {
      const creds = {};
      for (const [type, ref] of Object.entries(n.credentials)) {
        const id = credentialIdByTypeAndName[`${type}:${ref.name}`];
        if (id) creds[type] = { id, name: ref.name };
        else unresolved.push(`credential ${type} "${ref.name}"`);
      }
      n.credentials = creds;
    }
    return n;
  });

  const settings = { ...(p.settings || {}) };
  if (settings.errorWorkflow) settings.errorWorkflow = refToId(settings.errorWorkflow);

  return {
    body: { name: p.name, nodes, connections: p.connections || {}, settings },
    published: Boolean(p.published),
    unresolved,
  };
}

module.exports = { ALLOWED_SETTINGS, NAME_REF, sortKeys, fileNameFor, toPortable, fromPortable };
