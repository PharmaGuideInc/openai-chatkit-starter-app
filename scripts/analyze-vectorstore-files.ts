import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = 'https://api.openai.com/v1';

interface VectorStoreFile {
  id: string;
  object?: string;
  created_at?: number;
  vector_store_id?: string;
  file_id: string;
  status?: string;
}

interface ListResponse<T> {
  data: T[];
  has_more?: boolean;
  after?: string;
  first_id?: string;
  last_id?: string;
}

interface FileObject {
  id: string;
  object?: string;
  bytes?: number;
  created_at?: number;
  filename?: string;
  purpose?: string;
  status?: string;
}

async function fetchAPI(endpoint: string, method = 'GET') {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }
    throw new Error(`API ${response.status}: ${JSON.stringify(detail)}`);
  }

  return response.json();
}

async function mapWithConcurrency<I, O>(items: I[], limit: number, mapper: (item: I, index: number) => Promise<O>): Promise<O[]> {
  const results: O[] = new Array(items.length) as O[];
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) break;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function initialBucket(filename: string | undefined): string {
  if (!filename) return 'unknown';
  const first = filename.trim().charAt(0).toLowerCase();
  if (first >= 'a' && first <= 'z') return first;
  return 'other';
}

async function analyzeVectorStoreFiles(vectorStoreId: string) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set in .env.local');
  if (!vectorStoreId) throw new Error('Vector store ID is required (argv[2] or VECTOR_STORE_ID env)');

  console.log(`Analyzing vector store: ${vectorStoreId}\n`);

  // 1) List all vector store files (pagination)
  let allVSFiles: VectorStoreFile[] = [];
  let after: string | undefined = undefined;
  let page = 0;

  do {
    page += 1;
    const qs = new URLSearchParams({ limit: '100' });
    if (after) qs.set('after', after);
    const res: ListResponse<VectorStoreFile> = await fetchAPI(`/vector_stores/${vectorStoreId}/files?${qs.toString()}`);
    const pageData = Array.isArray(res.data) ? res.data : [];
    allVSFiles = allVSFiles.concat(pageData);

    const hasMore = res.has_more === true;
    const nextCursor = (res as any).after || res.last_id; // fallback
    after = hasMore ? nextCursor : undefined;

    console.log(`  Page ${page}: ${pageData.length} files`);
  } while (after);

  console.log(`\nTotal vector store file records: ${allVSFiles.length}`);
  if (allVSFiles.length === 0) return;

  // 2) Fetch each underlying file to get filenames (limit concurrency to be gentle)
  console.log('Fetching filenames for each file_id (concurrency=8)...');
  const details = await mapWithConcurrency(allVSFiles, 8, async (vsf) => {
    try {
      const obj: FileObject = await fetchAPI(`/files/${vsf.file_id}`);
      return { vsf, filename: obj.filename ?? undefined };
    } catch (e) {
      // Could be a phantom/failed file where /files/{id} no longer exists
      return { vsf, filename: undefined, error: (e as Error).message };
    }
  });

  // 3) Duplicate detection by filename (case-sensitive as stored)
  const byName = new Map<string, { count: number; file_ids: string[] }>();
  let unknownFilenameCount = 0;
  for (const d of details) {
    if (!d.filename) { unknownFilenameCount++; continue; }
    const entry = byName.get(d.filename) || { count: 0, file_ids: [] };
    entry.count += 1;
    entry.file_ids.push(d.vsf.file_id);
    byName.set(d.filename, entry);
  }

  const duplicates = Array.from(byName.entries()).filter(([, v]) => v.count > 1)
    .map(([name, v]) => ({ filename: name, count: v.count }));
  const totalDuplicateGroups = duplicates.length;
  const totalDuplicateFiles = duplicates.reduce((sum, d) => sum + d.count, 0);

  // 4) Counts by starting letter
  const countsByLetter = new Map<string, number>();
  for (const d of details) {
    const bucket = initialBucket(d.filename);
    countsByLetter.set(bucket, (countsByLetter.get(bucket) || 0) + 1);
  }

  // Normalize to a..z + other + unknown
  const lettersLower = Array.from('abcdefghijklmnopqrstuvwxyz');
  const lettersUpper = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  const summary: Record<string, number> = {};
  for (const l of lettersLower) summary[l] = countsByLetter.get(l) || 0;
  summary.other = countsByLetter.get('other') || 0;
  summary.unknown = countsByLetter.get('unknown') || 0;

  // 5) Output
  console.log('\n' + '='.repeat(50));
  console.log('\nDuplicates');
  console.log(`Duplicate filename groups: ${totalDuplicateGroups}`);
  console.log(`Total files that are duplicates (by name): ${totalDuplicateFiles}`);
  if (totalDuplicateGroups > 0) {
    const top = duplicates
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    console.log('\nTop duplicate filenames:');
    for (const d of top) {
      console.log(`  - ${d.filename}: ${d.count}`);
    }
    if (duplicates.length > top.length) {
      console.log(`  ...and ${duplicates.length - top.length} more`);
    }
  }

  if (unknownFilenameCount > 0) {
    console.log(`\nNote: ${unknownFilenameCount} file(s) lacked retrievable filenames (e.g., failed/phantom).`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('\nCounts by starting letter (A–Z)');
  for (let i = 0; i < lettersUpper.length; i++) {
    const upper = lettersUpper[i];
    const lower = lettersLower[i];
    console.log(`  ${upper}: ${summary[lower]}`);
  }
  console.log(`  Other: ${summary.other}`);
  console.log(`  Unknown: ${summary.unknown}`);
}

const vectorStoreId = process.argv[2] || process.env.VECTOR_STORE_ID || '';

analyzeVectorStoreFiles(vectorStoreId).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
