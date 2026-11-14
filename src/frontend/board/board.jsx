/*
 * Recall board (Jira global page, UI Kit): open recalls with progress and clocks, a notice
 * checker, mock recalls, and the radar's review queue.
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, DynamicTable, Heading, Inline, Label, Link, Lozenge, ProgressBar, SectionMessage,
  Select, Spinner, Stack, Strong, Text, TextArea, xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const tile = xcss({ padding: 'space.200', borderRadius: 'border.radius.200', backgroundColor: 'color.background.neutral', minWidth: '170px' });
const CONFIDENCE = { High: 'removed', Medium: 'moved', Low: 'default' };
const time = (iso) => (iso ? `${String(iso).slice(0, 16).replace('T', ' ')} UTC` : '');

function Kpi({ value, label }) {
  return (
    <Box xcss={tile}>
      <Stack space="space.050">
        <Heading size="large">{String(value)}</Heading>
        <Text>{label}</Text>
      </Stack>
    </Box>
  );
}

function ClockLozenge({ clock }) {
  if (!clock) return <Lozenge appearance="success">All clocks met</Lozenge>;
  return (
    <Stack space="space.025">
      <Lozenge appearance={clock.status === 'overdue' ? 'removed' : 'inprogress'}>{clock.status === 'overdue' ? 'Overdue' : 'Due'}</Lozenge>
      <Text>{clock.label}, {time(clock.dueAt)}</Text>
    </Stack>
  );
}

const App = () => {
  const [board, setBoard] = useState(null);
  const [options, setOptions] = useState(null);
  const [noticeText, setNoticeText] = useState('');
  const [check, setCheck] = useState(null);
  const [drill, setDrill] = useState({ product: null, lots: [] });
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState(null);
  // Brand-only (Low) matches stay collapsed until asked for, as the design says.
  const [showLow, setShowLow] = useState({ check: false, queue: false });

  const load = async () => {
    const result = await invoke('getBoard');
    setBoard(result);
    if (result.ok && !result.setupNeeded && !options) {
      const opts = await invoke('getDrillOptions');
      if (opts.ok) setOptions(opts);
    }
  };
  useEffect(() => { load(); }, []);

  const started = async (label, fn, payload) => {
    setBusy(label);
    setFlash(null);
    const result = await invoke(fn, payload);
    setBusy('');
    setFlash(result.ok
      ? { appearance: 'success', text: `Opened ${result.issueKey} with ${result.locations} stop-sale task${result.locations === 1 ? '' : 's'}.`, url: result.url }
      : { appearance: 'error', text: result.message });
    if (result.ok) { setCheck(null); await load(); }
  };

  if (!board) return <Spinner label="Loading recall board" />;
  if (!board.ok) return <SectionMessage appearance="error" title="The board could not load"><Text>{board.message}</Text></SectionMessage>;

  const checkShown = (check?.matches || []).filter((m) => showLow.check || m.confidence !== 'Low');
  const checkLow = (check?.matches || []).filter((m) => m.confidence === 'Low').length;
  const queueAll = board.queue.flatMap((item) => item.matches.map((m) => ({ item, m })));
  const queueRows = queueAll.filter(({ m }) => showLow.queue || m.confidence !== 'Low');
  const queueLow = queueAll.length - queueAll.filter(({ m }) => m.confidence !== 'Low').length;
  const lotOptions = (options?.lots || []).filter((l) => l.productKey === drill.product?.value).map((l) => ({ label: `${l.code}${l.bestBy ? ` (best by ${l.bestBy})` : ''}`, value: l.key }));

  return (
    <Stack space="space.400">
      <Stack space="space.100">
        <Heading size="medium">Recall board</Heading>
        <Text>Every recall in one place: what is affected, where it is, who has pulled it from sale, and which clocks are running.</Text>
      </Stack>

      {flash && (
        <SectionMessage appearance={flash.appearance}>
          <Text>{flash.text} {flash.url && <Link href={flash.url} openNewTab>Open the case</Link>}</Text>
        </SectionMessage>
      )}

      {board.setupNeeded ? (
        <SectionMessage appearance="warning" title="Finish setup"><Text>{board.message}</Text></SectionMessage>
      ) : (
        <>
          <Inline space="space.200" shouldWrap>
            <Kpi value={board.kpis.open} label="Open recalls" />
            <Kpi value={board.kpis.locationsPending} label="Locations still to confirm" />
            <Kpi value={board.kpis.unitsOutstanding} label="Units not yet pulled" />
            <Kpi value={board.kpis.overdue} label="Overdue clocks" />
          </Inline>

          <Stack space="space.150">
            <Heading size="small">Open recalls</Heading>
            {board.recalls.length === 0 ? (
              <SectionMessage appearance="information"><Text>No open recalls. Run a mock recall below to test your process.</Text></SectionMessage>
            ) : (
              <DynamicTable
                head={{ cells: [
                  { key: 'recall', content: 'Recall', width: 34 },
                  { key: 'progress', content: 'Stop sale', width: 22 },
                  { key: 'units', content: 'Units pulled', width: 16 },
                  { key: 'clock', content: 'Next clock', width: 28 },
                ] }}
                rows={board.recalls.map((r) => ({
                  key: r.issueKey,
                  cells: [
                    { key: 'recall', content: (
                      <Stack space="space.050">
                        <Link href={`${board.siteUrl}/browse/${r.issueKey}`} openNewTab>{`${r.issueKey}: ${r.title}`}</Link>
                        <Inline space="space.050">
                          {r.drill && <Lozenge appearance="new">Mock recall</Lozenge>}
                          {!r.drill && <Text>{r.source}</Text>}
                        </Inline>
                      </Stack>
                    ) },
                    { key: 'progress', content: (
                      <Stack space="space.050">
                        <ProgressBar value={r.summary.locationsTotal ? r.summary.locationsConfirmed / r.summary.locationsTotal : 0} appearance={r.summary.percent === 100 ? 'success' : 'default'} ariaLabel={`Locations confirmed for ${r.issueKey}`} />
                        <Text>{r.summary.locationsConfirmed} of {r.summary.locationsTotal} locations confirmed</Text>
                      </Stack>
                    ) },
                    { key: 'units', content: `${r.summary.recoveredUnits} of ${r.summary.expectedUnits}` },
                    { key: 'clock', content: <ClockLozenge clock={r.summary.nextClock} /> },
                  ],
                }))}
              />
            )}
          </Stack>

          <Stack space="space.150">
            <Heading size="small">Check a notice</Heading>
            <Text>Paste a supplier notice, an email or a regulator alert. RecallReady checks it against every product, GTIN, SKU and lot in your catalog.</Text>
            <TextArea id="notice" value={noticeText} onChange={(e) => setNoticeText(e.target.value)} placeholder="Example: Quillbrook Farms is recalling Larkmere Creamy Peanut Butter 16 oz, lot 26I01A, because of possible Salmonella." />
            <Box>
              <Button isDisabled={Boolean(busy)} onClick={async () => { setBusy('check'); setFlash(null); const r = await invoke('checkNoticeText', { text: noticeText }); setBusy(''); if (r.ok) { setCheck(r); setShowLow({ ...showLow, check: false }); } else setFlash({ appearance: 'error', text: r.message }); }}>
                {busy === 'check' ? 'Checking...' : 'Check against catalog'}
              </Button>
            </Box>
            {check && (check.matches.length === 0 ? (
              <SectionMessage appearance="success"><Text>No product in your catalog matches this notice.</Text></SectionMessage>
            ) : checkShown.length > 0 && (
              <DynamicTable
                head={{ cells: [
                  { key: 'product', content: 'Product', width: 28 },
                  { key: 'confidence', content: 'Match', width: 10 },
                  { key: 'lots', content: 'Lots', width: 16 },
                  { key: 'why', content: 'Why', width: 30 },
                  { key: 'action', content: '', width: 16 },
                ] }}
                rows={checkShown.map((m) => ({
                  key: m.productKey,
                  cells: [
                    { key: 'product', content: m.productName },
                    { key: 'confidence', content: <Lozenge appearance={CONFIDENCE[m.confidence]}>{m.confidence}</Lozenge> },
                    { key: 'lots', content: m.lotCodes.join(', ') },
                    { key: 'why', content: m.evidence.join('. ') },
                    { key: 'action', content: <Button appearance={m.confidence === 'High' ? 'primary' : 'default'} isDisabled={Boolean(busy)} onClick={() => started('start', 'startFromNotice', { text: noticeText, productKey: m.productKey })}>{busy === 'start' ? 'Starting...' : 'Start recall'}</Button> },
                  ],
                }))}
              />
            ))}
            {checkLow > 0 && (
              <Box><Button appearance="subtle" onClick={() => setShowLow({ ...showLow, check: !showLow.check })}>{showLow.check ? 'Hide' : 'Show'} {checkLow} brand-only match{checkLow === 1 ? '' : 'es'}</Button></Box>
            )}
          </Stack>

          <Stack space="space.150">
            <Heading size="small">Run a mock recall</Heading>
            <Text>Food-safety standards such as the SQF Code require the withdrawal and recall procedure to be tested at least once a year. A mock recall runs the real process and is clearly labelled.</Text>
            <Label labelFor="drill-product">Product</Label>
            <Select id="drill-product" options={(options?.products || []).map((p) => ({ label: p.name, value: p.key }))} value={drill.product} onChange={(o) => setDrill({ product: o, lots: [] })} placeholder="Choose a product" />
            <Label labelFor="drill-lots">Lots (leave empty for every lot)</Label>
            <Select id="drill-lots" isMulti options={lotOptions} value={drill.lots} onChange={(o) => setDrill({ ...drill, lots: o || [] })} placeholder="Every lot" />
            <Box>
              <Button appearance="primary" isDisabled={Boolean(busy) || !drill.product} onClick={() => started('drill', 'runDrill', { productKey: drill.product.value, lotKeys: drill.lots.map((l) => l.value) })}>
                {busy === 'drill' ? 'Starting...' : 'Start mock recall'}
              </Button>
            </Box>
          </Stack>
        </>
      )}

      <Stack space="space.150">
        <Heading size="small">Recall radar</Heading>
        <Text>
          {board.radar ? `Last scan ${time(board.radar.at)}: ${board.radar.checked} public notices checked, ${board.radar.opened} recalls opened, ${board.radar.queued} sent for review.` : 'The radar checks FDA and CPSC recall notices every hour.'}
          {board.radar?.errors?.length ? ` Some sources failed: ${board.radar.errors.join('; ')}` : ''}
        </Text>
        {queueRows.length > 0 && (
          <DynamicTable
            head={{ cells: [
              { key: 'notice', content: 'Notice', width: 30 },
              { key: 'product', content: 'Possible match', width: 26 },
              { key: 'why', content: 'Why', width: 26 },
              { key: 'action', content: '', width: 18 },
            ] }}
            rows={queueRows.map(({ item, m }) => ({
              key: `${item.notice.id}-${m.productKey}`,
              cells: [
                { key: 'notice', content: item.notice.url ? <Link href={item.notice.url} openNewTab>{item.headline}</Link> : item.headline },
                { key: 'product', content: <Inline space="space.050"><Lozenge appearance={CONFIDENCE[m.confidence]}>{m.confidence}</Lozenge><Text>{m.productName}</Text></Inline> },
                { key: 'why', content: m.evidence.join('. ') },
                { key: 'action', content: (
                  <Inline space="space.050">
                    <Button isDisabled={Boolean(busy)} onClick={() => started('review', 'startFromReview', { noticeId: item.notice.id, productKey: m.productKey })}>Start recall</Button>
                    <Button appearance="subtle" isDisabled={Boolean(busy)} onClick={async () => { await invoke('dismissReview', { noticeId: item.notice.id }); await load(); }}>Dismiss</Button>
                  </Inline>
                ) },
              ],
            }))}
          />
        )}
        {queueLow > 0 && (
          <Box><Button appearance="subtle" onClick={() => setShowLow({ ...showLow, queue: !showLow.queue })}>{showLow.queue ? 'Hide' : 'Show'} {queueLow} brand-only match{queueLow === 1 ? '' : 'es'} for review</Button></Box>
        )}
      </Stack>
      <Text><Strong>RecallReady</Strong> never sends anything to customers or regulators by itself. It prepares the records; people decide.</Text>
    </Stack>
  );
};

ForgeReconciler.render(<App />);
