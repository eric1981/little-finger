#!/usr/bin/env python3
"""
Little Finger CLI — Hermes Agent interface.
Usage:
  python3 little-finger-cli.py '<json>'
  python3 little-finger-cli.py --file <path>

Example:
  python3 little-finger-cli.py '{"action":"publish_article","platform":"zhihu","title":"Test","content":"Hello"}'

Writes command to ~/.little-finger/command.json atomically and polls for result.
"""

import sys, json, os, time
from pathlib import Path

CMD_DIR = Path.home() / '.little-finger'
CMD_FILE = CMD_DIR / 'command.json'
RESULT_FILE = CMD_DIR / 'result.json'
TIMEOUT = 120  # seconds


def atomic_write_json(path: Path, data) -> None:
    """Write JSON to path atomically: write to tmp, then rename."""
    tmp = path.with_suffix(path.suffix + '.tmp')
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)  # atomic on POSIX


def main():
    # Support --file <path> for large payloads
    if len(sys.argv) >= 3 and sys.argv[1] == '--file':
        with open(sys.argv[2], encoding='utf-8') as f:
            try:
                cmd = json.load(f)
            except json.JSONDecodeError as e:
                print(json.dumps({"success": False, "error": f"Invalid JSON in file: {e}"}))
                sys.exit(1)
    elif len(sys.argv) >= 2:
        try:
            cmd = json.loads(sys.argv[1])
        except json.JSONDecodeError as e:
            print(json.dumps({"success": False, "error": f"Invalid JSON: {e}"}))
            sys.exit(1)
    else:
        print(json.dumps({"success": False, "error": "Usage: little-finger-cli.py '<json>' or --file <path>"}))
        sys.exit(1)

    CMD_DIR.mkdir(parents=True, exist_ok=True)

    # Clear stale result from previous run
    try:
        RESULT_FILE.unlink()
    except FileNotFoundError:
        pass

    # Write command atomically so host never reads a half-written file
    atomic_write_json(CMD_FILE, cmd)

    # Poll for result
    start = time.time()
    while time.time() - start < TIMEOUT:
        if RESULT_FILE.exists():
            try:
                with open(RESULT_FILE, encoding='utf-8') as f:
                    result = json.load(f)
                # Clean up result file
                try:
                    RESULT_FILE.unlink()
                except FileNotFoundError:
                    pass
                print(json.dumps(result, ensure_ascii=False))
                return
            except json.JSONDecodeError:
                # Result file is being written — wait and retry
                pass
        time.sleep(0.5)

    # Timeout — clean up the command file so it doesn't get processed later
    try:
        CMD_FILE.unlink()
    except FileNotFoundError:
        pass
    print(json.dumps({"success": False, "error": f"Timeout after {TIMEOUT}s"}))
    sys.exit(1)


if __name__ == '__main__':
    main()
