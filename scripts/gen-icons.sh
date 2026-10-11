#!/data/data/com.termux/files/usr/bin/bash
# Generate Android icons + splash from SVG

set -e
cd "$(dirname "$0")/.."

RES="android/app/src/main/res"
SRC="resources"

echo "🎨 توليد الأيقونات..."

# ===== Legacy icons (ic_launcher) =====
declare -A ICON_SIZES=(
  ["mipmap-mdpi"]=48
  ["mipmap-hdpi"]=72
  ["mipmap-xhdpi"]=96
  ["mipmap-xxhdpi"]=144
  ["mipmap-xxxhdpi"]=192
)

for folder in "${!ICON_SIZES[@]}"; do
  size=${ICON_SIZES[$folder]}
  mkdir -p "$RES/$folder"
  rsvg-convert -w $size -h $size "$SRC/icon.svg" -o "$RES/$folder/ic_launcher.png"
  rsvg-convert -w $size -h $size "$SRC/icon.svg" -o "$RES/$folder/ic_launcher_round.png"
  echo "  ✅ $folder (${size}px)"
done

# ===== Adaptive icons (foreground + background) =====
declare -A ADAPTIVE_SIZES=(
  ["mipmap-mdpi"]=108
  ["mipmap-hdpi"]=162
  ["mipmap-xhdpi"]=216
  ["mipmap-xxhdpi"]=324
  ["mipmap-xxxhdpi"]=432
)

for folder in "${!ADAPTIVE_SIZES[@]}"; do
  size=${ADAPTIVE_SIZES[$folder]}
  rsvg-convert -w $size -h $size "$SRC/icon-foreground.svg" -o "$RES/$folder/ic_launcher_foreground.png"
  rsvg-convert -w $size -h $size "$SRC/icon-background.svg" -o "$RES/$folder/ic_launcher_background.png"
  echo "  ✅ $folder adaptive (${size}px)"
done

# ===== Splash screens =====
declare -A SPLASH_SIZES=(
  ["drawable"]=480
  ["drawable-land-hdpi"]=800
  ["drawable-land-mdpi"]=480
  ["drawable-land-xhdpi"]=1280
  ["drawable-land-xxhdpi"]=1600
  ["drawable-land-xxxhdpi"]=1920
  ["drawable-port-hdpi"]=480
  ["drawable-port-mdpi"]=320
  ["drawable-port-xhdpi"]=720
  ["drawable-port-xxhdpi"]=960
  ["drawable-port-xxxhdpi"]=1280
)

for folder in "${!SPLASH_SIZES[@]}"; do
  width=${SPLASH_SIZES[$folder]}
  height=$width
  mkdir -p "$RES/$folder"
  rsvg-convert -w $width -h $height "$SRC/splash.svg" -o "$RES/$folder/splash.png"
  echo "  ✅ $folder splash (${width}px)"
done

echo ""
echo "🎉 اكتمل التوليد!"
echo ""
echo "📊 إحصائيات:"
echo "  الأيقونات:    $(find $RES -name 'ic_launcher*.png' | wc -l) ملف"
echo "  السبلاش:      $(find $RES -name 'splash.png' | wc -l) ملف"
