import Cocoa

struct CalendarModel: Identifiable, Hashable {
    let accountName: String
    let id: String
    let title: String
    let color: NSColor
    let isSubscribed: Bool
    let isReminder: Bool // true if this is a reminder calendar
}
