// Resolvers for the RecallReady settings page (Jira admins only).
import api, { route } from '@forge/api';
import { getWorkspaceId } from '../platform/assets.js';
import { listProjects } from '../platform/jira.js';
import { getSettings, saveSettings, getState } from '../platform/settings.js';
import { runSetup, startSampleLoad, catalogStatus, NO_ASSETS } from '../services/setup.js';
import { DEFAULT_PLAN } from '../lib/case.js';
import { resultFromError } from '../lib/errors.js';

async function isJiraAdmin() {
  const res = await api.asUser().requestJira(route`/rest/api/3/mypermissions?permissions=${'ADMINISTER'}`);
  if (!res.ok) return false;
  const data = await res.json();
  return Boolean(data?.permissions?.ADMINISTER?.havePermission);
}

async function requireAdmin() {
  if (!(await isJiraAdmin())) throw new Error('Only Jira admins can change RecallReady settings.');
}

const fail = resultFromError;

export function defineAdmin(resolver) {
  resolver.define('getAdminState', async () => {
    try {
      const settings = await getSettings();
      const [workspaceId, projects, status, sample, radar] = await Promise.all([
        getWorkspaceId('user'),
        listProjects('user').catch(() => []),
        settings.schemaIds ? catalogStatus(settings.schemaIds).catch(() => ({ ready: false, counts: null })) : { ready: false, counts: null },
        getState('sample-progress'),
        getState('radar-last'),
      ]);
      return {
        ok: true,
        assetsAvailable: Boolean(workspaceId),
        assetsMessage: workspaceId ? '' : NO_ASSETS,
        settings: { projectKey: settings.projectKey, company: settings.company, plan: settings.plan, sources: settings.sources },
        catalog: status,
        sample,
        radar,
        projects,
      };
    } catch (error) {
      return fail(error);
    }
  });

  resolver.define('runSetup', async ({ payload }) => {
    try {
      await requireAdmin();
      return await runSetup({ withSample: Boolean(payload?.withSample) });
    } catch (error) {
      return fail(error);
    }
  });

  resolver.define('loadSampleData', async () => {
    try {
      await requireAdmin();
      const settings = await getSettings();
      if (!settings.schemaIds) return { ok: false, message: 'Create the catalog first.' };
      await startSampleLoad();
      return { ok: true, sample: await getState('sample-progress') };
    } catch (error) {
      return fail(error);
    }
  });

  resolver.define('getSampleProgress', async () => {
    const settings = await getSettings();
    return {
      ok: true,
      sample: await getState('sample-progress'),
      catalog: settings.schemaIds ? await catalogStatus(settings.schemaIds).catch(() => null) : null,
    };
  });

  resolver.define('saveAdminSettings', async ({ payload }) => {
    try {
      await requireAdmin();
      const projects = await listProjects('user');
      const projectKey = String(payload?.projectKey || '');
      if (projectKey && !projects.some((p) => p.key === projectKey)) return { ok: false, message: 'Choose a project you can see.' };
      const plan = DEFAULT_PLAN.map((step) => {
        const hours = Number((payload?.plan || []).find((p) => p.key === step.key)?.hours ?? step.hours);
        if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 90) throw new Error(`"${step.label}" needs a number of hours between 1 and 2160.`);
        return { ...step, hours };
      });
      const sources = Object.fromEntries(['fdaFood', 'fdaDrug', 'fdaDevice', 'cpsc'].map((k) => [k, Boolean(payload?.sources?.[k])]));
      const saved = await saveSettings({ projectKey, company: String(payload?.company || '').slice(0, 80), plan, sources });
      return { ok: true, settings: { projectKey: saved.projectKey, company: saved.company, plan: saved.plan, sources: saved.sources } };
    } catch (error) {
      return fail(error);
    }
  });
}
