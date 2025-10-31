#!/usr/bin/env python3
"""
Extract storage/stability information from drug monograph Markdown files.

This script reads Markdown files from the Upload_to_vector_store folder,
extracts storage sections, and outputs a JSONL file with structured data.
"""

import os
import re
import json
from pathlib import Path


def extract_drug_name(filename):
    """Extract drug name from filename by removing .md extension."""
    return filename.replace('.md', '')


def find_storage_section(content):
    """
    Find and extract the storage section from markdown content.
    
    Returns the extracted text or None if not found.
    """
    # Common storage section headings
    storage_patterns = [
        r'#{1,4}\s*STORAGE,?\s*STABILITY\s*AND\s*DISPOSAL',
        r'#{1,4}\s*STABILITY\s*AND\s*STORAGE\s*CONDITIONS',
        r'#{1,4}\s*STORAGE\s*AND\s*STABILITY',
        r'#{1,4}\s*STORAGE',
    ]
    
    # Try each pattern
    for pattern in storage_patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            # Found the storage heading, determine its level
            heading_start = content.rfind('\n', 0, match.start()) + 1
            heading_text = content[heading_start:match.end()]
            heading_level = heading_text.count('#')
            
            # Extract content until next heading at same or higher level
            # (but not sub-headings of storage section)
            start_pos = match.end()
            
            # Look for next major section heading (equal or fewer #'s)
            # Use a pattern that finds headings at the determined level or higher
            # Exclude sub-sections that are part of storage (Pre-filled, Vial, Dual, Special)
            next_pattern = r'\n#{1,' + str(heading_level) + r'}\s+(?!Pre-filled|Vial|Dual|Special\s+Handling)[A-Z]'
            next_heading = re.search(next_pattern, content[start_pos:])
            
            if next_heading:
                end_pos = start_pos + next_heading.start()
                extracted = content[start_pos:end_pos]
            else:
                # No next heading, take rest of document
                extracted = content[start_pos:]
            
            # Clean up the extracted text
            extracted = extracted.strip()
            
            # Remove extra blank lines
            extracted = re.sub(r'\n\s*\n\s*\n+', '\n\n', extracted)
            
            # If still empty, skip to keyword fallback
            if not extracted or len(extracted) < 10:
                continue
            
            return extracted
    
    # Fallback: Search for paragraphs containing storage keywords
    return find_storage_by_keyword(content)


def find_storage_by_keyword(content):
    """
    Fallback method: Find storage information by searching for keywords.
    
    Returns extracted text containing storage information or None if not found.
    """
    # Keywords to search for (case-insensitive)
    keywords = [
        r'\bstore\b',
        r'\bstored\b',
        r'\bstorage\b',
        r'\bkeep\b',
        r'\brefrigerat',
        r'\bfreez',
        r'\btemperature\b',
        r'\bprotect from light\b',
    ]
    
    # Split content into paragraphs (separated by blank lines)
    paragraphs = re.split(r'\n\s*\n+', content)
    
    # Find paragraphs that contain storage keywords
    storage_paragraphs = []
    for paragraph in paragraphs:
        # Check if any keyword is in this paragraph
        for keyword_pattern in keywords:
            if re.search(keyword_pattern, paragraph, re.IGNORECASE):
                # Clean the paragraph
                cleaned = paragraph.strip()
                # Remove markdown headers from the paragraph
                cleaned = re.sub(r'^#{1,6}\s+', '', cleaned)
                if cleaned and len(cleaned) > 20:  # Ensure meaningful content
                    storage_paragraphs.append(cleaned)
                break
    
    if storage_paragraphs:
        # Join found paragraphs and limit to reasonable length
        result = '\n\n'.join(storage_paragraphs[:5])  # Max 5 paragraphs
        # Limit total length to avoid very long extracts
        if len(result) > 1500:
            result = result[:1500] + '...'
        return result
    
    return None


def process_markdown_file(filepath):
    """
    Process a single markdown file and extract storage information.
    
    Returns a dict with name, input, and reference_doc fields.
    """
    filename = os.path.basename(filepath)
    drug_name = extract_drug_name(filename)
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        storage_info = find_storage_section(content)
        
        if storage_info:
            reference_doc = storage_info
        else:
            reference_doc = "Storage section not found"
        
        return {
            "name": drug_name,
            "input": f"How to store {drug_name}?",
            "reference_doc": reference_doc
        }
    
    except Exception as e:
        print(f"Error processing {filename}: {str(e)}")
        return {
            "name": drug_name,
            "input": f"How to store {drug_name}?",
            "reference_doc": f"Error reading file: {str(e)}"
        }


def main():
    """Main function to process all markdown files and create JSONL output."""
    # Define paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    input_dir = project_root / "Upload_to_vector_store"
    output_file = script_dir / "storage_extraction.jsonl"
    
    print(f"Reading files from: {input_dir}")
    print(f"Output will be saved to: {output_file}")
    
    # Check if input directory exists
    if not input_dir.exists():
        print(f"Error: Directory {input_dir} not found!")
        return
    
    # Get all .md files
    md_files = sorted(input_dir.glob("*.md"))
    
    if not md_files:
        print(f"No .md files found in {input_dir}")
        return
    
    print(f"Found {len(md_files)} markdown files to process")
    
    # Process each file and write to JSONL
    processed_count = 0
    found_count = 0
    
    with open(output_file, 'w', encoding='utf-8') as out_f:
        for md_file in md_files:
            result = process_markdown_file(md_file)
            
            # Write as JSONL (one JSON object per line)
            json.dump(result, out_f, ensure_ascii=False)
            out_f.write('\n')
            
            processed_count += 1
            
            # Track how many had storage sections found
            if result['reference_doc'] != "Storage section not found":
                found_count += 1
            
            # Progress indicator
            if processed_count % 50 == 0:
                print(f"Processed {processed_count}/{len(md_files)} files...")
    
    print(f"\n✓ Processing complete!")
    print(f"  Total files processed: {processed_count}")
    print(f"  Storage sections found: {found_count}")
    print(f"  Storage sections not found: {processed_count - found_count}")
    print(f"  Output saved to: {output_file}")


if __name__ == "__main__":
    main()
