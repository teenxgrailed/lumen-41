import Foundation
import SwiftUI
import Defaults

/// Model for dynamic pricing data structure
struct ModelPricingData: Codable {
    let models: [ModelPriceEntry]
    let lastUpdated: String?
    
    enum CodingKeys: String, CodingKey {
        case models
        case lastUpdated = "last_updated"
    }
}

struct ModelPriceEntry: Codable, Identifiable {
    let id: String
    let name: String
    let pricing: ModelRates
}

struct ModelRates: Codable {
    let prompt: String
    let completion: String
    
    var promptPrice: Double {
        Double(prompt) ?? 0.0
    }
    
    var completionPrice: Double {
        Double(completion) ?? 0.0
    }
}

/// Manager class to handle fetching and caching of LLM pricing data
class ModelPricingManager: ObservableObject {
    static let shared = ModelPricingManager()
    
    @Published private(set) var pricingData: ModelPricingData?
    
    private init() {
        loadInitialPricing()
    }
    
    /// Loads initial pricing from local bundle fallback
    private func loadInitialPricing() {
        if let localURL = Bundle.main.url(forResource: "pricing", withExtension: "json", subdirectory: "DynamicIsland/managers/LLMUsage") {
            do {
                let data = try Data(contentsOf: localURL)
                self.pricingData = try JSONDecoder().decode(ModelPricingData.self, from: data)
                print("✅ ModelPricingManager: Loaded bundled pricing fallback")
            } catch {
                print("❌ ModelPricingManager: Failed to load bundled pricing: \(error)")
            }
        } else {
            // Check flat manager path if subdirectory lookup fails
            if let localURL = Bundle.main.url(forResource: "pricing", withExtension: "json") {
                do {
                    let data = try Data(contentsOf: localURL)
                    self.pricingData = try JSONDecoder().decode(ModelPricingData.self, from: data)
                    print("✅ ModelPricingManager: Loaded bundled pricing from flat path")
                } catch {
                    print("❌ ModelPricingManager: Failed to load bundled pricing (flat): \(error)")
                }
            }
        }
    }
    
    /// Resolves pricing for a specific model ID
    func getPricing(for modelId: String) -> (prompt: Double, completion: Double)? {
        guard let model = pricingData?.models.first(where: { $0.id == modelId }) else {
            return nil
        }
        return (model.pricing.promptPrice, model.pricing.completionPrice)
    }
}
