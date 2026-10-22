import Foundation

/// Utility to resolve LLM model pricing dynamically
struct ModelPricing {
    /// Resolves prompt and completion rates for a given model
    /// Rates are per 1M tokens or as defined by the pricing.json structure
    static func resolveRates(for modelId: String) -> (prompt: Double, completion: Double) {
        // Try to get dynamic rates from the manager (Remote or Local Bundled Fallback)
        if let dynamicRates = ModelPricingManager.shared.getPricing(for: modelId) {
            return dynamicRates
        }
        
        // If the manager has no data (e.g. initialization failed),
        // use a static safe default to avoid 0.0 calculations.
        return (0.000002, 0.000002)
    }

    /// Calculates the total cost for a given model and token counts. Returns nil if the model is unpriced.
    static func cost(model: String, inputTokens: Int, outputTokens: Int) -> Double? {
        guard let rates = ModelPricingManager.shared.getPricing(for: model) else {
            return nil
        }
        return (Double(inputTokens) * rates.prompt) + (Double(outputTokens) * rates.completion)
    }
}
