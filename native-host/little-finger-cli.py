#!/usr/bin/env python3
"""
Little Finger CLI — Hermes Agent interface.
Usage: python3 little-finger-cli.py '<json>'

Example:
  python3 little-finger-cli.py '{"action":"publish_article","platform":"zhihu","title":"Test","content":"Hello"}'

Writes command to ~/.little-finger/command.json and polls for result.
"""

import sys, json, os, time
from pathlib import Path

CMD_DIR = Path.home() / '.little-finger'
CMD_FILE = CMD_DIR / 'command.json'
RESULT_FILE = CMD_DIR / 'result.json'
TIMEOUT = 120  # seconds

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: little-finger-cli.py '<json_command>'"}))
        sys.exit(1)
    
    try:
        cmd = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON: {e}"}))
        sys.exit(1)
    
    CMD_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_FILE.unlink(missing_ok=True)
    
    with open(CMD_FILE, 'w') as f:
        json.dump(cmd, f, ensure_ascii=False)
    
    # Poll for result
    start = time.time()
    while time.time() - start < TIMEOUT:
        if RESULT_FILE.exists():
            with open(RESULT_FILE) as f:
                result = json.load(f)
            RESULT_FILE.unlink(missing_ok=True)
            print(json.dumps(result, ensure_ascii=False))
            return
        time.sleep(0.5)
    
    print(json.dumps({"success": False, "error": f"Timeout after {TIMEOUT}s"}))
    sys.exit(1)

if __name__ == '__main__':
    main()
