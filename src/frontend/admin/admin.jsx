/*
 * RecallReady settings (Jira admin page, UI Kit).
 * 1. Catalog in Assets (and optional sample data). 2. Project for recall cases and company name.
 * 3. Response plan clocks. 4. Recall radar sources.
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, ButtonGroup, DynamicTable, Heading, Inline, Label, Lozenge, ProgressBar, SectionMessage,
  Select, Spinner, Stack, Text, Textfield, Toggle, xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const SOURCES = [
  { key: 'fdaFood', label: 'FDA food enforcement reports' },
  { key: 'fdaDrug', label: 'FDA drug enforcement reports' },
  { key: 'fdaDevice', label: 'FDA medical device enforcement reports' },
  { key: 'cpsc', label: 'CPSC consumer product recalls' },
];
const hoursStyle = xcss({ maxWidth: '110px' });
const TYPES = ['Product', 'Location', 'Lot', 'Stock', 'Order'];

function CatalogCounts({ catalog }) {
  if (!catalog?.counts) return null;
  return (
    <DynamicTable
      head={{ cells: TYPES.map((t) => ({ key: t, content: `${t}s` })) }}
      rows={[{ key: 'counts', cells: TYPES.map((t) => ({ key: t, content: String(catalog.counts[t] ?? 0) })) }]}
    />
  );
}

const App = () => {
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const [busyArea, setBusyArea] = useState('');

  const load = async () => {
    const result = await invoke('getAdminState');
    setState(result);
    if (result.ok) setDraft(result.settings);
  };
  useEffect(() => { load(); }, []);

  const sampleRunning = ['queued', 'running'].includes(state?.sample?.status);
  useEffect(() => {
    if (!sampleRunning) return undefined;
    const timer = setInterval(async () => {
      const p = await invoke('getSampleProgress');
      setState((s) => ({ ...s, sample: p.sample, catalog: p.catalog || s.catalog }));
    }, 4000);
    return () => clearInterval(timer);
  }, [sampleRunning]);

  const act = async (label, fn, payload) => {
    setBusy(label);
    setBusyArea(label === 'save' ? 'save' : label === 'scan' ? 'scan' : 'catalog');
    setMessage(null);
    const result = await invoke(fn, payload);
    setBusy('');
    if (!result.ok) setMessage({ appearance: 'error', text: result.message });
    else setMessage({ appearance: 'success', text: label === 'save' ? 'Saved.' : 'Done.' });
    await load();
  };

  // The scan runs in the background; wait for a result newer than the request.
  const scan = async () => {
    setBusy('scan');
    setBusyArea('scan');
    setMessage(null);
    const result = await invoke('scanNow');
    if (!result.ok) {
      setBusy('');
      setMessage({ appearance: 'error', text: result.message });
      return;
    }
    for (let i = 0; i < 60; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const next = await invoke('getAdminState');
      if (next.ok && next.radar && String(next.radar.at) >= String(result.requestedAt)) {
        setState(next);
        setBusy('');
        setMessage({ appearance: 'success', text: 'Done.' });
        return;
      }
    }
    setBusy('');
    setMessage({ appearance: 'warning', text: 'The scan is still running. Its result appears here when it finishes.' });
  };

  if (!state) return <Spinner label="Loading RecallReady settings" />;
  if (!state.ok) return <SectionMessage appearance="error" title="Settings could not load"><Text>{state.message}</Text></SectionMessage>;
  if (!draft) return <Spinner label="Loading RecallReady settings" />;

  const projectOptions = state.projects.map((p) => ({ label: `${p.name} (${p.key})`, value: p.key }));
  const sample = state.sample;
  return (
    <Stack space="space.300">
      <Text>RecallReady matches recall notices against your products and lots in Assets, and runs every recall as a tracked case with stop-sale tasks, clocks and a closing record.</Text>

      <Stack space="space.150">
        <Heading size="small">1. Catalog in Assets</Heading>
        {!state.assetsAvailable ? (
          <SectionMessage appearance="warning" title="Assets not found"><Text>{state.assetsMessage}</Text></SectionMessage>
        ) : (
          <Stack space="space.100">
            <Inline space="space.100" alignBlock="center">
              <Text>Schema "RecallReady catalog" (key RRC):</Text>
              {state.catalog?.ready ? <Lozenge appearance="success">Ready</Lozenge> : <Lozenge>Not set up</Lozenge>}
            </Inline>
            {message && busyArea === 'catalog' && <SectionMessage appearance={message.appearance}><Text>{message.text}</Text></SectionMessage>}
            <CatalogCounts catalog={state.catalog} />
            {sample && (
              <Stack space="space.050">
                <Text>Sample data ({sample.status}): {sample.created} of {sample.total} objects{sample.message ? `. ${sample.message}` : ''}</Text>
                <ProgressBar value={sample.total ? sample.created / sample.total : 0} appearance={sample.status === 'failed' ? 'default' : 'success'} />
              </Stack>
            )}
            <ButtonGroup>
              <Button appearance="primary" isDisabled={Boolean(busy)} onClick={() => act('setup', 'runSetup', { withSample: true })}>
                {busy === 'setup' ? 'Setting up...' : 'Create catalog with sample data'}
              </Button>
              <Button isDisabled={Boolean(busy)} onClick={() => act('setup', 'runSetup', { withSample: false })}>Create empty catalog</Button>
              {state.catalog?.ready && !sampleRunning && (
                <Button appearance="subtle" isDisabled={Boolean(busy)} onClick={() => act('sample', 'loadSampleData')}>Load sample data</Button>
              )}
            </ButtonGroup>
            <Text>The sample is a fictional retailer, Larkmere Market: 24 products, 59 lots, 10 locations, stock and 40 online orders. Import your own catalog into the same object types with Assets import.</Text>
          </Stack>
        )}
      </Stack>

      <Stack space="space.150">
        <Heading size="small">2. Recall cases</Heading>
        <Label labelFor="project">Project for recall cases</Label>
        <Select
          id="project"
          options={projectOptions}
          value={projectOptions.find((o) => o.value === draft.projectKey) || null}
          onChange={(option) => setDraft({ ...draft, projectKey: option ? option.value : '' })}
          placeholder="Choose a project"
        />
        <Label labelFor="company">Company name used in customer notices</Label>
        <Textfield id="company" value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} />
      </Stack>

      <Stack space="space.150">
        <Heading size="small">3. Response plan</Heading>
        <Text>Hours after a recall opens. These are your own targets, shown as clocks on every case.</Text>
        {draft.plan.map((step) => (
          <Inline key={step.key} space="space.150" alignBlock="center">
            <Box xcss={hoursStyle}>
              <Textfield
                id={`plan-${step.key}`}
                type="number"
                value={String(step.hours)}
                onChange={(event) => setDraft({ ...draft, plan: draft.plan.map((p) => (p.key === step.key ? { ...p, hours: event.target.value } : p)) })}
              />
            </Box>
            <Text>{step.label}</Text>
          </Inline>
        ))}
      </Stack>

      <Stack space="space.150">
        <Heading size="small">4. Recall radar</Heading>
        <Text>Every hour RecallReady reads new public recall notices and checks them against your catalog.</Text>
        {SOURCES.map((s) => (
          <Inline key={s.key} space="space.100" alignBlock="center">
            <Toggle
              id={`source-${s.key}`}
              label={s.label}
              isChecked={Boolean(draft.sources[s.key])}
              onChange={(event) => setDraft({ ...draft, sources: { ...draft.sources, [s.key]: Boolean(event.target.checked) } })}
            />
            <Label labelFor={`source-${s.key}`}>{s.label}</Label>
          </Inline>
        ))}
        <Box><Button isDisabled={Boolean(busy)} onClick={scan}>{busy === 'scan' ? 'Scanning...' : 'Scan now'}</Button></Box>
        {message && busyArea === 'scan' && <SectionMessage appearance={message.appearance}><Text>{message.text}</Text></SectionMessage>}
        {state.radar?.errors?.length > 0 && <SectionMessage appearance="warning" title="Some sources could not be read"><Text>{state.radar.errors.join(' ')}</Text></SectionMessage>}
        {state.radar && <Text>Last scan: {String(state.radar.at || '').slice(0, 16).replace('T', ' ')} UTC. Checked {state.radar.checked} notices, opened {state.radar.opened} cases, {state.radar.queued} for review.</Text>}
      </Stack>

      {message && busyArea === 'save' && <SectionMessage appearance={message.appearance}><Text>{message.text}</Text></SectionMessage>}
      <ButtonGroup>
        <Button appearance="primary" isDisabled={Boolean(busy)} onClick={() => act('save', 'saveAdminSettings', draft)}>{busy === 'save' ? 'Saving...' : 'Save settings'}</Button>
      </ButtonGroup>
    </Stack>
  );
};

ForgeReconciler.render(<App />);
