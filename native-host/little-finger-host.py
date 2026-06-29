#!/usr/bin/env python3
"""
Little Finger Native Messaging Host.
Started by Chrome when the extension calls connectNative().
Watches ~/.little-finger/command.json for agent commands,
forwards them to the extension, and writes results back.
"""

import sys, json, struct, os, time, shutil
from pathlib import Path

CMD_DIR = Path.home() / '.little-finger'
CMD_FILE = CMD_DIR / 'command.json'
RESULT_FILE = CMD_DIR / 'result.json'

def read_message():
    raw = sys.stdin.buffer.read(4)
    if not raw or len(raw) < 4:
        return None
    length = struct.unpack('<I', raw)[0]
    return json.loads(sys.stdin.buffer.read(length).decode())

def send_message(msg):
    data = json.dumps(msg, ensure_ascii=False).encode()
    sys.stdout.buffer.write(struct.pack('<I', len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()

def main():
    CMD_DIR.mkdir(parents=True, exist_ok=True)
    
    # Clear stale files
    CMD_FILE.unlink(missing_ok=True)
    RESULT_FILE.unlink(missing_ok=True)
    
    sys.stderr.write("[LF Host] Ready, watching for commands\n")
    sys.stderr.flush()
    
    last_mtime = 0
    first_check = True
    
    while True:
        # Check for incoming command from agent (written to file)
        if CMD_FILE.exists():
            mtime = CMD_FILE.stat().st_mtime
            if mtime > last_mtime or first_check:
                first_check = False
                last_mtime = mtime
                try:
                    with open(CMD_FILE) as f:
                        cmd = json.load(f)
                    sys.stderr.write(f"[LF Host] Command: {cmd.get('action')} on {cmd.get('platform')}\n")
                    sys.stderr.flush()
                    
                    # Forward to extension
                    send_message(cmd)
                    
                    # Wait for extension response
                    resp = read_message()
                    if resp:
                        with open(RESULT_FILE, 'w') as f:
                            json.dump(resp, f, ensure_ascii=False, indent=2)
                        sys.stderr.write(f"[LF Host] Result: {resp.get('success')}\n")
                        sys.stderr.flush()
                    
                    # Clean up command file
                    CMD_FILE.unlink(missing_ok=True)
                    
                except Exception as e:
                    sys.stderr.write(f"[LF Host] Error: {e}\n")
                    sys.stderr.flush()
                    CMD_FILE.unlink(missing_ok=True)
        
        # Also check for messages from extension
        # (extension may send unsolicited messages)
        
        time.sleep(0.5)

if __name__ == '__main__':
    main()
