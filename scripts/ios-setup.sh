#!/bin/bash
# Sets up the iOS project on a Mac with Xcode installed. Run from the repo root:  bash scripts/ios-setup.sh
# A free Apple ID is enough to run Trove on your own iPhone (the app must be re-installed from Xcode every 7 days).
set -e
npm install
[ -d ios ] || npx cap add ios
npx cap sync ios
PLIST=ios/App/App/Info.plist
add() { /usr/libexec/PlistBuddy -c "Delete :$1" "$PLIST" 2>/dev/null || true; /usr/libexec/PlistBuddy -c "Add :$1 string $2" "$PLIST"; }
add NSCameraUsageDescription "Trove uses the camera to scan connection QR codes and take entry photos."
add NSPhotoLibraryUsageDescription "Trove lets you attach your photos to entries."
add NSLocationWhenInUseUsageDescription "Trove uses your location to pin places and note your visits."
add NSLocationAlwaysAndWhenInUseUsageDescription "Trove notes the places you visit while it is in the background."
/usr/libexec/PlistBuddy -c "Delete :UIBackgroundModes" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :UIBackgroundModes array" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :UIBackgroundModes:0 string location" "$PLIST"
echo
echo "Done. Xcode will open. Then:"
echo " 1. Click 'App' in the left sidebar -> Signing & Capabilities -> Team: pick your Apple ID (Add an Account if needed)."
echo " 2. Change the Bundle Identifier to something unique, e.g. io.github.YOURNAME.trove"
echo " 3. Plug in the iPhone, pick it at the top, press the Play button."
echo " 4. On the iPhone: Settings -> General -> VPN & Device Management -> trust your Apple ID."
npx cap open ios
