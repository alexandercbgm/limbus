"""Trim a track's silence at its head and tail, so it loops in the game without a pause (a level's track repeats whole).

    python3 tools/trim_music.py music/<stem>.mp3                  cut the silence off, the MP3 frames copied as they are
    python3 tools/trim_music.py music/<stem>.mp3 --loop END XF    a track that fades out: end it at END seconds and lay its
                                                                  last XF seconds over its start, so the loop runs on through
                                                                  its own fading tail (re-encoded at 192 kbps)

Silence is anything below -50 dB for more than 0.2 s at the tail (0.05 s at the head). Needs ffmpeg (and numpy for --loop).
"""
import re, subprocess, sys, shutil, tempfile, os

def edges(f):
    out = subprocess.run(["ffmpeg", "-i", f, "-af", "silencedetect=n=-50dB:d=0.05", "-f", "null", "-"], capture_output=True, text=True).stderr
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], capture_output=True, text=True).stdout)
    starts = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", out)]
    ends = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", out)]
    head = ends[0] if starts and starts[0] < 0.01 and ends else 0.0 # silence from the very start
    tail = starts[-1] if starts and (len(ends) < len(starts) or ends[-1] > dur - 0.05) and dur - starts[-1] > 0.2 else dur # silence to the very end
    return head, tail, dur

def main():
    f = sys.argv[1]
    head, tail, dur = edges(f)
    tmp = tempfile.mktemp(suffix=".mp3")
    if "--loop" in sys.argv:
        import numpy as np
        i = sys.argv.index("--loop"); end, xf = float(sys.argv[i + 1]), float(sys.argv[i + 2]); sr = 44100
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-ar", str(sr), "-ac", "2", "-f", "f32le", "-"], capture_output=True).stdout
        a = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()
        a = a[int(max(0, head - 0.01) * sr):int(end * sr)]
        n = int(xf * sr); fade = np.cos(np.linspace(0, np.pi / 2, n)) ** 2 # the tail fades out as it runs over the start
        out = a[:-n].copy(); out[:n] += a[-n:] * fade[:, None]
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(sr), "-ac", "2", "-i", "-", "-c:a", "libmp3lame", "-b:a", "192k", tmp], input=np.clip(out, -1, 1).astype(np.float32).tobytes(), check=True)
    else:
        if head < 0.02 and dur - tail < 0.05: print(f, "nothing to trim"); return
        t0 = max(0, head - 0.02)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t0:.3f}", "-i", f, "-t", f"{tail + 0.08 - t0:.3f}", "-c", "copy", tmp], check=True)
    shutil.move(tmp, f)
    print(f, f"{dur:.2f} s -> {edges(f)[2]:.2f} s (head {head:.2f}, tail from {tail:.2f})")

main()
