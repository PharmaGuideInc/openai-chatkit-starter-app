import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = 'https://api.openai.com/v1';
const LOCAL_FOLDER = 'markdown_for_vectorstore';

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

async function uploadFile(filePath: string, filename: string) {
  const fileContent = await readFile(filePath);
  const blob = new Blob([fileContent], { type: 'text/markdown' });
  
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('purpose', 'assistants');

  const response = await fetch(`${BASE_URL}/files`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Upload Error: ${JSON.stringify(error)}`);
  }

  return response.json();
}

async function uploadMissingFiles() {
  try {
    console.log('Step 1: Fetching currently uploaded files from OpenAI...\n');
    
    // Fetch all currently uploaded files
    let uploadedFiles: any[] = [];
    let after: string | undefined = undefined;
    
    do {
      const endpoint = after 
        ? `/files?limit=10000&after=${after}`
        : `/files?limit=10000`;
      
      const response = await fetchAPI(endpoint);
      const files = response.data || [];
      uploadedFiles = uploadedFiles.concat(files);
      
      after = response.has_more ? response.after : undefined;
    } while (after);
    
    console.log(`✓ Found ${uploadedFiles.length} files currently uploaded\n`);
    
    // Get list of uploaded filenames
    const uploadedFilenames = new Set(uploadedFiles.map(f => f.filename));
    
    console.log('Step 2: Scanning local markdown files...\n');
    
    // Get all local markdown files
    const localFiles = await readdir(LOCAL_FOLDER);
    const markdownFiles = localFiles.filter(f => f.endsWith('.md'));
    
    console.log(`✓ Found ${markdownFiles.length} markdown files locally\n`);
    
    // Identify missing files
    const missingFiles = markdownFiles.filter(f => !uploadedFilenames.has(f));
    
    if (missingFiles.length === 0) {
      console.log('✅ All files are already uploaded!\n');
      return;
    }
    
    console.log('Step 3: Uploading missing files...\n');
    console.log(`📤 Need to upload ${missingFiles.length} files\n`);
    console.log('='.repeat(50));
    
    const results = {
      successful: [] as string[],
      failed: [] as { filename: string; error: string }[],
    };
    
    // Upload missing files one by one
    for (let i = 0; i < missingFiles.length; i++) {
      const filename = missingFiles[i];
      const filePath = path.join(LOCAL_FOLDER, filename);
      
      try {
        console.log(`\n[${i + 1}/${missingFiles.length}] Uploading: ${filename}`);
        
        const result = await uploadFile(filePath, filename);
        
        const sizeKB = (result.bytes / 1024).toFixed(2);
        console.log(`  ✓ Success! File ID: ${result.id}, Size: ${sizeKB} KB`);
        
        results.successful.push(filename);
        
        // Small delay to avoid rate limiting
        if (i < missingFiles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.log(`  ✗ Failed: ${(error as Error).message}`);
        results.failed.push({
          filename,
          error: (error as Error).message,
        });
      }
    }
    
    // Final summary
    console.log('\n' + '='.repeat(50));
    console.log('\n📊 Upload Summary:\n');
    console.log(`Total files to upload: ${missingFiles.length}`);
    console.log(`Successfully uploaded: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    
    if (results.failed.length > 0) {
      console.log('\n❌ Failed uploads:');
      results.failed.forEach(({ filename, error }) => {
        console.log(`  - ${filename}: ${error}`);
      });
    }
    
    // Verify final count
    console.log('\nStep 4: Verifying final count...\n');
    
    let finalFiles: any[] = [];
    after = undefined;
    
    do {
      const endpoint = after 
        ? `/files?limit=10000&after=${after}`
        : `/files?limit=10000`;
      
      const response = await fetchAPI(endpoint);
      const files = response.data || [];
      finalFiles = finalFiles.concat(files);
      
      after = response.has_more ? response.after : undefined;
    } while (after);
    
    console.log(`✓ Total files in OpenAI: ${finalFiles.length}`);
    console.log(`✓ Expected files: ${markdownFiles.length}`);
    
    if (finalFiles.length === markdownFiles.length) {
      console.log('\n✅ All files successfully uploaded!\n');
    } else {
      console.log(`\n⚠️  File count mismatch. Missing ${markdownFiles.length - finalFiles.length} files.\n`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    process.exit(1);
  }
}

uploadMissingFiles();
