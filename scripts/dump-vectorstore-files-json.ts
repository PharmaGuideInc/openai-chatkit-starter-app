import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = 'https://api.openai.com/v1';

interface VectorStoreFile {
  id: string;
  object?: string;
  created_at?: number;
  vector_store_id?: string;
  // Note: some responses also include `file_id`, `status`, etc.
  [key: string]: unknown;
}

interface ListResponse<T> {
  object?: string;
  data: T[];
  first_id?: string;
  last_id?: string;
  has_more?: boolean;
  after?: string; // some endpoints return `after`
}

async function fetchAPI(endpoint: string) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    let detail: unknown;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    throw new Error(`API ${res.status}: ${JSON.stringify(detail)}`);
  }
  return res.json();
}

async function dumpVectorStoreFiles(vectorStoreId: string) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set in .env.local');
  if (!vectorStoreId) throw new Error('Vector store ID is required (argv[2] or VECTOR_STORE_ID)');

  console.log(`Dumping files for vector store: ${vectorStoreId}`);

  let all: VectorStoreFile[] = [];
  let after: string | undefined = undefined;
  let page = 0;

  do {
    page += 1;
    const qs = new URLSearchParams({ limit: '100' });
    if (after) qs.set('after', after);
    const resp: ListResponse<VectorStoreFile> = await fetchAPI(`/vector_stores/${vectorStoreId}/files?${qs.toString()}`);
    const data = Array.isArray(resp.data) ? resp.data : [];
    all = all.concat(data);
    const hasMore = resp.has_more === true;
    const nextCursor = (resp as any).after || resp.last_id; // handle either style
    after = hasMore ? nextCursor : undefined;
    console.log(`  Page ${page}: ${data.length} items`);
  } while (after);

  const outDir = path.resolve(process.cwd(), 'scripts', 'outputs');
  await fs.mkdir(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `vectorstore-${vectorStoreId}-files-${ts}.json`);

  const output = {
    object: 'list',
    data: all,
    total: all.length,
    collected_at: new Date().toISOString(),
    vector_store_id: vectorStoreId,
    source_endpoint: `/vector_stores/${vectorStoreId}/files`,
  };

  await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nWrote: ${outPath}`);
  console.log(`Total items: ${all.length}`);
}

const vectorStoreId = process.argv[2] || process.env.VECTOR_STORE_ID || '';
dumpVectorStoreFiles(vectorStoreId).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

