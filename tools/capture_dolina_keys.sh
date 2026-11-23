#!/bin/sh
cd /home/claude/preview && python3 -m http.server 8850 > /tmp/srv8850.log 2>&1 &
SRV=$!
sleep 1
python3 /home/claude/build/tools/capture_dolina_keys.py l 1880 844 1 > /tmp/capt_dl.log 2>&1
python3 /home/claude/build/tools/capture_dolina_keys.py p 390 1056 1.5 > /tmp/capt_dp.log 2>&1
kill $SRV
echo done > /tmp/capt_dolina_done
