import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = 'https://api.openai.com/v1';

interface VectorStoreFile {
  id: string;
  file_id: string;
  status?: string;
  created_at?: number; // vector store file creation (not always needed)
}

interface ListResponse<T> {
  data: T[];
  has_more?: boolean;
  after?: string;
  last_id?: string;
}

interface FileObject {
  id: string;
  filename?: string;
  created_at?: number; // epoch seconds
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
    try { detail = await response.json(); } catch { detail = await response.text(); }
    throw new Error(`API ${response.status}: ${JSON.stringify(detail)}`);
  }
  return response.json();
}

async function mapWithConcurrency<I, O>(items: I[], limit: number, mapper: (item: I, index: number) => Promise<O>): Promise<O[]> {
  const results: O[] = new Array(items.length) as O[];
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await mapper(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function exportVectorStoreFileNames(vectorStoreId: string) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set in .env.local');
  if (!vectorStoreId) throw new Error('Vector store ID is required (argv[2] or VECTOR_STORE_ID)');

  console.log(`Exporting filenames for vector store: ${vectorStoreId}`);

  // 1) List all vector store files
  let vsFiles: VectorStoreFile[] = [];
  let after: string | undefined = undefined;
  let page = 0;
  do {
    page += 1;
    const qs = new URLSearchParams({ limit: '100' });
    if (after) qs.set('after', after);
    const res: ListResponse<VectorStoreFile> = await fetchAPI(`/vector_stores/${vectorStoreId}/files?${qs.toString()}`);
    const pageData = Array.isArray(res.data) ? res.data : [];
    vsFiles = vsFiles.concat(pageData);
    const hasMore = res.has_more === true;
    const nextCursor = (res as any).after || res.last_id;
    after = hasMore ? nextCursor : undefined;
    console.log(`  Page ${page}: ${pageData.length} files`);
  } while (after);

  console.log(`Total vector store file records: ${vsFiles.length}`);
  if (vsFiles.length === 0) {
    console.log('No files to export.');
    return;
  }

  // 2) Fetch underlying file objects to get filename + created_at
  console.log('Fetching file metadata (concurrency=8)...');
  const details = await mapWithConcurrency(vsFiles, 8, async (v) => {
    try {
      const f: FileObject = await fetchAPI(`/files/${v.file_id}`);
      return { file_id: v.file_id, filename: f.filename, created_at: f.created_at ?? 0 };
    } catch (e) {
      return { file_id: v.file_id, filename: undefined, created_at: Number.MAX_SAFE_INTEGER };
    }
  });

  // 3) Sort by created_at ascending; unknowns at the end
  const known = details.filter(d => !!d.filename) as { file_id: string; filename: string; created_at: number }[];
  const unknown = details.filter(d => !d.filename);
  known.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

  // 4) Prepare outputs
  const outDir = path.resolve(process.cwd(), 'scripts', 'outputs');
  await fs.mkdir(outDir, { recursive: true });
  const base = `vectorstore-${vectorStoreId}-filenames`;
  const mdPath = path.join(outDir, `${base}.md`);
  const txtPath = path.join(outDir, `${base}.txt`);

  const mdLines: string[] = [];
  mdLines.push(`# Filenames for Vector Store ${vectorStoreId}`);
  mdLines.push('');
  mdLines.push(`Total files with names: ${known.length}`);
  if (unknown.length) mdLines.push(`Files without retrievable names (skipped): ${unknown.length}`);
  mdLines.push('');
  for (const d of known) {
    mdLines.push(`- ${d.filename}`);
  }

  const txtLines = known.map(d => d.filename);

  await fs.writeFile(mdPath, mdLines.join('\n'), 'utf8');
  await fs.writeFile(txtPath, txtLines.join('\n'), 'utf8');

  console.log('\nWrote:');
  console.log(`  ${mdPath}`);
  console.log(`  ${txtPath}`);
}

const vectorStoreId = process.argv[2] || process.env.VECTOR_STORE_ID || '';
exportVectorStoreFileNames(vectorStoreId).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

