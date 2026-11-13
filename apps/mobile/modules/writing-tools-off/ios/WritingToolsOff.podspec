# Apple's Writing Tools off in the app's text inputs (owner, 2026-11-13). See WritingToolsOffAppDelegate.swift.
Pod::Spec.new do |s|
  s.name           = 'WritingToolsOff'
  s.version        = '1.0.0'
  s.summary        = 'Turns Apple Writing Tools off in every text input of the app.'
  s.author         = 'JPC Space'
  s.homepage       = 'https://github.com/jesusprojectcommunity/space-v2'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files   = '**/*.swift'
end
