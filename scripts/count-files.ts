import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = 'https://api.openai.com/v1';

async function fetchAPI(endpoint: string) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API Error: ${JSON.stringify(error)}`);
  }

  return response.json();
}

async function countFiles() {
  try {
    console.log('Counting files in OpenAI account...\n');
    
    let totalCount = 0;
    let after: string | undefined = undefined;
    let pageCount = 0;
    
    // Fetch all files using pagination
    do {
      pageCount++;
      const endpoint = after 
        ? `/files?limit=10000&after=${after}`
        : `/files?limit=10000`;
      
      const response = await fetchAPI(endpoint);
      const files = response.data || [];
      totalCount += files.length;
      
      console.log(`Page ${pageCount}: ${files.length} files`);
      
      // Check if there are more files to fetch
      after = response.has_more ? response.after : undefined;
    } while (after);
    
    console.log('\n' + '='.repeat(50));
    console.log(`\n📊 Total files in OpenAI account: ${totalCount}\n`);
    
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}

countFiles();
