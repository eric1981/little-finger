#!/usr/bin/env python3
"""
Little Finger Native Messaging Host.
Started by Chrome when the extension calls connectNative().

Architecture:
  - Main thread polls ~/.little-finger/command.json for agent commands.
  - A separate reader thread listens on stdin for extension responses.
  - Communication uses two files (atomic via tmp+rename):
      command.json  — agent → host → extension (via stdin)
      result.json   — extension → host → agent
      error.json    — host writes error info when command parsing fails
                    (so CLI doesn't wait until timeout)
"""

import sys, json, struct, os, time, select
from pathlib import Path
from typing import Optional

CMD_DIR = Path.home() / '.little-finger'
CMD_FILE = CMD_DIR / 'command.json'
RESULT_FILE = CMD_DIR / 'result.json'
ERROR_FILE = CMD_DIR / 'error.json'

# If extension doesn't respond within this, give up and write an error result
EXTENSION_TIMEOUT = 90  # seconds


def read_message_stdin(timeout: Optional[float] = None):
    """
    Read a native-messaging-framed message from stdin.
    Returns the parsed JSON dict, or None on timeout/EOF/error.
    """
    try:
        if timeout is not None:
            # Wait for stdin to be readable within `timeout` seconds.
            # select.select on sys.stdin.buffer works on POSIX (macOS/Linux).
            rlist, _, _ = select.select([sys.stdin.buffer], [], [], timeout)
            if not rlist:
                return None  # timed out

        raw = sys.stdin.buffer.read(4)
        if not raw or len(raw) < 4:
            return None
        length = struct.unpack('<I', raw)[0]
        if length <= 0 or length > 10 * 1024 * 1024:
            return None  # sanity check (10 MB max)
        payload = sys.stdin.buffer.read(length)
        if len(payload) < length:
            return None
        return json.loads(payload.decode())
    except Exception:
        return None


def send_message_to_extension(msg: dict) -> None:
    """Send a native-messaging-framed message to the extension via stdout."""
    data = json.dumps(msg, ensure_ascii=False).encode()
    sys.stdout.buffer.write(struct.pack('<I', len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def atomic_write_json(path: Path, data) -> None:
    """Write JSON to path atomically: write to tmp, then rename."""
    tmp = path.with_suffix(path.suffix + '.tmp')
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)  # atomic on POSIX


def write_error_result(error_msg: str) -> None:
    """Write an error result so the CLI doesn't block until timeout."""
    atomic_write_json(RESULT_FILE, {"success": False, "error": error_msg})


def process_command(cmd: dict) -> None:
    """Forward a command to the extension and write back the response."""
    sys.stderr.write(f"[LF Host] Command: {cmd.get('action')} on {cmd.get('platform')}\n")
    sys.stderr.flush()

    # Forward to extension
    try:
        send_message_to_extension(cmd)
    except Exception as e:
        write_error_result(f"Failed to send to extension: {e}")
        return

    # Wait for response (blocking read with timeout)
    resp = read_message_stdin(timeout=EXTENSION_TIMEOUT)
    if resp is None:
        write_error_result(f"Extension did not respond within {EXTENSION_TIMEOUT}s")
        sys.stderr.write(f"[LF Host] Extension timeout\n")
    else:
        atomic_write_json(RESULT_FILE, resp)
        sys.stderr.write(f"[LF Host] Result: {resp.get('success')}\n")
    sys.stderr.flush()


def main():
    CMD_DIR.mkdir(parents=True, exist_ok=True)

    # Clear stale files
    for f in (CMD_FILE, RESULT_FILE, ERROR_FILE):
        try:
            f.unlink()
        except FileNotFoundError:
            pass

    sys.stderr.write("[LF Host] Ready, watching for commands\n")
    sys.stderr.flush()

    last_mtime = 0
    first_check = True

    while True:
        # Check for incoming command from agent (written to file)
        if CMD_FILE.exists():
            try:
                mtime = CMD_FILE.stat().st_mtime
            except OSError:
                mtime = 0

            if mtime > last_mtime or first_check:
                first_check = False
                last_mtime = mtime
                try:
                    # Read + parse with error handling
                    with open(CMD_FILE, encoding='utf-8') as f:
                        cmd = json.load(f)
                    # Clean up command file BEFORE processing
                    # (so a crash mid-processing doesn't leave a stale command)
                    try:
                        CMD_FILE.unlink()
                    except FileNotFoundError:
                        pass
                    process_command(cmd)
                except json.JSONDecodeError as e:
                    sys.stderr.write(f"[LF Host] Bad JSON in command file: {e}\n")
                    sys.stderr.flush()
                    write_error_result(f"Invalid command JSON: {e}")
                    try:
                        CMD_FILE.unlink()
                    except FileNotFoundError:
                        pass
                except Exception as e:
                    sys.stderr.write(f"[LF Host] Error: {e}\n")
                    sys.stderr.flush()
                    write_error_result(f"Host error: {e}")
                    try:
                        CMD_FILE.unlink()
                    except FileNotFoundError:
                        pass

        time.sleep(0.5)


if __name__ == '__main__':
    main()
