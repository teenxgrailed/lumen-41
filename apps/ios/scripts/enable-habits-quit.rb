#!/usr/bin/env ruby
# Turns the quit blocker (feature `habits_quit`) into part of the Xcode project.
# Until this runs, project.pbxproj has no quit target, no source from
# ios/App/NeedtQuit is compiled and the app is exactly what ships today.
#
#   gem install xcodeproj          # once (the CocoaPods project library)
#   cd apps/ios && ruby scripts/enable-habits-quit.rb [--open-app]
#
# It adds, to ios/App/App.xcodeproj:
#   - targets NeedtQuitShield, NeedtQuitShieldAction, NeedtQuitMonitor
#     (bundle ids app.needt.ios.quit.shield / .shieldaction / .monitor), embedded
#     in the App target next to the widgets and the share extension,
#   - NeedtQuit/Shared/* in the app and all three, NeedtQuit/App/* in the app,
#   - the NeedtKit package product in each target,
#   - the compilation condition HABITS_QUIT on every target,
#   - the family-controls entitlements (App uses NeedtQuit/App/AppQuit.entitlements).
# --open-app also sets HABITS_QUIT_OPEN_APP (iOS 26.5+ `.openParentalControlsApp`;
# needs Xcode 26.5 or newer).
#
# Distribution signing needs Apple's approval of com.apple.developer.family-controls
# (docs/release/family-controls-request.md). NOT run in CI and not verified by a
# build yet: run it on a branch, open the project in Xcode, build, then commit.
require "xcodeproj"

ROOT = File.expand_path("../ios/App", __dir__)
project = Xcodeproj::Project.open(File.join(ROOT, "App.xcodeproj"))
open_app = ARGV.include?("--open-app")

abort "already enabled" if project.targets.any? { |t| t.name == "NeedtQuitShield" }

app = project.targets.find { |t| t.name == "App" } or abort "App target not found"
kit_ref = project.root_object.package_references.find { |r| r.respond_to?(:relative_path) && r.relative_path.to_s.end_with?("shared/NeedtKit") } or abort "NeedtKit package reference not found"

group = project.main_group.new_group("NeedtQuit", "NeedtQuit")
shared = Dir[File.join(ROOT, "NeedtQuit/Shared/*.swift")].sort.map { |p| group.new_reference(p.sub("#{ROOT}/NeedtQuit/", "")) }
app_files = Dir[File.join(ROOT, "NeedtQuit/App/*.swift")].sort.map { |p| group.new_reference(p.sub("#{ROOT}/NeedtQuit/", "")) }
group.new_reference("Extension.entitlements")
group.new_reference("App/AppQuit.entitlements")
privacy = group.new_reference("PrivacyInfo.xcprivacy")

def add_kit(project, target, kit_ref)
  dep = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
  dep.product_name = "NeedtKit"
  dep.package = kit_ref
  target.package_product_dependencies << dep
  build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
  build_file.product_ref = dep
  target.frameworks_build_phase.files << build_file
end

conditions = open_app ? "HABITS_QUIT HABITS_QUIT_OPEN_APP" : "HABITS_QUIT"

specs = [
  ["NeedtQuitShield", "Shield", "ShieldConfigurationExtension.swift", "app.needt.ios.quit.shield"],
  ["NeedtQuitShieldAction", "ShieldAction", "ShieldActionExtension.swift", "app.needt.ios.quit.shieldaction"],
  ["NeedtQuitMonitor", "Monitor", "DeviceActivityMonitorExtension.swift", "app.needt.ios.quit.monitor"],
]

embed = app.copy_files_build_phases.find { |p| p.name == "Embed Foundation Extensions" } or abort "Embed Foundation Extensions phase not found"

specs.each do |name, dir, source, bundle_id|
  target = project.new_target(:app_extension, name, :ios, "18.0")
  src = group.new_reference("#{dir}/#{source}")
  target.add_file_references([src] + shared)
  target.add_resources([privacy])
  add_kit(project, target, kit_ref)
  target.build_configurations.each do |config|
    s = config.build_settings
    s["PRODUCT_BUNDLE_IDENTIFIER"] = bundle_id
    s["INFOPLIST_FILE"] = "NeedtQuit/#{dir}/Info.plist"
    s["GENERATE_INFOPLIST_FILE"] = "NO"
    s["CODE_SIGN_ENTITLEMENTS"] = "NeedtQuit/Extension.entitlements"
    s["CODE_SIGN_STYLE"] = "Automatic"
    s["IPHONEOS_DEPLOYMENT_TARGET"] = "18.0"
    s["SWIFT_VERSION"] = "5.0"
    s["SKIP_INSTALL"] = "YES"
    s["TARGETED_DEVICE_FAMILY"] = "1,2"
    s["SWIFT_ACTIVE_COMPILATION_CONDITIONS"] = "$(inherited) #{conditions}"
    s["LD_RUNPATH_SEARCH_PATHS"] = ["$(inherited)", "@executable_path/Frameworks", "@executable_path/../../Frameworks"]
  end
  app.add_dependency(target)
  file = embed.add_file_reference(target.product_reference)
  file.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
end

# The app: plugin sources, shared sources, the flag, the entitlements.
app.add_file_references(app_files + shared)
app.build_configurations.each do |config|
  s = config.build_settings
  s["CODE_SIGN_ENTITLEMENTS"] = "NeedtQuit/App/AppQuit.entitlements"
  s["SWIFT_ACTIVE_COMPILATION_CONDITIONS"] = "$(inherited) #{conditions}"
end

project.save
puts "habits_quit enabled in App.xcodeproj. Open it in Xcode, build, then commit."
