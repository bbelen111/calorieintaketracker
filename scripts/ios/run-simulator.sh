#!/usr/bin/env bash
#
# Build the web bundle, sync it into the iOS project, then build + install + launch
# the app on a booted iOS Simulator. This is the command-line equivalent of
# `npx cap open ios` followed by pressing Run in Xcode — useful for headless/CI-style
# checking and for anyone who does not want the Xcode GUI in the loop.
#
#   npm run ios:run                          # whole flow
#   IOS_SIMULATOR=<UDID> npm run ios:run     # target a specific simulator
#   IOS_DERIVED_DATA=/tmp/dd npm run ios:run # use a different derived-data dir
#
# HealthKit note: an Xcode simulator build is signed ad-hoc, which IS enough for the
# `com.apple.developer.healthkit` entitlement in ios/App/App/App.entitlements to be
# applied. Only *device*/App Store builds need a Team selected in Xcode and the
# HealthKit capability enabled for the App ID in the Developer portal.
set -euo pipefail

APP_ID="com.energymap.tracker"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DERIVED_DATA="${IOS_DERIVED_DATA:-$ROOT_DIR/ios/DerivedData}"   # gitignored
APP_PATH="$DERIVED_DATA/Build/Products/Debug-iphonesimulator/App.app"

cd "$ROOT_DIR"

# 1. Web bundle -> dist/, then into ios/App/App/public (+ regenerates CapApp-SPM/Package.swift).
npm run build
npx cap sync ios

# 2. Resolve a simulator: explicit UDID > first booted > boot the first available iPhone.
UDID="${IOS_SIMULATOR:-$(xcrun simctl list devices booted | grep -oE '\(([0-9A-Fa-f-]{36})\)' | tr -d '()' | head -1)}"
if [ -z "$UDID" ]; then
  UDID="$(xcrun simctl list devices available | grep -E '^[[:space:]]+iPhone' | grep -oE '\(([0-9A-Fa-f-]{36})\)' | tr -d '()' | head -1)"
  echo "No booted simulator — booting $UDID"
  xcrun simctl boot "$UDID"
  open -a Simulator
  xcrun simctl bootstatus "$UDID" -b
fi
echo "Simulator: $UDID"

# 3. Build the native app (SPM deps resolve automatically).
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -sdk iphonesimulator -configuration Debug \
  -destination "id=$UDID" -derivedDataPath "$DERIVED_DATA" \
  build | tail -3

# 4. Install + launch.
xcrun simctl install "$UDID" "$APP_PATH"
xcrun simctl launch "$UDID" "$APP_ID"
echo "Running on $UDID — stream logs with:"
echo "  xcrun simctl spawn $UDID log stream --level debug --predicate 'process == \"App\"'"
