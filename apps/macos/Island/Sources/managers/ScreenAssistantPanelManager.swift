import AppKit
import SwiftUI
import Defaults

class ScreenAssistantPanelManager: ObservableObject {
    static let shared = ScreenAssistantPanelManager()
    
    // Backward compatibility wrapper - delegates to the new ScreenAssistantManager
    private var screenAssistantPanel: ScreenAssistantPanel?
    
    private init() {}
    
    func showScreenAssistantPanel() {
        hideScreenAssistantPanel() // Close any existing panel
        
        // Use the new dual-panel system
        ScreenAssistantManager.shared.showPanels()
        
        // Create a dummy panel for backward compatibility
        let panel = ScreenAssistantPanel()
        self.screenAssistantPanel = panel
        
        // The actual panels are managed by ScreenAssistantManager
        // This is just for compatibility with existing code
        
        print("ScreenAssistant: New dual-panel system activated")
    }
    
    func hideScreenAssistantPanel() {
        // Close the new panel system
        ScreenAssistantManager.shared.closePanels()
        
        // Clean up compatibility panel
        screenAssistantPanel?.close()
        screenAssistantPanel = nil
        
        print("ScreenAssistant: Panels hidden")
    }
    
    func toggleScreenAssistantPanel() {
        if ScreenAssistantManager.shared.arePanelsVisible() {
            hideScreenAssistantPanel()
        } else {
            showScreenAssistantPanel()
        }
    }
    
    var isPanelVisible: Bool {
        return ScreenAssistantManager.shared.arePanelsVisible()
    }
}