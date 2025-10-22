# Vector Store Failed Files Issue

## Problem Summary
The PharmacyVectorStore contains 10 files with "failed" status that cannot be removed from the vector store, despite successful DELETE API calls.

## What We've Discovered

1. **Files are stuck in "failed" state** due to "An internal error occurred" during processing
2. **The underlying file objects don't exist** - when we try to delete them via `/files/{file_id}`, we get "No such File object" errors
3. **DELETE API returns success** - when we call DELETE on `/vector_stores/{store_id}/files/{file_id}`, it returns:
   ```json
   {"id":"file-xxx","object":"vector_store.file.deleted","deleted":true}
   ```
4. **Files reappear in listings** - despite successful deletion, the files continue to show up when listing vector store files
5. **file_counts metadata doesn't update** - the vector store still shows `"failed":10` in its file_counts

## Stuck File IDs
- file-AL1Pehh3YbiNv1FkUmWGL2
- file-BywpKYBcFaEHmkebZDoCCg
- file-BkT7doNd4WNUycvsbaa5UK
- file-3RsVH57VzDtEr7Y3FXuU4t
- file-5MjGr8m81P1sqyMndhMuXU
- file-SpWrJyZotuwZPsZPub2Em8
- file-NjTNCz91Lfj6HZitLHD7Rz
- file-G2tEo7N8t1kUHNFmZ4Vqbq
- file-DK475dadFpZ6iuLKaXQYzG
- file-2ES11SE3M42SyLaVNjVBJj

## Conclusion
This appears to be a bug in OpenAI's Vector Store API where:
- Failed file references become "phantom" entries
- The DELETE API acknowledges deletion but doesn't actually remove them from listings
- The underlying file objects were already deleted (or failed to upload completely)
- The vector store metadata and file listings are out of sync

## Recommended Actions

### 1. Contact OpenAI Support
Report this issue to OpenAI support with the following information:
- Vector Store ID: `vs_68f7c64015d4819184aa0cff0d01cd3c`
- Problem: Failed files cannot be removed from vector store
- API behavior: DELETE returns success but files persist in listings
- File IDs: (list all 10 file IDs above)

### 2. Wait for OpenAI to Fix
This appears to be a server-side issue that requires OpenAI engineering to resolve.

### 3. Workaround Options
If you need to clean this up immediately:
- **Option A**: Create a new vector store and migrate successful files
- **Option B**: Wait for OpenAI's internal cleanup processes to eventually remove these phantom entries
- **Option C**: Request OpenAI support to manually clean up the vector store

## What Won't Work
- Running the delete script multiple times (we've tried this)
- Deleting the underlying file objects (they don't exist)
- Using different delete endpoints (we've tried both)
- Waiting longer between delete calls (tested with delays)
