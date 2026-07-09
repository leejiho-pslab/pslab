#!/usr/bin/env bash
# 먼데이투선데이 유튜브 무드필름 합성 (CI 전용, ffmpeg)
# data/mts-video.json 의 segments 를 순서대로 정규화(1080x1920@30) →
# 클립엔 자막 오버레이 + 페이드, 카드엔 페이드 → concat → 앰비언트 BGM 믹스.
set -euo pipefail
J=data/mts-video.json
OUT=$(jq -r '.output' "$J")
W=1080; H=1920; FPS=30
tmp=$(mktemp -d)
n=$(jq '.segments | length' "$J")
list="$tmp/list.txt"; : > "$list"
total=0

for i in $(seq 0 $((n-1))); do
  type=$(jq -r ".segments[$i].type" "$J")
  dur=$(jq -r ".segments[$i].dur" "$J")
  seg="$tmp/seg_$i.mp4"
  fo=$(echo "$dur - 0.4" | bc)
  if [ "$type" = "card" ]; then
    img=$(jq -r ".segments[$i].img" "$J")
    ffmpeg -y -loglevel error -loop 1 -i "$img" -t "$dur" \
      -vf "scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fade=t=in:st=0:d=0.4,fade=t=out:st=${fo}:d=0.4,format=yuv420p" \
      -r $FPS -c:v libx264 -pix_fmt yuv420p -profile:v high -preset medium -crf 19 "$seg"
  else
    url=$(jq -r ".segments[$i].url" "$J")
    cap=$(jq -r ".segments[$i].cap" "$J")
    clip="$tmp/clip_$i.mp4"
    curl -fsSL -o "$clip" "$url"
    fo2=$(echo "$dur - 0.3" | bc)
    ffmpeg -y -loglevel error -i "$clip" -i "$cap" -filter_complex \
      "[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},trim=0:${dur},setpts=PTS-STARTPTS,fps=${FPS}[b];[b][1:v]overlay=0:0[c];[c]fade=t=in:st=0:d=0.3,fade=t=out:st=${fo2}:d=0.3,format=yuv420p[o]" \
      -map "[o]" -an -c:v libx264 -pix_fmt yuv420p -profile:v high -preset medium -crf 19 "$seg"
  fi
  echo "file 'seg_$i.mp4'" >> "$list"
  total=$(echo "$total + $dur" | bc)
done

# concat (동일 코덱 파라미터)
ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" -c copy "$tmp/joined.mp4"

# 앰비언트 BGM (저작권 free) — 따뜻한 A major 패드 + 슬로우 트레몰로 + 로우패스 + 페이드
fade_out_start=$(echo "$total - 2.2" | bc)
ffmpeg -y -loglevel error -f lavfi -i \
  "aevalsrc=0.17*sin(2*PI*110*t)+0.13*sin(2*PI*164.81*t)+0.11*sin(2*PI*220*t)+0.07*sin(2*PI*277.18*t):s=44100:d=${total}" \
  -af "tremolo=f=0.14:d=0.55,lowpass=f=1100,highpass=f=60,afade=t=in:st=0:d=1.8,afade=t=out:st=${fade_out_start}:d=2.2,volume=0.6" \
  "$tmp/bgm.wav"

mkdir -p "$(dirname "$OUT")"
ffmpeg -y -loglevel error -i "$tmp/joined.mp4" -i "$tmp/bgm.wav" \
  -c:v copy -c:a aac -b:a 160k -shortest "$OUT"

echo "built $OUT  (~${total}s)"
ls -la "$OUT"
