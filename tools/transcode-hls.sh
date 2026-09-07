#!/usr/bin/env bash
# Transcode a single MKV/MP4 (e.g. 1080p HEVC 2GB R2 file) into a low-RAM-TV
# safe HLS ladder with fMP4 segments. Upload the OUT dir to R2 and point
# movies.video_url at <R2>/<movie>/master.m3u8.
#
# Codec strategy (why no lag on 1GB TVs, 4K where possible):
#   540p/720p  = H.264 (every SoC has HW H.264 — instant start on weak boxes)
#   1080p/4K   = HEVC  (50% smaller than H.264 — 4K fits 15Mbps, needs HW HEVC)
#   audio      = AAC stereo (passthrough-free, cheap to decode)
#   segments   = 6s fMP4 (fast seek, CDN-cacheable; single MKV seeks re-fetch GBs)
#
# Usage: ./transcode-hls.sh input.mkv out/movie
set -euo pipefail
IN="${1:?usage: $0 input.mkv out/movie}"
OUT="${2:?usage: $0 input.mkv out/movie}"
mkdir -p "$OUT"

# 4K source? keep 4K rung. 1080p source? drop the 2160p rung (upscaling wastes bits).
HAS_4K=0
if ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$IN" 2>/dev/null | grep -qE '2[1-9][0-9]{2}|[3-9][0-9]{3}'; then
  HAS_4K=1
fi

if [ "$HAS_4K" = "1" ]; then
  MAP='v:0,a:0 v:1,a:0 v:2,a:0 v:3,a:0'
  # shellcheck disable=SC2086
  ffmpeg -hide_banner -y -i "$IN" \
    -map v:0 -map a:0 \
    -c:a aac -b:a 128k -ac 2 \
    -c:v:0 libx264 -crf 23 -preset veryfast -s 960x540  -b:v:0 800k  -maxrate:v:0 1000k  -bufsize:v:0 1500k \
    -c:v:1 libx264 -crf 22 -preset veryfast -s 1280x720 -b:v:1 2000k -maxrate:v:1 2500k -bufsize:v:1 3500k \
    -c:v:2 libx265 -crf 24 -preset veryfast -s 1920x1080 -b:v:2 4500k -maxrate:v:2 5500k -bufsize:v:2 8000k \
    -c:v:3 libx265 -crf 22 -preset veryfast -s 3840x2160 -b:v:3 15000k -maxrate:v:3 18000k -bufsize:v:3 24000k \
    -var_stream_map "$MAP" \
    -master_pl_name master.m3u8 -hls_time 6 -hls_playlist_type vod \
    -hls_segment_type fmp4 -hls_segment_filename "$OUT/v%v/seg_%03d.m4s" \
    "$OUT/v%v/index.m3u8"
else
  MAP='v:0,a:0 v:1,a:0 v:2,a:0'
  ffmpeg -hide_banner -y -i "$IN" \
    -map v:0 -map a:0 \
    -c:a aac -b:a 128k -ac 2 \
    -c:v:0 libx264 -crf 23 -preset veryfast -s 960x540  -b:v:0 800k  -maxrate:v:0 1000k  -bufsize:v:0 1500k \
    -c:v:1 libx264 -crf 22 -preset veryfast -s 1280x720 -b:v:1 2000k -maxrate:v:1 2500k -bufsize:v:1 3500k \
    -c:v:2 libx265 -crf 24 -preset veryfast -s 1920x1080 -b:v:2 4500k -maxrate:v:2 5500k -bufsize:v:2 8000k \
    -var_stream_map "$MAP" \
    -master_pl_name master.m3u8 -hls_time 6 -hls_playlist_type vod \
    -hls_segment_type fmp4 -hls_segment_filename "$OUT/v%v/seg_%03d.m4s" \
    "$OUT/v%v/index.m3u8"
fi

echo "Done: $OUT/master.m3u8"
echo "Upload: rclone copy $OUT r2:bucket/movie --header-upload 'Cache-Control: public, max-age=31536000'"
echo "Serve master.m3u8 as Content-Type: application/vnd.apple.mpegurl"
