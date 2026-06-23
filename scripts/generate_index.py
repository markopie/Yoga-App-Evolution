import argparse
import os
import re
from pathlib import Path


EXPORT_PATTERN = re.compile(
    r'^export\s+(?:async\s+)?(function|const|let|var|class|default)\s+([a-zA-Z0-9_]+)',
    re.MULTILINE,
)
BRACKET_EXPORT_PATTERN = re.compile(r'^export\s+\{([^}]+)\}', re.MULTILINE)
WINDOW_PATTERN = re.compile(r'window\.([a-zA-Z0-9_]+)\s*=', re.MULTILINE)


def collect_exports(source_dir):
    index_data = {}
    source_path = Path(source_dir)

    for root, dirs, files in os.walk(source_path):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git')]
        for file_name in files:
            if not file_name.endswith('.js'):
                continue

            file_path = Path(root) / file_name
            rel_path = file_path.relative_to(source_path).as_posix()
            exports = set()

            try:
                content = file_path.read_text(encoding='utf-8')
            except OSError as error:
                print(f"Warning: could not read {file_path}: {error}")
                continue

            for match in EXPORT_PATTERN.finditer(content):
                exports.add(f"`{match.group(2)}` ({match.group(1)})")

            for match in BRACKET_EXPORT_PATTERN.finditer(content):
                items = [item.strip() for item in match.group(1).replace('\n', '').split(',')]
                for item in items:
                    if item:
                        exports.add(f"`{item}` (module export)")

            for match in WINDOW_PATTERN.finditer(content):
                exports.add(f"`{match.group(1)}` (window binding)")

            if exports:
                index_data[rel_path] = sorted(exports)

    return index_data


def render_index(index_data):
    lines = [
        "# Application Architecture & Function Index\n\n",
        "> Auto-generated map of all exported modules and window bindings.\n\n",
    ]

    for file_path in sorted(index_data):
        lines.append(f"### File: `{file_path}`\n")
        for item in index_data[file_path]:
            lines.append(f"- {item}\n")
        lines.append("\n")

    return ''.join(lines)


def write_file(path, content):
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    newline = '\r\n' if output_path.suffix.lower() == '.md' else '\n'
    output_path.write_text(content, encoding='utf-8', newline=newline)
    return output_path


def generate_function_index(source_dir, local_output):
    print(f"Scanning '{source_dir}' for exports and window bindings...")

    index_data = collect_exports(source_dir)
    full_content = render_index(index_data)

    local_path = write_file(local_output, full_content)
    print(f"Local copy saved: {local_path}")


def parse_args():
    parser = argparse.ArgumentParser(description="Generate the application function index.")
    parser.add_argument("--source", default="./src", help="Source directory to scan.")
    parser.add_argument("--output", default="FUNCTION_INDEX.md", help="Local markdown output path.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    generate_function_index(args.source, args.output)
