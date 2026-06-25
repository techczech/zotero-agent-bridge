import yaml from 'js-yaml';
import { type ZoteroAnnotation } from '../types';

export type HighlightColor = 'yellow' | 'red' | 'green' | 'blue';
export type HighlightSignificance =
  | 'main-finding'
  | 'critical-result'
  | 'method'
  | 'discussion'
  | 'limitation';

interface HighlightColorDefinition {
  color: HighlightColor;
  colorCode: string;
  aliases: string[];
  defaultSignificance: HighlightSignificance;
}

const HIGHLIGHT_COLOR_DEFINITIONS: HighlightColorDefinition[] = [
  {
    color: 'yellow',
    colorCode: '#ffd400',
    aliases: ['yellow', '#ff0', '#ffff00'],
    defaultSignificance: 'main-finding',
  },
  {
    color: 'red',
    colorCode: '#ff6666',
    aliases: ['red'],
    defaultSignificance: 'critical-result',
  },
  {
    color: 'green',
    colorCode: '#5fb236',
    aliases: ['green'],
    defaultSignificance: 'method',
  },
  {
    color: 'blue',
    colorCode: '#2ea8e5',
    aliases: ['blue'],
    defaultSignificance: 'discussion',
  },
];

const DEFAULT_COLOR = HIGHLIGHT_COLOR_DEFINITIONS[0];

function normalizeColorToken(rawColor?: string): string | undefined {
  if (!rawColor) {
    return undefined;
  }

  const normalized = rawColor.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (!normalized.startsWith('#')) {
    return normalized;
  }

  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(normalized)) {
    return normalized;
  }

  if (normalized.length === 4) {
    const [r, g, b] = normalized.slice(1);
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return normalized;
}

function parseHexToRgb(colorCode: string): [number, number, number] | undefined {
  const match = colorCode.match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    return undefined;
  }

  const value = match[1];
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function colorDistance(left: [number, number, number], right: [number, number, number]): number {
  const dr = left[0] - right[0];
  const dg = left[1] - right[1];
  const db = left[2] - right[2];
  return dr * dr + dg * dg + db * db;
}

function resolveHighlightColorDefinition(rawColor?: string): HighlightColorDefinition {
  const normalized = normalizeColorToken(rawColor);
  if (!normalized) {
    return DEFAULT_COLOR;
  }

  const byAlias = HIGHLIGHT_COLOR_DEFINITIONS.find((entry) => entry.aliases.includes(normalized));
  if (byAlias) {
    return byAlias;
  }

  if (!normalized.startsWith('#')) {
    return DEFAULT_COLOR;
  }

  const rgb = parseHexToRgb(normalized);
  if (!rgb) {
    return DEFAULT_COLOR;
  }

  let best = DEFAULT_COLOR;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of HIGHLIGHT_COLOR_DEFINITIONS) {
    const candidateRgb = parseHexToRgb(entry.colorCode);
    if (!candidateRgb) {
      continue;
    }
    const distance = colorDistance(rgb, candidateRgb);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return best;
}

function inferSignificance(comment: string | undefined, color: HighlightColorDefinition): HighlightSignificance {
  const normalized = (comment ?? '').toLowerCase();
  if (normalized.includes('limit')) {
    return 'limitation';
  }
  if (normalized.includes('method') || normalized.includes('protocol')) {
    return 'method';
  }
  if (normalized.includes('critical') || normalized.includes('key result')) {
    return 'critical-result';
  }
  if (normalized.includes('main finding') || normalized.includes('finding')) {
    return 'main-finding';
  }
  if (normalized.includes('discussion')) {
    return 'discussion';
  }
  return color.defaultSignificance;
}

function parsePage(pageLabel: string | undefined): number | null {
  if (!pageLabel) {
    return null;
  }

  const value = Number.parseInt(pageLabel.trim(), 10);
  return Number.isNaN(value) ? null : value;
}

function toIsoTimestamp(rawValue: string | undefined, fallback: Date): string {
  if (!rawValue || rawValue.trim().length === 0) {
    return fallback.toISOString();
  }

  const trimmed = rawValue.trim();
  const withTimeSeparator = trimmed.includes(' ') ? trimmed.replace(' ', 'T') : trimmed;
  const withTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(withTimeSeparator)
    ? withTimeSeparator
    : `${withTimeSeparator}Z`;

  const parsed = new Date(withTimezone);
  if (Number.isNaN(parsed.getTime())) {
    return fallback.toISOString();
  }

  return parsed.toISOString();
}

export interface HighlightMarkdownPayload {
  itemKey: string;
  itemTags: string[];
  highlight: ZoteroAnnotation;
  highlightIndex: number;
  sourceLink: string;
  exportedAt: Date;
}

export function buildHighlightMarkdown(payload: HighlightMarkdownPayload): string {
  const definition = resolveHighlightColorDefinition(payload.highlight.color);
  const text = payload.highlight.text?.trim() || payload.highlight.comment?.trim() || '';
  const context = payload.highlight.comment?.trim() || null;
  const highlightId = String(payload.highlightIndex).padStart(3, '0');

  const frontmatter = {
    type: 'highlight',
    highlight_id: highlightId,
    page: parsePage(payload.highlight.pageLabel),
    color: definition.color,
    color_code: definition.colorCode,
    significance: inferSignificance(payload.highlight.comment, definition),
    text,
    context,
    created: toIsoTimestamp(payload.highlight.created, payload.exportedAt),
    paper_key: payload.itemKey,
    tags: payload.itemTags,
    links: [payload.sourceLink],
  };

  const yamlContent = yaml.dump(frontmatter, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });

  return `---\n${yamlContent}---\n`;
}
