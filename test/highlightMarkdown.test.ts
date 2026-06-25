import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { buildHighlightMarkdown } from '../src/export/highlightMarkdown';
import { type ZoteroAnnotation } from '../src/types';

function parseFrontmatter(markdown: string): Record<string, unknown> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error('Missing YAML frontmatter');
  }
  return yaml.load(match[1]) as Record<string, unknown>;
}

describe('buildHighlightMarkdown', () => {
  it('renders expected YAML fields for a highlight', () => {
    const highlight: ZoteroAnnotation = {
      itemId: 31,
      parentItemId: 11,
      type: 'highlight',
      text: 'Important quote from the paper.',
      comment: 'Potential limitation for external validity.',
      color: '#ff0',
      pageLabel: '4',
      created: '2026-01-03 12:30:00',
    };

    const markdown = buildHighlightMarkdown({
      itemKey: 'ITEM1KEY',
      itemTags: ['cognition', 'methods'],
      highlight,
      highlightIndex: 1,
      sourceLink: '[[../item]]',
      exportedAt: new Date('2026-02-12T10:00:00.000Z'),
    });

    const frontmatter = parseFrontmatter(markdown);
    expect(frontmatter.type).toBe('highlight');
    expect(frontmatter.highlight_id).toBe('001');
    expect(frontmatter.page).toBe(4);
    expect(frontmatter.color).toBe('yellow');
    expect(frontmatter.color_code).toBe('#ffd400');
    expect(frontmatter.significance).toBe('limitation');
    expect(frontmatter.text).toBe('Important quote from the paper.');
    expect(frontmatter.context).toBe('Potential limitation for external validity.');
    expect(frontmatter.created).toBe('2026-01-03T12:30:00.000Z');
    expect(frontmatter.paper_key).toBe('ITEM1KEY');
    expect(frontmatter.tags).toEqual(['cognition', 'methods']);
    expect(frontmatter.links).toEqual(['[[../item]]']);
  });

  it('uses null page and defaults when values are missing', () => {
    const highlight: ZoteroAnnotation = {
      itemId: 31,
      parentItemId: 11,
      text: '',
      color: '#888888',
      pageLabel: 'A12',
    };

    const markdown = buildHighlightMarkdown({
      itemKey: 'ITEM1KEY',
      itemTags: [],
      highlight,
      highlightIndex: 12,
      sourceLink: '[[ITEM1KEY-Distributed-Cognition]]',
      exportedAt: new Date('2026-02-12T10:00:00.000Z'),
    });

    const frontmatter = parseFrontmatter(markdown);
    expect(frontmatter.highlight_id).toBe('012');
    expect(frontmatter.page).toBeNull();
    expect(frontmatter.color).toBeTypeOf('string');
    expect(frontmatter.color_code).toMatch(/^#[0-9a-f]{6}$/i);
    expect(frontmatter.significance).toBeTypeOf('string');
  });
});
