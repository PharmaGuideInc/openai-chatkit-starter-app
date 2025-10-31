import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = 'https://api.openai.com/v1';

interface VectorStoreFile {
  id: string;
  status?: string;
  [key: string]: unknown;
}

interface VectorStoreResponse {
  id: string;
  object: string;
  file_counts?: {
    in_progress?: number;
    completed?: number;
    failed?: number;
    cancelled?: number;
    total?: number;
  };
  [key: string]: unknown;
}

interface ListResponse<T> {
  data: T[];
  object?: string;
  has_more?: boolean;
  first_id?: string;
  last_id?: string;
  after?: string; // Some endpoints return an `after` cursor
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
    let errorDetail: unknown;
    try {
      errorDetail = await response.json();
    } catch {
      errorDetail = await response.text();
    }
    throw new Error(`API Error ${response.status}: ${JSON.stringify(errorDetail)}`);
  }

  return response.json();
}

async function listVectorStoreFiles(vectorStoreId: string) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env.local');
  }
  if (!vectorStoreId) {
    throw new Error('Vector store ID is required. Pass as argv[2] or set VECTOR_STORE_ID env');
  }

  console.log(`Vector Store ID: ${vectorStoreId}\n`);

  // Try to fetch summary counts from the vector store object
  try {
    const store: VectorStoreResponse = await fetchAPI(`/vector_stores/${vectorStoreId}`);
    if (store.file_counts) {
      const { in_progress = 0, completed = 0, failed = 0, cancelled = 0, total } = store.file_counts;
      console.log('File counts from vector store metadata:');
      console.log(`  - in_progress: ${in_progress}`);
      console.log(`  - completed:   ${completed}`);
      console.log(`  - failed:      ${failed}`);
      console.log(`  - cancelled:   ${cancelled}`);
      if (typeof total === 'number') {
        console.log(`  - total:       ${total}`);
      }
      console.log();
    }
  } catch (e) {
    console.log(`Warning: could not fetch vector store metadata: ${(e as Error).message}`);
  }

  // Paginate through files for an exact count and optional breakdown
  console.log('Listing vector store files via pagination...');
  let all: VectorStoreFile[] = [];
  let after: string | undefined = undefined;
  let page = 0;

  do {
    page += 1;
    const qs = new URLSearchParams({ limit: '100' });
    if (after) qs.set('after', after);
    const res: ListResponse<VectorStoreFile> = await fetchAPI(`/vector_stores/${vectorStoreId}/files?${qs.toString()}`);

    const data = Array.isArray((res as any).data) ? (res as any).data : [];
    all = all.concat(data);

    const hasMore = (res as any).has_more === true;
    const nextCursor = (res as any).after || (res as any).last_id;
    after = hasMore ? nextCursor : undefined;

    console.log(`  Page ${page}: ${data.length} files`);
  } while (after);

  console.log('\n' + '='.repeat(50));
  console.log('\nSummary');
  console.log(`Total files in vector store: ${all.length}`);

  // Optional: status breakdown
  const withStatus = all.filter(f => typeof f.status === 'string');
  if (withStatus.length) {
    const byStatus: Record<string, number> = {};
    for (const f of withStatus) {
      const s = f.status as string;
      byStatus[s] = (byStatus[s] || 0) + 1;
    }
    console.log('\nBy status:');
    for (const [s, count] of Object.entries(byStatus)) {
      console.log(`  - ${s}: ${count}`);
    }
  }
}

const vectorStoreId = process.argv[2] || process.env.VECTOR_STORE_ID || '';

listVectorStoreFiles(vectorStoreId).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

