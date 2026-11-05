#!/bin/bash
# usage: encode.sh <scratch> <outdir>
set -euo pipefail
S=$1; O=$2; mkdir -p $O/landing; cd $S
F="-loglevel error -y"
SC="scale=1920:1080:flags=lanczos"
# Two-pass to a byte budget (bits/s from seconds and MB target).
br() { python3 -c "print(int($2*8*1024*1024*0.97/$1 / 1000))"; }

# --- X / social cut: 0-25 s from the first frame of the drawing-in
XS=25
ffmpeg $F -framerate 30 -start_number 0 -i land/f%04d.jpg -frames:v $((XS*30)) -vf "$SC,format=yuv420p" -c:v libx264 -preset slow -crf 16 -an x_master.mp4
B=$(br $XS 2.9)
ffmpeg $F -i x_master.mp4 -c:v libx264 -preset slow -b:v ${B}k -pass 1 -passlogfile x264x -an -f mp4 /dev/null
ffmpeg $F -i x_master.mp4 -c:v libx264 -preset slow -b:v ${B}k -pass 2 -passlogfile x264x -pix_fmt yuv420p -movflags +faststart -an $O/map-16x9.mp4
ffmpeg $F -i x_master.mp4 -c:v libvpx-vp9 -b:v ${B}k -pass 1 -passlogfile vp9x -row-mt 1 -an -f webm /dev/null
ffmpeg $F -i x_master.mp4 -c:v libvpx-vp9 -b:v ${B}k -pass 2 -passlogfile vp9x -row-mt 1 -an $O/map-16x9.webm

# --- Landing loop: L s of calm flow from T0, the last F s crossfaded into the head
T0=${T0:-13}; L=${L:-12}; XF=1
ffmpeg $F -framerate 30 -start_number $((T0*30)) -i land/f%04d.jpg -frames:v $(((L+XF)*30)) -vf "$SC,format=yuv420p" -c:v libx264 -crf 14 -preset slow -an seg.mp4
ffmpeg $F -i seg.mp4 -filter_complex "\
[0]split=3[a][b][c];\
[a]trim=0:$XF,setpts=PTS-STARTPTS[head];\
[b]trim=$L:$((L+XF)),setpts=PTS-STARTPTS[tail];\
[c]trim=$XF:$L,setpts=PTS-STARTPTS[mid];\
[tail][head]blend=all_expr='A*(1-T/$XF)+B*(T/$XF)'[x];\
[x][mid]concat=n=2:v=1[out]" -map "[out]" -c:v libx264 -crf 14 -preset slow -pix_fmt yuv420p -an loop_master.mp4
B=$(br $L 2.9)
ffmpeg $F -i loop_master.mp4 -c:v libx264 -preset slow -b:v ${B}k -pass 1 -passlogfile x264l -an -f mp4 /dev/null
ffmpeg $F -i loop_master.mp4 -c:v libx264 -preset slow -b:v ${B}k -pass 2 -passlogfile x264l -pix_fmt yuv420p -movflags +faststart -an $O/landing/map.mp4
ffmpeg $F -i loop_master.mp4 -c:v libvpx-vp9 -b:v ${B}k -pass 1 -passlogfile vp9l -row-mt 1 -an -f webm /dev/null
ffmpeg $F -i loop_master.mp4 -c:v libvpx-vp9 -b:v ${B}k -pass 2 -passlogfile vp9l -row-mt 1 -an $O/landing/map.webm
# Landing poster: the loop's first frame, so the poster and the video meet.
ffmpeg $F -i loop_master.mp4 -frames:v 1 -c:v libwebp -quality 85 $O/landing/map-poster.webp

# --- Poster of the settled map (X cut): 20 s in
P=$(printf "land/f%04d.jpg" 600)
ffmpeg $F -i $P -vf "$SC" $O/map-poster.png
ffmpeg $F -i $P -vf "$SC" -c:v libwebp -quality 85 $O/map-poster.webp

# --- Shorts: 9:16, 13 s from the first frame
ffmpeg $F -framerate 30 -i tall/f%04d.jpg -vf "scale=1080:1920:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow -crf 19 -movflags +faststart -an $O/map-9x16.mp4
