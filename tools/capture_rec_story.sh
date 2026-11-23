#!/bin/sh
# Films the REC model story frame by frame (see STANDARD.md, "Кадры для облегчённого режима").
# A copy of the site gets a hook that sets the story progress directly; frames go to build/work/frames-rec.
rm -rf /tmp/cap && cp -a /home/claude/site /tmp/cap
python3 - <<'PY'
p = '/tmp/cap/js/viewer/story.js'; s = open(p, encoding='utf-8').read()
s = s.replace("function progress() {\n", "function progress() {\n  if (window.__storyP != null) return window.__storyP;\n", 1)
s = s.replace("    V.setStoryHook(render);", "    V.setStoryHook(render); window.__storyKick = () => C.kick(); window.__storyFrames = 0; const _r = render; V.setStoryHook(() => { const ok = _r(); if (ok) window.__storyFrames++; return ok; });", 1)
open(p, 'w', encoding='utf-8').write(s)
PY
cd /tmp/cap && python3 -m http.server 8840 > /tmp/srv8840.log 2>&1 &
SRV=$!
sleep 1
python3 /home/claude/build/tools/capture_rec_story.py land 1152 664 1 > /tmp/capt_land.log 2>&1
PER=3 python3 /home/claude/build/tools/capture_rec_story.py port 400 820 1.4 > /tmp/capt_port.log 2>&1
kill $SRV
echo done > /tmp/capture_rec_done
