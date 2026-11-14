// Jira REST calls used by RecallReady. `who` is 'user' (the person acting in the UI or Rovo)
// or 'app' (the scheduled radar).
import api, { route } from '@forge/api';

export class JiraError extends Error {
  constructor(status, body) {
    super(`Jira returned ${status}: ${String(body || '').slice(0, 300)}`);
    this.status = status;
  }
}

async function call(who, path, options = {}) {
  const client = who === 'app' ? api.asApp() : api.asUser();
  const res = await client.requestJira(path, {
    ...options,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new JiraError(res.status, text);
  return text ? JSON.parse(text) : null;
}

export const getProject = (projectKey, who = 'user') => call(who, route`/rest/api/3/project/${projectKey}`);

export async function listProjects(who = 'user') {
  const data = await call(who, route`/rest/api/3/project/search?maxResults=${100}&orderBy=${'name'}`);
  return (data?.values || []).map((p) => ({ key: p.key, name: p.name, type: p.projectTypeKey }));
}

export const createIssue = (who, fields) => call(who, route`/rest/api/3/issue`, { method: 'POST', body: JSON.stringify({ fields }) });

export const setProperty = (who, issueKey, value) => call(who, route`/rest/api/3/issue/${issueKey}/properties/recallready`, { method: 'PUT', body: JSON.stringify(value) });

export async function getProperty(who, issueKey) {
  try {
    const data = await call(who, route`/rest/api/3/issue/${issueKey}/properties/recallready`);
    return data?.value ?? null;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export const addComment = (who, issueKey, adf) => call(who, route`/rest/api/3/issue/${issueKey}/comment`, { method: 'POST', body: JSON.stringify({ body: adf }) });

export async function transitionToDone(who, issueKey) {
  const data = await call(who, route`/rest/api/3/issue/${issueKey}/transitions`);
  const transition = (data?.transitions || []).find((t) => t.to?.statusCategory?.key === 'done');
  if (!transition) return false;
  await call(who, route`/rest/api/3/issue/${issueKey}/transitions`, { method: 'POST', body: JSON.stringify({ transition: { id: transition.id } }) });
  return true;
}

export async function search(who, jql, { fields = ['summary', 'status', 'created', 'labels'], max = 100 } = {}) {
  const out = [];
  let nextPageToken;
  do {
    const data = await call(who, route`/rest/api/3/search/jql`, {
      method: 'POST',
      body: JSON.stringify({ jql, maxResults: Math.min(max - out.length, 100), fields, properties: ['recallready'], ...(nextPageToken ? { nextPageToken } : {}) }),
    });
    for (const issue of data?.issues || []) out.push({ key: issue.key, fields: issue.fields || {}, property: issue.properties?.recallready ?? null });
    nextPageToken = data?.isLast === false ? data.nextPageToken : undefined;
  } while (nextPageToken && out.length < max);
  return out;
}

export async function myName(who = 'user') {
  const me = await call(who, route`/rest/api/3/myself`);
  return me?.displayName || 'Someone';
}

export async function siteUrl(who = 'user') {
  const info = await call(who, route`/rest/api/3/serverInfo`);
  return String(info?.baseUrl || '').replace(/\/$/, '');
}
