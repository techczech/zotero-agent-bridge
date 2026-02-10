import { describe, expect, it } from 'vitest';
import { buildMarkdown } from '../src/export/markdown';
import { type ZoteroItem } from '../src/types';

const baseItem: ZoteroItem = {
  itemId: 1,
  key: 'ABCD1234',
  libraryId: 1,
  libraryName: 'My Library',
  itemType: 'journalArticle',
  title: 'Distributed Cognition',
  creators: [
    {
      orderIndex: 0,
      displayName: 'Hutchins, Edwin',
      firstName: 'Edwin',
      lastName: 'Hutchins',
      creatorType: 'author',
    },
  ],
  year: '1995',
  date: '1995',
  publicationTitle: 'Cognitive Science',
  volume: '12',
  issue: '3',
  pages: '12-15',
  publisher: 'MIT',
  place: 'Cambridge',
  language: 'en',
  doi: '10.1234/abcd',
  url: 'https://example.com',
  tags: ['cognition'],
  collections: ['Theory'],
  abstract: 'Abstract',
  dateAdded: '2024-01-01',
  dateModified: '2024-01-02',
  extra: 'extra',
  attachments: [],
  notes: [],
  annotations: [],
};

describe('buildMarkdown', () => {
  it('renders frontmatter and sections', () => {
    const markdown = buildMarkdown({
      item: baseItem,
      selectedAttachments: [],
      exportedAttachmentFilenames: ['paper.pdf'],
      highlights: [
        {
          itemId: 100,
          parentItemId: 10,
          text: 'Important excerpt',
          pageLabel: '4',
          color: '#ffee00',
        },
      ],
      notes: [
        {
          itemId: 200,
          parentItemId: 1,
          title: 'My note',
          noteHtml: '<p>Note</p>',
          noteMarkdown: 'Note content',
        },
      ],
      exportedAt: new Date('2026-02-10T12:00:00.000Z'),
    });

    expect(markdown).toContain('zotero_key: ABCD1234');
    expect(markdown).toContain('# Distributed Cognition');
    expect(markdown).toContain('## Highlights');
    expect(markdown).toContain('Important excerpt');
    expect(markdown).toContain('## Notes');
    expect(markdown).toContain('Note content');
  });

  it('renders None placeholders for empty sections', () => {
    const markdown = buildMarkdown({
      item: baseItem,
      selectedAttachments: [],
      exportedAttachmentFilenames: [],
      highlights: [],
      notes: [],
      exportedAt: new Date('2026-02-10T12:00:00.000Z'),
    });

    expect(markdown).toContain('## Highlights\n\nNone');
    expect(markdown).toContain('## Notes\n\nNone');
  });
});
