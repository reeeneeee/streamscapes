import SwiftUI

struct ConfigureView: View {
    @Environment(AppStore.self) private var store
    @Environment(AuthManager.self) private var authManager

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Account
                accountSection

                // Presets — browse saved + community
                SettingsShareView()
                    .onAppearLoad()

                // Global musical frame
                globalSection

                // Sonification stream list with preset pickers
                streamSection

                // Factory reset
                factoryResetSection

                // Desktop hint
                desktopHint
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
    }

    // MARK: - Account

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            if authManager.isSignedIn, let user = authManager.user {
                HStack(spacing: 10) {
                    // Avatar
                    if let imageURL = user.image {
                        AsyncImage(url: imageURL) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Circle().fill(Theme.bgElevated)
                        }
                        .frame(width: 28, height: 28)
                        .clipShape(Circle())
                    }

                    VStack(alignment: .leading, spacing: 1) {
                        if let name = user.name {
                            Text(name)
                                .font(.custom("DMSans-Medium", size: 13))
                                .foregroundStyle(Theme.textPrimary)
                        }
                        if let email = user.email {
                            Text(email)
                                .font(.custom("DMSans-Regular", size: 11))
                                .foregroundStyle(Theme.textMuted)
                        }
                    }

                    Spacer()

                    Button {
                        authManager.signOut()
                    } label: {
                        Text("Sign Out")
                            .font(.custom("DMSans-Regular", size: 11))
                            .foregroundStyle(Theme.textMuted)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(Theme.border, lineWidth: 1)
                            )
                    }
                }
            } else {
                VStack(spacing: 8) {
                    Button {
                        authManager.signIn(provider: "apple")
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "apple.logo")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.textPrimary)
                            Text("Sign in with Apple")
                                .font(.custom("DMSans-Medium", size: 13))
                                .foregroundStyle(Theme.textPrimary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.white.opacity(0.12))
                        .cornerRadius(6)
                    }

                    Button {
                        authManager.signIn(provider: "google")
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "person.crop.circle")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.textMuted)
                            Text("Sign in with Google")
                                .font(.custom("DMSans-Medium", size: 13))
                                .foregroundStyle(Theme.textPrimary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Theme.bgElevated)
                        .cornerRadius(6)
                    }
                }
            }
        }
    }

    // MARK: - Global

    private var globalSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionTitle("Global")
            Text("Root note, scale, and tempo shared across all streams.")
                .font(.custom("DMSans-Regular", size: 11))
                .foregroundStyle(Theme.textMuted)
            InlineGlobalFrame(showHeader: false)
        }
    }

    // MARK: - Sonification Stream List

    private var streamSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionTitle("Sonification")
            SonificationStreamList()
        }
    }

    // MARK: - Factory Reset

    @State private var showResetConfirm = false

    private var factoryResetSection: some View {
        Button {
            showResetConfirm = true
        } label: {
            Text("Factory Reset Audio Config")
                .font(.custom("DMSans-Regular", size: 11))
                .foregroundStyle(Color(red: 0.97, green: 0.55, blue: 0.55).opacity(0.7))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(Color(red: 0.24, green: 0.12, blue: 0.12).opacity(0.6))
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(red: 0.97, green: 0.55, blue: 0.55).opacity(0.15), lineWidth: 1)
                )
        }
        .padding(.top, 8)
        .alert("Reset Audio Config?", isPresented: $showResetConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Reset", role: .destructive) {
                store.resetAudioConfig()
            }
        } message: {
            Text("Resets synths, effects, and modes to defaults. Your volume levels are preserved.")
        }
    }

    // MARK: - Desktop Hint

    private var desktopHint: some View {
        HStack(spacing: 8) {
            Image(systemName: "desktopcomputer")
                .font(.system(size: 11))
                .foregroundStyle(Theme.textWhisper)
            Text("More advanced configurations — effects chains, mapping curves, and per-stream synth editing — available at streamscapes.fm")
                .font(.custom("DMSans-Regular", size: 11))
                .foregroundStyle(Theme.textWhisper)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.02))
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(Color.white.opacity(0.04), lineWidth: 1)
        )
    }

    // MARK: - Helpers

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.custom("SpaceGrotesk-Medium", size: 13))
            .foregroundStyle(Theme.textSecondary)
    }
}
