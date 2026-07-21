import AuthenticationServices
import Foundation
import Security
import UIKit

struct UserProfile: Sendable {
    let id: String
    let name: String?
    let email: String?
    let image: URL?
}

@Observable
@MainActor
final class AuthManager: NSObject {
    private(set) var user: UserProfile?
    var isSignedIn: Bool { user != nil }

    private static let baseURL = "https://www.streamscapes.fm"
    private static let keychainAccount = "com.streamscapes.app.mobileToken"

    /// Retained so the controller isn't deallocated before the delegate callback fires.
    private var appleAuthController: ASAuthorizationController?

    override init() {
        super.init()
        if let token = Self.loadToken() {
            user = Self.decodeJWT(token)
        }
    }

    // MARK: - Google Sign In (web OAuth via ASWebAuthenticationSession)

    func signIn(provider: String = "google") {
        if provider == "apple" {
            signInWithApple()
            return
        }

        let url = URL(string: "\(Self.baseURL)/api/auth/mobile/callback?provider=\(provider)")!
        let session = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: "streamscapes"
        ) { [weak self] callbackURL, error in
            guard let self else { return }
            Task { @MainActor in
                guard error == nil,
                      let callbackURL,
                      let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
                      let token = components.queryItems?.first(where: { $0.name == "token" })?.value
                else { return }

                Self.saveToken(token)
                self.user = Self.decodeJWT(token)
                WatchSessionManager.shared.sendToken(token)
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = true
        session.start()
    }

    // MARK: - Native Apple Sign In

    private func signInWithApple() {
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        appleAuthController = controller
        controller.performRequests()
    }

    // MARK: - Sign Out

    func signOut() {
        Self.deleteToken()
        user = nil
        WatchSessionManager.shared.sendToken(nil)
    }

    // MARK: - Token Access

    var token: String? { Self.loadToken() }

    // MARK: - JWT Decode (payload only, verification happens server-side)

    private static func decodeJWT(_ jwt: String) -> UserProfile? {
        let parts = jwt.split(separator: ".")
        guard parts.count == 3 else { return nil }

        var base64 = String(parts[1])
        while base64.count % 4 != 0 { base64.append("=") }
        base64 = base64.replacingOccurrences(of: "-", with: "+")
                        .replacingOccurrences(of: "_", with: "/")

        guard let data = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let sub = json["sub"] as? String
        else { return nil }

        if let exp = json["exp"] as? TimeInterval, Date(timeIntervalSince1970: exp) < Date() {
            deleteToken()
            return nil
        }

        return UserProfile(
            id: sub,
            name: json["name"] as? String,
            email: json["email"] as? String,
            image: (json["image"] as? String).flatMap(URL.init(string:))
        )
    }

    // MARK: - Exchange Apple identity token for our mobile JWT

    private func exchangeAppleToken(identityToken: String, fullName: PersonNameComponents?) async {
        var body: [String: Any] = ["identityToken": identityToken]
        if let fn = fullName {
            var nameDict: [String: String] = [:]
            if let given = fn.givenName { nameDict["givenName"] = given }
            if let family = fn.familyName { nameDict["familyName"] = family }
            body["fullName"] = nameDict
        }

        guard let jsonData = try? JSONSerialization.data(withJSONObject: body),
              let url = URL(string: "\(Self.baseURL)/api/auth/mobile/apple")
        else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = jsonData

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let token = json["token"] as? String {
                Self.saveToken(token)
                self.user = Self.decodeJWT(token)
                WatchSessionManager.shared.sendToken(token)
            }
        } catch {
            print("[Auth] Apple token exchange failed: \(error)")
        }
    }

    // MARK: - Keychain

    private static func saveToken(_ token: String) {
        deleteToken()
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: keychainAccount,
            kSecValueData as String: Data(token.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    private static func loadToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: keychainAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func deleteToken() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: keychainAccount,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

// MARK: - ASAuthorizationControllerDelegate (Apple Sign In)

extension AuthManager: ASAuthorizationControllerDelegate {
    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8)
        else { return }

        let fullName = credential.fullName

        Task { @MainActor in
            await exchangeAppleToken(identityToken: identityToken, fullName: fullName)
        }
    }

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        print("[Auth] Apple Sign In failed: \(error.localizedDescription)")
    }
}

// MARK: - ASAuthorizationControllerPresentationContextProviding

extension AuthManager: ASAuthorizationControllerPresentationContextProviding {
    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        }
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension AuthManager: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        }
    }
}
