// Public recall feeds. Only public data is fetched; nothing about the customer is sent.
import api from '@forge/api';
import { cleanCpsc } from '../lib/radar.js';

const compact = (ymd) => ymd.replace(/-/g, '');

// openFDA enforcement reports. A 404 with "No matches found!" means an empty result.
export async function fetchFda(kind, sinceYmd, untilYmd) {
  const out = [];
  let skip = 0;
  for (;;) {
    const url = `https://api.fda.gov/${kind}/enforcement.json?search=report_date:%5B${compact(sinceYmd)}+TO+${compact(untilYmd)}%5D&limit=100&skip=${skip}`;
    const res = await api.fetch(url);
    if (res.status === 404) break;
    if (!res.ok) throw new Error(`FDA ${kind} feed returned ${res.status}`);
    const data = await res.json();
    const results = data?.results || [];
    out.push(...results);
    if (results.length < 100 || out.length >= 500) break;
    skip += 100;
  }
  return out;
}

export async function fetchCpsc(sinceYmd) {
  const res = await api.fetch(`https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=${sinceYmd}`);
  if (!res.ok) throw new Error(`CPSC feed returned ${res.status}`);
  const { records, error } = cleanCpsc(await res.json());
  if (error && !records.length) throw new Error(`CPSC feed: ${error}`);
  return records;
}
