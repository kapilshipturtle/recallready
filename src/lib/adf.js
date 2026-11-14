// Minimal Atlassian Document Format builders for work item descriptions and comments.
const textNode = (text, marks) => (marks ? { type: 'text', text, marks } : { type: 'text', text });

export function textToAdf(text) {
  const lines = String(text || '').split('\n').filter((line) => line.trim() !== '');
  return { type: 'doc', version: 1, content: lines.map((line) => ({ type: 'paragraph', content: [textNode(line)] })) };
}

// blocks: { heading } | { text, link?: { text, href } } | { bullets: string[] }
export function docFromBlocks(blocks) {
  const content = [];
  for (const block of blocks) {
    if (block.heading) {
      content.push({ type: 'heading', attrs: { level: 3 }, content: [textNode(block.heading)] });
    } else if (block.bullets) {
      if (!block.bullets.length) continue;
      content.push({
        type: 'bulletList',
        content: block.bullets.map((item) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [textNode(item)] }] })),
      });
    } else {
      const parts = [];
      if (block.text) parts.push(textNode(block.text));
      if (block.link?.href) parts.push(textNode(block.link.text || block.link.href, [{ type: 'link', attrs: { href: block.link.href } }]));
      if (parts.length) content.push({ type: 'paragraph', content: parts });
    }
  }
  return { type: 'doc', version: 1, content };
}
