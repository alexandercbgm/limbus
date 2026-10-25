#!/usr/bin/env bash
# Builds android/limbus.aab, the bundle for Google Play: the game as in the APK, with Google Play's billing for the crystal
# shop (play-src/PlayBilling.java) in place of Telegram's, signed with the upload key. Gradle builds it (play-gradle/), as
# the billing library comes with dependencies of its own. Needs ANDROID_HOME (platforms;android-36), a JDK and Gradle.
# The upload key is android/upload.jks, its password in android/upload.properties (both kept out of git: keep a copy safe,
# Play wants every update signed with it). Made on the first run if there is none.
# Every upload to Play needs a higher version code: VERSION_CODE=2 VERSION_NAME=1.1 android/build_aab.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; root="$here/.."; out="$here/out-aab"
rm -rf "$out"; mkdir -p "$out/assets/music"
python3 "$root/build.py" --no-music >/dev/null
sed 's#https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js#three.min.js#' "$root/index.html" > "$out/assets/index.html"
python3 "$root/build.py" >/dev/null # index.html back as the repository keeps it
cp "$here/three.min.js" "$out/assets/"; cp "$root"/music/*.mp3 "$out/assets/music/"
# the APK's manifest without the package, versions and SDK levels, which Gradle takes from play-gradle/build.gradle
sed -e 's/ package="[^"]*"//' -e 's/ android:versionCode="[^"]*"//' -e 's/ android:versionName="[^"]*"//' -e '/<uses-sdk/d' "$here/AndroidManifest.xml" > "$out/AndroidManifest.xml"
props="$here/upload.properties"; ks="$here/upload.jks"
if [ ! -f "$ks" ]; then
  pass="$(python3 -c 'import secrets; print(secrets.token_urlsafe(18))')"
  keytool -genkeypair -keystore "$ks" -storetype PKCS12 -storepass "$pass" -alias upload -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Limbus, O=alexandercbgm" >/dev/null 2>&1
  printf 'storePassword=%s\nkeyAlias=upload\n' "$pass" > "$props"
fi
gradle -p "$here/play-gradle" --no-daemon -q bundleRelease
cp "$here/play-gradle/build/outputs/bundle/release/limbus-play-release.aab" "$here/limbus.aab"
ls -l "$here/limbus.aab"
