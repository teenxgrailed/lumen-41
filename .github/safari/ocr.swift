// Text on a simulator screenshot, with where it is, for the parts of iOS that
// idb's accessibility dump cannot see (the share sheet is a remote view).
//   swiftc -O ocr.swift -o ocr && ./ocr shot.png
// Prints JSON: [{text, x, y, w, h}], centre and size as fractions of the
// image, y from the top.
import AppKit
import Foundation
import Vision

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let img = NSImage(contentsOf: url),
  let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil)
else { exit(1) }
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
var out: [[String: Any]] = []
for o in req.results ?? [] {
  guard let c = o.topCandidates(1).first else { continue }
  let b = o.boundingBox
  out.append([
    "text": c.string, "x": b.midX, "y": 1 - b.midY, "w": b.width, "h": b.height,
  ])
}
let data = try JSONSerialization.data(withJSONObject: out)
print(String(data: data, encoding: .utf8)!)
