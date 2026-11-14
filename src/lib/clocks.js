// Response clocks: each plan step is due a number of hours after the case opened.
export function clockStatus(startedAt, plan, milestones, now) {
  const start = Date.parse(startedAt);
  const nowMs = Date.parse(now);
  return (plan || []).map((step) => {
    const dueMs = start + Number(step.hours) * 3600e3;
    const metAt = (milestones || {})[step.key] || null;
    const status = metAt ? 'met' : nowMs > dueMs ? 'overdue' : 'due';
    const late = Boolean(metAt) && Date.parse(metAt) > dueMs;
    return { key: step.key, label: step.label, hours: Number(step.hours), dueAt: new Date(dueMs).toISOString(), status, metAt, late };
  });
}
