import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = 'https://api.openai.com/v1';
const VECTOR_STORE_ID = 'vs_68f7cf20da288191bc7b87e142689081';

interface OpenAIFile {
  id: string;
  filename: string;
  [key: string]: unknown;
}

async function fetchAPI(endpoint: string, method = 'GET', body?: Record<string, unknown>) {
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API Error: ${JSON.stringify(error)}`);
  }

  return response.json();
}

async function attachFilesToVectorStore() {
  try {
    console.log('Step 1: Fetching all uploaded files from OpenAI...\n');
    
    // Fetch all files
    let allFiles: OpenAIFile[] = [];
    let after: string | undefined = undefined;
    
    do {
      const endpoint = after 
        ? `/files?limit=10000&after=${after}`
        : `/files?limit=10000`;
      
      const response = await fetchAPI(endpoint);
      const files = response.data || [];
      allFiles = allFiles.concat(files);
      
      after = response.has_more ? response.after : undefined;
    } while (after);
    
    console.log(`✓ Found ${allFiles.length} files to attach\n`);
    
    if (allFiles.length === 0) {
      console.log('❌ No files found to attach!\n');
      return;
    }
    
    console.log('Step 2: Attaching files to vector store...\n');
    console.log(`Vector Store ID: ${VECTOR_STORE_ID}\n`);
    console.log('='.repeat(50));
    
    const results = {
      successful: [] as string[],
      failed: [] as { file_id: string; filename: string; error: string }[],
    };
    
    // Attach files one by one
    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      
      try {
        console.log(`\n[${i + 1}/${allFiles.length}] Attaching: ${file.filename}`);
        console.log(`  File ID: ${file.id}`);
        
        const result = await fetchAPI(
          `/vector_stores/${VECTOR_STORE_ID}/files`,
          'POST',
          { file_id: file.id }
        );
        
        console.log(`  ✓ Success! Vector Store File ID: ${result.id}`);
        results.successful.push(file.filename);
        
        // Delay to avoid rate limiting (200ms between requests)
        if (i < allFiles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        const errorMsg = (error as Error).message;
        console.log(`  ✗ Failed: ${errorMsg}`);
        results.failed.push({
          file_id: file.id,
          filename: file.filename,
          error: errorMsg,
        });
        
        // Continue with next file even if one fails
        if (i < allFiles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }
    
    // Final summary
    console.log('\n' + '='.repeat(50));
    console.log('\n📊 Attachment Summary:\n');
    console.log(`Total files: ${allFiles.length}`);
    console.log(`Successfully attached: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    
    if (results.failed.length > 0) {
      console.log('\n❌ Failed attachments:');
      results.failed.forEach(({ filename, file_id, error }) => {
        console.log(`  - ${filename} (${file_id})`);
        console.log(`    Error: ${error}`);
      });
    }
    
    if (results.successful.length === allFiles.length) {
      console.log('\n✅ All files successfully attached to vector store!\n');
    } else {
      console.log(`\n⚠️  ${results.failed.length} file(s) failed to attach. See details above.\n`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    process.exit(1);
  }
}

attachFilesToVectorStore();
