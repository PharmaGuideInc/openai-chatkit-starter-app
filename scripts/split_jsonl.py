#!/usr/bin/env python3
"""
Split a large JSONL file into smaller files with a specified number of rows each.
"""

import json
from pathlib import Path


def split_jsonl(input_file, rows_per_file=500):
    """
    Split a JSONL file into multiple smaller files.
    
    Args:
        input_file: Path to the input JSONL file
        rows_per_file: Number of rows per output file (default: 500)
    """
    input_path = Path(input_file)
    
    if not input_path.exists():
        print(f"Error: File {input_path} not found!")
        return
    
    # Read all lines
    with open(input_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    total_lines = len(lines)
    num_files = (total_lines + rows_per_file - 1) // rows_per_file  # Ceiling division
    
    print(f"Total rows: {total_lines}")
    print(f"Rows per file: {rows_per_file}")
    print(f"Number of output files: {num_files}")
    print()
    
    # Split into multiple files
    base_name = input_path.stem  # filename without extension
    output_dir = input_path.parent
    
    for i in range(num_files):
        start_idx = i * rows_per_file
        end_idx = min((i + 1) * rows_per_file, total_lines)
        
        output_filename = f"{base_name}_{i+1}.jsonl"
        output_path = output_dir / output_filename
        
        # Write chunk to file
        with open(output_path, 'w', encoding='utf-8') as out_f:
            for line in lines[start_idx:end_idx]:
                out_f.write(line)
        
        rows_in_file = end_idx - start_idx
        print(f"✓ Created {output_filename} ({rows_in_file} rows)")
    
    print(f"\n✓ Split complete! Created {num_files} files in {output_dir}")


def main():
    """Main function."""
    script_dir = Path(__file__).parent
    input_file = script_dir / "storage_extraction.jsonl"
    
    split_jsonl(input_file, rows_per_file=500)


if __name__ == "__main__":
    main()
