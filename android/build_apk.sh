#!/usr/bin/env bash
# Builds android/limbus.apk: the game page (built by build.py) in a full-screen WebView, offline (three.js bundled).
# Needs ANDROID_HOME with platforms;android-36 and build-tools;36.0.0, and a JDK. No Gradle. (Google Play takes the bundle: build_aab.sh.)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; root="$here/.."; out="$here/out"
BT="$ANDROID_HOME/build-tools/36.0.0"; JAR="$ANDROID_HOME/platforms/android-36/android.jar"
rm -rf "$out"; mkdir -p "$out/assets" "$out/classes" "$out/res"
python3 "$root/build.py" --no-music >/dev/null
# the page loads three.js from the bundled copy instead of the CDN
sed 's#https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js#three.min.js#' "$root/index.html" > "$out/assets/index.html"
cp "$here/three.min.js" "$out/assets/"
# the tracks as they are (192 kbps), not squeezed to fit an artifact; stored uncompressed so they stream from the APK
mkdir -p "$out/assets/music" && cp "$root"/music/*.mp3 "$out/assets/music/"
"$BT/aapt2" compile --dir "$here/res" -o "$out/res.zip"
"$BT/aapt2" link -o "$out/base.apk" -I "$JAR" --manifest "$here/AndroidManifest.xml" -A "$out/assets" "$out/res.zip" --java "$out/gen" --auto-add-overlay -0 mp3
javac -g -source 8 -target 8 -nowarn -bootclasspath "$JAR" -classpath "$JAR" -d "$out/classes" $(find "$here/src" "$out/gen" -name '*.java') 2>&1 | grep -v "warning" || true
"$BT/d8" --min-api 24 --lib "$JAR" --output "$out" $(find "$out/classes" -name '*.class')
(cd "$out" && cp base.apk unsigned.apk && zip -q -u unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$out/unsigned.apk" "$out/aligned.apk"
ks="$here/limbus.keystore"
[ -f "$ks" ] || keytool -genkeypair -keystore "$ks" -storepass limbus -keypass limbus -alias limbus -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Limbus" >/dev/null 2>&1
"$BT/apksigner" sign --ks "$ks" --ks-pass pass:limbus --key-pass pass:limbus --out "$here/limbus.apk" "$out/aligned.apk"
"$BT/apksigner" verify "$here/limbus.apk" && ls -l "$here/limbus.apk"
