import SwiftUI
import AppKit

@main
struct StreamscapesAgentApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings { EmptyView() }
    }
}

@MainActor
class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var panel: NSPanel!
    private let agent = AgentViewModel()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        // Status bar item
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            // Load icon from bundle Resources (asset catalogs aren't compiled by SPM)
            if let iconURL = Bundle.main.url(forResource: "menubar-icon", withExtension: "png"),
               let icon = NSImage(contentsOf: iconURL) {
                icon.isTemplate = true
                icon.size = NSSize(width: 18, height: 18)
                button.image = icon
            } else {
                button.title = "♪"
            }
            button.action = #selector(togglePanel)
            button.target = self
        }

        // Floating panel that stays open
        let content = PopoverView(agent: agent)
            .padding(.top, 28)

        panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 350, height: 680),
            styleMask: [.nonactivatingPanel, .titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isMovableByWindowBackground = true
        panel.backgroundColor = NSColor(red: 0.055, green: 0.055, blue: 0.063, alpha: 1)
        panel.isReleasedWhenClosed = false
        panel.hidesOnDeactivate = false

        let hostingController = NSHostingController(rootView: content)
        hostingController.view.frame = panel.contentView!.bounds
        panel.contentViewController = hostingController
    }

    @objc func togglePanel() {
        if panel.isVisible {
            panel.orderOut(nil)
        } else {
            // Position below the status item
            if let button = statusItem.button, let window = button.window {
                let buttonRect = button.convert(button.bounds, to: nil)
                let screenRect = window.convertToScreen(buttonRect)
                let x = screenRect.midX - 175
                let y = screenRect.minY - 684
                panel.setFrameOrigin(NSPoint(x: x, y: y))
            }
            panel.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
    }
}
