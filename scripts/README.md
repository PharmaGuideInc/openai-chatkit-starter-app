# OpenAI File Management Scripts

This directory contains utility scripts for managing files and vector stores in OpenAI.

## Prerequisites

1. **Environment Variables**: Create a `.env.local` file in the project root with:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```

2. **Dependencies**: Install required packages:
   ```bash
   npm install
   ```

## Available Scripts

### 1. Count Files (`count-files.ts`)
Quickly check the total number of files in your OpenAI account.

```bash
npx tsx scripts/count-files.ts
```

**Output:**
- Total file count
- Page-by-page breakdown

---

### 2. Check for Duplicates (`check-duplicates.ts`)
Identify files with duplicate filenames in your OpenAI account.

```bash
npx tsx scripts/check-duplicates.ts
```

**Output:**
- List of duplicate filenames (if any)
- Details for each duplicate (file ID, size, creation date, purpose, status)
- Summary statistics

---

### 3. List All Files (`list-all-files.ts`)
Get a detailed view of all files in your OpenAI account.

```bash
npx tsx scripts/list-all-files.ts
```

**Output:**
- Files grouped by purpose
- File details (ID, filename, size, creation date, status)
- Summary statistics (total files, storage used, breakdown by purpose and status)

---

### 4. Upload Missing Files (`upload-missing-files.ts`)
Upload files from a local directory that don't exist in OpenAI yet.

**Configuration:**
- Edit `LOCAL_FOLDER` constant in the script (default: `markdown_for_vectorstore`)
- Files must have `.md` extension

**Usage:**
```bash
npx tsx scripts/upload-missing-files.ts
```

**Process:**
1. Fetches all currently uploaded files from OpenAI
2. Scans local directory for markdown files
3. Identifies missing files
4. Uploads each missing file with `purpose: "assistants"`
5. Shows progress and final summary

**Output:**
- Progress for each file upload
- Success/failure status
- Final verification of total file count

**Notes:**
- Individual files must be under 512 MB
- Total storage limit is 1 TB per organization
- Small delay (100ms) between uploads to avoid rate limiting

---

### 5. Attach Files to Vector Store (`attach-files-to-vectorstore.ts`)
Attach all uploaded files to a specific vector store.

**Configuration:**
1. Edit `VECTOR_STORE_ID` constant in the script with your vector store ID

**Usage:**
```bash
npx tsx scripts/attach-files-to-vectorstore.ts
```

**Process:**
1. Fetches all files from your OpenAI account
2. Attaches each file to the specified vector store
3. Shows progress and final summary

**Output:**
- Progress for each file attachment
- Success/failure status
- Final summary

**Notes:**
- 200ms delay between requests to avoid rate limiting
- Continues with remaining files even if some fail
- Each file attachment creates a vector store file object

---

### 6. List Vector Store Files (`list-vectorstore-files.ts`)
List and count files attached to a specific vector store.

**Usage:**
```bash
npx tsx scripts/list-vectorstore-files.ts <VECTOR_STORE_ID>
# example:
npx tsx scripts/list-vectorstore-files.ts vs_68fbb131bad08191b5ddbb1fc60de79a
```

You can also set `VECTOR_STORE_ID` in the environment instead of passing an argument.

**Output:**
- Total files in the vector store
- Optional breakdown by file status (completed, failed, etc.)

---

### 7. Analyze Vector Store Files (`analyze-vectorstore-files.ts`)
Detect duplicate filenames and count how many files start with each letter.

**Usage:**
```bash
npx tsx scripts/analyze-vectorstore-files.ts <VECTOR_STORE_ID>
# example:
npx tsx scripts/analyze-vectorstore-files.ts vs_68fbb131bad08191b5ddbb1fc60de79a
```

**What it does:**
- Paginates `/vector_stores/{id}/files` to collect all vector store file entries
- Fetches each underlying file (`/files/{file_id}`) to read `filename`
- Reports duplicate filenames (groups and totals)
- Prints counts by starting letter (A–Z, Other, Unknown)

Notes:
- Some failed/phantom entries may not have retrievable filenames; these are counted as `unknown`.

---

### 8. Export Vector Store Filenames (`export-vectorstore-file-names.ts`)
Write all filenames from a vector store to files in timestamp ascending order.

**Usage:**
```bash
npx tsx scripts/export-vectorstore-file-names.ts <VECTOR_STORE_ID>
# example:
npx tsx scripts/export-vectorstore-file-names.ts vs_68fbb131bad08191b5ddbb1fc60de79a
```

**Output:**
- `scripts/outputs/vectorstore-<id>-filenames.md` (Markdown list, filenames only)
- `scripts/outputs/vectorstore-<id>-filenames.txt` (one filename per line)

Notes:
- Sorted by file creation time (ascending) based on the underlying `/files/{file_id}` `created_at`.
- Files whose filenames cannot be retrieved (e.g., failed/phantom entries) are skipped in the lists and counted in the header.

---

### 9. Dump Vector Store Files JSON (`dump-vectorstore-files-json.ts`)
Fetch all vector store file entries and write the raw JSON to disk.

**Usage:**
```bash
npx tsx scripts/dump-vectorstore-files-json.ts <VECTOR_STORE_ID>
# example:
npx tsx scripts/dump-vectorstore-files-json.ts vs_68fbb131bad08191b5ddbb1fc60de79a
```

**Output:**
- `scripts/outputs/vectorstore-<id>-files-<timestamp>.json`
- Contains the combined list response: `{ object: "list", data: [...], total, collected_at, vector_store_id }`

Notes:
- This is the direct data from `/vector_stores/{id}/files` across all pages. It may not include filenames; use this together with `/files/{file_id}` where available if you need more detail.

---

## Complete Workflow: Upload & Attach Files

To upload files and attach them to a vector store from scratch:

### Step 1: Prepare Your Files
Place all markdown files in the `markdown_for_vectorstore/` directory (or update the `LOCAL_FOLDER` constant).

### Step 2: Upload Files to OpenAI
```bash
npx tsx scripts/upload-missing-files.ts
```

This will:
- Check which files are already uploaded
- Upload only the missing ones
- Verify the final count

### Step 3: Get or Create a Vector Store
Create a vector store via OpenAI API or dashboard. Note the vector store ID (format: `vs_xxxxx`).

### Step 4: Update Vector Store ID
Edit `scripts/attach-files-to-vectorstore.ts` and update:
```typescript
const VECTOR_STORE_ID = 'vs_your_vector_store_id_here';
```

### Step 5: Attach Files to Vector Store
```bash
npx tsx scripts/attach-files-to-vectorstore.ts
```

This will attach all 224 files to your vector store.

### Step 6: Verify
Check your vector store in the OpenAI dashboard or via API to confirm all files are attached.

---

## Troubleshooting

### "No such File object" errors
If you get errors about missing file objects, the underlying files may have been deleted. Use `list-all-files.ts` to check current file status.

### Rate Limiting
If you encounter rate limits:
- The scripts include automatic delays between requests
- For persistent issues, increase the delay values in the scripts

### Failed File Attachments
Some files may fail to attach due to:
- File processing errors
- Temporary API issues
- File compatibility problems

See `VECTOR_STORE_ISSUE.md` for known issues with failed files.

### Permission Errors
Ensure your API key has the necessary permissions:
- Read files
- Write files
- Manage vector stores

---

## File Limits & Considerations

**OpenAI Limits:**
- Individual file size: up to 512 MB
- Total storage per organization: up to 1 TB
- Assistants API: files up to 2 million tokens

**Best Practices:**
- Keep files under 100 MB for optimal processing
- Use descriptive filenames
- Set appropriate `purpose` for files
- Monitor your storage usage regularly

---

## API Documentation

For more information, refer to:
- [OpenAI Files API](https://platform.openai.com/docs/api-reference/files)
- [OpenAI Vector Stores API](https://platform.openai.com/docs/api-reference/vector-stores)
- [OpenAI Assistants Guide](https://platform.openai.com/docs/assistants/overview)
