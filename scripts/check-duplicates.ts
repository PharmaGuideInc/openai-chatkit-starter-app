import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = 'https://api.openai.com/v1';

interface OpenAIFile {
  id: string;
  filename: string;
  bytes: number;
  created_at: number;
  purpose?: string;
  status?: string;
  [key: string]: unknown;
}

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

async function checkDuplicates() {
  try {
    console.log('Fetching all files to check for duplicates...\n');
    
    let allFiles: OpenAIFile[] = [];
    let after: string | undefined = undefined;
    
    // Fetch all files using pagination
    do {
      const endpoint = after 
        ? `/files?limit=10000&after=${after}`
        : `/files?limit=10000`;
      
      const response = await fetchAPI(endpoint);
      const files = response.data || [];
      allFiles = allFiles.concat(files);
      
      after = response.has_more ? response.after : undefined;
    } while (after);
    
    console.log(`Total files fetched: ${allFiles.length}\n`);
    
    // Check for duplicates by filename
    const filesByName: Record<string, OpenAIFile[]> = {};
    allFiles.forEach(file => {
      const filename = file.filename;
      if (!filesByName[filename]) {
        filesByName[filename] = [];
      }
      filesByName[filename].push(file);
    });
    
    // Find duplicates
    const duplicates = Object.entries(filesByName).filter(([, files]) => files.length > 1);
    
    if (duplicates.length === 0) {
      console.log('✅ No duplicate filenames found!\n');
      return;
    }
    
    console.log('🔍 Duplicate files found:\n');
    console.log('='.repeat(50));
    
    let totalDuplicateFiles = 0;
    
    duplicates.forEach(([filename, files]) => {
      console.log(`\n📄 ${filename} (${files.length} copies)`);
      totalDuplicateFiles += files.length;
      
      files.forEach((file, index) => {
        const sizeKB = (file.bytes / 1024).toFixed(2);
        const createdDate = new Date(file.created_at * 1000).toLocaleString();
        console.log(`\n  Copy ${index + 1}:`);
        console.log(`    ID: ${file.id}`);
        console.log(`    Size: ${sizeKB} KB`);
        console.log(`    Created: ${createdDate}`);
        console.log(`    Purpose: ${file.purpose || 'N/A'}`);
        console.log(`    Status: ${file.status || 'N/A'}`);
      });
    });
    
    console.log('\n' + '='.repeat(50));
    console.log('\n📊 Summary:');
    console.log(`Total unique filenames: ${Object.keys(filesByName).length}`);
    console.log(`Total files: ${allFiles.length}`);
    console.log(`Duplicate filenames: ${duplicates.length}`);
    console.log(`Total duplicate files: ${totalDuplicateFiles}`);
    console.log(`Unique files: ${allFiles.length - (totalDuplicateFiles - duplicates.length)}\n`);
    
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}

checkDuplicates();
