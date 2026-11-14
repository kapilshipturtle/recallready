/*
 * RecallReady issue panel (UI Kit).
 * On a recall case: clocks, every location with what it pulled, the customer notice, the
 * regulator summary and Close. On a stop-sale task: one form to confirm the units pulled.
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, ButtonGroup, DynamicTable, Heading, Inline, Label, Link, Lozenge, ProgressBar, SectionMessage,
  Spinner, Stack, Strong, Text, TextArea, Textfield, xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const time = (iso) => (iso ? `${String(iso).slice(0, 16).replace('T', ' ')} UTC` : '');
const numberStyle = xcss({ maxWidth: '140px' });
const percent = (n) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

function Clocks({ clocks }) {
  return (
    <Stack space="space.075">
      {clocks.map((c) => (
        <Inline key={c.key} space="space.100" alignBlock="center">
          <Lozenge appearance={c.status === 'met' ? 'success' : c.status === 'overdue' ? 'removed' : 'inprogress'}>
            {c.status === 'met' ? 'Met' : c.status === 'overdue' ? 'Overdue' : 'Due'}
          </Lozenge>
          <Text>{c.label} (target {c.hours} h): {c.status === 'met' ? `met ${time(c.metAt)}` : `due ${time(c.dueAt)}`}</Text>
        </Inline>
      ))}
    </Stack>
  );
}

function CaseView({ state, act, busy }) {
  const c = state.caseData;
  const s = state.summary;
  const allConfirmed = s.locationsConfirmed === s.locationsTotal;
  return (
    <Stack space="space.250">
      <Stack space="space.075">
        <Inline space="space.075" alignBlock="center">
          {c.drill && <Lozenge appearance="new">Mock recall</Lozenge>}
          {c.milestones.closed ? <Lozenge appearance="success">Closed</Lozenge> : <Lozenge appearance="inprogress">Open</Lozenge>}
        </Inline>
        <Text><Strong>{c.products.map((p) => p.name).join(', ')}</Strong>, lot{c.lots.length === 1 ? '' : 's'} {c.lots.map((l) => l.code).join(', ')}</Text>
        {c.notice.url ? <Link href={c.notice.url} openNewTab>{`${c.notice.source}: ${c.notice.title}`}</Link> : <Text>{c.notice.source}: {c.notice.title}</Text>}
        {c.notice.reason && <Text>Reason: {c.notice.reason}</Text>}
      </Stack>

      <Stack space="space.075">
        <Heading size="xsmall">Stop sale</Heading>
        <ProgressBar value={s.locationsTotal ? s.locationsConfirmed / s.locationsTotal : 0} appearance={allConfirmed ? 'success' : 'default'} ariaLabel="Locations confirmed" />
        <Text>{s.locationsConfirmed} of {s.locationsTotal} locations confirmed. {s.recoveredUnits} of {s.expectedUnits} units pulled (effectiveness {percent(s.effectiveness)}).</Text>
        <DynamicTable
          head={{ cells: [
            { key: 'loc', content: 'Location', width: 34 },
            { key: 'exp', content: 'Expected', width: 14 },
            { key: 'got', content: 'Pulled', width: 14 },
            { key: 'who', content: 'Confirmed', width: 38 },
          ] }}
          rows={c.locations.map((l) => ({
            key: l.key,
            cells: [
              { key: 'loc', content: l.subtaskKey ? <Link href={`/browse/${l.subtaskKey}`}>{`${l.name} (${l.type})`}</Link> : `${l.name} (${l.type})` },
              { key: 'exp', content: String(l.expectedUnits) },
              { key: 'got', content: l.confirmedUnits === null ? '-' : String(l.confirmedUnits) },
              { key: 'who', content: l.confirmedUnits === null ? <Lozenge>Waiting</Lozenge> : (
                <Stack space="space.025">
                  <Inline space="space.050">{l.overRecovered ? <Lozenge appearance="moved">More than expected</Lozenge> : <Lozenge appearance="success">Confirmed</Lozenge>}</Inline>
                  <Text>{l.confirmedBy}, {time(l.confirmedAt)}{l.note ? `. ${l.note}` : ''}</Text>
                </Stack>
              ) },
            ],
          }))}
        />
      </Stack>

      <Stack space="space.075">
        <Heading size="xsmall">Response plan</Heading>
        <Clocks clocks={s.clocks} />
      </Stack>

      <Stack space="space.075">
        <Heading size="xsmall">Customers</Heading>
        <Text>{c.orders.length} online order{c.orders.length === 1 ? '' : 's'} contain affected lots{c.ordersTotal ? ` (${c.ordersTotal} in total)` : ''}.</Text>
        {c.orders.length > 0 && <Text>{c.orders.slice(0, 8).map((o) => `${o.orderNumber} ${o.customerName}`).join(', ')}{c.orders.length > 8 ? ', ...' : ''}</Text>}
        <Label labelFor="notice">Customer notice (copy into your email or messaging tool)</Label>
        <TextArea id="notice" isReadOnly value={state.customerNotice} />
        {!c.milestones.customerNotice && <Box><Button isDisabled={Boolean(busy)} onClick={() => act('markMilestoneHere', { key: 'customerNotice' })}>Mark customer notice ready</Button></Box>}
      </Stack>

      <Stack space="space.075">
        <Heading size="xsmall">Regulator summary</Heading>
        <TextArea id="regulator" isReadOnly value={state.regulatorSummary} />
        {!c.milestones.regulatorSummary && <Box><Button isDisabled={Boolean(busy)} onClick={() => act('markMilestoneHere', { key: 'regulatorSummary' })}>Mark regulator summary ready</Button></Box>}
      </Stack>

      {!c.milestones.closed && (
        <Stack space="space.075">
          {!allConfirmed && <Text>Close becomes available when every location has confirmed.</Text>}
          <ButtonGroup>
            <Button appearance="primary" isDisabled={Boolean(busy) || !allConfirmed} onClick={() => act('closeHere')}>{busy === 'closeHere' ? 'Closing...' : 'Close recall with closing record'}</Button>
          </ButtonGroup>
        </Stack>
      )}
      {state.closingRecord && <SectionMessage appearance="success" title="Closing record posted as a comment"><Text>Effectiveness {percent(s.effectiveness)}.</Text></SectionMessage>}
    </Stack>
  );
}

function LocationView({ state, act, busy }) {
  const l = state.location;
  const [units, setUnits] = useState(String(l?.confirmedUnits ?? l?.expectedUnits ?? ''));
  const [note, setNote] = useState(l?.note || '');
  if (!l) return <SectionMessage appearance="warning"><Text>The recall case for this task could not be found.</Text></SectionMessage>;
  return (
    <Stack space="space.200">
      <Inline space="space.075">{state.drill && <Lozenge appearance="new">Mock recall</Lozenge>}<Text>Part of <Link href={`/browse/${state.caseKey}`}>{state.caseKey}</Link></Text></Inline>
      <Text><Strong>{l.name}</Strong>: pull {l.expectedUnits} units from sale.</Text>
      <Stack space="space.025">
        {(l.lotUnits || []).map((x) => <Text key={x.lotKey}>Lot {x.code}: {x.units} units expected</Text>)}
      </Stack>
      {l.confirmedUnits !== null && (
        <SectionMessage appearance={l.overRecovered ? 'warning' : 'success'}>
          <Text>Confirmed by {l.confirmedBy} at {time(l.confirmedAt)}: {l.confirmedUnits} units pulled.{l.overRecovered ? ' That is more than expected; check for stock from other lots.' : ''}</Text>
        </SectionMessage>
      )}
      <Label labelFor="units">Units pulled</Label>
      <Box xcss={numberStyle}><Textfield id="units" type="number" value={units} onChange={(e) => setUnits(e.target.value)} /></Box>
      <Label labelFor="note">Note (optional)</Label>
      <TextArea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Example: 2 units found in the back room" />
      <Box>
        <Button appearance="primary" isDisabled={Boolean(busy) || units === ''} onClick={() => act('confirmHere', { units: Number(units), note })}>
          {busy === 'confirmHere' ? 'Saving...' : l.confirmedUnits === null ? 'Confirm stop sale' : 'Update confirmation'}
        </Button>
      </Box>
    </Stack>
  );
}

const App = () => {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { invoke('getPanel').then(setState); }, []);
  const act = async (fn, payload) => {
    setBusy(fn);
    setError('');
    const result = await invoke(fn, payload);
    setBusy('');
    if (result.ok) setState(result);
    else setError(result.message);
  };
  if (!state) return <Spinner label="Loading recall" />;
  if (!state.ok) return <SectionMessage appearance="error"><Text>{state.message}</Text></SectionMessage>;
  return (
    <Stack space="space.200">
      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
      {state.mode === 'case' && <CaseView state={state} act={act} busy={busy} />}
      {state.mode === 'location' && <LocationView state={state} act={act} busy={busy} />}
      {state.mode === 'none' && <Text>This work item is not part of a recall. Recalls start from the RecallReady board or the RecallReady agent in Rovo.</Text>}
    </Stack>
  );
};

ForgeReconciler.render(<App />);
