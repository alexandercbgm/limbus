# build the claude.ai artifact of the game (run from anywhere): python3 tools/mkart.py [index.html] [out/index.html]; publish out/index.html with out/music/*.mp3 (and the minis/ files already there)
# build the artifact page from index.html: the levels' clips, the menu loops and their posters, and the menu's music, are files
# published beside the page (minis/, music/), not embedded in it (the page alone must stay under 16 MB)
import re, sys
src = sys.argv[1] if len(sys.argv) > 1 else '/home/user/limbus/index.html'
out = sys.argv[2] if len(sys.argv) > 2 else '/home/user/work/art/index.html'
s = open(src).read()
n = [0] * 5
def clip(m):
    i = m.group(1); n[0] += 1
    path = 'minis/menu.bg.mp4' if i == 'menubg' else 'minis/menu.night.mp4' if i == 'menubg-night' else 'minis/%s.mp4' % i[5:]
    return '<script type="text/plain" id="%s">%s</script>' % (i, path)
s = re.sub(r'<script type="text/plain" id="(clip-[a-z]+|menubg|menubg-night)">[^<]*</script>', clip, s)
def poster(m):
    i = m.group(1); n[1] += 1
    path = 'minis/menu.bg.jpg' if i == 'menubg-poster' else 'minis/menu.night.jpg' if i == 'menubg-night-poster' else 'minis/%s.clip.jpg' % i[7:]
    return '<img hidden alt="" id="%s" src="%s">' % (i, path)
s = re.sub(r'<img hidden alt="" id="(poster-[a-z]+|menubg-poster|menubg-night-poster)" src="data:[^"]*">', poster, s)
# every track a file of its own in music/ (the game fetches music/<id>.mp3 when it finds none embedded)
import base64, os
os.makedirs(os.path.join(os.path.dirname(out), 'music'), exist_ok=True)
def track(m):
    open(os.path.join(os.path.dirname(out), 'music', m.group(1) + '.mp3'), 'wb').write(base64.b64decode(re.sub(r'\s+', '', m.group(2))))
    return ''
s, n[2] = re.subn(r'<script type="application/octet-stream" id="music-([a-z_]+)"[^>]*>([^<]*)</script>\n?', track, s)
s = '<!DOCTYPE html>\n' + s + '\n'
open(out, 'w').write(s)
print(*n, round(len(s) / 1e6, 3))
