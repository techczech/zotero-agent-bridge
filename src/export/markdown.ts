import yaml from 'js-yaml';
import { type ZoteroAnnotation, type ZoteroAttachment, type ZoteroItem, type ZoteroNote } from '../types';

export interface MarkdownPayload {
  item: ZoteroItem;
  selectedAttachments: ZoteroAttachment[];
  exportedAttachmentFilenames: string[];
  highlights: ZoteroAnnotation[];
  notes: ZoteroNote[];
  exportedAt: Date;
}

function renderHighlights(highlights: ZoteroAnnotation[]): string {
  if (highlights.length === 0) {
    return 'None\n';
  }

  const parts: string[] = [];
  for (const [index, highlight] of highlights.entries()) {
    parts.push(`### Highlight ${index + 1}`);
    if (highlight.pageLabel) {
      parts.push(`- Page: ${highlight.pageLabel}`);
    }
    if (highlight.color) {
      parts.push(`- Color: ${highlight.color}`);
    }
    if (highlight.text && highlight.text.trim().length > 0) {
      parts.push(`> ${highlight.text.trim()}`);
    }
    if (highlight.comment && highlight.comment.trim().length > 0) {
      parts.push(`Comment: ${highlight.comment.trim()}`);
    }
    parts.push('');
  }

  return `${parts.join('\n').trim()}\n`;
}

function renderNotes(notes: ZoteroNote[]): string {
  if (notes.length === 0) {
    return 'None\n';
  }

  const parts: string[] = [];
  for (const [index, note] of notes.entries()) {
    parts.push(`### Note ${index + 1}`);
    if (note.title && note.title.trim().length > 0) {
      parts.push(`Title: ${note.title.trim()}`);
      parts.push('');
    }

    const markdown = (note.noteMarkdown ?? '').trim();
    parts.push(markdown.length > 0 ? markdown : 'Empty note content.');
    parts.push('');
  }

  return `${parts.join('\n').trim()}\n`;
}

export function buildMarkdown(payload: MarkdownPayload): string {
  const frontmatter = {
    zotero_key: payload.item.key,
    item_id: payload.item.itemId,
    library_id: payload.item.libraryId,
    library_name: payload.item.libraryName,
    item_type: payload.item.itemType,
    title: payload.item.title,
    creators: payload.item.creators.map((creator) => creator.displayName),
    year: payload.item.year ?? null,
    date: payload.item.date ?? null,
    publication_title: payload.item.publicationTitle ?? null,
    volume: payload.item.volume ?? null,
    issue: payload.item.issue ?? null,
    pages: payload.item.pages ?? null,
    publisher: payload.item.publisher ?? null,
    place: payload.item.place ?? null,
    language: payload.item.language ?? null,
    doi: payload.item.doi ?? null,
    url: payload.item.url ?? null,
    tags: payload.item.tags,
    collections: payload.item.collections,
    abstract: payload.item.abstract ?? null,
    date_added: payload.item.dateAdded ?? null,
    date_modified: payload.item.dateModified ?? null,
    extra: payload.item.extra ?? null,
    attachments: payload.exportedAttachmentFilenames,
    exported_at: payload.exportedAt.toISOString(),
  };

  const yamlContent = yaml.dump(frontmatter, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });

  const title = payload.item.title || 'Untitled';

  return `---\n${yamlContent}---\n\n# ${title}\n\n## Highlights\n\n${renderHighlights(
    payload.highlights,
  )}\n## Notes\n\n${renderNotes(payload.notes)}`;
}
