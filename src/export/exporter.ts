import { promises as fs } from 'node:fs';
import path from 'node:path';
import TurndownService from 'turndown';
import { type Database } from 'sql.js';
import {
  type ExportOptions,
  type ExportResult,
  type LayoutMode,
  type ZoteroAnnotation,
  type ZoteroAttachment,
  type ZoteroItem,
  type ZoteroItemSummary,
  type ZoteroNote,
} from '../types';
import { buildMarkdown } from './markdown';
import { buildHighlightMarkdown } from './highlightMarkdown';
import {
  type ItemOutputPaths,
  buildItemSlug,
  makeUniqueFilePath,
  pathExists,
  resolveItemOutputPaths,
  sanitizeFilename,
} from './naming';
import { getItemExportData } from '../zotero/queries';

function resolveAttachmentSourcePath(storagePath: string, attachment: ZoteroAttachment): string | undefined {
  const attachmentPath = attachment.path;
  if (!attachmentPath) {
    return undefined;
  }

  if (attachmentPath.startsWith('storage:')) {
    const relativePart = attachmentPath.slice('storage:'.length).replace(/^[/\\]+/, '');
    const filename = relativePart || attachment.filename || `${attachment.key}.pdf`;
    return path.join(storagePath, attachment.key, filename);
  }

  if (path.isAbsolute(attachmentPath)) {
    return attachmentPath;
  }

  if (/^[A-Za-z]:\\/.test(attachmentPath)) {
    return attachmentPath;
  }

  return undefined;
}

function getTargetPdfPath(
  markdownPath: string,
  layoutMode: LayoutMode,
  flatPrefix: string | undefined,
  sourceFilename: string,
): string {
  const sanitized = sanitizeFilename(sourceFilename);
  const directory = path.dirname(markdownPath);

  if (layoutMode === 'flat') {
    return path.join(directory, `${flatPrefix ?? ''}${sanitized}`);
  }

  return path.join(directory, sanitized);
}

async function removeExistingTarget(
  outputRoot: string,
  markdownPath: string,
  itemFolder: string | undefined,
  flatPrefix: string | undefined,
): Promise<void> {
  if (itemFolder) {
    if (await pathExists(itemFolder)) {
      await fs.rm(itemFolder, { recursive: true, force: true });
    }
    return;
  }

  if (await pathExists(markdownPath)) {
    await fs.rm(markdownPath, { force: true });
  }

  if (!flatPrefix) {
    return;
  }

  if (!(await pathExists(outputRoot))) {
    return;
  }

  const entries = await fs.readdir(outputRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (entry.name.startsWith(flatPrefix)) {
      await fs.rm(path.join(outputRoot, entry.name), { force: true });
    }
  }
}

async function convertNotesToMarkdown(notes: ZoteroNote[]): Promise<ZoteroNote[]> {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });

  return notes.map((note) => {
    const html = note.noteHtml || '';
    const markdown = html.trim().length > 0 ? turndown.turndown(html) : '';
    return {
      ...note,
      noteMarkdown: markdown,
    };
  });
}

function appendWarning(result: ExportResult, outputChannel: ExportOptions['outputChannel'], warning: string): void {
  result.warnings.push(warning);
  outputChannel.appendLine(`[warning] ${warning}`);
}

function isHighlightAnnotation(annotation: ZoteroAnnotation): boolean {
  const annotationType = annotation.type?.trim().toLowerCase();
  return annotationType === undefined || annotationType.length === 0 || annotationType === 'highlight';
}

function toWikiLink(fromFilePath: string, targetMarkdownPath: string): string {
  const relativePath = path.relative(path.dirname(fromFilePath), targetMarkdownPath).replace(/\\/g, '/');
  const withoutExt = relativePath.replace(/\.md$/i, '');
  return `[[${withoutExt}]]`;
}

function getHighlightFilePath(
  outputRoot: string,
  outputPaths: ItemOutputPaths,
  highlightId: string,
): string {
  const filename = `highlight-${highlightId}.md`;
  if (outputPaths.itemFolder) {
    return path.join(outputPaths.itemFolder, 'highlights', filename);
  }

  return path.join(outputRoot, `${outputPaths.flatPrefix ?? ''}${filename}`);
}

async function exportHighlightMarkdownFiles(
  outputRoot: string,
  outputPaths: ItemOutputPaths,
  item: ZoteroItem,
  highlights: ZoteroAnnotation[],
  exportedAt: Date,
): Promise<number> {
  let exportedCount = 0;
  for (const [index, highlight] of highlights.entries()) {
    const highlightId = String(index + 1).padStart(3, '0');
    const highlightPath = getHighlightFilePath(outputRoot, outputPaths, highlightId);
    await fs.mkdir(path.dirname(highlightPath), { recursive: true });

    const markdown = buildHighlightMarkdown({
      itemKey: item.key,
      itemTags: item.tags,
      highlight,
      highlightIndex: index + 1,
      sourceLink: toWikiLink(highlightPath, outputPaths.markdownPath),
      exportedAt,
    });

    await fs.writeFile(highlightPath, markdown, 'utf8');
    exportedCount += 1;
  }

  return exportedCount;
}

export async function exportItems(
  db: Database,
  itemSummaries: ZoteroItemSummary[],
  options: ExportOptions,
): Promise<ExportResult> {
  const outputRoot = options.outputRootPath;
  await fs.mkdir(outputRoot, { recursive: true });

  const result: ExportResult = {
    exported: 0,
    skipped: 0,
    failed: 0,
    cancelled: false,
    warnings: [],
    itemOutcomes: [],
  };

  for (const summary of itemSummaries) {
    try {
      const item = getItemExportData(db, summary.itemId);
      const slug = buildItemSlug(item);
      const outputPaths = resolveItemOutputPaths(outputRoot, options.layoutMode, slug, item.year);
      const existingTarget = outputPaths.itemFolder ?? outputPaths.markdownPath;
      let outcomeAction: 'exported-new' | 'exported-overwrite' = 'exported-new';

      if (await pathExists(existingTarget)) {
        const decision = await options.resolveConflict(existingTarget, item);
        if (decision === 'cancel') {
          result.cancelled = true;
          break;
        }
        if (decision === 'skip') {
          result.skipped += 1;
          result.itemOutcomes.push({
            itemId: item.itemId,
            key: item.key,
            title: item.title,
            action: 'skipped-conflict',
            targetPath: existingTarget,
          });
          continue;
        }

        await removeExistingTarget(
          outputRoot,
          outputPaths.markdownPath,
          outputPaths.itemFolder,
          outputPaths.flatPrefix,
        );
        outcomeAction = 'exported-overwrite';
      }

      await fs.mkdir(path.dirname(outputPaths.markdownPath), { recursive: true });

      const pdfAttachments = item.attachments.filter((attachment) => attachment.isPdf);
      let selectedPdfs: ZoteroAttachment[];

      if (pdfAttachments.length > 1) {
        selectedPdfs = await options.selectPdfAttachments(item, pdfAttachments);
      } else {
        selectedPdfs = pdfAttachments;
      }

      const selectedPdfIds = new Set(selectedPdfs.map((attachment) => attachment.itemId));
      const copiedPdfNames: string[] = [];

      for (const attachment of selectedPdfs) {
        const sourcePath = resolveAttachmentSourcePath(options.storagePath, attachment);
        if (!sourcePath) {
          appendWarning(
            result,
            options.outputChannel,
            `Item ${item.key}: unsupported attachment path format for ${attachment.filename ?? attachment.key}`,
          );
          continue;
        }

        if (!(await pathExists(sourcePath))) {
          appendWarning(
            result,
            options.outputChannel,
            `Item ${item.key}: attachment file not found at ${sourcePath}`,
          );
          continue;
        }

        const desiredTargetPath = getTargetPdfPath(
          outputPaths.markdownPath,
          options.layoutMode,
          outputPaths.flatPrefix,
          attachment.filename ?? `${attachment.key}.pdf`,
        );
        const targetPath = await makeUniqueFilePath(desiredTargetPath);
        await fs.copyFile(sourcePath, targetPath);
        copiedPdfNames.push(path.basename(targetPath));
      }

      const filteredHighlights = item.annotations.filter((annotation) =>
        selectedPdfIds.has(annotation.parentItemId),
      );
      const fileHighlights = filteredHighlights.filter(isHighlightAnnotation);

      const filteredNotes = item.notes.filter(
        (note) => note.parentItemId === item.itemId || selectedPdfIds.has(note.parentItemId),
      );
      const noteMarkdown = await convertNotesToMarkdown(filteredNotes);
      const exportedAt = options.now ?? new Date();

      const markdown = buildMarkdown({
        item,
        selectedAttachments: selectedPdfs,
        exportedAttachmentFilenames: copiedPdfNames,
        highlights: filteredHighlights,
        notes: noteMarkdown,
        exportedAt,
      });

      await fs.writeFile(outputPaths.markdownPath, markdown, 'utf8');

      if (options.exportHighlightsAsMarkdownFiles) {
        const highlightFileCount = await exportHighlightMarkdownFiles(
          outputRoot,
          outputPaths,
          item,
          fileHighlights,
          exportedAt,
        );
        options.outputChannel.appendLine(
          `Exported ${highlightFileCount} highlight file(s) for ${item.key}.`,
        );
      }

      result.exported += 1;
      result.itemOutcomes.push({
        itemId: item.itemId,
        key: item.key,
        title: item.title,
        action: outcomeAction,
        targetPath: outputPaths.markdownPath,
      });
      options.outputChannel.appendLine(`Exported ${item.key} -> ${outputPaths.markdownPath}`);
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      result.itemOutcomes.push({
        itemId: summary.itemId,
        key: summary.key,
        title: summary.title,
        action: 'failed',
        error: message,
      });
      options.outputChannel.appendLine(
        `[error] Failed exporting item ${summary.key} (${summary.title}): ${message}`,
      );
    }
  }

  return result;
}

export function buildConflictTargetLabel(item: ZoteroItem, targetPath: string): string {
  return `${item.title || item.key} (${targetPath})`;
}
