#!/usr/bin/env bash
# Builds android/limbus.aab, the bundle for Google Play: the game as in the APK, but with no crystal shop (build.py --play),
# signed with the upload key. Needs ANDROID_HOME (platforms;android-36, build-tools;36.0.0), a JDK and bundletool
# (BUNDLETOOL=/path/to/bundletool.jar). No Gradle.
# The upload key is android/upload.jks, its password in android/upload.properties (both kept out of git: keep a copy safe,
# Play wants every update signed with it). Made on the first run if there is none.
# Every upload to Play needs a higher version code: VERSION_CODE=2 VERSION_NAME=1.1 android/build_aab.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; root="$here/.."; out="$here/out-aab"
BT="$ANDROID_HOME/build-tools/36.0.0"; JAR="$ANDROID_HOME/platforms/android-36/android.jar"; BUNDLETOOL="${BUNDLETOOL:-/home/user/tools/bundletool.jar}"
rm -rf "$out"; mkdir -p "$out/assets/music" "$out/classes" "$out/module/manifest" "$out/module/dex"
python3 "$root/build.py" --no-music --play >/dev/null
sed 's#https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js#three.min.js#' "$root/index.html" > "$out/assets/index.html"
python3 "$root/build.py" >/dev/null # index.html back as the repository keeps it
cp "$here/three.min.js" "$out/assets/"; cp "$root"/music/*.mp3 "$out/assets/music/"
"$BT/aapt2" compile --dir "$here/res" -o "$out/res.zip"
"$BT/aapt2" link --proto-format -o "$out/proto.apk" -I "$JAR" --manifest "$here/AndroidManifest.xml" -A "$out/assets" "$out/res.zip" \
  --java "$out/gen" --auto-add-overlay ${VERSION_CODE:+--version-code "$VERSION_CODE"} ${VERSION_NAME:+--version-name "$VERSION_NAME"}
javac -g -source 8 -target 8 -nowarn -bootclasspath "$JAR" -classpath "$JAR" -d "$out/classes" $(find "$here/src" "$out/gen" -name '*.java') 2>&1 | grep -v "warning" || true
"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$out/module/dex" $(find "$out/classes" -name '*.class')
# a bundle's module: the manifest in manifest/, the code in dex/, resources and assets as aapt2 laid them out
(cd "$out/module" && unzip -q "$out/proto.apk" && mv AndroidManifest.xml manifest/ && zip -q -r "$out/base.zip" .)
# the tracks stay uncompressed, so they stream straight from the installed app
echo '{"compression":{"uncompressedGlob":["assets/music/**"]}}' > "$out/config.json"
java -jar "$BUNDLETOOL" build-bundle --modules="$out/base.zip" --config="$out/config.json" --output="$out/unsigned.aab" --overwrite
props="$here/upload.properties"; ks="$here/upload.jks"
if [ ! -f "$ks" ]; then
  pass="$(python3 -c 'import secrets; print(secrets.token_urlsafe(18))')"
  keytool -genkeypair -keystore "$ks" -storetype PKCS12 -storepass "$pass" -alias upload -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Limbus, O=alexandercbgm" >/dev/null 2>&1
  printf 'storePassword=%s\nkeyAlias=upload\n' "$pass" > "$props"
fi
pass="$(sed -n 's/^storePassword=//p' "$props")"
cp "$out/unsigned.aab" "$here/limbus.aab"
jarsigner -keystore "$ks" -storepass "$pass" -sigalg SHA256withRSA -digestalg SHA-256 "$here/limbus.aab" upload >/dev/null
java -jar "$BUNDLETOOL" validate --bundle="$here/limbus.aab" >/dev/null && ls -l "$here/limbus.aab"
