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
  status_details?: string;
  [key: string]: unknown;
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
    const error = await response.json();
    throw new Error(`API Error: ${JSON.stringify(error)}`);
  }

  return response.json();
}

async function listAllFiles() {
  try {
    console.log('Fetching all files from OpenAI...\n');
    
    // List all files with pagination
    let allFiles: OpenAIFile[] = [];
    let after: string | undefined = undefined;
    
    do {
      const endpoint = after 
        ? `/files?limit=100&after=${after}`
        : `/files?limit=100`;
      
      const response = await fetchAPI(endpoint);
      const files = response.data || [];
      allFiles = allFiles.concat(files);
      
      after = response.has_more ? response.after : undefined;
    } while (after);
    
    console.log(`Total files in OpenAI account: ${allFiles.length}\n`);
    
    if (allFiles.length === 0) {
      console.log('No files found.');
      return;
    }
    
    // Group files by purpose
    const filesByPurpose: Record<string, OpenAIFile[]> = {};
    allFiles.forEach(file => {
      const purpose = file.purpose || 'unknown';
      if (!filesByPurpose[purpose]) {
        filesByPurpose[purpose] = [];
      }
      filesByPurpose[purpose].push(file);
    });
    
    // Display files grouped by purpose
    console.log('Files grouped by purpose:\n');
    for (const [purpose, files] of Object.entries(filesByPurpose)) {
      console.log(`📁 ${purpose.toUpperCase()} (${files.length} files)`);
      files.forEach(file => {
        const sizeKB = (file.bytes / 1024).toFixed(2);
        const createdDate = new Date(file.created_at * 1000).toLocaleString();
        console.log(`   • ${file.filename}`);
        console.log(`     ID: ${file.id}`);
        console.log(`     Size: ${sizeKB} KB`);
        console.log(`     Created: ${createdDate}`);
        console.log(`     Status: ${file.status || 'N/A'}`);
        if (file.status_details) {
          console.log(`     Status Details: ${file.status_details}`);
        }
        console.log();
      });
    }
    
    // Summary statistics
    console.log('='.repeat(50));
    console.log('\n📊 Summary:\n');
    
    const totalSize = allFiles.reduce((sum, file) => sum + (file.bytes || 0), 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    
    console.log(`Total files: ${allFiles.length}`);
    console.log(`Total storage used: ${totalSizeMB} MB`);
    console.log(`\nFiles by purpose:`);
    for (const [purpose, files] of Object.entries(filesByPurpose)) {
      console.log(`  - ${purpose}: ${files.length} files`);
    }
    
    // Check for files with status
    const filesWithStatus = allFiles.filter(f => f.status);
    if (filesWithStatus.length > 0) {
      console.log(`\nFiles with status:`);
      const statusGroups: Record<string, number> = {};
      filesWithStatus.forEach(f => {
        if (f.status) {
          statusGroups[f.status] = (statusGroups[f.status] || 0) + 1;
        }
      });
      for (const [status, count] of Object.entries(statusGroups)) {
        console.log(`  - ${status}: ${count} files`);
      }
    }
    
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}

listAllFiles();
